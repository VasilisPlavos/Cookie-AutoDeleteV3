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
  knownKeys: ReadonlySet<string>,
): { known: Setting[]; dropped: string[] } => {
  // A duplicated name is deduplicated last-wins, mirroring how applying each
  // entry in order would leave the settings map: a later entry for the same
  // name overrides an earlier one rather than both being carried forward.
  const deduped = Array.from(
    new Map(settings.map((setting) => [setting.name, setting])).values(),
  );
  const known: Setting[] = [];
  const dropped: string[] = [];
  deduped.forEach((setting) => {
    if (knownKeys.has(setting.name)) {
      known.push(setting);
    } else {
      dropped.push(setting.name);
    }
  });
  return { known, dropped };
};

export interface CoreSettingsImportDecision {
  // De-duplicated (last-wins), known-key settings to apply.
  toApply: Setting[];
  // De-duplicated names of settings this version does not recognize.
  dropped: string[];
  // True when nothing is applicable — either the file had no settings at
  // all, or none of the settings it had are recognized by this version.
  // Callers that need to tell those two cases apart for messaging can do so
  // from `dropped.length` (0 for the former, >0 for the latter).
  isError: boolean;
}

/**
 * The pure decision behind Settings import: given the raw settings parsed
 * from an import file and the set of keys this version knows about, decide
 * what should be applied, what was dropped, and whether the import as a
 * whole is an error. Kept free of any DOM/redux I/O so it can be unit tested
 * directly (jest's testEnvironment is 'node' — no jsdom, so the component
 * method itself cannot be).
 */
export const decideCoreSettingsImport = (
  settings: readonly Setting[],
  knownKeys: ReadonlySet<string>,
): CoreSettingsImportDecision => {
  const { known, dropped } = partitionSettingsByKnownKeys(settings, knownKeys);
  return {
    toApply: known,
    dropped,
    isError: known.length === 0,
  };
};
