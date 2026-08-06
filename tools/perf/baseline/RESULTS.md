# Baseline — before any hot-path changes

Recorded 2026-08-06 against `d43ee51` (CAD 1.3.0), Chromium 1232, Windows 11.
Raw data: `measured.json`, `cad-sw.json`. Regenerate the summary with
`node tools/perf/report.js`.

## Measured inputs

**Real browsing — 10 page loads in 82 s**

| | |
|---|---|
| `cookies.onChanged` | 2124 events = **212 per page load** |
| causes | explicit 1147, overwrite 686, expired_overwrite 291 |
| removals | 977 |
| `tabs.onUpdated` | 69 events = 6.9 per page load (28 with `status:complete`) |

**Idle — 60 s, 11 tabs open, no interaction**

| | |
|---|---|
| `cookies.onChanged` | 50 events = 2977/hour |
| `tabs.onUpdated` | 0 |

**Per-API latency (mean ms, real Chromium)**

| API | mean |
|---|---|
| `action.setIcon(imageData)` | **0.538** |
| `storage.local.set(5KB)` | 0.187 |
| `tabs.query({active:true})` | 0.152 |
| `cookies.getAll({domain:''})` (FPI probe) | 0.150 |
| `cookies.getAll({domain})` | 0.146 |
| `action.setTitle()` | 0.134 |
| `action.setBadgeText()` | 0.137 |
| `action.setBadgeBackgroundColor()` | 0.125 |
| `storage.local.get()` | 0.097 |
| `action.getTitle()` | 0.088 |
| `storage.session.get()` | 0.078 |
| `alarms.get()` | 0.071 |

`action.setIcon` is 3.5x more expensive than anything else CAD calls.

## API calls per event (deterministic — the A/B signal)

| Event | API calls | Cost |
|---|---|---|
| `cookies.onChanged` | **1** (`tabs.query`) | 0.185 ms |
| `getAllCookieActions` | **8** | 1.569 ms |
| one redux dispatch | **5** | 1.171 ms |
| cold SW init, N tabs | **10 + N** | 3.23 ms @1 tab -> 34.95 ms @60 tabs |

Breakdowns:

- `cookies.onChanged` -> `tabs.query({active:true})`
- `getAllCookieActions` -> `cookies.getAll` x2 (one is the FPI probe),
  `action.getTitle/setTitle/setIcon/setBadgeBackgroundColor/setBadgeText/setBadgeTextColor`
- redux dispatch -> `tabs.query`, `action.getTitle/setTitle/setIcon/setBadgeBackgroundColor`
- cold init -> `action.setIcon` x(2+N), `tabs.query` x2, `storage.local.get`,
  `storage.session.get` x2, the CHIPS probe, `action.getTitle/setTitle/setBadgeBackgroundColor`

The single `cookies.getAll` during cold init is `detectPartitionedCookieSupport`
(CHIPS) at `lifecycle.ts:129` — **not** the first-party-isolation probe. The cost
model prices it with the FPI probe's measured latency because both are one
`cookies.getAll` (0.150 vs 0.146 ms); only the label was wrong.

## Real CAD service worker

| | |
|---|---|
| observed | 278 s |
| resident | 227 s = **81.6%** |
| cold starts | **2** |
| JS heap | **3.48 MB used / 4.50 MB allocated** |

| phase | window | SW alive | cold starts |
|---|---|---|---|
| quiet (no tabs) | 75 s | 31.9% | 0 |
| browsing | 80 s | 99.8% | 1 |
| idle, 11 tabs open | 120 s | **100%** | **0** |

**The service worker never sleeps while tabs are open.** The ~0.8 events/s cookie
stream keeps resetting Chrome's 30 s idle timer, so MV3's termination model never
engages. It only sleeps with no tabs open (terminated after 23.9 s in the quiet
phase).

## Derived cost

| Scenario | CPU/hour | % of one core |
|---|---|---|
| sustained heavy browsing | 17.9 – 24.8 s | 0.50 – 0.69 % |
| idle, tabs open | 0.55 s | 0.015 % |
| mixed day (20% browse / 80% idle) | 4.0 – 5.4 s | 0.11 – 0.15 % |

