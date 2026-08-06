const { test, expect } = require('@playwright/test');
const { launchWithExtension, closeContext } = require('../../tools/e2e/extension');

test('the extension loads and its service worker starts', async () => {
  const { context, worker, extensionId, userDataDir } = await launchWithExtension();
  try {
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    expect(worker.url()).toContain(extensionId);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/settings/settings.html`);
    await expect(page).toHaveTitle(/./);
  } finally {
    await closeContext(context, userDataDir);
  }
});
