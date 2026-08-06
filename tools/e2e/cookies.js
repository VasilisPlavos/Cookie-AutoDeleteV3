const CLEANUP_POLL_TIMEOUT_MS = 15_000;
const CLEANUP_POLL_INTERVAL_MS = 250;

class PreconditionError extends Error {
  constructor(message) {
    super(`PRECONDITION FAILED: ${message}`);
    this.name = 'PreconditionError';
  }
}

class CleanupError extends Error {
  constructor(message) {
    super(`CLEANUP FAILED: ${message}`);
    this.name = 'CleanupError';
  }
}

// Match on the registrable domain rather than a cookie name: sites rename their
// cookies, and that must not read as a CAD regression.
function belongsTo(cookieDomain, site) {
  const domain = cookieDomain.replace(/^\./, '').toLowerCase();
  return domain === site || domain.endsWith(`.${site}`);
}

async function cookiesFor(context, site) {
  const all = await context.cookies();
  return all.filter((cookie) => belongsTo(cookie.domain, site));
}

async function expectCookiesPresent(context, site) {
  const cookies = await cookiesFor(context, site);
  if (cookies.length === 0) {
    throw new PreconditionError(
      `${site} set no cookies, so deletion cannot be tested. ` +
        'This is a site or network problem, not a CAD regression.',
    );
  }
}

async function expectCookiesGone(context, site, timeoutMs = CLEANUP_POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let remaining = await cookiesFor(context, site);
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_POLL_INTERVAL_MS));
    remaining = await cookiesFor(context, site);
  }
  if (remaining.length > 0) {
    const names = remaining.map((cookie) => `${cookie.domain}${cookie.name}`).join(', ');
    throw new CleanupError(
      `${site} still has ${remaining.length} cookie(s) after ${timeoutMs}ms: ${names}`,
    );
  }
}

async function expectCookiesStillPresent(context, site) {
  const cookies = await cookiesFor(context, site);
  if (cookies.length === 0) {
    throw new CleanupError(
      `${site} is whitelisted but all of its cookies were deleted`,
    );
  }
}

module.exports = {
  CleanupError,
  PreconditionError,
  cookiesFor,
  expectCookiesGone,
  expectCookiesPresent,
  expectCookiesStillPresent,
};