Energy at ~3 J per CPU-second on a 60 Wh battery: **0.056 – 0.075 % of one full
charge over a 10-hour mixed day.**

The range on `getAllCookieActions` is min = once per page load, max = the
debounce ceiling of 1 per 750 ms sustained.

## Conclusions

1. **The dominant cost is `cookies.onChanged` -> `tabs.query`**, unconditionally,
   212 times per page load: 17.24 of the 17.93 s/h floor under heavy browsing
   (**96%**). `CookieEvents.ts:28` does this before any cheap filtering.
2. **`SettingService.onSettingsChange` runs on every store dispatch**, not just on
   settings changes (`lifecycle.ts:141`), ending in `checkIfProtected()` —
   5 IPC calls including the expensive `setIcon`.
3. **`isFirstPartyIsolate()` probes on every `getAllCookiesForDomain`**
   (`Libs.ts:227`); on Chrome the answer is always `false` and is cacheable.
4. **`setGlobalIcon`'s O(tabs) loop is low priority.** It is paid only on cold
   init, and cold starts are rare — 2 in 278 s, zero during idle-with-tabs. It
   matters at browser startup, not in steady state.
5. **Absolute cost is tiny.** Even eliminating all background work saves under
   0.1% of a battery charge per day. Any change here should be justified as code
   quality or correctness, not as a battery feature.

## Wrong hypotheses this run killed

- *"Idle is the worst case because sparse events force repeated cold inits."*
  Backwards. Idle-with-tabs keeps the SW **100%** resident with **zero** cold
  starts; the cold-init path is nearly free in steady state.
- *"Cold init costs 30–80 ms of CPU."* The JS is ~0.6 ms; the cost is IPC
  round-trips and it scales with open tab count (3.2 ms @1 tab, 35 ms @60).

## After round 1 — Tasks 1-3 applied (2026-08-06)

Measured against commits `d83bb4e..6d1cacb` (icon split, slice-scoped
subscriptions, memoised FPI probe), same machine, same Chromium revision
(`chromium-1232`). Raw data: `tools/perf/baseline/after-round-1/measured.json`,
`tools/perf/baseline/after-round-1/cad-sw.json` (copied here because
`tools/perf/runs/` is gitignored — ad-hoc run data isn't tracked, only
`baseline/`). `npm run test:perf` output captured separately (see Task 4
report).

### M1 — cold init, `npm run test:perf` (deterministic, the real signal)

`perf.totalCalls()` is now **flat at 19 calls regardless of open-tab count** —
confirmed at 1, 10, 30 and 60 tabs. Before this branch (re-measured against
`b6bde72` with the identical, unmodified harness, for a true apples-to-apples
diff) it scaled with tab count: 21 → 30 → 50 → 80 calls for 1 → 10 → 30 → 60
tabs (~+1 API call per open tab, from the O(tabs) `action.setIcon` loop that
`d83bb4e`/`b5a4ad0` removed from the init path).

The absolute numbers (19 / 21) don't match this document's earlier "12" /
"10 expected" framing verbatim: that framing counted only `browser.action.*`,
`browser.tabs.*`, `browser.storage.*` and `browser.cookies.*` calls, excluding
`runtime.getURL`, `runtime.getManifest`, `runtime.getPlatformInfo`, and the
icon-loading pipeline's `fetch`/`createImageBitmap` calls (9 calls at every
tab count, both before and after — `instrumentedBrowser.js` counts all of
these under `perf.totalCalls()`, this document's earlier hand rollup did not).
Subtracting that constant 9-call gap from both sides reproduces the original
12 → 10 figures exactly. Either way the qualitative result is unchanged and is
the one that matters: **no scaling with tab count**, confirmed on raw numbers
alone with no reconciliation needed.

### M3 — `getAllCookieActions` x200 (FPI probe caching)

Before (re-measured, same harness): `cookies.getAll×400` (2 per call — one
real lookup, one unmemoised FPI probe). After: `cookies.getAll×200` — the FPI
probe now fires once per service-worker lifetime (`f2f8572`/`6d1cacb`), and in
this harness that one probe call lands inside the test's own 30-call warm-up
window, before the measured 200-call window starts, so the measured window
pays it zero times rather than the predicted once (i.e. the cache is even more
effective in steady state than the "201" estimate assumed).

