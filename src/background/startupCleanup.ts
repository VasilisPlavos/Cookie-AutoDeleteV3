/**
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import { Store } from 'redux';

import { cookieCleanup } from '../redux/Actions';
import { getSetting } from '../services/Libs';
import { ReduxAction } from '../typings/ReduxConstants';

/**
 * Browser-startup cleanup: the catch-up pass for whatever tab-close cleanup
 * missed because MV3 terminated the service worker at shutdown. It is not a
 * greylist feature — ENABLE_GREYLIST only decides whether greylisted entries
 * are included, which isSafeToClean reads for itself.
 *
 * Open tabs are always protected here. Only the explicit "include open tabs"
 * actions in the popup and context menu bypass that.
 */
export async function runStartupCleanup(
  store: Store<State, ReduxAction>,
): Promise<void> {
  if (getSetting(store.getState(), SettingID.ACTIVE_MODE) !== true) return;

  // Firefox restores tabs behind about:sessionrestore, where those tabs do not
  // exist yet. Cleaning now would delete cookies for tabs about to reappear.
  const startupTabs = await browser.tabs.query({ windowType: 'normal' });
  if (startupTabs.some((tab) => tab.url === 'about:sessionrestore')) return;

  store.dispatch<any>(
    cookieCleanup({ startup: true, ignoreOpenTabs: false }),
  );
}
