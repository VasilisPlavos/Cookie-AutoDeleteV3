/**
 * Copyright (c) 2026 CAD Team
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT
 */

import { when } from 'jest-when';

// Mock heavy services so the test only focuses on lifecycle logic
jest.mock('../../src/services/BrowserActionService', () => ({
  setGlobalIcon: jest.fn().mockResolvedValue(undefined),
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

import { ready, _resetForTests } from '../../src/background/lifecycle';
import { PARTITION_PROBE_COOKIE_NAME } from '../../src/services/Libs';

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
  });
});
