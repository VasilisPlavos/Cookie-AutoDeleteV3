/**
 * CAD Hot-Path Meter — measures, in a real Chrome MV3 service worker:
 *   1. real per-call latency of the extension APIs CAD uses on its hot paths
 *   2. real cookies.onChanged / tabs.onUpdated event rates during real browsing
 *
 * Results are POSTed to a local collector (no data leaves the machine).
 */

const COLLECTOR = 'http://localhost:8777';

const SITES = [
  'https://en.wikipedia.org/wiki/HTTP_cookie',
  'https://www.bbc.com/news',
  'https://stackoverflow.com/questions',
  'https://github.com/explore',
  'https://www.reddit.com/r/programming/',
  'https://www.imdb.com/chart/top/',
  'https://www.ebay.com/',
  'https://weather.com/',
  'https://www.cnn.com/',
  'https://www.amazon.com/',
];

// ---- event counters (in-memory, flushed as deltas) -------------------------

let d = freshDelta();

function freshDelta() {
  return {
    cookieEvents: 0,
    cookieByCause: {},
    cookieRemoved: 0,
    tabUpdatedEvents: 0,
    tabUpdatedByKey: {},
    tabUpdatedComplete: 0,
    tabsRemoved: 0,
  };
}

function bump(obj, key, by = 1) {
  obj[key] = (obj[key] || 0) + by;
}

chrome.cookies.onChanged.addListener((ci) => {
  d.cookieEvents++;
  bump(d.cookieByCause, ci.cause);
  if (ci.removed) d.cookieRemoved++;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  d.tabUpdatedEvents++;
  for (const k of Object.keys(changeInfo)) bump(d.tabUpdatedByKey, k);
  if (tab && tab.status === 'complete') d.tabUpdatedComplete++;
});

chrome.tabs.onRemoved.addListener(() => {
  d.tabsRemoved++;
});

function addCounts(target, source) {
  target.cookieEvents += source.cookieEvents;
  target.cookieRemoved += source.cookieRemoved;
  target.tabUpdatedEvents += source.tabUpdatedEvents;
  target.tabUpdatedComplete += source.tabUpdatedComplete;
  target.tabsRemoved += source.tabsRemoved;
  for (const [k, v] of Object.entries(source.cookieByCause)) bump(target.cookieByCause, k, v);
  for (const [k, v] of Object.entries(source.tabUpdatedByKey)) bump(target.tabUpdatedByKey, k, v);
}

async function flush(phase) {
  const payload = { kind: 'delta', phase, ...d };
  const sent = d;
  d = freshDelta();
  try {
    await fetch(`${COLLECTOR}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // collector not up yet; sum the unsent counts (plus anything counted by
    // listeners since `d` was reset above) into the next flush instead of
    // overwriting it, so events aren't silently lost.
    addCounts(d, sent);
  }
}

async function send(obj) {
  try {
    await fetch(`${COLLECTOR}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
    });
  } catch (e) {
    /* ignore */
  }
}

// ---- IPC latency benchmark -------------------------------------------------

async function makeIconData() {
  // Same technique CAD uses (BrowserActionService.loadIconData).
  const c = new OffscreenCanvas(48, 48);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(0, 0, 48, 48);
  return ctx.getImageData(0, 0, 48, 48);
}

async function bench(name, fn, iterations) {
  // warm-up
  for (let i = 0; i < 20; i++) await fn(i);
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn(i);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    name,
    n: iterations,
    mean: sum / samples.length,
    p50: samples[Math.floor(samples.length * 0.5)],
    p90: samples[Math.floor(samples.length * 0.9)],
    p99: samples[Math.floor(samples.length * 0.99)],
  };
}

