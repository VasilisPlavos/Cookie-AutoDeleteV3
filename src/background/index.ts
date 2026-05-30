/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import 'webextension-polyfill';

import { cookieCleanup, validateSettings } from '../redux/Actions';
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

// --- Context menus: initialized inside ready() since they need the store. ---
//     A separate top-level browser.contextMenus.onClicked listener is set up
//     inside ContextMenuEvents.menuInit() via eventListenerActions().
ready().then(() => {
  if (browser.contextMenus) {
    ContextMenuEvents.menuInit();
  }
}).catch((err) => {
  console.error('[CAD] background init failed:', err);
});
