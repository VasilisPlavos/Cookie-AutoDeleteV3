/**
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import { Store } from 'redux';

import { cookieCleanup } from '../redux/Actions';
import { cadLog, getSetting } from '../services/Libs';
import { ReduxAction } from '../typings/ReduxConstants';

/**
 * Browser-startup cleanup: the catch-up pass for whatever tab-close cleanup
 * missed because MV3 terminated the service worker at shutdown. It is not a
 * greylist feature — ENABLE_GREYLIST only decides whether greylisted entries
 * are included, which isSafeToClean reads for itself.
 *
 * Automatic cleanup never suspends open-tab protection here; only the
 * explicit "include open tabs" actions in the popup and context menu bypass
 * it. Discarded/unloaded tabs still follow CLEAN_DISCARDED, same as
 * everywhere else protection is evaluated.
 */
export async function runStartupCleanup(
  store: Store<State, ReduxAction>,
): Promise<void> {
  if (getSetting(store.getState(), SettingID.ACTIVE_MODE) !== true) return;

  // Firefox restores tabs behind about:sessionrestore, where those tabs do not
  // exist yet. Cleaning now would delete cookies for tabs about to reappear.
  let startupTabs: browser.tabs.Tab[];
  try {
    startupTabs = await browser.tabs.query({ windowType: 'normal' });
  } catch (err) {
    // Without a reliable tab list, open-tab protection can't be trusted —
    // skip this startup's cleanup rather than risk cleaning an open tab.
    // A genuine failure like this belongs in bug reports, so it is always
    // logged regardless of DEBUG_MODE (see CleanupService's browsingData
    // failure logs for the same convention).
    cadLog(
      {
        msg: 'runStartupCleanup: tabs.query failed; skipping startup cleanup.',
        type: 'warn',
        x: err,
      },
      true,
    );
    return;
  }
  if (startupTabs.some((tab) => tab.url === 'about:sessionrestore')) return;

  try {
    await store.dispatch<any>(
      cookieCleanup({ startup: true, ignoreOpenTabs: false }),
    );
  } catch (err) {
    // The caller (index.ts's onStartup listener) always runs
    // checkIfProtected right after this to refresh the icon/badge — a
    // rejection here must not propagate and skip that. The await above is
    // kept regardless (it exists to keep the MV3 SW alive through cleanup).
    cadLog(
      {
        msg: 'runStartupCleanup: cookieCleanup dispatch failed.',
        type: 'warn',
        x: err,
      },
      true,
    );
  }
}
