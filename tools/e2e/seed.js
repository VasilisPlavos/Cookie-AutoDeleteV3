const { SetupError } = require('./extension');

const WHITELISTED_SITE = 'wikipedia.org';
const CLEANED_SITE = 'github.com';
const OPEN_TAB_SITE = 'bing.com';

// Mirrored from src/background/index.ts:173-175.
const DISPATCH = '@@STORE_DISPATCH';
const UPDATE_STATE = '@@STORE_UPDATE_STATE';

const WHITELIST_EXPRESSION = {
  expression: WHITELISTED_SITE,
  listType: 'WHITE',
  storeId: 'default',
  id: 'e2e-keep',
};

// Values chosen in the design spec. delayBeforeClean must be 1: Actions.ts
// clamps anything below 1, and a larger value pushes AlarmScheduler off its
// setTimeout branch onto chrome.alarms, which Chrome floors at ~30s.
const SEED_SETTINGS = {
  activeMode: true,
  delayBeforeClean: 1,
  localStorageCleanup: true,
  indexedDBCleanup: true,
  disableNewVersionPopup: true,
  showNotificationAfterCleanup: false,
  contextMenus: false,
  debugMode: true,
};

// A page on the extension's own origin is the only context that can talk to the
// background over runtime.sendMessage the way the popup and settings pages do.
async function withExtensionPage(context, extensionId, fn) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/settings/settings.html`);
    return await fn(page);
  } finally {
    await page.close();
  }
}

async function sendToBackground(page, message) {
  return page.evaluate(
    (msg) => chrome.runtime.sendMessage(msg),
    message,
  );
}

async function readState(context, extensionId) {
  const state = await withExtensionPage(context, extensionId, (page) =>
    sendToBackground(page, { type: UPDATE_STATE }),
  );
  if (!state || !state.settings) {
    throw new SetupError(
      'the background store did not answer @@STORE_UPDATE_STATE with a usable state',
    );
  }
  return state;
}

async function seedState(context, extensionId) {
  return withExtensionPage(context, extensionId, async (page) => {
    for (const [name, value] of Object.entries(SEED_SETTINGS)) {
      await sendToBackground(page, {
        type: DISPATCH,
        action: { type: 'UPDATE_SETTING', payload: { name, value } },
      });
    }

    await sendToBackground(page, {
      type: DISPATCH,
      action: { type: 'ADD_EXPRESSION', payload: WHITELIST_EXPRESSION },
    });

    const state = await sendToBackground(page, { type: UPDATE_STATE });

    const expressions = (state && state.lists && state.lists.default) || [];
    if (!expressions.some((e) => e.expression === WHITELISTED_SITE)) {
      throw new SetupError(
        `seeding did not install the ${WHITELISTED_SITE} whitelist entry`,
      );
    }
    if (state.settings.activeMode.value !== true) {
      throw new SetupError('seeding did not enable activeMode');
    }

    return state;
  });
}

module.exports = {
  CLEANED_SITE,
  OPEN_TAB_SITE,
  WHITELISTED_SITE,
  readState,
  seedState,
};
