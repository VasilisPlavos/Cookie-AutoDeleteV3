/**
 * Copyright (c) 2017-2022 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { getHostname, returnMatchedExpressionObject } from './Libs';

// MV3 service workers can't reliably resolve relative icon paths during early
// startup (Chromium bug #40058177). Convert paths to ImageData up-front via
// OffscreenCanvas so chrome.action.setIcon never has to fetch from a
// chrome-extension:// URL.
const iconCache = new Map<string, ImageData>();

async function loadIconData(path: string): Promise<ImageData | null> {
  const cached = iconCache.get(path);
  if (cached) return cached;
  try {
    const url = browser.runtime.getURL(path);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    iconCache.set(path, data);
    return data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[CAD] loadIconData failed for ${path}:`, err);
    return null;
  }
}

// Show the # of cookies in icon
export const showNumberOfCookiesInIcon = (
  tab: browser.tabs.Tab,
  cookieLength: number,
): void => {
  if (browser.action.setBadgeText) {
    try {
      browser.action.setBadgeText({
        tabId: tab.id,
        text: `${cookieLength === 0 ? '' : cookieLength.toString()}`,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CAD] browser.action.setBadgeText failed:', err);
    }
  }
  if (browser.action.setBadgeTextColor) {
    try {
      browser.action.setBadgeTextColor({
        color: 'white',
        tabId: tab.id,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CAD] browser.action.setBadgeTextColor failed:', err);
    }
  }
};

// Set BrowserAction Title with number of cookies in square brackets.
export const showNumberOfCookiesInTitle = async (
  tab: browser.tabs.Tab,
  otherInfo: {
    cookieLength?: number;
    listType?: string;
    platformOS?: string;
  },
): Promise<void> => {
  const mf = browser.runtime.getManifest();
  // Use Shortened Extension name for mobile.
  const tabTitle = `${otherInfo.platformOS === 'android' ? 'CAD' : mf.name} ${
    mf.version
  }`;

  let curData: RegExpExecArray | null = null;
  try {
    curData = /\[(.*)] \((\d*)\)/.exec(
      await browser.action.getTitle({
        tabId: tab.id,
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[CAD] browser.action.getTitle failed:', err);
  }
  const newData = {
    cookies: otherInfo.cookieLength || (curData && curData[2]) || 0,
    list: otherInfo.listType || (curData && curData[1]) || 'NO LIST',
  };

  try {
    browser.action.setTitle({
      tabId: tab.id,
      title: `${tabTitle} [${newData.list}] (${newData.cookies})`,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[CAD] browser.action.setTitle failed:', err);
  }
};

// Set Badge Color accordingly (to matching list)
const setBadgeColor = (tab: browser.tabs.Tab, color = 'default') => {
  const badgeBackgroundColor: { [key: string]: string } = {
    default: 'blue',
    red: 'red',
    yellow: '#e6a32e',
  };
  if (browser.action.setBadgeBackgroundColor) {
    try {
      browser.action.setBadgeBackgroundColor({
        color: badgeBackgroundColor[color],
        tabId: tab.id,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[CAD] browser.action.setBadgeBackgroundColor failed:', err);
    }
  }
};

// Set Background icon color and badgeBackgroundColor accordingly.
const setIconColor = async (
  tab: browser.tabs.Tab,
  keepDefault = false,
  color = 'default',
): Promise<void> => {
  if (browser.action.setIcon) {
    const iconPath = `icons/icon_48${
      keepDefault || color === 'default' ? '' : `_${color}`
    }.png`;
    const imageData = await loadIconData(iconPath);
    if (imageData) {
      try {
        await browser.action.setIcon({ imageData: { 48: imageData }, tabId: tab.id });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[CAD] browser.action.setIcon (tab) failed for ${iconPath}:`, err);
      }
    }
  }

  setBadgeColor(tab, color);
};

// Set background icon for browser.
export const setGlobalIcon = async (enabled: boolean): Promise<void> => {
  if (!browser.action.setIcon) return;

  const iconPath = `icons/icon_48${enabled ? '' : '_greyscale'}.png`;
  const imageData = await loadIconData(iconPath);
  if (!imageData) return; // loadIconData already logged

  try {
    await browser.action.setIcon({ imageData: { 48: imageData } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[CAD] browser.action.setIcon (global) failed for ${iconPath}:`, err);
  }

  const tabAwait = await browser.tabs.query({ windowType: 'normal' });
  for (const tab of tabAwait) {
    if (tab.id !== browser.tabs.TAB_ID_NONE) {
      try {
        await browser.action.setIcon({ imageData: { 48: imageData }, tabId: tab.id });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[CAD] browser.action.setIcon (tab) failed for ${iconPath}:`, err);
      }
    }
  }
};

// Check if the site is protected and adjust the icon and titles appropriately
export const checkIfProtected = async (
  state: State,
  tab: browser.tabs.Tab | undefined = undefined,
  cookieLength?: number,
): Promise<void> => {
  const active = state.settings[SettingID.ACTIVE_MODE].value as boolean;
  let activeTabs: browser.tabs.Tab[] = [];

  if (tab) {
    activeTabs.push(tab);
  } else {
    // No tab provided - query all active tabs instead.
    activeTabs = await browser.tabs.query({
      active: true,
      windowType: 'normal',
    });
  }

  for (const aTab of activeTabs) {
    const matchedExpression = returnMatchedExpressionObject(
      state,
      aTab.cookieStoreId || 'default',
      getHostname(aTab.url || ''),
    );

    if (matchedExpression) {
      showNumberOfCookiesInTitle(aTab, {
        platformOS: state.cache.platformOs,
        listType: matchedExpression.listType,
        cookieLength,
      });
    } else {
      showNumberOfCookiesInTitle(aTab, {
        platformOS: state.cache.platformOs,
        listType: 'NO LIST',
        cookieLength,
      });
    }

    // Can't set icons on Android.
    if (state.cache.platformOs && state.cache.platformOs === 'android') continue;

    if (matchedExpression) {
      switch (matchedExpression.listType) {
        case ListType.WHITE:
          if (active) {
            await setIconColor(aTab);
          } else {
            setBadgeColor(aTab);
          }
          break;
        case ListType.GREY:
          if (active) {
            await setIconColor(
              aTab,
              state.settings[SettingID.KEEP_DEFAULT_ICON].value as boolean,
              'yellow',
            );
          } else {
            setBadgeColor(aTab, 'yellow');
          }
          break;
        default:
          if (active) {
            await setIconColor(
              aTab,
              state.settings[SettingID.KEEP_DEFAULT_ICON].value as boolean,
              'red',
            );
          } else {
            setBadgeColor(aTab, 'red');
          }
          break;
      }
    } else {
      if (cookieLength !== undefined && cookieLength === 0) {
        if (active) {
          await setIconColor(aTab);
        } else {
          setBadgeColor(aTab);
        }
      } else {
        if (active) {
          await setIconColor(
            aTab,
            state.settings[SettingID.KEEP_DEFAULT_ICON].value as boolean,
            'red',
          );
        } else {
          setBadgeColor(aTab, 'red');
        }
      }
    }
  }
};
