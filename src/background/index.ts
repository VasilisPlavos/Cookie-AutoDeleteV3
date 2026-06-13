/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import 'webextension-polyfill';

import { cookieCleanup, validateSettings } from '../redux/Actions';
import { reduxWebextActions } from '../redux/Store';
import { checkIfProtected } from '../services/BrowserActionService';
import AlarmScheduler from '../services/AlarmScheduler';
import ContextMenuEvents from '../services/ContextMenuEvents';
import CookieEvents from '../services/CookieEvents';
import TabEvents from '../services/TabEvents';
import {
  cadLog,
  convertVersionToNumber,
  eventListenerActions,
  extractMainDomain,
  getSetting,
} from '../services/Libs';
import { ReduxConstants } from '../typings/ReduxConstants';
import { flushSave, getStore, ready } from './lifecycle';

// --- Tabs ---

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await ready();
  // Forward to the existing TabEvents handlers in their original order.
  TabEvents.onDomainChange(tabId, changeInfo, tab);
  TabEvents.onTabDiscarded(tabId, changeInfo, tab);
  TabEvents.onTabUpdate(tabId, changeInfo, tab);
});

browser.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  await ready();
  TabEvents.onDomainChangeRemove(tabId, removeInfo);
  TabEvents.cleanFromTabEvents();
});

// --- Cookies ---

browser.cookies.onChanged.addListener(async (changeInfo) => {
  await ready();
  CookieEvents.onCookieChanged(changeInfo);
});

// --- Alarms ---

browser.alarms.onAlarm.addListener(async (alarm) => {
  await ready();
  AlarmScheduler.handleAlarm(alarm);
});

// --- Runtime lifecycle ---

browser.runtime.onStartup.addListener(async () => {
  await ready();
  const store = getStore();
  if (getSetting(store.getState(), SettingID.ACTIVE_MODE) === true) {
    if (getSetting(store.getState(), SettingID.ENABLE_GREYLIST) === true) {
      let isFFSessionRestore = false;
      const startupTabs = await browser.tabs.query({ windowType: 'normal' });
      startupTabs.forEach((tab) => {
        if (tab.url === 'about:sessionrestore') isFFSessionRestore = true;
      });
      if (!isFFSessionRestore) {
        store.dispatch<any>(
          cookieCleanup({
            greyCleanup: true,
            ignoreOpenTabs: getSetting(
              store.getState(),
              SettingID.CLEAN_OPEN_TABS_STARTUP,
            ),
          }),
        );
      }
    }
  }
  await checkIfProtected(store.getState());
});

browser.runtime.onInstalled.addListener(async (details) => {
  await ready();
  const store = getStore();
  await checkIfProtected(store.getState());

  switch (details.reason) {
    case 'install':
      await browser.runtime.openOptionsPage();
      break;
    case 'update':
      store.dispatch<any>(validateSettings());
      if (convertVersionToNumber(details.previousVersion) < 350) {
        if (store.getState().settings[SettingID.CLEANUP_LOCALSTORAGE_OLD]) {
          store.dispatch({
            type: ReduxConstants.UPDATE_SETTING,
            payload: {
              name: SettingID.CLEANUP_LOCALSTORAGE,
              value: store.getState().settings[SettingID.CLEANUP_LOCALSTORAGE_OLD].value as boolean,
            },
          });
        }
        Object.values(store.getState().lists).forEach((list) => {
          list.forEach((exp) => {
            if (exp.cleanLocalStorage && !exp.cleanSiteData) {
              store.dispatch({
                type: ReduxConstants.UPDATE_EXPRESSION,
                payload: {
                  ...exp,
                  cleanSiteData: [SiteDataType.LOCALSTORAGE],
                },
              });
            }
          });
        });
        for (const lt of [ListType.GREY, ListType.WHITE]) {
          if (
            getSetting(
              store.getState(),
              `${lt.toLowerCase()}CleanLocalstorage` as SettingID,
            )
          ) {
            const containers = new Set<string>(Object.keys(store.getState().lists));
            containers.add('default');
            if (getSetting(store.getState(), SettingID.CONTEXTUAL_IDENTITIES)) {
              const cios = await browser.contextualIdentities.query({});
              cios.forEach((c) => containers.add(c.cookieStoreId));
            }
            containers.forEach((list) => {
              store.dispatch({
                type: ReduxConstants.ADD_EXPRESSION,
                payload: {
                  expression: `_Default:${lt}`,
                  cleanSiteData: [SiteDataType.LOCALSTORAGE],
                  listType: lt,
                  storeId: list,
                },
              });
            });
          }
        }
      }
      if (convertVersionToNumber(details.previousVersion) < 300) {
        store.dispatch({ type: ReduxConstants.RESET_COOKIE_DELETED_COUNTER });
      }
      if (getSetting(store.getState(), SettingID.ENABLE_NEW_POPUP)) {
        await browser.runtime.openOptionsPage();
      }
      break;
    default:
      break;
  }
});

// --- runtime.onSuspend: flush pending state before SW termination ---
// onSuspend is a Chrome/MV3 extension point not present in the Firefox
// webext-types declaration, so we access it via a cast.
const _runtimeAny = browser.runtime as unknown as Record<string, { addListener: (cb: () => void) => void } | undefined>;
if (_runtimeAny['onSuspend']) {
  _runtimeAny['onSuspend'].addListener(() => {
    // No await — onSuspend can't keep the SW alive past return. The promise from
    // flushSave() races with termination; chrome.storage.local writes are
    // best-effort but fast.
    flushSave();
  });
}

