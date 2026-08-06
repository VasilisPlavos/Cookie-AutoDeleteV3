/**
 * Instrumented `browser.*` mock for hot-path measurement.
 *
 * Unlike __tests__/setup.js (jest.fn() stubs that return undefined), this mock
 * returns realistic payloads so the real CAD code paths actually execute, and
 * counts every extension-API call so we can report exact IPC counts per event.
 */
'use strict';

const calls = {};
let ipcLatencyMs = 0;

function resetCalls() {
  for (const k of Object.keys(calls)) delete calls[k];
}

function totalCalls() {
  return Object.values(calls).reduce((a, b) => a + b, 0);
}

function ipc(name, result) {
  calls[name] = (calls[name] || 0) + 1;
  if (ipcLatencyMs > 0) {
    return new Promise((r) => setTimeout(() => r(result), ipcLatencyMs));
  }
  return Promise.resolve(result);
}

function sync(name, result) {
  calls[name] = (calls[name] || 0) + 1;
  return result;
}

// --- realistic fixtures -----------------------------------------------------

const DOMAINS = [
  'example.com', 'news.site.org', 'shop.example.net', 'video.example.io',
  'mail.example.com', 'docs.example.org', 'forum.example.net', 'blog.example.co',
];

function makeTab(i) {
  const d = DOMAINS[i % DOMAINS.length];
  return {
    id: i + 1,
    index: i,
    windowId: 1,
    active: i === 0,
    url: `https://www.${d}/page/${i}`,
    title: `Tab ${i} - ${d}`,
    status: 'complete',
    cookieStoreId: '0',
    incognito: false,
    discarded: false,
    favIconUrl: `https://www.${d}/favicon.ico`,
    highlighted: i === 0,
    pinned: false,
    selected: i === 0,
  };
}

function makeCookie(i, domain) {
  return {
    name: `cookie_${i}`,
    value: 'v'.repeat(32),
    domain: `.${domain}`,
    hostOnly: false,
    path: '/',
    secure: true,
    httpOnly: i % 3 === 0,
    sameSite: 'lax',
    session: i % 4 === 0,
    firstPartyDomain: '',
    storeId: '0',
    expirationDate: 1900000000,
  };
}

/**
 * @param {number} tabCount how many normal tabs the profile has open
 * @param {number} cookiesPerDomain cookies returned by cookies.getAll for a domain
 */
