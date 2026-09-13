/**
 * Copyright (c) 2022 CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
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
import { when } from 'jest-when';
import { Store } from 'redux';
import * as Actions from '../../src/redux/Actions';
import { initialState } from '../../src/redux/State';
// tslint:disable-next-line: import-name
import createStore from '../../src/redux/Store';
import * as CleanupService from '../../src/services/CleanupService';
import { ReduxAction } from '../../src/typings/ReduxConstants';

const spyCleanupService: JestSpyObject = global.generateSpies(CleanupService);

describe('validateSettings', () => {
  it('adds a missing setting even when the key count is unchanged (swap case)', () => {
    // Simulate an existing user: same number of settings as initialState, but
    // missing DISABLE_NEW_VERSION_POPUP and carrying a stale key instead — so
    // the old count-based guard would have skipped repopulation.
    // Cast to Record so `delete` and the arbitrary stale key type-check.
    const settings = { ...initialState.settings } as Record<string, Setting>;
    delete settings[SettingID.DISABLE_NEW_VERSION_POPUP];
    settings.staleLegacyKey = { name: 'staleLegacyKey', value: true } as Setting;

    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      settings,
    });
    expect(
      store.getState().settings[SettingID.DISABLE_NEW_VERSION_POPUP],
    ).toBeUndefined();

    store.dispatch<any>(Actions.validateSettings());

    expect(
      store.getState().settings[SettingID.DISABLE_NEW_VERSION_POPUP],
    ).toEqual({
      name: SettingID.DISABLE_NEW_VERSION_POPUP,
      value: false,
    });
  });
});

describe('cookieCleanup', () => {
  const mockCleanupResult = (registryDomainsToRemove: string[]) =>
    ({
      setOfDeletedDomainCookies: [],
      cachedResults: {
        dateTime: 'now',
        recentlyCleaned: 0,
        storeIds: {},
        browsingDataCleanup: {},
        siteDataCleaned: false,
      },
      registryDomainsToRemove,
    } as never);

  beforeEach(() => {
    when(spyCleanupService.cleanCookiesOperation)
      .calledWith(expect.any(Object), expect.any(Object))
      .mockResolvedValue(mockCleanupResult([]));
  });

  it('drops registry domains CleanupService reports as safe to remove, on startup', async () => {
    when(spyCleanupService.cleanCookiesOperation)
      .calledWith(expect.any(Object), expect.any(Object))
      .mockResolvedValue(mockCleanupResult(['a.com', 'protected.com']));
    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      domainsToClean: ['a.com', 'protected.com'],
    });

    await store.dispatch<any>(
      Actions.cookieCleanup({ startup: true, ignoreOpenTabs: false }),
    );

    expect(store.getState().domainsToClean).toEqual([]);
  });

  it('keeps a registry domain CleanupService did not report as safe to remove, on startup', async () => {
    when(spyCleanupService.cleanCookiesOperation)
      .calledWith(expect.any(Object), expect.any(Object))
      .mockResolvedValue(mockCleanupResult(['a.com']));
    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      domainsToClean: ['a.com', 'protected.com'],
    });

    await store.dispatch<any>(
      Actions.cookieCleanup({ startup: true, ignoreOpenTabs: false }),
    );

    // 'protected.com' (e.g. still open in a tab) was not reported as safe to
    // remove, so it stays queued for a later run.
    expect(store.getState().domainsToClean).toEqual(['protected.com']);
  });

  it('keeps registry domains untouched on a non-startup cleanup when nothing is safe to remove', async () => {
    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      domainsToClean: ['a.com'],
    });

    await store.dispatch<any>(
      Actions.cookieCleanup({ startup: false, ignoreOpenTabs: false }),
    );

    expect(store.getState().domainsToClean).toEqual(['a.com']);
  });

  it('drops only the registry domains reported as safe to remove, on a non-startup cleanup', async () => {
    when(spyCleanupService.cleanCookiesOperation)
      .calledWith(expect.any(Object), expect.any(Object))
      .mockResolvedValue(mockCleanupResult(['a.com']));
    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      settings: {
        ...initialState.settings,
        [SettingID.NOTIFY_AUTO]: {
          name: SettingID.NOTIFY_AUTO,
          value: false,
        },
      },
      domainsToClean: ['a.com', 'protected.com'],
    });

    await store.dispatch<any>(
      Actions.cookieCleanup({ startup: false, ignoreOpenTabs: false }),
    );

    // 'a.com' was reported safe to remove; 'protected.com' (e.g. open tab) was
    // not, so it is kept for a later run.
    expect(store.getState().domainsToClean).toEqual(['protected.com']);
  });
});
