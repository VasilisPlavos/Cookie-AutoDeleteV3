const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const REPO_ROOT = path.join(__dirname, '..', '..');
const EXTENSION_DIR = path.join(REPO_ROOT, 'extension');

const SERVICE_WORKER_TIMEOUT_MS = 30_000;

class SetupError extends Error {
  constructor(message) {
    super(`SETUP FAILED: ${message}`);
    this.name = 'SetupError';
  }
}

async function launchWithExtension() {
  if (!fs.existsSync(path.join(EXTENSION_DIR, 'bundles'))) {
    throw new SetupError(
      'extension/bundles/ is missing. Run "npm run compile" before the harness.',
    );
  }

  // A fresh profile every run: a reused one would carry cookies and extension
  // state from the previous run into the assertions.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-e2e-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) {
    try {
      worker = await context.waitForEvent('serviceworker', {
        timeout: SERVICE_WORKER_TIMEOUT_MS,
      });
    } catch {
      await context.close();
      throw new SetupError(
        'the extension service worker never started; the extension failed to load',
      );
    }
  }

  const extensionId = new URL(worker.url()).host;
  if (!extensionId) {
    await context.close();
    throw new SetupError('could not resolve the extension id from the service worker url');
  }

  return { context, worker, extensionId, userDataDir };
}

async function closeContext(context, userDataDir) {
  await context.close();
  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

module.exports = {
  EXTENSION_DIR,
  REPO_ROOT,
  SetupError,
  closeContext,
  launchWithExtension,
};
