const { SetupError } = require('./errors');

// The registrable domain used for assertions (cookie identity is matched by
// domain suffix — see cookies.js:belongsTo).
const WHITELISTED_SITE = 'wikipedia.org';
const CLEANED_SITE = 'github.com';
const OPEN_TAB_SITE = 'bing.com';

// The expression actually seeded into the whitelist. It must be broader than
// WHITELISTED_SITE: https://wikipedia.org/ redirects to www.wikipedia.org, and
// CAD's expression matching is a strict regex (getMatchedExpressions,
// src/services/Libs.ts), not a domain-suffix match. A bare 'wikipedia.org'
// expression compiles to ^wikipedia\.org$ and does not match the www host, so
// host-only cookies set there would be (correctly) deleted despite the site
// being "whitelisted". The '*.' glob compiles to (^|.)wikipedia\.org$ instead,
// covering both hosts.
const WHITELIST_EXPRESSION_GLOB = `*.${WHITELISTED_SITE}`;

// Mirrored from src/background/index.ts:173-175.
const DISPATCH = '@@STORE_DISPATCH';
const UPDATE_STATE = '@@STORE_UPDATE_STATE';

const WHITELIST_EXPRESSION = {
  expression: WHITELIST_EXPRESSION_GLOB,
  listType: 'WHITE',
  storeId: 'default',
  id: 'e2e-keep',
};

// Values chosen in the design spec. delayBeforeClean must be 1: Actions.ts
// clamps anything below 1, and a larger value pushes AlarmScheduler off its
// setTimeout branch onto chrome.alarms, which Chrome floors at ~30s.
const SEED_SETTINGS = {
  activeMode: true,
  delayBeforeClean: 1,
  localStorageCleanup: true,
  indexedDBCleanup: true,
  disableNewVersionPopup: true,
  showNotificationAfterCleanup: false,
  contextMenus: false,
  debugMode: true,
};

// A page on the extension's own origin is the only context that can talk to the
// background over runtime.sendMessage the way the popup and settings pages do.
async function withExtensionPage(context, extensionId, fn) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/settings/settings.html`);
    return await fn(page);
  } finally {
    await page.close();
  }
}

async function sendToBackground(page, message) {
  return page.evaluate(
    (msg) => chrome.runtime.sendMessage(msg),
    message,
  );
}

async function readState(context, extensionId) {
  const state = await withExtensionPage(context, extensionId, (page) =>
    sendToBackground(page, { type: UPDATE_STATE }),
  );
  if (!state || !state.settings) {
    throw new SetupError(
      'the background store did not answer @@STORE_UPDATE_STATE with a usable state',
    );
  }
  return state;
}

// A name in SEED_SETTINGS that isn't already a real setting is a typo by
// definition: the extension ships every setting with a default (Reducers.ts
// initialState), so a genuine setting is always present before we touch it.
// Reducers.ts's UPDATE_SETTING handler creates whatever key it's handed
// (`newObject[action.payload.name] = ...`), so a typo would otherwise be
// silently accepted as a brand-new junk key instead of failing loudly.
function assertKnownSettings(state) {
  for (const name of Object.keys(SEED_SETTINGS)) {
    if (!state || !state.settings || !(name in state.settings)) {
      throw new SetupError(
        `SEED_SETTINGS references "${name}", which is not a real setting. ` +
          'Check it against src/typings/Global.d.ts SettingID for a typo.',
      );
    }
  }
}

function assertSettingValue(state, name, expectedValue) {
  if (
    !state ||
    !state.settings ||
    !state.settings[name] ||
    state.settings[name].value !== expectedValue
  ) {
    throw new SetupError(`seeding did not set ${name} to ${expectedValue}`);
  }
}

async function seedState(context, extensionId) {
  return withExtensionPage(context, extensionId, async (page) => {
    const before = await sendToBackground(page, { type: UPDATE_STATE });
    assertKnownSettings(before);

    for (const [name, value] of Object.entries(SEED_SETTINGS)) {
      await sendToBackground(page, {
        type: DISPATCH,
        action: { type: 'UPDATE_SETTING', payload: { name, value } },
      });
    }

    await sendToBackground(page, {
      type: DISPATCH,
      action: { type: 'ADD_EXPRESSION', payload: WHITELIST_EXPRESSION },
    });

    const state = await sendToBackground(page, { type: UPDATE_STATE });

    const expressions = (state && state.lists && state.lists.default) || [];
    if (!expressions.some((e) => e.expression === WHITELIST_EXPRESSION.expression)) {
      throw new SetupError(
        `seeding did not install the ${WHITELIST_EXPRESSION.expression} whitelist entry`,
      );
    }
    assertSettingValue(state, 'activeMode', true);
    assertSettingValue(state, 'localStorageCleanup', true);
    assertSettingValue(state, 'indexedDBCleanup', true);

    return state;
  });
}

module.exports = {
  CLEANED_SITE,
  OPEN_TAB_SITE,
  WHITELISTED_SITE,
  WHITELIST_EXPRESSION_GLOB,
  readState,
  seedState,
};
