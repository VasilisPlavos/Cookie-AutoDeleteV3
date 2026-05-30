/**
 * Copyright (c) 2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
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

/**
 * Detect the current browser. Works in both background (SW or event page) and
 * UI (popup, settings) contexts.
 *
 * Background path: navigator.userAgent + presence of runtime.getBrowserInfo
 * (Firefox-only API).
 *
 * The result is cached in module scope AND mirrored to chrome.storage.session
 * so SW restarts don't repeat the detection.
 */
export async function detectBrowser(): Promise<BrowserName> {
  if (_cached) return _cached;

  // Try the session cache first (fast warm path).
  try {
    const session = await (browser.storage as any).session.get(CACHE_KEY);
    const cached = (session as { browserDetect?: BrowserName }).browserDetect;
    if (cached) {
      _cached = cached;
      return _cached;
    }
  } catch {
    // storage.session may be unavailable in very old test stubs; fall through.
  }

  let detected: BrowserName = 'UnknownBrowser';

  // Firefox: only browser with runtime.getBrowserInfo.
  if (browser.runtime && (browser.runtime as any).getBrowserInfo) {
    detected = 'Firefox';
  } else {
    const ua = (globalThis as any).navigator?.userAgent || '';
    if (ua.includes('Edg/') || ua.includes('Edge/')) {
      detected = 'EdgeChromium';
    } else if (ua.includes('OPR/') || ua.includes('Opera/')) {
      detected = 'Opera';
    } else if (ua.includes('Chrome/')) {
      detected = 'Chrome';
    } else if (ua.includes('Firefox/')) {
      detected = 'Firefox';
    } else if (ua.includes('Safari/')) {
      detected = 'Safari';
    }
  }

  _cached = detected;
  try {
    await (browser.storage as any).session.set({ [CACHE_KEY]: detected });
  } catch {
    // Best effort.
  }
  return detected;
}

/** Synchronous accessor for callers that already awaited detectBrowser() at least once. */
export function getCachedBrowser(): BrowserName | null {
  return _cached;
}

/** Test seam. */
export function _resetForTests(): void {
  _cached = null;
}
