/**
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import { getSetting } from '../services/Libs';

/**
 * Opens the Welcome tab (the options page) after an extension update, unless
 * the user opted out via SettingID.DISABLE_NEW_VERSION_POPUP.
 */
export async function openWhatsNewOnUpdate(state: State): Promise<void> {
  if (!getSetting(state, SettingID.DISABLE_NEW_VERSION_POPUP)) {
    await browser.runtime.openOptionsPage();
  }
}
