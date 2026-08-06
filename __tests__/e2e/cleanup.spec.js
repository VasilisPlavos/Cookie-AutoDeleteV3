const { test } = require('@playwright/test');
const { launchWithExtension, closeContext } = require('../../tools/e2e/extension');
const {
  CLEANED_SITE,
  OPEN_TAB_SITE,
  WHITELISTED_SITE,
  seedState,
} = require('../../tools/e2e/seed');
const {
  CleanupError,
  PreconditionError,
  cookiesFor,
  expectCookieSetStillPresent,
  expectCookiesGone,
  expectCookiesPresent,
  expectCookiesStillPresent,
  gotoOrPrecondition,
} = require('../../tools/e2e/cookies');

let context;
let userDataDir;
let keeperPage;

test.beforeAll(async () => {
  const launched = await launchWithExtension();
  context = launched.context;
  userDataDir = launched.userDataDir;
  await seedState(context, launched.extensionId);
  // A persistent context closes with its last page, so one page always stays
  // open. about:blank has no hostname, so it protects no domain.
  keeperPage = await context.newPage();
  await keeperPage.goto('about:blank');
});

test.afterAll(async () => {
  await closeContext(context, userDataDir);
});

test.beforeEach(async () => {
  await context.clearCookies();
});

test('an unlisted site is cleaned while a whitelisted site survives', async () => {
  const whitelisted = await context.newPage();
  await gotoOrPrecondition(whitelisted, `https://${WHITELISTED_SITE}/`);
  const unlisted = await context.newPage();
  await gotoOrPrecondition(unlisted, `https://${CLEANED_SITE}/`);

  await expectCookiesPresent(context, WHITELISTED_SITE);
  await expectCookiesPresent(context, CLEANED_SITE);

  // Snapshot before the tabs close: the whitelist is seeded as *.wikipedia.org
  // (see seed.js), so every wikipedia cookie should survive, not merely one.
  const whitelistedBefore = await cookiesFor(context, WHITELISTED_SITE);

  await whitelisted.close();
  await unlisted.close();

  // Positive signal first: proving the engine ran is what gives the next
  // assertion meaning. Without it, "the whitelist survived" also passes when
  // cleanup never happened at all.
  await expectCookiesGone(context, CLEANED_SITE);
  await expectCookieSetStillPresent(context, WHITELISTED_SITE, whitelistedBefore);
});

test('a domain with a tab still open is not cleaned', async () => {
  const firstTab = await context.newPage();
  await gotoOrPrecondition(firstTab, `https://${OPEN_TAB_SITE}/`);
  const secondTab = await context.newPage();
  await gotoOrPrecondition(secondTab, `https://${OPEN_TAB_SITE}/`);
  // Sacrificial: an unprotected domain whose deletion proves a sweep completed.
  const sacrificial = await context.newPage();
  await gotoOrPrecondition(sacrificial, `https://${CLEANED_SITE}/`);

  await expectCookiesPresent(context, OPEN_TAB_SITE);
  await expectCookiesPresent(context, CLEANED_SITE);

  await firstTab.close();
  await sacrificial.close();

  // cleanCookiesOperation sweeps every domain, filtered by open tabs — so the
  // sacrificial domain disappearing proves this domain was evaluated and kept.
  // bing.com is protected-by-open-tab, not whitelisted, so "at least one
  // survivor" (not the full set) is the honest property under test here.
  await expectCookiesGone(context, CLEANED_SITE);
  await expectCookiesStillPresent(context, OPEN_TAB_SITE);

  await secondTab.close();
  await expectCookiesGone(context, OPEN_TAB_SITE);
});

const SITE_DATA_KEY = 'cad-e2e-marker';
const SITE_DATA_DB = 'cad-e2e-db';

async function writeSiteData(page) {
  try {
    await page.evaluate(
      ({ key, db }) =>
        new Promise((resolve, reject) => {
          localStorage.setItem(key, 'present');
          const request = indexedDB.open(db, 1);
          request.onupgradeneeded = () => request.result.createObjectStore('items');
          request.onsuccess = () => {
            request.result.close();
            resolve();
          };
          request.onerror = () => reject(request.error);
        }),
      { key: SITE_DATA_KEY, db: SITE_DATA_DB },
    );
  } catch (error) {
    // A raw IndexedDB failure (quota exhausted, storage disabled) is a site or
    // browser problem, not a CAD regression — carry its detail into the
    // taxonomy instead of letting an unprefixed DOMException escape.
    throw new PreconditionError(`could not write site data: ${error.message}`);
  }
}

async function readSiteData(page) {
  return page.evaluate(
    async ({ key, db }) => ({
      localStorageValue: localStorage.getItem(key),
      databases: (await indexedDB.databases()).map((entry) => entry.name),
    }),
    { key: SITE_DATA_KEY, db: SITE_DATA_DB },
  );
}

test('site data is cleaned for an unlisted domain', async () => {
  const page = await context.newPage();
  await gotoOrPrecondition(page, `https://${CLEANED_SITE}/`);
  await writeSiteData(page);

  const before = await readSiteData(page);
  if (before.localStorageValue !== 'present' || !before.databases.includes(SITE_DATA_DB)) {
    throw new PreconditionError(
      `could not write site data on ${CLEANED_SITE}. ` +
        'This is a site or browser problem, not a CAD regression.',
    );
  }
  await expectCookiesPresent(context, CLEANED_SITE);

  await page.close();
  await expectCookiesGone(context, CLEANED_SITE);

  // Re-navigating lets the site set fresh cookies again; harmless, because the
  // cookie assertion already completed and this step only reads site data.
  const verify = await context.newPage();
  await gotoOrPrecondition(verify, `https://${CLEANED_SITE}/`);
  const after = await readSiteData(verify);
  await verify.close();

  if (after.localStorageValue !== null) {
    throw new CleanupError(
      `localStorage key "${SITE_DATA_KEY}" survived on ${CLEANED_SITE}`,
    );
  }
  if (after.databases.includes(SITE_DATA_DB)) {
    throw new CleanupError(
      `IndexedDB database "${SITE_DATA_DB}" survived on ${CLEANED_SITE}`,
    );
  }
});