function install({ tabCount = 10, cookiesPerDomain = 25 } = {}) {
  const tabs = Array.from({ length: tabCount }, (_, i) => makeTab(i));
  const cookiesFor = (domain) =>
    Array.from({ length: cookiesPerDomain }, (_, i) => makeCookie(i, domain));

  const storageLocal = { data: {} };
  const storageSession = { data: {} };

  const area = (backing, label) => ({
    get: (key) => {
      calls[`storage.${label}.get`] = (calls[`storage.${label}.get`] || 0) + 1;
      if (key === undefined) return Promise.resolve({ ...backing.data });
      if (typeof key === 'string') {
        return Promise.resolve(
          backing.data[key] === undefined ? {} : { [key]: backing.data[key] },
        );
      }
      return Promise.resolve({ ...backing.data });
    },
    set: (obj) => {
      calls[`storage.${label}.set`] = (calls[`storage.${label}.set`] || 0) + 1;
      Object.assign(backing.data, obj);
      return Promise.resolve();
    },
    remove: (key) => {
      calls[`storage.${label}.remove`] = (calls[`storage.${label}.remove`] || 0) + 1;
      delete backing.data[key];
      return Promise.resolve();
    },
    clear: () => Promise.resolve(),
  });

  const noop = () => {};
  const listeners = {
    addListener: noop,
    removeListener: noop,
    hasListener: () => false,
    clearListeners: noop,
  };

  const browser = {
    action: {
      setIcon: () => ipc('action.setIcon'),
      setTitle: () => sync('action.setTitle'),
      getTitle: () => ipc('action.getTitle', 'Cookie AutoDelete 1.3.0 [NO LIST] (0)'),
      setBadgeText: () => sync('action.setBadgeText'),
      setBadgeTextColor: () => sync('action.setBadgeTextColor'),
      setBadgeBackgroundColor: () => sync('action.setBadgeBackgroundColor'),
      getBadgeText: () => ipc('action.getBadgeText', ''),
    },
    alarms: {
      get: () => ipc('alarms.get', undefined),
      create: () => sync('alarms.create'),
      clear: () => ipc('alarms.clear', true),
      clearAll: () => ipc('alarms.clearAll', true),
      getAll: () => ipc('alarms.getAll', []),
      onAlarm: listeners,
    },
    browsingData: {
      remove: () => ipc('browsingData.remove'),
    },
    cookies: {
      getAll: (details) => {
        calls['cookies.getAll'] = (calls['cookies.getAll'] || 0) + 1;
        const dom = (details && details.domain) || '';
        if (dom === '') return Promise.resolve([]); // isFirstPartyIsolate probe
        return Promise.resolve(cookiesFor(dom.replace(/^\./, '')));
      },
      getAllCookieStores: () => ipc('cookies.getAllCookieStores', [{ id: '0', tabIds: [] }]),
      get: () => ipc('cookies.get', null),
      set: () => ipc('cookies.set', {}),
      remove: () => ipc('cookies.remove', {}),
      onChanged: listeners,
    },
    i18n: { getMessage: (k) => sync('i18n.getMessage', k) },
    contextMenus: undefined, // measured separately; not part of the hot paths
    notifications: { create: () => ipc('notifications.create') },
    privacy: { websites: { firstPartyIsolate: { get: () => ipc('privacy.get', { value: false }) } } },
    runtime: {
      getManifest: () => sync('runtime.getManifest', { name: 'Cookie AutoDelete', version: '1.3.0' }),
      getURL: (p) => sync('runtime.getURL', `chrome-extension://abcdef/${p}`),
      getPlatformInfo: () => ipc('runtime.getPlatformInfo', { os: 'win', arch: 'x86-64' }),
      getBrowserInfo: undefined, // Chrome
      openOptionsPage: () => ipc('runtime.openOptionsPage'),
      onConnect: listeners,
      onInstalled: listeners,
      onMessage: listeners,
      onStartup: listeners,
      onSuspend: listeners,
      id: 'abcdef',
    },
    storage: {
      local: area(storageLocal, 'local'),
      session: area(storageSession, 'session'),
      sync: area({ data: {} }, 'sync'),
      managed: area({ data: {} }, 'managed'),
      onChanged: listeners,
    },
    tabs: {
      TAB_ID_NONE: -1,
      query: (q) => {
        calls['tabs.query'] = (calls['tabs.query'] || 0) + 1;
        if (q && q.active) return Promise.resolve(tabs.filter((t) => t.active));
        return Promise.resolve(tabs);
      },
      get: (id) => ipc('tabs.get', tabs.find((t) => t.id === id)),
      create: () => ipc('tabs.create', makeTab(999)),
      onUpdated: listeners,
      onRemoved: listeners,
    },
    extension: { isAllowedIncognitoAccess: () => ipc('extension.incognito', false) },
    contextualIdentities: undefined, // Chrome
  };

  global.browser = browser;
  global.chrome = browser;
  global.navigator = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  // Globals BrowserActionService.loadIconData needs (browser-only APIs).
  global.fetch = () => {
    calls['fetch(icon)'] = (calls['fetch(icon)'] || 0) + 1;
    return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ size: 1024 }) });
  };
  global.createImageBitmap = () => {
    calls['createImageBitmap'] = (calls['createImageBitmap'] || 0) + 1;
    return Promise.resolve({ width: 48, height: 48, close: noop });
  };
  global.OffscreenCanvas = class {
    constructor(w, h) {
      this.width = w;
      this.height = h;
    }
    getContext() {
      return {
        drawImage: noop,
        getImageData: (x, y, w, h) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
      };
    }
  };

  return { browser, tabs, storageLocal, storageSession };
}

module.exports = {
  install,
  calls,
  resetCalls,
  totalCalls,
  makeTab,
  makeCookie,
  setIpcLatency: (ms) => {
    ipcLatencyMs = ms;
  },
};
