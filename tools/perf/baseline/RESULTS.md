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
  `storage.session.get` x2, FPI probe, `action.getTitle/setTitle/setBadgeBackgroundColor`

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
