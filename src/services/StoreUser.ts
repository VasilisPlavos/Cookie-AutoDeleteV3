/* istanbul ignore file: Redux init. */

/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
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

  private static _store: Store<State, ReduxAction> | null = null;
}
