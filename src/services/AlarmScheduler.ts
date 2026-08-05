/**
 * Copyright (c) 2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */

import { cookieCleanup } from '../redux/Actions';

export const CLEANUP_ALARM_NAME = 'cad_cleanup';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const browserSessionStorage: browser.storage.StorageArea = (browser.storage as any).session;

/**
 * Delays below this threshold use setTimeout (which works fine because the
 * background SW stays alive while a tab/cookie event-driven cleanup is queued).
 * At or above this threshold, we hand off to chrome.alarms so the cleanup
 * survives SW termination.
 */
export const ALARM_THRESHOLD_MS = 25_000;

const SESSION_FLAG_KEY = 'alarmFlag';

type Dispatcher = () => Promise<void>;

let _inFlight = false;
let _dispatcher: Dispatcher | null = null;

async function defaultDispatcher(): Promise<void> {
  // Lazily resolve StoreUser/lifecycle so this module is import-safe in tests.
  // Late import avoids a cycle (lifecycle imports services indirectly).
  const { ready, getStore } = (await import('../background/lifecycle')) as {
    ready: () => Promise<void>;
    getStore: () => { dispatch: (action: unknown) => void };
  };
  await ready();
  getStore().dispatch(
    cookieCleanup({ startup: false, ignoreOpenTabs: false }) as unknown,
  );
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
    const persisted = await browserSessionStorage.get(SESSION_FLAG_KEY);
    if ((persisted as { alarmFlag?: boolean }).alarmFlag) {
      // Flag is set. Confirm the alarm is actually still pending — if not, the
      // previous SW activation died after setting the flag; clear it and re-schedule.
      const existing = await browser.alarms.get(CLEANUP_ALARM_NAME);
      if (existing) {
        _inFlight = true; // adopt the genuinely pending alarm
        return;
      }
      // Stale flag — clear it and fall through to fresh scheduling.
      await browserSessionStorage.remove(SESSION_FLAG_KEY);
    }

    _inFlight = true;
    await browserSessionStorage.set({ [SESSION_FLAG_KEY]: true });

    if (delayMs >= ALARM_THRESHOLD_MS) {
      browser.alarms.create(CLEANUP_ALARM_NAME, { when: Date.now() + delayMs });
      // The alarm handler clears the flag.
    } else {
      setTimeout(() => {
        AlarmScheduler.fire();
      }, delayMs);
    }
  }

  /**
   * Called from the alarms.onAlarm listener registered in background/index.ts.
   *
   * NOTE: Until Task 10 of the MV3 migration plan wires
   * `browser.alarms.onAlarm.addListener(...)` in background/index.ts, the
   * delayMs >= ALARM_THRESHOLD_MS branch of scheduleCleanup is inert — alarms
   * fire but no handler runs. Tests cover handleAlarm directly.
   */
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
      await dispatcher();
    } finally {
      _inFlight = false;
      await browserSessionStorage.remove(SESSION_FLAG_KEY);
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
