/**
 * Final cost model.
 *
 * Inputs, all measured:
 *   measured.json  - real Chromium: per-API IPC latency + background event rates
 *   cad-sw.json    - real CAD service worker: residency, cold starts, JS heap
 *   COUNTS below   - exact API-call counts per event, from the Node harness
 *                    running the real CAD code (__tests__/perf/hotpaths.test.ts)
 *
 * Latency uses MEAN, not p50: performance.now() in a service worker is coarsened
 * to 100us, so p50 collapses to 0.100 for almost every API and understates cost.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Which run to report on. Defaults to the recorded baseline.
//   node tools/perf/report.js                     -> tools/perf/baseline
//   node tools/perf/report.js tools/perf/runs/after
const DATA = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'baseline');

const m = JSON.parse(fs.readFileSync(path.join(DATA, 'measured.json'), 'utf8'));
let sw = null;
try {
  sw = JSON.parse(fs.readFileSync(path.join(DATA, 'cad-sw.json'), 'utf8'));
} catch {
  /* probe may not have run */
}
console.log(`# data: ${DATA}\n`);

const L = {};
for (const r of m.ipc) L[r.name] = r.mean;
L['action.setBadgeTextColor()'] = L['action.setBadgeText()']; // not benched separately

const f = (n, d = 2) => (n === null || n === undefined ? 'n/a' : Number(n).toFixed(d));
const line = (c = '=') => console.log(c.repeat(76));

// --- exact API-call counts from the harness --------------------------------
const COUNTS = {
  coldInit: (tabs) => ({
    'action.setIcon(imageData)': 2 + tabs,
    'tabs.query({windowType:normal})': 1,
    'tabs.query({active:true})': 1,
    'storage.local.get()': 1,
    'storage.session.get()': 2,
    // This is detectPartitionedCookieSupport (CHIPS) at lifecycle.ts:129, not the
    // FPI probe. Priced with the FPI probe's latency as the nearest measured
    // equivalent — both are a single cookies.getAll (0.150 vs 0.146 ms).
    'cookies.getAll({domain:""}) [FPI probe]': 1,
    'action.getTitle()': 1,
    'action.setTitle()': 1,
    'action.setBadgeBackgroundColor()': 1,
  }),
  cookieOnChanged: { 'tabs.query({active:true})': 1 },
  getAllCookieActions: {
    'cookies.getAll({domain})': 1,
    'cookies.getAll({domain:""}) [FPI probe]': 1,
    'action.getTitle()': 1,
    'action.setTitle()': 1,
    'action.setIcon(imageData)': 1,
    'action.setBadgeBackgroundColor()': 1,
    'action.setBadgeText()': 1,
    'action.setBadgeTextColor()': 1,
  },
  reduxDispatch: {
    'tabs.query({active:true})': 1,
    'action.getTitle()': 1,
    'action.setTitle()': 1,
    'action.setIcon(imageData)': 1,
    'action.setBadgeBackgroundColor()': 1,
  },
};
const JS = { cookieOnChanged: 0.033, getAllCookieActions: 0.115, reduxDispatch: 0.135, coldInit: 0.6 };

const cost = (counts) =>
  Object.entries(counts).reduce((a, [k, n]) => a + (L[k] || 0) * n, 0);

const ph = m.byPhase;
const phSecs = (a, b) => {
  const s = m.phases.find((p) => p.phase === a);
  const e = m.phases.find((p) => p.phase === b);
  return (e.ts - s.ts) / 1000;
};
const browseSecs = phSecs('browse-start', 'browse-end');
const idleSecs = phSecs('idle-start', 'idle-end');

const cookiesPerHBrowse = (ph.browse.cookieEvents / browseSecs) * 3600;
const cookiesPerHIdle = (ph.idle.cookieEvents / idleSecs) * 3600;
const pagesPerHBrowse = (m.pages.length / browseSecs) * 3600;