// --- redux-webext protocol constants (mirrored from node_modules/redux-webext/lib/constants.js) ---
const REDUX_WEBEXT_CONNECTION = 'redux-webext';
const REDUX_WEBEXT_DISPATCH = '@@STORE_DISPATCH';
const REDUX_WEBEXT_UPDATE_STATE = '@@STORE_UPDATE_STATE';

// --- redux-webext message + connection (TOP LEVEL — required for MV3 SW wake) ---
//
// createBackgroundStore inside lifecycle.ts ran async inside init(), which
// meant the listeners were registered too late on a cold SW wake: the popup's
// first sendMessage/connect arrived before any handler existed, the callback
// never fired, createUIStore() hung, and React never mounted (empty popup).
//
// We re-implement the redux-webext background protocol inline here so that
// Chrome sees the listeners synchronously at module-load time and wakes the
// SW correctly. After waking we await ready() so the store is initialised
// before we touch it.

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== REDUX_WEBEXT_CONNECTION) return;

  let unsubscribe: (() => void) | null = null;

  (async () => {
    await ready();
    const store = getStore();
    // Push current state immediately so the UI doesn't have to ask separately.
    port.postMessage({ type: REDUX_WEBEXT_UPDATE_STATE, data: store.getState() });
    // Forward subsequent store changes over the port.
    unsubscribe = store.subscribe(() => {
      try {
        port.postMessage({ type: REDUX_WEBEXT_UPDATE_STATE, data: store.getState() });
      } catch {
        // Port disconnected; clean up.
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      }
    });
  })();

  port.onDisconnect.addListener(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
});

browser.runtime.onMessage.addListener((msg: any, _sender: browser.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === REDUX_WEBEXT_UPDATE_STATE) {
    (async () => {
      await ready();
      sendResponse(getStore().getState());
    })();
    return true; // keep channel open for async sendResponse
  }

  if (msg.type === REDUX_WEBEXT_DISPATCH) {
    (async () => {
      await ready();
      const action = msg.action || {};
      const { type, ...actionData } = action;
      const actionFn = (reduxWebextActions as any)[type];
      if (typeof actionFn === 'function') {
        // Mirror redux-webext's own logic exactly: unwrap `payload` from the
        // remaining action fields. If the original action had any extra fields,
        // pass `payload` (defaulting to {}) — otherwise pass undefined. Without
        // this unwrap, action creators receive `{ payload: {...} }` instead of
        // `{...}` and reads like `payload.storeId` silently resolve to undefined.
        const { payload = {} } = actionData as { payload?: unknown };
        const arg = Object.keys(actionData).length ? payload : undefined;
        getStore().dispatch(actionFn(arg));
      } else {
        // eslint-disable-next-line no-console
        console.warn('[CAD] redux-webext DISPATCH received unknown action type:', type);
      }
      sendResponse(undefined);
    })();
    return true;
  }

  return false;
});

// --- Popup port (live cookie-count updates) ---

const cookiePopupPorts: browser.runtime.Port[] = [];

async function onCookiePopupUpdates(changeInfo: {
  removed: boolean;
  cookie: browser.cookies.Cookie;
  cause: browser.cookies.OnChangedCause;
}): Promise<void> {
  await ready();
  const cDomain = extractMainDomain(changeInfo.cookie.domain);
  cookiePopupPorts.forEach((p) => {
    if (!p.name) return;
    if (!p.name.startsWith('popupCAD_')) return;
    const pn = p.name.slice(9).split(',');
    if (pn[0].endsWith(changeInfo.cookie.domain) || pn[0].endsWith(cDomain)) {
      p.postMessage({ cookieUpdated: true });
    }
  });
}

browser.runtime.onConnect.addListener(async (p) => {
  if (!p.name || !p.name.startsWith('popupCAD_')) return;
  await ready();
  eventListenerActions(
    browser.cookies.onChanged,
    onCookiePopupUpdates,
    EventListenerAction.ADD,
  );
  p.onMessage.addListener((m) => {
    cadLog(
      { msg: 'Received unexpected message from CAD Popup', type: 'warn', x: JSON.stringify(m) },
      true,
    );
  });
  p.onDisconnect.addListener((dp) => {
    if (cookiePopupPorts.length - 1 === 0) {
      eventListenerActions(
        browser.cookies.onChanged,
        onCookiePopupUpdates,
        EventListenerAction.REMOVE,
      );
    }
    if (!dp.name) return;
    const i = cookiePopupPorts.findIndex((pp) => pp.name === dp.name);
    if (i !== -1) cookiePopupPorts.splice(i, 1);
  });
  p.postMessage({ cookieUpdated: true });
  cookiePopupPorts.push(p);
});

// --- Context menus ---
// Register onClicked at module top level so MV3 SW wakes on context-menu clicks.
// Menu creation (menuInit) still runs after ready() because it needs the store.

if (browser.contextMenus) {
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    await ready();
    ContextMenuEvents.onContextMenuClicked(info, tab);
  });
}

ready().then(async () => {
  if (browser.contextMenus) {
    await ContextMenuEvents.menuInit();
  }
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[CAD] context menu init failed:', err);
});
