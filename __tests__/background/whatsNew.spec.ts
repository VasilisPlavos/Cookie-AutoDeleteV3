import { openWhatsNewOnUpdate } from '../../src/background/whatsNew';
import { initialState } from '../../src/redux/State';

const stateWith = (disabled: boolean): State =>
  ({
    ...initialState,
    settings: {
      ...initialState.settings,
      [SettingID.DISABLE_NEW_VERSION_POPUP]: {
        name: SettingID.DISABLE_NEW_VERSION_POPUP,
        value: disabled,
      },
    },
  } as State);

describe('openWhatsNewOnUpdate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the options page when the disable setting is off (default)', async () => {
    await openWhatsNewOnUpdate(stateWith(false));
    expect(global.browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('does not open the options page when the disable setting is on', async () => {
    await openWhatsNewOnUpdate(stateWith(true));
    expect(global.browser.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});