### M4 — store dispatch (informational, not part of the pass/fail gate)

`npm run test:perf` fails one assertion:
`__tests__/perf/hotpaths.test.ts:297` expects
`perf.totalCalls() > 0` for an `ADD_CACHE` dispatch and now observes `0`. This
is Task 2 working as designed — `lifecycle.ts`'s `onSlicesChange()` filters by
slice-reference-equality inside the subscriber itself, so it correctly ignores
an unrelated-slice dispatch even when the caller holds a direct `getStore()`
reference (the opposite of what was predicted going into this round). Proof:
`__tests__/background/lifecycle.spec.ts`'s `'does not run
SettingService.onSettingsChange for an unrelated slice'` test, which passes.
The stale assertion doesn't affect `npm test`/`npm run test-all`
(`__tests__/perf` is excluded from both).

### Real browser — IPC/event rates (`browser-meter`, environmental, not evidence)

| | Baseline | After |
|---|---|---|
| `cookies.onChanged` per page load | 212 | 215 |
| Idle `cookies.onChanged`/hour | 2977 | 1848 |
| `action.setIcon(imageData)` mean | 0.538 ms | 0.516 ms |

Day-to-day noise in what the 10 fixed sites happened to serve, not a measured
effect of this branch — call counts (M1/M3 above) are the only deterministic
signal.

### Real browser — CAD service-worker residency (`cad-sw-probe.js`)

| | Baseline | After |
|---|---|---|
| observed window | 278 s | 278 s |
| SW resident | 227 s (81.6%) | 225 s (80.8%) |
| cold starts | 2 | 2 |
| JS heap used / allocated | 3.48 / 4.50 MB | 3.56 / 4.75 MB |

Statistically indistinguishable from baseline, as predicted: cold starts are
rare (2 in 278 s either way) and the SW stays resident while tabs are open
regardless of the icon-loop fix, so this measurement was never expected to
move. `tools/perf/report.js`'s derived "Option C" savings and its `COUNTS`
table are unaffected by this round for a mechanical reason worth flagging:
`COUNTS` in `report.js` is a hand-maintained constant (`action.setIcon`:
`2 + tabs`, an unconditional FPI-probe count of 1 per call) that predates this
branch and was not updated alongside Tasks 1-3, so `node tools/perf/report.js
tools/perf/runs/after` prints the same derived cold-init/getAllCookieActions
figures as the baseline run regardless of code changes. `npm run test:perf`
(M1/M3 above) is the only place the actual effect of this branch shows up.

### Manual real-browser check (Step 5)

Confirmed by direct visual inspection (OS-level screenshots of the real
toolbar icon, not just DOM state):

- Whitelisted tab shows the default (blue) icon; unlisted tab shows red —
  visually distinct and correct.
- Forcing a real SW restart (`chrome://serviceworker-internals` → Stop) while
  a whitelisted tab sat in the background: its icon was still blue after the
  restart, with no reload — the Task 1 bug is fixed.
- Active Mode toggle off/on (via the popup, same tab kept foregrounded
  throughout): icon cleared to greyscale on off, returned to blue on on.
- Closing the browser entirely and relaunching on the same profile (tabs
  restored, new tab IDs as expected): no tab showed an *incorrect* leftover
  color. However, one restored tab (an unlisted site) sat on the default/blue
  icon for over a minute after its page had fully loaded, instead of updating
  to red — traced to `TabEvents.onTabUpdate`'s single, non-per-tab debounce
  flag (`src/services/TabEvents.ts:85-119`): when several tabs' `complete`
  events land inside the same 750 ms window (as session restore does), only
  the first is processed and the rest are dropped outright, not queued. An
  isolated reload of the same tab immediately produced the correct red icon,
  confirming the per-tab colour logic itself is correct and this is a
  scheduling gap, not a wrong-color bug. `TabEvents.ts` is untouched by any of
  this branch's three commits (confirmed by diffing against the pre-Task-1
  commit), so this is a pre-existing characteristic, present identically
  before and after this branch, not something removing the init-time loop
  caused. Worth a human's attention as a possible follow-up, separate from
  this branch.
