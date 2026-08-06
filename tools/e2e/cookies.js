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

// A navigation failure (DNS, timeout, refused connection) is a site or network
// problem, not a CAD regression — route it into the taxonomy instead of
// letting a raw Playwright TimeoutError escape unprefixed.
async function gotoOrPrecondition(page, url) {
  try {
    await page.goto(url);
  } catch (error) {
    throw new PreconditionError(`navigation to ${url} failed: ${error.message}`);
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
    const names = remaining.map((cookie) => `${cookie.domain}: ${cookie.name}`).join(', ');
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

// Identity for comparing a cookie across two snapshots in time: domain + name.
// Deliberately excludes value/expiry, which legitimately churn between
// snapshots (a still-open session can rewrite its own cookies).
function cookieIdentity(cookie) {
  return `${cookie.domain}: ${cookie.name}`;
}

// Stronger than expectCookiesStillPresent's "at least one survived": asserts
// that every cookie observed in an earlier snapshot (`before`, from a prior
// cookiesFor(context, site) call) is still present now. Use this wherever the
// site is whitelisted and the honest expectation is "nothing was deleted",
// not merely "something wasn't".
async function expectCookieSetStillPresent(context, site, before) {
  const after = await cookiesFor(context, site);
  const afterIdentities = new Set(after.map(cookieIdentity));
  const missing = before.filter((cookie) => !afterIdentities.has(cookieIdentity(cookie)));
  if (missing.length > 0) {
    const names = missing.map(cookieIdentity).join(', ');
    throw new CleanupError(
      `${site} is whitelisted but ${missing.length} of its ${before.length} cookie(s) ` +
        `present before cleanup did not survive: ${names}`,
    );
  }
}

module.exports = {
  CleanupError,
  PreconditionError,
  cookiesFor,
  expectCookieSetStillPresent,
  expectCookiesGone,
  expectCookiesPresent,
  expectCookiesStillPresent,
  gotoOrPrecondition,
};
