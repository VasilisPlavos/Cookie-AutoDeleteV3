/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */

// Placeholder. Task 6 fills in ready() / init() / save().
let _initialized: Promise<void> | null = null;

export function ready(): Promise<void> {
  if (!_initialized) {
    _initialized = Promise.resolve();
  }
  return _initialized;
}

export function markInitialized(p: Promise<void>): void {
  _initialized = p;
}
