/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
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

import AlarmScheduler from './AlarmScheduler';
import { getSetting } from './Libs';
import StoreUser from './StoreUser';

/**
 * Back-compat shim: TabEvents.cleanFromTabEvents still calls
 * AlarmEvents.createActiveModeAlarm(). Forward to AlarmScheduler.
 */
export default class AlarmEvents extends StoreUser {
  public static createActiveModeAlarm = async (): Promise<void> => {
    const seconds = parseInt(
      getSetting(StoreUser.store.getState(), SettingID.CLEAN_DELAY) as string,
      10,
    );
    const ms = (seconds > 0 ? seconds : 0.5) * 1000;
    if (getSetting(StoreUser.store.getState(), SettingID.ACTIVE_MODE)) {
      await AlarmScheduler.scheduleCleanup(ms);
    }
  };
}
