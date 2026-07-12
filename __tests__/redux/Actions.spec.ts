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
import { Store } from 'redux';
import * as Actions from '../../src/redux/Actions';
import { initialState } from '../../src/redux/State';
// tslint:disable-next-line: import-name
import createStore from '../../src/redux/Store';
import { ReduxAction } from '../../src/typings/ReduxConstants';

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
