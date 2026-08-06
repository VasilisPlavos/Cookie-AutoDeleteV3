const { test } = require('@playwright/test');
const { launchWithExtension, closeContext } = require('../../tools/e2e/extension');
const {
  CLEANED_SITE,
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
