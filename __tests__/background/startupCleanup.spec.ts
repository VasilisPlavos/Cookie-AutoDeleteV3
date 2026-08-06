/**
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import { when } from 'jest-when';

import { runStartupCleanup } from '../../src/background/startupCleanup';
import * as Actions from '../../src/redux/Actions';
import { initialState } from '../../src/redux/State';
import * as Libs from '../../src/services/Libs';

const spyCookieCleanup = jest.spyOn(Actions, 'cookieCleanup');
const spyCadLog = jest.spyOn(Libs, 'cadLog');

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
  beforeAll(() => {
    // cadLog reads the manifest version whenever it actually logs (i.e.
    // debug/output is true) — the failure-path tests below now pass `true`
    // per the always-log convention for genuine failures, so this needs a
    // real return value rather than jest.fn()'s default undefined.
    when(global.browser.runtime.getManifest)
      .calledWith()
      .mockReturnValue({ version: '0.12.34' } as never);
  });

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

  it('awaits the dispatched cleanup before resolving', async () => {
    const store = storeWith(true, false);
    let dispatchSettled = false;
    store.dispatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          // A macrotask: if runStartupCleanup did not await the dispatch,
          // its returned promise would already have settled by the time
          // this fires, since only microtasks run before a macrotask.
          setTimeout(() => {
            dispatchSettled = true;
            resolve(undefined);
          }, 0);
        }),
    );

    await runStartupCleanup(store as never);

    expect(dispatchSettled).toBe(true);
  });

  it('skips the cleanup and does not throw when tabs.query rejects', async () => {
    const store = storeWith(true, true);
    when(global.browser.tabs.query)
      .calledWith(expect.any(Object))
      .mockRejectedValue(new Error('tabs.query unavailable') as never);

    await expect(runStartupCleanup(store as never)).resolves.toBeUndefined();

    expect(spyCookieCleanup).not.toHaveBeenCalled();
    expect(store.dispatch).not.toHaveBeenCalled();
    // A genuine failure must always be logged, regardless of DEBUG_MODE.
    expect(spyCadLog).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warn' }),
      true,
    );
  });

  it('does not throw and still resolves when the dispatched cleanup rejects', async () => {
    const store = storeWith(true, true);
    store.dispatch.mockImplementation(() =>
      Promise.reject(new Error('cookieCleanup failed')),
    );

    await expect(runStartupCleanup(store as never)).resolves.toBeUndefined();

    expect(store.dispatch).toHaveBeenCalledTimes(1);
    // A genuine failure must always be logged, regardless of DEBUG_MODE.
    expect(spyCadLog).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warn' }),
      true,
    );
  });
});
