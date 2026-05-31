// One-off helper: load the unpacked extension and capture Chrome Web Store
// screenshots (1280x800) of the settings page and the popup.
// Run via tools/run-capture.sh (sets NODE_PATH to the cached Playwright install).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'store-assets', 'screenshots');
const CHROME = process.env.PW_CHROME; // explicit chromium binary

const VIEWPORT = { width: 1280, height: 800 };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const userDataDir = path.join(require('os').tmpdir(), 'cad-pw-profile');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: CHROME || undefined,
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
    ],
  });

  // Find the extension ID via its MV3 service worker.
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log('Extension ID:', extId);

  const shots = [
    { name: '1-settings', url: `chrome-extension://${extId}/settings/settings.html` },
    { name: '2-popup', url: `chrome-extension://${extId}/popup/popup.html` },
  ];

  for (const s of shots) {
    const page = await context.newPage();
    await page.setViewportSize(VIEWPORT);
    await page.goto(s.url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(2500); // let React render + redux hydrate
    const file = path.join(OUT, `${s.name}.png`);
    await page.screenshot({ path: file }); // viewport-sized => exactly 1280x800
    console.log('Saved', file);
    await page.close();
  }

  await context.close();
  console.log('DONE');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