line();
console.log('MEASURED INPUTS');
line();
console.log(`Browsing: ${m.pages.length} real page loads in ${f(browseSecs, 0)}s`);
console.log(`  cookies.onChanged  ${ph.browse.cookieEvents} events = ${f(ph.browse.cookieEvents / m.pages.length, 0)} per page load`);
console.log(`                     causes ${JSON.stringify(ph.browse.cookieByCause)}`);
console.log(`  tabs.onUpdated     ${ph.browse.tabUpdatedEvents} events = ${f(ph.browse.tabUpdatedEvents / m.pages.length, 1)} per page load (${ph.browse.tabUpdatedComplete} with status:complete)`);
console.log(`Idle (${f(idleSecs, 0)}s, 11 tabs open, no interaction)`);
console.log(`  cookies.onChanged  ${ph.idle.cookieEvents} events = ${f(cookiesPerHIdle, 0)}/hour`);
console.log(`  tabs.onUpdated     ${ph.idle.tabUpdatedEvents} events`);
console.log('');
console.log('Costliest APIs (mean ms per call):');
for (const k of ['action.setIcon(imageData)', 'tabs.query({active:true})', 'cookies.getAll({domain})', 'storage.local.set(5KB)', 'action.getTitle()']) {
  console.log(`  ${k.padEnd(42)} ${f(L[k], 3)}`);
}
console.log('');

line();
console.log('PER-EVENT COST  (measured API counts x measured mean latency)');
line();
const cCookie = cost(COUNTS.cookieOnChanged) + JS.cookieOnChanged;
const cPage = cost(COUNTS.getAllCookieActions) + JS.getAllCookieActions;
const cDisp = cost(COUNTS.reduxDispatch) + JS.reduxDispatch;
console.log(`cookies.onChanged   1 API call   ${f(cCookie, 3)} ms   <- paid on EVERY cookie write in the browser`);
console.log(`getAllCookieActions 8 API calls  ${f(cPage, 3)} ms   <- debounced to at most 1 per 750 ms`);
console.log(`one redux dispatch  5 API calls  ${f(cDisp, 3)} ms   <- any state change, via SettingService`);
console.log('');
console.log('Cold service-worker init:');
for (const t of [1, 10, 30, 60]) {
  const c = COUNTS.coldInit(t);
  console.log(`  ${String(t).padStart(2)} tabs open  ${String(Object.values(c).reduce((a, b) => a + b, 0)).padStart(3)} API calls  ${f(cost(c) + JS.coldInit, 2).padStart(6)} ms`);
}
console.log('');

line();
console.log('CPU PER HOUR');
line();
// getAllCookieActions rate is bounded: >=1 per page load, <=1.33/s while
// same-domain cookie traffic is continuous. Report both ends.
function hour(label, cookiesH, pagesH, activeFraction) {
  const cookieMs = cookiesH * cCookie;
  const lo = pagesH * cPage;
  const hi = activeFraction * 3600 * (1 / 0.75) * cPage;
  console.log(label);
  console.log(`  cookie events   ${f(cookiesH, 0).padStart(7)}/h  -> ${f(cookieMs / 1000).padStart(6)} s/h`);
  console.log(`  getAllCookieActions        -> ${f(lo / 1000)} s/h (min, 1/page) .. ${f(hi / 1000)} s/h (max, debounce-saturated)`);
  console.log(`  TOTAL                      -> ${f((cookieMs + lo) / 1000)} .. ${f((cookieMs + hi) / 1000)} s CPU per hour`);
  console.log(`                                = ${f(((cookieMs + lo) / 36000), 3)} .. ${f(((cookieMs + hi) / 36000), 3)} % of one core`);
  console.log('');
  return [(cookieMs + lo) / 1000, (cookieMs + hi) / 1000];
}

const heavy = hour('SUSTAINED HEAVY BROWSING (at the measured rate, all hour):', cookiesPerHBrowse, pagesPerHBrowse, 1.0);
const idle = hour('IDLE, tabs left open:', cookiesPerHIdle, 0, 0);
const mixed = hour('MIXED DAY (20% browsing at measured rate, 80% idle):', 0.2 * cookiesPerHBrowse + 0.8 * cookiesPerHIdle, 0.2 * pagesPerHBrowse, 0.2);

