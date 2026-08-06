/**
 * Copyright (c) 2019-2022 Kenneth Tran and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
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

/**
 *  Dynamically generate timestamp as a string
 */
export const appendDynamicTimestamp = (): string => {
  // We take into account the timezone offset since using Date.toISOString() returns in UTC/GMT.
  return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, -5)
    .replace('T', '_')
    .replace(/:/g, '.');
};

/**
 * Dynamically generate data to be downloaded and executes the download.
 * https://stackoverflow.com/questions/19721439/download-json-object-as-a-file-from-browser
 */
export const downloadObjectAsJSON = (
  exportObj: Record<string, unknown>,
  exportName = 'ExportedData',
): Record<string, boolean | null | string> => {
  const dataHref = `data:text/json;charset=urf-8,${encodeURIComponent(
    JSON.stringify(exportObj, null, 2),
  )}`;
  const downloadNode = document.createElement('a');
  downloadNode.setAttribute('href', dataHref);
  downloadNode.setAttribute(
    'download',
    `CAD_${exportName}_${appendDynamicTimestamp()}.json`,
  );
  downloadNode.setAttribute('target', '_blank');
  document.body.appendChild(downloadNode);
  downloadNode.click();
  downloadNode.remove();
  return {
    status: true,
    downloadHref: downloadNode.getAttribute('href'),
    downloadName: downloadNode.getAttribute('download'),
  };
};

// #58: the "Cookies to keep" dropdown in ExpressionOptions is a presentation
// layer over two stored fields — cleanAllCookies (existing) and firstPartyOnly
// (new). These pure helpers translate both directions.
export type CookiePolicy = 'all' | 'firstPartyOnly' | 'selected';

export const cookiePolicyFromExpression = (
  expression: Expression,
): CookiePolicy => {
  if (expression.cleanAllCookies === false) return 'selected';
  if (expression.firstPartyOnly) return 'firstPartyOnly';
  return 'all';
};

export const expressionFieldsForCookiePolicy = (
  policy: CookiePolicy,
): { cleanAllCookies: boolean; firstPartyOnly: boolean } => {
  switch (policy) {
    case 'selected':
      return { cleanAllCookies: false, firstPartyOnly: false };
    case 'firstPartyOnly':
      return { cleanAllCookies: true, firstPartyOnly: true };
    case 'all':
    default:
      return { cleanAllCookies: true, firstPartyOnly: false };
  }
};

// A removed setting (e.g. cleanCookiesFromOpenTabsOnStartup) can still show
// up here — from an older export file, or rehydrated from storage.local.
export const partitionSettingsByKnownKeys = (
  settings: readonly Setting[],
  knownKeys: readonly string[],
): { known: Setting[]; dropped: string[] } => {
  const known: Setting[] = [];
  const dropped: string[] = [];
  settings.forEach((setting) => {
    if (knownKeys.includes(setting.name)) {
      known.push(setting);
    } else {
      dropped.push(setting.name);
    }
  });
  return { known, dropped };
};
