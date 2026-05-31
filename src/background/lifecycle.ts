/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */

import { Store } from 'redux';
import { validateSettings } from '../redux/Actions';
import createStore from '../redux/Store';
import {
  checkIfProtected,
  setGlobalIcon,
} from '../services/BrowserActionService';
import ContextualIdentitiesEvents from '../services/ContextualIdentitiesEvents';
import { diagnosticError } from '../services/Diagnostics';
import { getSetting } from '../services/Libs';
import { detectBrowser } from '../services/BrowserDetect';
import SettingService from '../services/SettingService';
import StoreUser from '../services/StoreUser';
import { ReduxAction, ReduxConstants } from '../typings/ReduxConstants';

let _ready: Promise<void> | null = null;
let _store: Store<State, ReduxAction> | null = null;

/**
 * Returns a Promise that resolves once the background has finished one-time
 * init for this service-worker (or event-page) activation. Idempotent across
 * concurrent callers.
 */
export function ready(): Promise<void> {
  if (!_ready) {
    _ready = init().catch((err) => {
      diagnosticError('[CAD] background init failed (will retry on next ready()):', err);
      _ready = null; // Allow retry on next call.
      throw err;
    });
  }
  return _ready;
}

/** Exposed for callers that need the post-init store. Throws if called before ready resolves. */
export function getStore(): Store<State, ReduxAction> {
  if (!_store) {
    throw new Error(
      'getStore() called before ready() resolved. Always `await ready()` in event handlers.',
    );
  }
  return _store;
}

/** Test seam — resets the module so tests can simulate a fresh SW wake. */
export function _resetForTests(): void {
  _ready = null;
  _store = null;
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  _saveDirty = false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const browserSessionStorage: any = (browser.storage as any).session;

async function init(): Promise<void> {
  const local = await browser.storage.local.get();
  let stateFromStorage: Partial<State> = {};
  try {
    const localAny = local as { state?: string };
    if (localAny.state) {
      stateFromStorage = JSON.parse(localAny.state);
    }
  } catch {
    stateFromStorage = {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store: any = createStore(stateFromStorage);
  _store = store as Store<State, ReduxAction>;

  store.dispatch({ type: ReduxConstants.ON_STARTUP });

  // Restore the cache slice from session storage (warm SW restart) before
  // falling back to live runtime queries (cold start).
  const session = await browserSessionStorage.get('cache');
  const cache = (session as { cache?: State['cache'] }).cache;
  if (cache) {
    Object.entries(cache).forEach(([key, value]) => {
      store.dispatch({
        type: ReduxConstants.ADD_CACHE,
        payload: { key, value },
      });
    });
  } else {
    // Cold start — populate cache for the first time.
    const browserName = await detectBrowser();
    _store.dispatch({ type: ReduxConstants.ADD_CACHE, payload: { key: 'browserDetect', value: browserName } });

    if (browser.runtime.getBrowserInfo) {
      const browserInfo = await browser.runtime.getBrowserInfo();
      const browserVersion = Number.parseInt(browserInfo.version, 10);
      store.dispatch({
        type: ReduxConstants.ADD_CACHE,
        payload: { key: 'browserVersion', value: browserVersion },
      });
      store.dispatch({
        type: ReduxConstants.ADD_CACHE,
        payload: { key: 'browserInfo', value: browserInfo },
      });
    }
    const platformInfo = await browser.runtime.getPlatformInfo();
    store.dispatch({
      type: ReduxConstants.ADD_CACHE,
      payload: { key: 'platformInfo', value: platformInfo },
    });
    store.dispatch({
      type: ReduxConstants.ADD_CACHE,
      payload: { key: 'platformOs', value: platformInfo.os },
    });
  }

  StoreUser.init(store);
  SettingService.init();
  store.subscribe(SettingService.onSettingsChange);
  store.subscribe(saveSubscriber);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  store.dispatch(validateSettings());

  await setGlobalIcon(
    getSetting(store.getState(), SettingID.ACTIVE_MODE) as boolean,
  );

  await checkIfProtected(store.getState());

  if (browser.contextualIdentities) {
    await ContextualIdentitiesEvents.init();
  }
}

// --- Save debouncer (replaces the old delaySave variable in background.ts:40-50) ---

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
let _saveDirty = false;

function saveSubscriber(): void {
  _saveDirty = true;
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    flushSave().catch((err) => {
      diagnosticError('flushSave failed:', err);
    });
  }, 1000);
}

/**
 * Immediately writes the current store state to local storage AND the cache
 * slice to session storage. Called by the debounce timer and (synchronously)
 * by runtime.onSuspend so no state is ever lost on SW termination.
 */
export async function flushSave(): Promise<void> {
  if (!_saveDirty || !_store) return;
  _saveDirty = false;
  const state = _store.getState();
  try {
    await Promise.all([
      browser.storage.local.set({ state: JSON.stringify(state) }),
      browserSessionStorage.set({ cache: state.cache }),
    ]);
  } catch (err) {
    // Re-dirty so a subsequent change retries this write.
    _saveDirty = true;
    throw err;
  }
}