const J = 3; // ~3 J per CPU-second, mid-range for a laptop core under light load
const BATT = 60 * 3600; // 60 Wh in joules
line();
console.log(`ENERGY  (~${J} J per CPU-second, 60 Wh battery)`);
line();
for (const [lbl, r] of [['heavy browsing', heavy], ['idle', idle], ['mixed day', mixed]]) {
  console.log(`  ${lbl.padEnd(16)} ${f(r[0] * J).padStart(6)} .. ${f(r[1] * J).padStart(6)} J/h  =  ${f((r[0] * J / BATT) * 100, 4)} .. ${f((r[1] * J / BATT) * 100, 4)} % of battery per hour`);
}
console.log('');
console.log(`  Over a 10-hour mixed day: ${f((mixed[0] * J * 10 / BATT) * 100, 3)} .. ${f((mixed[1] * J * 10 / BATT) * 100, 3)} % of one full charge.`);
console.log('');

if (sw) {
  line();
  console.log('REAL CAD SERVICE WORKER (measured via CDP, no debugger attached)');
  line();
  console.log(`observed        : ${f(sw.totalMs / 1000, 0)}s`);
  console.log(`SW resident     : ${f(sw.aliveMs / 1000, 0)}s = ${sw.pctAlive}% of the time`);
  console.log(`cold starts     : ${sw.coldStarts}`);
  if (sw.heap) console.log(`JS heap         : ${f(sw.heap.usedSize / 1048576)} MB used / ${f(sw.heap.totalSize / 1048576)} MB allocated`);
  console.log('');
  for (const [k, v] of Object.entries(sw.phaseWindows)) {
    console.log(`  ${k.padEnd(10)} window ${f(v.windowMs / 1000, 0).padStart(4)}s | SW alive ${String(v.pctAlive).padStart(5)}% | cold starts ${v.coldStarts}`);
  }
  console.log('');
  const coldMs = cost(COUNTS.coldInit(11)) + JS.coldInit;
  console.log(`Each cold start costs ${f(coldMs, 2)} ms (11 tabs). ${sw.coldStarts} cold starts = ${f((sw.coldStarts * coldMs) / 1000, 2)} s over the run.`);
  console.log('');
}

line();
console.log('WHAT EACH OPTION ACTUALLY SAVES');
line();
console.log(`A) "Clean only at startup", as proposed (gate only the cleanup):`);
console.log(`     cookies.onChanged and tabs.onUpdated are NOT gated on ACTIVE_MODE,`);
console.log(`     so all of the per-hour cost above remains. Saving: the cleanup pass only.`);
console.log('');
console.log(`B) Same, but also stop registering the observation listeners:`);
console.log(`     saves ${f(mixed[0])} .. ${f(mixed[1])} s CPU/h on a mixed day`);
console.log(`     = ${f((mixed[0] * J / BATT) * 100, 4)} .. ${f((mixed[1] * J / BATT) * 100, 4)} % of battery per hour`);
console.log(`     but loses the cookie-count badge and per-site icon colours.`);
console.log('');
console.log(`C) Fix the three hot paths (no behaviour change, helps ALL users):`);
const fix1 = cost(COUNTS.reduxDispatch) + JS.reduxDispatch;
const cold60 = cost(COUNTS.coldInit(60));
const cold60fix = cost(COUNTS.coldInit(0)) - 2 * L['action.setIcon(imageData)'];
console.log(`     #1 dispatch -> checkIfProtected  : ${f(fix1, 3)} ms per state change, removed`);
console.log(`     #2 setGlobalIcon O(tabs) on init : ${f(cold60, 2)} -> ${f(cold60fix, 2)} ms at 60 tabs (-${f(100 - (cold60fix / cold60) * 100, 0)}%)`);
console.log(`     #3 isFirstPartyIsolate() probe   : ${f(L['cookies.getAll({domain:""}) [FPI probe]'], 3)} ms per page load, cacheable to 0`);
console.log('');
console.log(`   Biggest single lever not in that list: filter cookies.onChanged BEFORE`);
console.log(`   tabs.query. At ${f(ph.browse.cookieEvents / m.pages.length, 0)} events per page load that one call is`);
console.log(`   ${f((cookiesPerHBrowse * cCookie) / 1000)} of the ${f(heavy[0])} s/h floor under heavy browsing.`);
