const { test } = require('@playwright/test');
const { launchWithExtension, closeContext } = require('../../tools/e2e/extension');
const {
  CLEANED_SITE,
  OPEN_TAB_SITE,
  WHITELISTED_SITE,
  seedState,
} = require('../../tools/e2e/seed');
const {
  expectCookiesGone,
  expectCookiesPresent,
  expectCookiesStillPresent,
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
  await whitelisted.goto(`https://${WHITELISTED_SITE}/`);
  const unlisted = await context.newPage();
  await unlisted.goto(`https://${CLEANED_SITE}/`);

  await expectCookiesPresent(context, WHITELISTED_SITE);
  await expectCookiesPresent(context, CLEANED_SITE);

  await whitelisted.close();
  await unlisted.close();

  // Positive signal first: proving the engine ran is what gives the next
  // assertion meaning. Without it, "the whitelist survived" also passes when
  // cleanup never happened at all.
  await expectCookiesGone(context, CLEANED_SITE);
  await expectCookiesStillPresent(context, WHITELISTED_SITE);
});

test('a domain with a tab still open is not cleaned', async () => {
  const firstTab = await context.newPage();
  await firstTab.goto(`https://${OPEN_TAB_SITE}/`);
  const secondTab = await context.newPage();
  await secondTab.goto(`https://${OPEN_TAB_SITE}/`);
  // Sacrificial: an unprotected domain whose deletion proves a sweep completed.
  const sacrificial = await context.newPage();
  await sacrificial.goto(`https://${CLEANED_SITE}/`);

  await expectCookiesPresent(context, OPEN_TAB_SITE);
  await expectCookiesPresent(context, CLEANED_SITE);

  await firstTab.close();
  await sacrificial.close();

  // cleanCookiesOperation sweeps every domain, filtered by open tabs — so the
  // sacrificial domain disappearing proves this domain was evaluated and kept.
  await expectCookiesGone(context, CLEANED_SITE);
  await expectCookiesStillPresent(context, OPEN_TAB_SITE);

  await secondTab.close();
  await expectCookiesGone(context, OPEN_TAB_SITE);
});
