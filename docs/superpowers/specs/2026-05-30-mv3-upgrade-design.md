# Cookie AutoDelete — Manifest V3 Upgrade Design

**Status:** Draft for review
**Date:** 2026-05-30
**Target release:** 4.0.0 (from `4.X.X-Branch`)
**Source baseline:** `3.X.X-Branch` @ `d9e01ba`

## 1. Scope & goals

Upgrade Cookie AutoDelete to ship a single MV3 manifest for Chrome (≥109), Firefox (≥115), and Edge (≥109). The work happens on a new `4.X.X-Branch` cut from `3.X.X-Branch` and ships as version **4.0.0**. The 3.x branch continues to receive MV2 bugfixes in parallel until the MV3 release stabilizes.

**Out of scope for 4.0:**

- Rewriting the UI (popup/settings stay React 17 + Bootstrap 4)
- Changing the Redux action surface
- Switching away from `webextension-polyfill`
- Redesigning the settings/expressions/cleanup logic

**Success criteria:**

- Loads as MV3 unpacked in Chrome 109+, Firefox 115+, Edge 109+
- All current settings/whitelist/greylist/cleanup behavior preserved (cookies, localStorage, indexedDB, etc. via `browsingData`)
- Popup ↔ background communication still works after the service worker has been suspended and resumed
- Jest test suite stays green; new tests cover SW restart + state rehydration
- Both `.zip` artifacts produced by `npm run build` install cleanly in their respective stores

**Decisions captured during brainstorming (with the alternatives that were rejected):**

| Decision | Chosen | Rejected alternatives |
|---|---|---|
| Target browsers | Chrome + Firefox + Edge, all MV3 | Chromium-only MV3 + Firefox-stays-MV2; mixed MV3 SW/event-page schemas |
| State architecture | Persist whole store to `chrome.storage.session` + hydrate on every SW wake; keep `redux-webext` | Move state into `chrome.storage.*` directly (drop redux-webext); `runtime.sendMessage` request/response API |
| Cleanup delay | Keep `setTimeout` for delays <25s; use `chrome.alarms` for ≥25s | Always alarms (30s minimum); always setTimeout (accept drops) |
| Manifest build | One source manifest + per-target patcher in `tools/buildFilesDev.js` | Two source manifests; generated manifests from TS module |
| Firefox background model + minimums | Firefox event page (`background.scripts`); Chrome 109+, Firefox 115+, Edge 109+ | Firefox SW (preview, FF 128+); higher minimums (Chrome 116/FF 121) |
| Rollout shape | Single MV3 feature branch → 4.0.0 | Incremental PRs with feature flag; migrate `3.X.X-Branch` in place |

## 2. Manifest

`extension/manifest.json` becomes the **Chromium-baseline MV3 manifest**. `tools/buildFilesDev.js` patches it per target during the build.

### 2.1 Baseline manifest (on disk)

```jsonc
{
  "manifest_version": 3,
  "name": "__MSG_extensionName__",
  "description": "__MSG_extensionDescription__",
  "version": "4.0.0",
  "default_locale": "en",
  "homepage_url": "https://github.com/Cookie-AutoDelete/Cookie-AutoDelete",
  "author": "CAD Team",
  "icons": { "48": "icons/icon_48.png", "128": "icons/icon_128.png" },

  "minimum_chrome_version": "109",

  "action": {
    "default_icon": { "48": "icons/icon_48.png" },
    "default_title": "Cookie AutoDelete",
    "default_popup": "popup/popup.html"
  },

  "background": {
    "service_worker": "bundles/background.js"
  },

  "options_ui": { "page": "settings/settings.html", "open_in_tab": true },

  "permissions": [
    "activeTab", "alarms", "browsingData", "contextMenus",
    "cookies", "notifications", "storage", "tabs"
  ],
  "host_permissions": ["<all_urls>"]
}
```

### 2.2 Build-time patching

- **Firefox build:** add `browser_specific_settings.gecko = { id: 'cookieautodelete@vp.dev', strict_min_version: '115.0' }`; add `"contextualIdentities"` to `permissions`; remove `minimum_chrome_version`; convert `background.service_worker` → `background.scripts: [...]`. Firefox uses `scripts` (event page).
- **Chrome/Edge build:** remove the `background.scripts` key (Chromium warns about unknown keys); remove any legacy `applications` block defensively.

### 2.3 Notable changes vs. MV2

- `browser_action` → `action`
- `<all_urls>` moved out of `permissions` into `host_permissions`
- `applications` → `browser_specific_settings`
- `background.scripts` (six files) → single bundled `background.js`
- `manifest_version: 2` → `3`