async function runIpcBenchmark() {
  const icon = await makeIconData();
  const N = 300;
  const results = [];

  results.push(
    await bench('tabs.query({active:true})', () => chrome.tabs.query({ active: true, windowType: 'normal' }), N),
  );
  results.push(
    await bench('tabs.query({windowType:normal})', () => chrome.tabs.query({ windowType: 'normal' }), N),
  );
  results.push(
    await bench('cookies.getAll({domain})', () => chrome.cookies.getAll({ domain: 'wikipedia.org' }), N),
  );
  results.push(
    await bench('cookies.getAll({domain:""}) [FPI probe]', () => chrome.cookies.getAll({ domain: '' }), N),
  );
  results.push(await bench('action.setIcon(imageData)', () => chrome.action.setIcon({ imageData: { 48: icon } }), N));
  results.push(await bench('action.getTitle()', () => chrome.action.getTitle({}), N));
  results.push(await bench('action.setTitle()', () => chrome.action.setTitle({ title: 'x' }), N));
  results.push(await bench('action.setBadgeText()', () => chrome.action.setBadgeText({ text: '' }), N));
  results.push(
    await bench('action.setBadgeBackgroundColor()', () => chrome.action.setBadgeBackgroundColor({ color: 'blue' }), N),
  );
  results.push(await bench('storage.local.get()', () => chrome.storage.local.get(), N));
  results.push(
    await bench('storage.local.set(5KB)', (i) => chrome.storage.local.set({ blob: 'x'.repeat(5000) + i }), 150),
  );
  results.push(await bench('storage.session.get()', () => chrome.storage.session.get('cache'), N));
  results.push(await bench('alarms.get()', () => chrome.alarms.get('nope'), N));

  await send({ kind: 'ipc', results });
  return results;
}

// ---- browsing driver -------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function openAndWait(url, settleMs) {
  const tab = await chrome.tabs.create({ url, active: true });
  await sleep(settleMs);
  return tab.id;
}

async function run() {
  await send({ kind: 'phase', phase: 'start', ts: Date.now() });

  // Phase 1 — IPC latency, on an otherwise idle browser.
  const ipc = await runIpcBenchmark();
  await flush('ipc-bench');

  // Phase 2 — real page loads, one at a time, tabs left open (accumulating).
  await send({ kind: 'phase', phase: 'browse-start', ts: Date.now() });
  const opened = [];
  for (const url of SITES) {
    const before = Date.now();
    const id = await openAndWait(url, 8000);
    opened.push(id);
    await send({
      kind: 'page',
      url,
      ms: Date.now() - before,
      openTabs: (await chrome.tabs.query({ windowType: 'normal' })).length,
    });
    await flush('browse');
  }
  await send({ kind: 'phase', phase: 'browse-end', ts: Date.now() });

  // Phase 3 — idle with all tabs still open (background cookie churn).
  await send({ kind: 'phase', phase: 'idle-start', ts: Date.now(), openTabs: opened.length + 1 });
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    await flush('idle');
  }
  await send({ kind: 'phase', phase: 'idle-end', ts: Date.now() });

  // Phase 4 — re-measure the two costliest APIs with many tabs open, to see
  // whether IPC latency degrades with tab count (CAD's setGlobalIcon loop).
  const tabCount = (await chrome.tabs.query({ windowType: 'normal' })).length;
  const loaded = [
    await bench('tabs.query({windowType:normal}) @manyTabs', () => chrome.tabs.query({ windowType: 'normal' }), 200),
    await bench('action.setIcon(imageData) @manyTabs', () => chrome.action.setIcon({ imageData: { 48: makeIconDataSync() } }), 200),
  ];
  await send({ kind: 'ipc-loaded', tabCount, results: loaded });

  await send({ kind: 'done', ts: Date.now() });
}

let cachedIcon = null;
function makeIconDataSync() {
  if (cachedIcon) return cachedIcon;
  const c = new OffscreenCanvas(48, 48);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(0, 0, 48, 48);
  cachedIcon = ctx.getImageData(0, 0, 48, 48);
  return cachedIcon;
}

run().catch((e) => send({ kind: 'error', message: String(e && e.stack) }));
