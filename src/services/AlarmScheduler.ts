/**
 * Copyright (c) 2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */

import { cookieCleanup } from '../redux/Actions';

export const CLEANUP_ALARM_NAME = 'cad_cleanup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sessionStorage: browser.storage.StorageArea = (browser.storage as any).session;

/**
 * Delays below this threshold use setTimeout (which works fine because the
 * background SW stays alive while a tab/cookie event-driven cleanup is queued).
 * At or above this threshold, we hand off to chrome.alarms so the cleanup
 * survives SW termination.
 */
export const ALARM_THRESHOLD_MS = 25_000;

const SESSION_FLAG_KEY = 'alarmFlag';

type Dispatcher = () => void;

let _inFlight = false;
let _dispatcher: Dispatcher | null = null;

function defaultDispatcher(): void {
  // Lazily resolve StoreUser/lifecycle so this module is import-safe in tests.
  // Late import avoids a cycle (lifecycle imports services indirectly).
  const lifecycle = require('../background/lifecycle') as {
    ready: () => Promise<void>;
    getStore: () => { dispatch: (action: unknown) => void };
  };
  lifecycle.ready().then(() => {
    lifecycle.getStore().dispatch(
      cookieCleanup({ greyCleanup: false, ignoreOpenTabs: false }) as unknown,
    );
  });
}

export default class AlarmScheduler {
  /**
   * Schedule a cleanup `delayMs` from now. If `delayMs < ALARM_THRESHOLD_MS`
   * the cleanup is queued via setTimeout; otherwise via chrome.alarms.
   * Dedups concurrent schedules across SW restarts via chrome.storage.session.
   */
  static async scheduleCleanup(delayMs: number): Promise<void> {
    if (_inFlight) return;

    // Cross-SW-restart dedup.
    const persisted = await sessionStorage.get(SESSION_FLAG_KEY);
    if ((persisted as { alarmFlag?: boolean }).alarmFlag) {
      _inFlight = true; // adopt the existing flag for the rest of this SW activation
      return;
    }

    _inFlight = true;
    await sessionStorage.set({ [SESSION_FLAG_KEY]: true });

    if (delayMs >= ALARM_THRESHOLD_MS) {
      browser.alarms.create(CLEANUP_ALARM_NAME, { when: Date.now() + delayMs });
      // The alarm handler clears the flag.
    } else {
      setTimeout(() => {
        AlarmScheduler.fire();
      }, delayMs);
    }
  }

  /** Called from the alarms.onAlarm listener registered in background/index.ts. */
  static async handleAlarm(alarm: {
    name: string;
    scheduledTime: number;
  }): Promise<void> {
    if (alarm.name !== CLEANUP_ALARM_NAME) return;
    await AlarmScheduler.fire();
  }

  private static async fire(): Promise<void> {
    const dispatcher = _dispatcher || defaultDispatcher;
    try {
      dispatcher();
    } finally {
      _inFlight = false;
      await sessionStorage.remove(SESSION_FLAG_KEY);
    }
  }

  // --- Test seams ---

  static _resetForTests(): void {
    _inFlight = false;
    _dispatcher = null;
  }

  static _setDispatcher(d: Dispatcher): void {
    _dispatcher = d;
  }
}
