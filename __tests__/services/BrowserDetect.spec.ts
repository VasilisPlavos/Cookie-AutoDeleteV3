/**
 * Copyright (c) 2026 CAD Team
 * Licensed under MIT
 */

import { detectBrowser, _resetForTests } from '../../src/services/BrowserDetect';

describe('BrowserDetect', () => {
  let mockNavigator: { userAgent: string };

  beforeEach(() => {
    _resetForTests();
    // Default: simulate a Chromium SW context (no getBrowserInfo)
    (global.browser.runtime as any).getBrowserInfo = undefined;
    // Set up a plain navigator mock so we can control userAgent
    mockNavigator = { userAgent: '' };
    (global as any).navigator = mockNavigator;
  });

  afterEach(() => {
    // Restore Node's native navigator
    delete (global as any).navigator;
  });

  function setUA(ua: string): void {
    mockNavigator.userAgent = ua;
  }

  it('detects Firefox when runtime.getBrowserInfo exists', async () => {
    (global.browser.runtime as any).getBrowserInfo = jest.fn().mockResolvedValue({ name: 'Firefox' });
    setUA('Mozilla/5.0 (Windows NT 10.0; rv:115.0) Gecko/20100101 Firefox/115.0');
    const name = await detectBrowser();
    expect(name).toBe('Firefox');
  });

  it('detects Edge from userAgent when "Edg/" is present', async () => {
    setUA('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0');
    const name = await detectBrowser();
    expect(name).toBe('EdgeChromium');
  });

  it('detects Chrome from userAgent', async () => {
    setUA('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
    const name = await detectBrowser();
    expect(name).toBe('Chrome');
  });

  it('caches the result in module scope (second call does not re-detect)', async () => {
    setUA('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
    const first = await detectBrowser();
    setUA('Mozilla/5.0 (Windows NT 10.0; rv:115.0) Gecko/20100101 Firefox/115.0');
    const second = await detectBrowser();
    expect(second).toBe(first);
  });
});
