const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');
const { SetupError } = require('./errors');

const EXTENSION_DIR = path.join(__dirname, '..', '..', 'extension');

const SERVICE_WORKER_TIMEOUT_MS = 30_000;

async function launchWithExtension() {
  if (!fs.existsSync(path.join(EXTENSION_DIR, 'bundles'))) {
    throw new SetupError(
      'extension/bundles/ is missing. Run "npm run compile" before the harness.',
    );
  }

  // A fresh profile every run: a reused one would carry cookies and extension
  // state from the previous run into the assertions.
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-e2e-'));

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
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
        throw new SetupError(
          'the extension service worker never started; the extension failed to load',
        );
      }
    }

    const extensionId = new URL(worker.url()).host;
    if (!extensionId) {
      throw new SetupError('could not resolve the extension id from the service worker url');
    }

    return { context, worker, extensionId, userDataDir };
  } catch (error) {
    // Best-effort cleanup on any failure path after the temp profile was
    // created. Swallow cleanup errors so the original error — what the
    // caller actually needs to see — is never masked by a secondary
    // failure while closing an already-broken context or removing an
    // already-gone directory.
    try {
      await closeContext(context, userDataDir);
    } catch {
      // ignore; rethrow the original error below
    }
    throw error;
  }
}

// Tolerates a missing context so a teardown hook can call this unconditionally.
// When launchWithExtension throws, the caller's `context` was never assigned —
// and a TypeError from teardown would bury the SETUP FAILED that explains why.
async function closeContext(context, userDataDir) {
  if (context) {
    await context.close();
  }
  if (userDataDir) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

module.exports = {
  closeContext,
  launchWithExtension,
};
