/**
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import { Store } from 'redux';
import StoreUser from '../../src/services/StoreUser';

describe('StoreUser.safeState', () => {
  beforeEach(() => {
    StoreUser._resetForTests();
  });

  it('returns null before init()', () => {
    expect.assertions(1);
    expect(StoreUser.safeState).toBeNull();
  });

  it('returns the current state after init()', () => {
    expect.assertions(1);
    const sentinel = { sentinel: true } as unknown as State;
    StoreUser.init({ getState: () => sentinel } as unknown as Store);
    expect(StoreUser.safeState).toBe(sentinel);
  });
});
