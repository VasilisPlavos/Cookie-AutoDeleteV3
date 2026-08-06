const { PreconditionError } = require('./errors');

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

async function openSite(context, site) {
  const page = await context.newPage();
  await gotoOrPrecondition(page, `https://${site}/`);
  return page;
}

module.exports = {
  openSite,
};