## 3. Background architecture

Today's background page loads six scripts in sequence via the manifest. In MV3 there is exactly one entry point per browser context.

### 3.1 Bundle layout

Webpack gets a new `background` entry: `src/background/index.ts`. It produces a single bundled `background.js` containing, in order:

1. `webextension-polyfill` (imported at top of bundle so `browser.*` resolves in SW)
2. The contents of today's `browserDetect.js`, ported to TS and rewritten for SW context (see §6)
3. `redux-webext`'s background-side bootstrap (imported as ESM, replacing the hand-rolled `extension/global_files/redux-webext.js`)
4. All current background source under `src/services/*` and `src/redux/*`
5. The existing `background.ts` orchestration, becoming an `init()` invoked on import

The `bundles/common-*.bundle.js` split is rewritten so background no longer shares chunks with the popup/settings (Chromium SWs can't load split chunks via `<script>` tags). The popup and settings keep their existing HTML + bundle structure unchanged.

### 3.2 Lifecycle pattern

A new `src/background/lifecycle.ts` exports a single `ready: Promise<void>` that runs `onStartUp()` once per SW activation. Every top-level event listener (`browser.tabs.onUpdated`, `browser.cookies.onChanged`, `browser.runtime.onConnect`, `browser.runtime.onInstalled`, `browser.runtime.onStartup`, `browser.alarms.onAlarm`) is registered **synchronously at module top level** (required so MV3 wakes the SW on the event), and the handler bodies start with `await ready`.

`onStartUp()` itself becomes idempotent: it rehydrates state from `chrome.storage.session` first, falling back to `chrome.storage.local` for cold start, then runs the existing init (StoreUser, SettingService, ContextMenuEvents, ContextualIdentitiesEvents, icon refresh).

## 4. State & redux-webext

Today, `src/redux/Store.ts` creates one Redux store at SW startup and assumes it lives forever. The store is wrapped by `createBackgroundStore({ store, actions })` from redux-webext, which registers `chrome.runtime.onConnect` and `chrome.runtime.onMessage` listeners for popup/settings UI to talk to.

### 4.1 What changes

- `chrome.storage.local` keeps being the source of truth for the **persisted** Redux state blob (unchanged — `background.ts:45` already serializes `JSON.stringify(store.getState())` here).
- A new `chrome.storage.session` cache mirrors the in-memory `cache` slice of the store (`browserDetect`, `browserInfo`, `platformInfo`, `browserVersion`). Session storage clears on browser restart, matching the lifetime of these values today.
- The `delaySave` 1-second debounce in `background.ts:40-50` is replaced by a small debouncer that flushes on **both** a 1s timer **and** the `chrome.runtime.onSuspend` event — so the SW never dies with unsaved state. (Firefox event page also fires `onSuspend`.)
- `redux-webext`'s vendored `extension/global_files/redux-webext.js` is dropped. We use the existing `redux-webext` npm dependency (`package.json:30`) directly: `import { createBackgroundStore, createUIStore } from 'redux-webext'` in our TS code, so it's part of the same bundle as everything else and runs inside the SW. The webpack `externals: { 'redux-webext': 'ReduxWebExt' }` mapping is removed.

### 4.2 The hydration gate

A new module `src/background/lifecycle.ts`:

```ts
let _ready: Promise<void> | null = null;
export function ready(): Promise<void> {
  if (!_ready) _ready = init();
  return _ready;
}
```

`init()` reads `chrome.storage.local.get('state')`, parses it (with the existing try/catch fallback), reads `chrome.storage.session.get('cache')` to restore cached browser info if present, creates the store, calls `StoreUser.init(store)`, `SettingService.init()`, subscribes the save debouncer, dispatches `validateSettings()`, and registers the contextMenus + contextualIdentities listeners. Cold start path additionally calls `browser.runtime.getBrowserInfo()`/`getPlatformInfo()` and populates the cache slice.

`StoreUser.store` becomes accessed via a getter so callers that wake up before init completes are forced to await `ready()` first — TypeScript catches the rest at compile time.

## 5. Delays & alarms

Three `setTimeout` sites need attention:

| Site | Today | After |
|---|---|---|
| `background.ts:43` (save debounce, 1s) | `setTimeout` | Same `setTimeout`, but flush also on `runtime.onSuspend` |
| `AlarmEvents.ts:29` (`CLEAN_DELAY` sleep, 0.5s–many minutes) | `await sleep(ms)` then dispatch | Split: if `ms < 25000` keep `setTimeout`; else schedule a `chrome.alarms` alarm named `cad_cleanup` and dispatch from the alarm handler |
| `TabEvents.ts:94` (short tab handling delay) | `setTimeout` | Unchanged — tab/cookie events keep the SW alive long enough |

### 5.1 AlarmScheduler

A new `src/services/AlarmScheduler.ts` owns the alarm path:

- `scheduleCleanup(delayMs)` — creates a `cad_cleanup` alarm at `Date.now() + delayMs` using `when:` so we can schedule sub-minute delays. (`delayInMinutes`/`periodInMinutes` are still bounded but `when` works at any timestamp.)
- A top-level `browser.alarms.onAlarm.addListener` (registered synchronously in `background.ts`) handles `cad_cleanup` by `await ready()` then dispatching `cookieCleanup({ greyCleanup: false, ignoreOpenTabs: false })`.

The existing `AlarmEvents.alarmFlag` debounce moves into `AlarmScheduler` and survives SW restart by being keyed in `chrome.storage.session` (so a duplicate schedule doesn't fire twice if the SW gets recycled between schedule and fire). When `CLEAN_DELAY` is short (the default), we stay on `setTimeout` and behavior is byte-identical to today.

## 6. Browser detection

`extension/global_files/browserDetect.js` uses `window.opr`, `window.opera`, `InstallTrigger`, `window.HTMLElement`, `document.documentMode`, `window.StyleMedia`, `window.CSS`, and `window.chrome` — **none of which exist in a service worker**. It also caches its result on `browserDetect.prototype._cachedResult`, which works fine but the whole detection logic is unusable in SW.

### 6.1 Replacement module

A new `src/services/BrowserDetect.ts` splits detection into two contexts:

- **UI context (popup, settings):** keep the existing duck-typing logic (it's been hardened across years of weird browser variants — don't throw it out).
- **Background SW/event page context:** detect via `navigator.userAgent` (available in both Chromium SW and Firefox event page) plus a one-time check for `browser.runtime.getBrowserInfo` (Firefox-only API). Result is cached in module scope **and** mirrored to `chrome.storage.session` so the value survives `await ready()` rehydration without re-running detection.

The legacy `global_files/browserDetect.js` script tag is dropped from `popup.html` and `settings.html`; the new TS module is imported by the bundles instead.

## 7. UI: popup, settings, and runtime ports

The popup and settings pages **keep their existing HTML, React 17 tree, and Redux selectors unchanged**. Only their script bootstrap shifts.

### 7.1 HTML script tag changes

- The four legacy `<script>` tags (`browser-polyfill`, `browserDetect`, `redux-webext`, then bundles) collapse to just the React bundle, because the polyfill / detection / redux-webext are now imported as ESM inside the webpack bundles.
- `popup.html` and `settings.html` keep their Bootstrap CSS link (it ships from node_modules via `CopyWebpackPlugin` exactly as today) and the `bootstrap.bundle.js` / `jquery.slim.js` script tags stay — those are needed for the React components that drive Bootstrap modals.
- `src/ui/popup/index.tsx` and `src/ui/settings/index.tsx` get a small change at the top: `import { createUIStore } from 'redux-webext'` and an `await` on the resulting promise (the 100ms sleep at `popup/index.tsx:35` is replaced with a proper `await createUIStore()`).

### 7.2 The long-lived popup port

`background.ts:155-211` keeps a `cookiePopupPorts` array of `runtime.Port` objects and a separate `cookies.onChanged` listener for live count updates. In MV3 the port keeps the SW alive while the popup is open (which is what we want), but the in-memory array vanishes when the SW dies between popup opens. That's fine — the array is only meaningful while a popup is connected, and a fresh connect rebuilds it. The fix is one line: register `browser.runtime.onConnect.addListener(handleConnect)` synchronously at module top level, and `await ready()` inside `handleConnect` before touching the store.

The `eventListenerActions(browser.cookies.onChanged, …, ADD/REMOVE)` calls for popup cookie updates stay — but the "remove if no popups" check moves into `onDisconnect`, gated on `await ready()`, so we don't try to remove from a stale array after SW restart.

## 8. Build pipeline

### 8.1 `webpack.config.js` changes

- **Background entry:** `background: 'src/background/index.ts'` (new file replacing today's `src/background.ts` as the entry — the orchestration code moves under `src/background/`).
- **No chunk sharing with background.** The `splitChunks.cacheGroups.common` rule gets a `chunks: chunk => chunk.name !== 'background'` exclusion so the SW bundle is self-contained. Popup and settings still split chunks between themselves.
- **No more `externals: { 'redux-webext': 'ReduxWebExt' }`.** Removed; redux-webext is bundled normally.
- **Output stays as classic script (not ESM).** Webpack `target` stays at the default (`web`), producing a single IIFE-wrapped bundle. The manifest does **not** declare `type: "module"` for the background — the bundle is self-contained, has no top-level `import` statements at runtime, and runs identically as a classic Chromium SW script and as a Firefox event-page script.
- **CopyWebpackPlugin** keeps copying Bootstrap CSS/JS and jQuery into `extension/global_files/` for the popup/settings HTML. The `browser-polyfill.min.js` copy is **removed** (no longer referenced from any HTML); the `browserDetect.js` file is deleted from `extension/global_files/`.

### 8.2 `tools/buildFilesDev.js` changes

- The existing `chromeBuild()` already mutates `manifest.json` in place and reverts after zip; the pattern is kept but extended.
- A new `firefoxPatchManifest(mf)` adds `browser_specific_settings.gecko = { id: 'CookieAutoDelete@kennydo.com', strict_min_version: '115.0' }`, pushes `'contextualIdentities'` into `permissions`, removes `minimum_chrome_version`, and removes the `background.service_worker` key.
- A new `chromePatchManifest(mf)` removes the `background.scripts` key and the (no-longer-relevant) `applications` block.
- Both patchers run against an in-memory copy; the on-disk `manifest.json` is restored after each zip exactly like today.

### 8.3 npm scripts

- `npm run build` keeps building both targets (unchanged contract).
- `npm run build:firefox` and `npm run build:chrome` are added for single-target builds.

## 9. Testing

The existing Jest suite under `test/` mocks `browser.*` per file and should keep passing with minimal change because we're not altering the redux/services contracts, only their initialization path. Specific additions:

- **New `test/background/lifecycle.spec.ts`** — verifies `ready()` is idempotent across multiple parallel callers, that cold-start vs. warm-start (with `chrome.storage.session` populated) take the correct path, and that calling an event handler before `ready()` resolves doesn't lose the event.
- **New `test/services/AlarmScheduler.spec.ts`** — verifies sub-25s delays use `setTimeout`, ≥25s delays create a `cad_cleanup` alarm with the right `when`, and that the dedup flag survives an SW-restart simulation.
- **New `test/services/BrowserDetect.spec.ts`** — covers SW-context detection (userAgent + presence of `runtime.getBrowserInfo`) for Chrome, Firefox, and Edge; UI-context detection keeps the existing tests if any.
- **Mock additions** to the per-test `browser` stub: `browser.action` (the new MV3 key), `browser.alarms`, `browser.storage.session`, `browser.runtime.onSuspend`.

### 9.1 Manual verification matrix

Before tagging 4.0.0:

| Browser | Version |
|---|---|
| Chrome | 109 (oldest supported) and latest stable |
| Edge | latest stable |
| Firefox | 115 ESR and latest stable |

For each, exercise:

1. Install unpacked → set a short cleanup delay → close a non-whitelisted tab → confirm cookies cleared.
2. Open popup → close popup → wait 35s (forces SW idle) → open popup again → confirm cookie counts still display.
3. Set a long cleanup delay (60s) → close a tab → confirm cleanup fires from the alarm (not setTimeout) even after the SW idles.

Firefox-only: confirm `contextualIdentities` (container) cookies are still listed correctly.

## 10. Rollout & user-facing migration

### 10.1 Branch & versioning

- Cut `4.X.X-Branch` from current `3.X.X-Branch` HEAD (`d9e01ba`).
- `package.json` `version` bumps to `4.0.0-beta.1` on the new branch; `extension/manifest.json` `version` bumps to `4.0.0`.
- `3.X.X-Branch` continues to receive MV2 bugfixes; PRs that touch shared code (settings UI, cleanup logic, locales) should be cherry-picked or rebased onto `4.X.X-Branch`.
- `README.md` adds a short MV3 section noting the minimum browser versions and the 4.x ↔ 3.x split.

### 10.2 User data migration

The Redux state blob in `chrome.storage.local` is read by the existing `JSON.parse(storage.state)` path and goes through `validateSettings()` on every install/update. No schema change is needed for MV3 itself — the same `state` key, same shape. The existing `onInstalled` migration ladder (the `convertVersionToNumber(previousVersion) < 350` and `< 300` branches in `background.ts:264-330`) stays as-is; nothing is added for 3.x → 4.0 because the data format is unchanged.

`extension/_locales/en/messages.json` gets one new entry: a release-notes line referencing MV3. `src/ui/settings/ReleaseNotes.json` gets a 4.0.0 entry listing the user-visible changes (mainly: minimum browser version bump, no behavior changes expected).

### 10.3 Permission warnings on upgrade

Splitting `<all_urls>` out of `permissions` into `host_permissions` is a no-op for existing users — Chromium and Firefox both treat the union as the granted set, and `<all_urls>` was already granted in 3.x. No permission re-prompt is expected. The `contextualIdentities` permission already lives in the Firefox-only build, so Firefox users see no change.

### 10.4 Long-tail Firefox users

Firefox users on the AMO `cookie-autodelete` listing currently on a version older than Firefox 115 will not auto-update to 4.0.0 — AMO honors `strict_min_version`. Those users stay on the last 3.x. This is acceptable: Firefox 115 is the current ESR (released July 2023), so the long tail is small.

### 10.5 Store submission notes

- **Chrome Web Store:** MV3 submission, single zip from `npm run build` produces `…_Chrome.zip` ready to upload.
- **AMO:** signed `.xpi`; the `npm run build` produces an unsigned `.xpi` that `web-ext sign` or AMO's web upload signs.
- **Edge add-ons:** accepts the Chrome zip unchanged (same MV3 manifest).

## 11. Known non-goals for 4.0

Explicitly not part of this release; tracked as possible follow-ups for 4.1+ or later majors:

- React 18 upgrade
- Bootstrap 5 upgrade (would also let us drop jQuery)
- `declarativeNetRequest` adoption (we don't use blocking webRequest today, so this is purely future-facing)
- Removing `webextension-polyfill`
- Dropping Bootstrap/jQuery from popup/settings
- Switching to `chrome.storage.session`-only state (i.e. removing the local-storage persisted blob)
- Replacing `redux-webext` with direct `runtime.sendMessage` request/response messaging
- Migrating to Webpack 5's native ESM output and dropping the IIFE wrapping
- TypeScript 5 / ESLint 9 upgrades

## 12. Implementation order

Ordered for the writing-plans skill to turn into discrete plan steps. Each step should be independently reviewable.

1. Cut `4.X.X-Branch` from `3.X.X-Branch` HEAD; bump `package.json` to `4.0.0-beta.1` and `extension/manifest.json` `version` to `4.0.0`.
2. Rewrite `extension/manifest.json` as the Chromium MV3 baseline (§2.1).
3. Add per-target manifest patcher in `tools/buildFilesDev.js` (§8.2); verify both `.zip` artifacts inspect correctly without touching the source yet (background bundle won't load yet — expected).
4. Add a new webpack `background` entry pointing at `src/background/index.ts`; move today's `src/background.ts` orchestration into `src/background/index.ts` as an `init()` function; configure `splitChunks` to exclude the background chunk (§3.1, §8.1).
5. Create `src/background/lifecycle.ts` with the `ready()` gate (§4.2); refactor `init()` to be idempotent and rehydrate from `chrome.storage.session` + `chrome.storage.local`.
6. Switch `redux-webext` from the vendored `extension/global_files/redux-webext.js` to the npm import; delete the vendored file; remove the webpack `externals` mapping (§4.1, §8.1).
7. Create `src/services/BrowserDetect.ts` with SW-context and UI-context paths; delete `extension/global_files/browserDetect.js`; update `popup.html` and `settings.html` to drop the legacy script tags (§6, §7.1).
8. Create `src/services/AlarmScheduler.ts`; refactor `src/services/AlarmEvents.ts` to delegate (§5.1).
9. Migrate every event-listener registration in `src/background/index.ts` to top-level + `await ready()` pattern (§3.2, §7.2).
10. Wire `browser.runtime.onSuspend` into the save debouncer so pending state always flushes (§4.1).
11. Update `src/ui/popup/index.tsx` and `src/ui/settings/index.tsx` to use the new ESM `createUIStore()` import path; remove the 100ms sleep (§7.1).
12. Write new jest specs: `lifecycle.spec.ts`, `AlarmScheduler.spec.ts`, `BrowserDetect.spec.ts`; extend the per-test `browser` stub with `action`, `alarms`, `storage.session`, `runtime.onSuspend` (§9).
13. Run the manual verification matrix across Chrome 109, latest Chrome, latest Edge, Firefox 115 ESR, latest Firefox (§9.1).
14. Update `README.md` (minimum versions, branch split note) and `src/ui/settings/ReleaseNotes.json` (4.0.0 entry).
15. Tag `4.0.0-beta.1`; collect beta feedback; tag `4.0.0` when stable.
