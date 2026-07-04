/* istanbul ignore file: Redux init. */

/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */
import { Store } from 'redux';
import { ReduxAction } from '../typings/ReduxConstants';

export default class StoreUser {
  public static init(store: Store): void {
    StoreUser._store = store as Store<State, ReduxAction>;
  }

  protected static get store(): Store<State, ReduxAction> {
    if (!StoreUser._store) {
      throw new Error(
        'StoreUser.store accessed before ready(). Event handlers must `await ready()` first.',
      );
    }
    return StoreUser._store;
  }

  /** Non-throwing state read for modules that may run before ready(). Null if store not initialized. */
  public static get safeState(): State | null {
    return StoreUser._store ? StoreUser._store.getState() : null;
  }

  /** Test-only: reset the module-level store so tests don't depend on order. */
  public static _resetForTests(): void {
    StoreUser._store = null;
  }

  private static _store: Store<State, ReduxAction> | null = null;
}
