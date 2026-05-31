/**
 * Copyright (c) 2017-2026 Kenny Do and CAD Team (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Licensed under MIT (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 */

export const diagnosticWarn = (message: string, ...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.warn(message, ...args);
};

export const diagnosticError = (message: string, ...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.error(message, ...args);
};
