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
  beforeEach(() => {
    when(spyCleanupService.cleanCookiesOperation)
      .calledWith(expect.any(Object), expect.any(Object))
      .mockResolvedValue({
        setOfDeletedDomainCookies: [],
        cachedResults: {
          dateTime: 'now',
          recentlyCleaned: 0,
          storeIds: {},
          browsingDataCleanup: {},
          siteDataCleaned: false,
        },
      } as never);
  });

  it('clears domainsToClean after a successful startup cleanup', async () => {
    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      domainsToClean: ['a.com', 'b.com'],
    });

    await store.dispatch<any>(
      Actions.cookieCleanup({ startup: true, ignoreOpenTabs: false }),
    );

    expect(store.getState().domainsToClean).toEqual([]);
  });

  it('clears domainsToClean on a startup cleanup even when greylist cleanup is off', async () => {
    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      settings: {
        ...initialState.settings,
        [SettingID.ENABLE_GREYLIST]: {
          name: SettingID.ENABLE_GREYLIST,
          value: false,
        },
      },
      domainsToClean: ['a.com', 'b.com'],
    });

    await store.dispatch<any>(
      Actions.cookieCleanup({ startup: true, ignoreOpenTabs: false }),
    );

    expect(store.getState().domainsToClean).toEqual([]);
  });

  it('keeps registry domains that were not cleaned on a non-startup cleanup', async () => {
    const store: Store<State, ReduxAction> = createStore({
      ...initialState,
      domainsToClean: ['a.com'],
    });

    // browsingDataCleanup is empty (nothing cleaned), so nothing is dropped.
    await store.dispatch<any>(
      Actions.cookieCleanup({ startup: false, ignoreOpenTabs: false }),
    );

    expect(store.getState().domainsToClean).toEqual(['a.com']);
  });

  it('on a non-startup cleanup, drops only the registry domains that were actually cleaned', async () => {
    when(spyCleanupService.cleanCookiesOperation)
      .calledWith(expect.any(Object), expect.any(Object))
      .mockResolvedValue({
        setOfDeletedDomainCookies: [],
        cachedResults: {
          dateTime: 'now',
          recentlyCleaned: 0,
          storeIds: {},
          browsingDataCleanup: {
            [SiteDataType.LOCALSTORAGE]: ['a.com'],
          },
          siteDataCleaned: true,
        },
      } as never);
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

    // 'a.com' was cleaned so it is dropped; 'protected.com' (e.g. open tab or
    // whitelisted, hence not cleaned) is kept for a later run.
    expect(store.getState().domainsToClean).toEqual(['protected.com']);
  });
});
