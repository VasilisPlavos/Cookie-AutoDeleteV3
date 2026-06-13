/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */

export type BrowserName =
  | 'Firefox'
  | 'Chrome'
  | 'EdgeChromium'
  | 'Edge'
  | 'Opera'
  | 'Safari'
  | 'UnknownBrowser';

const CACHE_KEY = 'browserDetect';
let _cached: BrowserName | null = null;

const browserSessionStorage: any =
  typeof browser !== 'undefined' ? (browser.storage as any)?.session : undefined;

/**
 * Synchronous best-effort detection. Used by:
 *   - the global `browserDetect()` shim installed below
 *   - `detectBrowser()` as the underlying logic (wrapped with the session cache)
 *
 * Returns 'UnknownBrowser' if no signal is present.
 */
function syncDetect(): BrowserName {
  // Firefox: only browser exposing runtime.getBrowserInfo.
  if (typeof browser !== 'undefined' && (browser.runtime as any)?.getBrowserInfo) {
    return 'Firefox';
  }
  const ua = (globalThis as any).navigator?.userAgent || '';
  if (ua.includes('Edg/') || ua.includes('Edge/')) return 'EdgeChromium';
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'UnknownBrowser';
}

/**
 * Detect the current browser. Works in both background (SW or event page) and
 * UI (popup, settings) contexts. Caches in module scope AND chrome.storage.session.
 */
export async function detectBrowser(): Promise<BrowserName> {
  if (_cached) return _cached;

  // Try the session cache first (fast warm path).
  if (browserSessionStorage) {
    try {
      const session = await browserSessionStorage.get(CACHE_KEY);
      const cached = (session as { browserDetect?: BrowserName }).browserDetect;
      if (cached) {
        _cached = cached;
        return _cached;
      }
    } catch {
      // storage.session may be unavailable in very old test stubs; fall through.
    }
  }

  _cached = syncDetect();

  if (browserSessionStorage) {
    try {
      await browserSessionStorage.set({ [CACHE_KEY]: _cached });
    } catch {
      // Best effort.
    }
  }
  return _cached;
}

/** Synchronous accessor for callers that already awaited detectBrowser() at least once. */
export function getCachedBrowser(): BrowserName | null {
  return _cached;
}

/** Test seam. */
export function _resetForTests(): void {
  _cached = null;
}

// --- Global shim for legacy call sites ---
//
// The original extension/global_files/browserDetect.js exposed a synchronous
// `browserDetect()` global. Several call sites in CleanupService, Libs, and UI
// components still depend on that global (as default-parameter fallbacks or in
// `state.cache.browserDetect || browserDetect()` chains). Until those callers
// are refactored to import detectBrowser/getCachedBrowser, we install a sync
// global shim that returns the cached value if available, otherwise runs
// best-effort sync detection on every call.
//
// `typeof globalThis !== 'undefined'` guards Node test environments that may
// or may not have a writable globalThis.
if (typeof (globalThis as any).browserDetect === 'undefined') {
  (globalThis as any).browserDetect = (): BrowserName =>
    _cached || syncDetect();
}
