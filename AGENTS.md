# AGENTS.md

Guidance for any AI agent working in this repository.

## What this is

Cookie AutoDelete V3 — a **Manifest V3** browser extension (TypeScript + React +
Redux) that auto-deletes unwanted cookies and other site data. It's a MV3 fork of
the original Cookie AutoDelete. Ships one codebase to both **Chromium** (Chrome /
Edge / Brave / Vivaldi) and **Firefox**; the two differ only by a manifest patch
at build time.

## Working agreements

- **Never push to `main`.** Work on a branch and open a PR. `main` is protected and
  a push to it auto-publishes a release (see Release process).
- **Every PR updates the release notes.** Add/extend an entry in
  `src/ui/settings/ReleaseNotes.json` under the version this PR ships in. That file
  feeds the "What's New" Welcome tab users see after an update.
- **Code is self-explaining.** Prefer clear names over comments. Add a comment only
  when the *why* is non-obvious (e.g. an MV3 service-worker quirk, a
  cross-browser workaround) — the existing comments in `src/background/` are the
  bar to match, not to exceed.
- Run `npm run test-all` (tests + lint) before opening a PR. Lint is zero-warnings.

## Commands

```bash
npm run compile        # webpack production build -> extension/bundles/
npm run dev            # webpack --watch (rebuild on change)
npm run build          # compile + package BOTH Chrome & Firefox into builds/
npm run build:chrome   # package Chromium only (optional version bump, see below)
npm run build:firefox  # package Firefox only
npm run lint           # eslint, --max-warnings 0
npm test               # jest
npm run test-all       # test + lint (run before every PR)
npm run test:coverage  # jest with coverage
npm run test:e2e       # Playwright harness in a real Chromium (local only, needs network)
```

Run a single test file / name:

```bash
npx jest __tests__/tools/resolveBuildVersion.test.js
npx jest -t "partitioned"
```

Version bump (writes both `package.json` **and** `extension/manifest.json`):

```bash
npm run build:chrome patch   # or minor | major; no arg = no bump
node ./tools/bumpVersion.js minor
```

Requires Node ≥ 22.

## Architecture

### Two build targets, one source

`extension/manifest.json` is authored as the Chromium MV3 manifest. At package time
`tools/buildFilesDev.js` clones it in memory and patches per target
(`chromePatchManifest` / `firefoxPatchManifest`): Firefox gets the
`contextualIdentities` permission + `browser_specific_settings` and its
`service_worker` entry is rewritten to `background.scripts`; Chromium gets those
stripped. The on-disk manifest is restored after each zip. **Don't hand-edit the
manifest per browser — change the patch functions.**

`webext-browser` types + `webextension-polyfill` give one `browser.*` API across
both. MV3/Chrome-only surfaces absent from the Firefox type defs (e.g.
`runtime.onSuspend`) are reached through explicit casts — see the bottom of
`src/background/index.ts`.

### Background service worker — `src/background/`

MV3 terminates the SW aggressively, which drives the design here:

- **`index.ts`** registers every event listener **synchronously at module top
  level** so Chrome wakes the SW on the event, then `await ready()` before touching
  the store. Registering listeners late (inside async init) means a cold wake
  misses the first message — that's why the redux-webext connect/message protocol
  is re-implemented inline here instead of via `createBackgroundStore`.
- **`lifecycle.ts`** owns one-time init (`ready()` — idempotent, retryable),
  `getStore()`, and the **save debouncer**. State persists to
  `storage.local` (full state) and `storage.session` (the `cache` slice); a
  synchronous `flushSave()` on `runtime.onSuspend` guards against loss on
  termination.
- **`whatsNew.ts`** opens the Welcome tab on version update (gated by a setting).

### State — `src/redux/`

Redux + redux-thunk. `State.ts` / `Reducers.ts` / `Actions.ts`, with the shared
`State` / `Expression` / `Setting` shapes and the `SettingID`, `SiteDataType`,
`ListType` **const enums** declared globally in `src/typings/Global.d.ts` (no
import needed). The UI talks to the background store over **redux-webext**: the
popup/settings dispatch actions that the background applies to the single source
of truth, then pushes state back over the port.

### Cleanup engine — `src/services/`

`CleanupService.ts` is the core: decides what to delete on tab-close / domain-change
/ manual / startup, honouring the **whitelist / greylist** expression lists and
per-expression `cleanSiteData` flags. Cookies are removed via `chrome.cookies`
(partition-aware — supports CHIPS `partitionKey`); non-cookie site data goes through
`chrome.browsingData.remove*`, which is **host-scoped only, not partition-aware**.
That asymmetry is why cross-site partitioned entries get their cookies cleaned but
their cache/storage left alone — see `isCrossSitePartitioned` and the full rationale
in `docs/chrome-vs-extensions-api.md`. Other services: `TabEvents`, `CookieEvents`,
`AlarmScheduler`/`AlarmEvents`, `ContextMenuEvents`, `BrowserActionService` (icon),
`BrowserDetect`, `SettingService`, and `Libs.ts` (shared helpers: domain parsing,
`getSetting`, `cadLog`, CHIPS detection).

### UI — `src/ui/`

Two independent React roots built as separate webpack entries: `popup/`
(per-site quick actions) and `settings/` (full options, expression tables, activity
log, Welcome/What's-New). `common_components/` is shared. Each entry ships as **one
self-contained bundle** (`splitChunks: false`) — MV3 SWs and `chrome-extension://`
pages can't reliably load webpack's async split chunks.

## Release process

`package.json` version is the **source of truth** (kept in sync with
`extension/manifest.json` by `tools/bumpVersion.js`). Pushing to `main`
(`.github/workflows/release-on-main.yml`) resolves that version and, **only if a
`v<version>` release doesn't already exist**, runs test → lint → build and publishes
a GitHub Release with the Chrome `.zip` + Firefox `.xpi`. So a release is cut by
merging a version bump to `main` — never by pushing directly.

Before merging that version bump, also run `npm run test:e2e` locally — CI only
runs the mocked Jest suite, so the real-browser harness (see Tests below) is the
last check against actual cookie deletion before the release goes out.

## Tests

Jest + ts-jest. Tests live under `__tests__/` (currently the build tooling and
release workflows); setup in `__tests__/setup.js`, `testEnvironment: node`.

`__tests__/e2e/` is a **local pre-release harness**, not part of `npm test`. It
loads the built extension into Playwright's Chromium, browses real sites, and
asserts against the real cookie jar — the one thing the mocked unit tests cannot
do. It needs network access and is excluded from Jest via
`testPathIgnorePatterns`. Run `npm run test:e2e` before cutting a release.

Failures are prefixed to say who is at fault: `SETUP FAILED` (harness),
`PRECONDITION FAILED` (site or network), `CLEANUP FAILED` (a real CAD
regression). Only the last one should block a release.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repo's GitHub Issues, using the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` and `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
