/**
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT
 */

import { when } from 'jest-when';
import {
  resetAllTabIcons,
  setGlobalIcon,
} from '../../src/services/BrowserActionService';

const stubIconGlobals = (): void => {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: () => Promise.resolve({}),
  });
  (global as any).createImageBitmap = jest
    .fn()
    .mockResolvedValue({ width: 48, height: 48 });
  (global as any).OffscreenCanvas = class {
    public getContext(): unknown {
      return {
        drawImage: (): void => undefined,
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
      };
    }
  };
};

describe('BrowserActionService', () => {
  beforeEach(() => {
    stubIconGlobals();
    global.browser.runtime.getURL = jest.fn((p: string) => `chrome-extension://x/${p}`);
  });

  describe('setGlobalIcon()', () => {
    it('writes the default icon once and never touches per-tab icons', async () => {
      await setGlobalIcon(true);

      expect(global.browser.action.setIcon).toHaveBeenCalledTimes(1);
      expect(global.browser.action.setIcon).toHaveBeenCalledWith(
        expect.not.objectContaining({ tabId: expect.anything() }),
      );
      expect(global.browser.tabs.query).not.toHaveBeenCalled();
    });
  });

  describe('resetAllTabIcons()', () => {
    it('writes the default icon and overwrites every open tab', async () => {
      when(global.browser.tabs.query)
        .calledWith({ windowType: 'normal' })
        .mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }] as never);

      await resetAllTabIcons(false);

      // 1 default write + 3 per-tab writes
      expect(global.browser.action.setIcon).toHaveBeenCalledTimes(4);
      expect(global.browser.action.setIcon).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: 2 }),
      );
    });
  });
});
