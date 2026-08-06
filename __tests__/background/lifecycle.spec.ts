/**
 * Copyright (c) 2026 CAD Team
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT
 */

import { when } from 'jest-when';

// Mock heavy services so the test only focuses on lifecycle logic
jest.mock('../../src/services/BrowserActionService', () => ({
  setGlobalIcon: jest.fn().mockResolvedValue(undefined),
  resetAllTabIcons: jest.fn().mockResolvedValue(undefined),
  checkIfProtected: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/SettingService', () => {
  return {
    __esModule: true,
    default: class MockSettingService {
      static init = jest.fn();
      static onSettingsChange = jest.fn();
      static isInitialized = false;
    },
  };
});
jest.mock('../../src/services/ContextualIdentitiesEvents', () => {
  return {
    __esModule: true,
    default: class MockContextualIdentitiesEvents {
      static init = jest.fn().mockResolvedValue(undefined);
      static isInitialized = false;
    },
  };
});

import { getStore, ready, _resetForTests } from '../../src/background/lifecycle';
import { PARTITION_PROBE_COOKIE_NAME } from '../../src/services/Libs';
import { ReduxConstants } from '../../src/typings/ReduxConstants';

describe('background/lifecycle', () => {
  beforeEach(() => {
    _resetForTests();
    when(global.browser.storage.local.get).calledWith().mockResolvedValue({} as never);
    when(global.browser.storage.session.get).calledWith('cache').mockResolvedValue({} as never);
    global.browser.runtime.getPlatformInfo = jest.fn().mockResolvedValue({ os: 'win' });
    global.browser.runtime.getBrowserInfo = jest.fn().mockResolvedValue({ version: '100', name: 'Firefox', vendor: 'Mozilla', buildID: '0' });
  });

  describe('ready()', () => {
    it('returns the same Promise for concurrent callers (idempotent)', async () => {
      const p1 = ready();
      const p2 = ready();
      expect(p1).toBe(p2);
      await p1;
    });

    it('runs init() exactly once even when invoked from many handlers', async () => {
      // local.get() is called with no args; session.get() is called with 'cache'.
      // Since they share the same storageArea mock, filter by no-arg calls only.
      const spy = jest
        .spyOn(global.browser.storage.local, 'get')
        .mockImplementation((...args: unknown[]) => {
          return Promise.resolve({});
        });
      await Promise.all([ready(), ready(), ready(), ready()]);
      // storage.local.get() called once (no args); session.get('cache') also goes
      // through the same spy because local/session share storageArea.
      const noArgCalls = spy.mock.calls.filter((c) => c.length === 0);
      expect(noArgCalls).toHaveLength(1);
    });
  });

  describe('init() cold vs warm start', () => {
    it('cold start: populates cache from runtime.getPlatformInfo', async () => {
      const platformSpy = global.browser.runtime.getPlatformInfo = jest
        .fn()
        .mockResolvedValue({ os: 'linux' });
      when(global.browser.storage.session.get).calledWith('cache').mockResolvedValue({} as never);
      await ready();
      expect(platformSpy).toHaveBeenCalled();
    });

    it('warm start: skips runtime.getPlatformInfo when session cache is present', async () => {
      const platformSpy = global.browser.runtime.getPlatformInfo = jest
        .fn()
        .mockResolvedValue({ os: 'linux' });
      when(global.browser.storage.session.get)
        .calledWith('cache')
        .mockResolvedValue({ cache: { browserDetect: 'Chrome', platformOs: 'linux' } } as never);
      await ready();
      expect(platformSpy).not.toHaveBeenCalled();
    });

    it('cold start: probes partitioned-cookie support and caches the result', async () => {
      when(global.browser.storage.session.get)
        .calledWith('cache')
        .mockResolvedValue({} as never);
      when(global.browser.cookies.getAll)
        .calledWith({ partitionKey: {}, name: PARTITION_PROBE_COOKIE_NAME })
        .mockResolvedValue([] as never);
      await ready();
      expect(global.browser.cookies.getAll).toHaveBeenCalledWith({
        partitionKey: {},
        name: PARTITION_PROBE_COOKIE_NAME,
      });
    });

    it('cold start: a failing partitioned-cookie probe does not break init', async () => {
      when(global.browser.storage.session.get)
        .calledWith('cache')
        .mockResolvedValue({} as never);
      when(global.browser.cookies.getAll)
        .calledWith({ partitionKey: {}, name: PARTITION_PROBE_COOKIE_NAME })
        .mockRejectedValue(new Error('unsupported') as never);
      await expect(ready()).resolves.not.toThrow();
    });

    it('warm start: probes when the restored cache lacks the support flag', async () => {
      when(global.browser.storage.session.get)
        .calledWith('cache')
        .mockResolvedValue({
          cache: { browserDetect: 'Chrome', platformOs: 'linux' },
        } as never);
      when(global.browser.cookies.getAll)
        .calledWith({ partitionKey: {}, name: PARTITION_PROBE_COOKIE_NAME })
        .mockResolvedValue([] as never);
      await ready();
      expect(global.browser.cookies.getAll).toHaveBeenCalledWith({
        partitionKey: {},
        name: PARTITION_PROBE_COOKIE_NAME,
      });
    });

    it('warm start: does not re-probe when the support flag is already cached', async () => {
      when(global.browser.storage.session.get)
        .calledWith('cache')
        .mockResolvedValue({
          cache: { supportsPartitionedCookies: false },
        } as never);
      global.browser.cookies.getAll = jest.fn();
      await ready();
      expect(global.browser.cookies.getAll).not.toHaveBeenCalled();
    });

    it('does not touch per-tab icons during init', async () => {
      const bas = require('../../src/services/BrowserActionService');
      await ready();
      expect(bas.setGlobalIcon).toHaveBeenCalled();
      expect(bas.resetAllTabIcons).not.toHaveBeenCalled();
    });
  });

  describe('store subscriptions', () => {
    it('does not run SettingService.onSettingsChange for an unrelated slice', async () => {
      await ready();
      const SettingService = require('../../src/services/SettingService').default;
      const before = SettingService.onSettingsChange.mock.calls.length;

      getStore().dispatch({
        type: ReduxConstants.ADD_CACHE,
        payload: { key: 'probe', value: 1 },
      });

      expect(SettingService.onSettingsChange.mock.calls.length).toBe(before);
    });

    it('runs SettingService.onSettingsChange when settings change', async () => {
      await ready();
      const SettingService = require('../../src/services/SettingService').default;
      const before = SettingService.onSettingsChange.mock.calls.length;

      getStore().dispatch({
        type: ReduxConstants.UPDATE_SETTING,
        payload: { name: SettingID.DEBUG_MODE, value: true },
      });

      expect(SettingService.onSettingsChange.mock.calls.length).toBe(before + 1);
    });

    it('does not run checkIfProtected for an unrelated slice', async () => {
      await ready();
      const bas = require('../../src/services/BrowserActionService');
      const before = bas.checkIfProtected.mock.calls.length;

      getStore().dispatch({
        type: ReduxConstants.ADD_CACHE,
        payload: { key: 'probe', value: 1 },
      });

      expect(bas.checkIfProtected.mock.calls.length).toBe(before);
    });

    it('refreshes the action icon when the expression lists change', async () => {
      await ready();
      const bas = require('../../src/services/BrowserActionService');
      const before = bas.checkIfProtected.mock.calls.length;

      getStore().dispatch({
        type: ReduxConstants.ADD_EXPRESSION,
        payload: {
          expression: '*.example.com',
          listType: ListType.WHITE,
          storeId: 'default',
        },
      });

      expect(bas.checkIfProtected.mock.calls.length).toBe(before + 1);
    });

    // The raw-dispatch test above cannot see a double call: the UI reaches these
    // actions through the Actions.ts thunks, which used to run their own
    // checkIfProtected on top of this subscription.
    it('runs checkIfProtected exactly once for a list edit made through the thunk', async () => {
      await ready();
      const bas = require('../../src/services/BrowserActionService');
      const { addExpression } = require('../../src/redux/Actions');
      const before = bas.checkIfProtected.mock.calls.length;

      getStore().dispatch(
        addExpression({
          expression: '*.thunk-path.com',
          listType: ListType.WHITE,
          storeId: 'default',
        }),
      );

      expect(bas.checkIfProtected.mock.calls.length).toBe(before + 1);
    });
  });
});
