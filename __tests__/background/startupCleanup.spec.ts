/**
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import { when } from 'jest-when';

import { runStartupCleanup } from '../../src/background/startupCleanup';
import * as Actions from '../../src/redux/Actions';
import { initialState } from '../../src/redux/State';

const spyCookieCleanup = jest.spyOn(Actions, 'cookieCleanup');

const storeWith = (activeMode: boolean, enableGreylist: boolean) => {
  const state: State = {
    ...initialState,
    settings: {
      ...initialState.settings,
      [SettingID.ACTIVE_MODE]: {
        name: SettingID.ACTIVE_MODE,
        value: activeMode,
      },
      [SettingID.ENABLE_GREYLIST]: {
        name: SettingID.ENABLE_GREYLIST,
        value: enableGreylist,
      },
    },
  };
  return {
    dispatch: jest.fn(),
    getState: () => state,
  };
};

const mockTabs = (urls: string[]) => {
  when(global.browser.tabs.query)
    .calledWith(expect.any(Object))
    .mockResolvedValue(urls.map((url) => ({ url })) as never);
};

describe('runStartupCleanup', () => {
  beforeEach(() => {
    spyCookieCleanup.mockReturnValue({ type: 'TEST_CLEANUP' } as never);
    mockTabs(['https://example.com']);
  });

  it('runs when greylist cleanup is off', async () => {
    const store = storeWith(true, false);

    await runStartupCleanup(store as never);

    expect(spyCookieCleanup).toHaveBeenCalledWith({
      startup: true,
      ignoreOpenTabs: false,
    });
    expect(store.dispatch).toHaveBeenCalledTimes(1);
  });

  it('runs when greylist cleanup is on', async () => {
    const store = storeWith(true, true);

    await runStartupCleanup(store as never);

    expect(spyCookieCleanup).toHaveBeenCalledWith({
      startup: true,
      ignoreOpenTabs: false,
    });
  });

  it('does nothing when active mode is off', async () => {
    const store = storeWith(false, true);

    await runStartupCleanup(store as never);

    expect(spyCookieCleanup).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('skips the run while Firefox is showing about:sessionrestore', async () => {
    mockTabs(['about:sessionrestore', 'https://example.com']);
    const store = storeWith(true, true);

    await runStartupCleanup(store as never);

    expect(spyCookieCleanup).not.toHaveBeenCalled();
  });

  it('never suspends open-tab protection', async () => {
    const store = storeWith(true, true);

    await runStartupCleanup(store as never);

    expect(spyCookieCleanup).toHaveBeenCalledWith(
      expect.objectContaining({ ignoreOpenTabs: false }),
    );
  });
});
