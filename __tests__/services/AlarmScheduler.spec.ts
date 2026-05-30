/**
 * Copyright (c) 2026 CAD Team
 * Licensed under MIT
 */

import { when } from 'jest-when';
import AlarmScheduler, { CLEANUP_ALARM_NAME, ALARM_THRESHOLD_MS } from '../../src/services/AlarmScheduler';

describe('AlarmScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    AlarmScheduler._resetForTests();
    when(global.browser.storage.session.get).calledWith('alarmFlag').mockResolvedValue({} as never);
    (global.browser.storage.session.set as jest.Mock).mockResolvedValue(undefined);
    (global.browser.storage.session.remove as jest.Mock).mockResolvedValue(undefined);
    (global.browser.alarms.create as jest.Mock).mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleCleanup()', () => {
    it('uses setTimeout when delay is below the threshold', async () => {
      const dispatchSpy = jest.fn();
      AlarmScheduler._setDispatcher(dispatchSpy);
      await AlarmScheduler.scheduleCleanup(5000);
      expect(global.browser.alarms.create).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      // Allow microtasks to drain
      await Promise.resolve();
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it('creates a chrome.alarms alarm when delay is at or above the threshold', async () => {
      await AlarmScheduler.scheduleCleanup(ALARM_THRESHOLD_MS);
      expect(global.browser.alarms.create).toHaveBeenCalledWith(
        CLEANUP_ALARM_NAME,
        expect.objectContaining({ when: expect.any(Number) }),
      );
    });

    it('does not schedule twice while a cleanup is already pending (dedup)', async () => {
      const dispatchSpy = jest.fn();
      AlarmScheduler._setDispatcher(dispatchSpy);
      await AlarmScheduler.scheduleCleanup(2000);
      await AlarmScheduler.scheduleCleanup(2000);
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it('dedup flag survives a simulated SW restart via storage.session', async () => {
      await AlarmScheduler.scheduleCleanup(60000);
      // Simulate SW kill: reset in-memory state but keep the session storage value.
      AlarmScheduler._resetForTests();
      when(global.browser.storage.session.get)
        .calledWith('alarmFlag')
        .mockResolvedValue({ alarmFlag: true } as never);
      // After reset, a fresh call should NOT create a second alarm.
      await AlarmScheduler.scheduleCleanup(60000);
      expect(global.browser.alarms.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleAlarm()', () => {
    it('dispatches cleanup when invoked with the cad_cleanup alarm', async () => {
      const dispatchSpy = jest.fn();
      AlarmScheduler._setDispatcher(dispatchSpy);
      await AlarmScheduler.handleAlarm({ name: CLEANUP_ALARM_NAME, scheduledTime: Date.now() });
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it('ignores alarms with other names', async () => {
      const dispatchSpy = jest.fn();
      AlarmScheduler._setDispatcher(dispatchSpy);
      await AlarmScheduler.handleAlarm({ name: 'other', scheduledTime: Date.now() });
      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
