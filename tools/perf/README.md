# Background hot-path measurement

Tooling used to decide whether CAD's MV3 background work is worth optimising, and
to verify the effect of any change. Everything here is measurement only — it is
not shipped in the extension bundle.

## The three measurements

| # | What | How | Deterministic? |
|---|------|-----|----------------|
| 1 | **Extension-API calls per event** | `__tests__/perf/hotpaths.test.ts` runs the real CAD code (`lifecycle.init`, `TabEvents`, `CookieEvents`, `SettingService`) against `instrumentedBrowser.js`, counting every `browser.*` call | **Yes** — same code, same counts |
| 2 | **Per-API IPC latency + background event rates** | `browser-meter/` extension in a real Chromium, reporting to `collector.js` | No — environment dependent |
| 3 | **CAD service-worker residency + JS heap** | `cad-sw-probe.js` drives Chromium over CDP with the real CAD extension loaded | Partly |

## Comparing a change against the baseline

**Measurement 1 is the honest A/B signal.** API call counts come from the code
alone, so a before/after diff is exact and reproducible.

`report.js`'s `COUNTS` constant is a hand-maintained model of the code at
branch base (currently `d43ee51`) — it is not re-derived per change, so its
API-call-derived output (per-event cost, cold-init totals, "what each option
saves") only reflects that pre-change code; `report.js` warns when pointed at
a data directory other than `baseline/` for this reason. For authoritative
post-change call counts, read `npm run test:perf`'s output directly.

**Measurement 2's event rates are an environmental input, not a result.** How many
`cookies.onChanged` events fire per page load depends on what the sites served
that day, not on CAD. Do not read a change in that number as an effect of your
patch. The fair comparison holds the baseline rates fixed and applies the *new*
call counts to them — which is what `report.js` does.

Per-API latency (also from measurement 2) is fairly stable on the same machine,
but re-measure it if the comparison is close.

## Running it

### 1. Call counts (fast, no browser)

```bash
npm run test:perf
```

This harness prints measurements rather than asserting behaviour, so `npm test`
excludes it and it gets its own script.

### 2. IPC latency + event rates

Chrome 137+ refuses `--load-extension`, so use Playwright's Chromium:

```
%LOCALAPPDATA%\ms-playwright\chromium-<rev>\chrome-win64\chrome.exe
```

```bash
node tools/perf/collector.js tools/perf/runs/after     # terminal 1, listens on :8777
```

```powershell
& $chromium --user-data-dir=<fresh-temp-dir> `
            --load-extension=tools\perf\browser-meter `
            --disable-extensions-except=tools\perf\browser-meter `
            --no-first-run --no-default-browser-check `
            --disable-backgrounding-occluded-windows about:blank
```

The extension drives itself: IPC benchmark, then 10 fixed sites at 8 s each, then
60 s idle. It writes `measured.json` and the collector exits.

### 3. CAD service-worker residency + heap

```powershell
& $chromium --user-data-dir=<fresh-temp-dir> `
            --load-extension=extension --disable-extensions-except=extension `
            --remote-debugging-port=9222 `
            --no-first-run --no-default-browser-check `
            --disable-backgrounding-occluded-windows about:blank
```

```bash
node tools/perf/cad-sw-probe.js tools/perf/runs/after
```

Phases: 75 s quiet, 10 sites at 8 s, 120 s idle, then one heap read.

Liveness is tracked with CDP target **discovery only**. Never attach a debugger to
the service worker while measuring lifetime — attaching suppresses Chrome's idle
termination and the SW will appear to live forever. The single attach at the end
is only for `Runtime.getHeapUsage`.

### 4. Report

```bash
node tools/perf/report.js                        # baseline
node tools/perf/report.js tools/perf/runs/after  # a new run
```

## Keeping runs comparable

- Do not edit the site list in `browser-meter/sw.js` or `cad-sw-probe.js`.
- Always use a **fresh** `--user-data-dir`; a warm cookie jar changes event counts.
- Use the same Chromium revision.
- `report.js` uses **mean** latency, not p50: `performance.now()` in a service
  worker is coarsened to 100 us, so p50 collapses to 0.100 for nearly every API
  and understates the cost.

## Baseline

`baseline/` holds the pre-change run. See `baseline/RESULTS.md` for the summary
and the conclusions drawn from it.
