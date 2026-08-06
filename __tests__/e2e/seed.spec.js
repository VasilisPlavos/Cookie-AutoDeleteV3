const { test, expect } = require('@playwright/test');
const { launchWithExtension, closeContext } = require('../../tools/e2e/extension');
const {
  seedState,
  readState,
  WHITELIST_EXPRESSION_GLOB,
} = require('../../tools/e2e/seed');

test('seeding installs the whitelist and the cleanup settings', async () => {
  const { context, extensionId, userDataDir } = await launchWithExtension();
  try {
    await seedState(context, extensionId);
    const state = await readState(context, extensionId);

    expect(state.lists.default).toHaveLength(1);
    expect(state.lists.default[0]).toMatchObject({
      expression: WHITELIST_EXPRESSION_GLOB,
      listType: 'WHITE',
      storeId: 'default',
    });

    expect(state.settings.activeMode.value).toBe(true);
    expect(state.settings.delayBeforeClean.value).toBe(1);
    expect(state.settings.localStorageCleanup.value).toBe(true);
    expect(state.settings.indexedDBCleanup.value).toBe(true);

    // Settings we never named must survive: dispatching one setting must not
    // clear the rest of the slice.
    expect(state.settings.enableGreyListCleanup).toBeDefined();

    // The cache slice must survive seeding, or getStoreId stops mapping '0' to
    // 'default' and the whitelist silently never matches.
    expect(state.cache.browserDetect).toBeDefined();
  } finally {
    await closeContext(context, userDataDir);
  }
});
