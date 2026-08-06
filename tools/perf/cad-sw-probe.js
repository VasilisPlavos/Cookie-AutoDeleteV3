/**
 * Measures the REAL Cookie AutoDelete MV3 service worker in a real Chromium:
 *   - how much wall-clock time it stays resident (=> memory + cold-start count)
 *   - how many times it cold-starts
 *   - its JS heap size
 *
 * Liveness is tracked with CDP target DISCOVERY ONLY (never attaching), because
 * attaching a debugger to a service worker suppresses Chrome's idle termination
 * and would invalidate the lifetime measurement. A single attach happens at the
 * very end, purely to read the heap.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CDP = 'http://127.0.0.1:9222';
// node tools/perf/cad-sw-probe.js [outDir]   (default: tools/perf/runs/latest)
const OUT_DIR = path.resolve(process.argv[2] || path.join(__dirname, 'runs', 'latest'));
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'cad-sw.json');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browserWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await (await fetch(`${CDP}/json/version`)).json();
      if (v.webSocketDebuggerUrl) return v.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error('CDP never came up');
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const handlers = [];

    ws.onopen = () =>
      resolve({
        send(method, params, sessionId) {
          const msgId = ++id;
          const msg = { id: msgId, method, params: params || {} };
          if (sessionId) msg.sessionId = sessionId;
          ws.send(JSON.stringify(msg));
          return new Promise((res, rej) => pending.set(msgId, { res, rej }));
        },
        on(fn) {
          handlers.push(fn);
        },
        close: () => ws.close(),
      });
    ws.onerror = (e) => reject(new Error('ws error ' + e.message));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error)));
        else res(m.result);
      } else if (m.method) {
        for (const h of handlers) h(m);
      }
    };
  });
}

const log = [];
function note(ev, extra) {
  const e = { t: Date.now(), ev, ...extra };
  log.push(e);
  console.log(`[${new Date(e.t).toISOString().slice(11, 19)}] ${ev}${extra ? ' ' + JSON.stringify(extra) : ''}`);
}

async function main() {
  const wsUrl = await browserWs();
  const c = await connect(wsUrl);

  // Track extension service-worker targets by discovery only.
  let swTargetId = null;
  let swUrl = null;
  const spans = []; // {start, end}
  let openedAt = null;

  // Chromium also runs component-extension service workers; match CAD only.
  const isCad = (t) =>
    t.type === 'service_worker' && /^chrome-extension:\/\/.*\/bundles\/background\.js/.test(t.url);

  c.on((m) => {
    if (m.method === 'Target.targetCreated' || m.method === 'Target.targetInfoChanged') {
      const t = m.params.targetInfo;
      if (isCad(t)) {
        if (swTargetId !== t.targetId) {
          swTargetId = t.targetId;
          swUrl = t.url;
          openedAt = Date.now();
          note('SW_START', { url: t.url.slice(0, 60) });
        }
      }
    }
    if (m.method === 'Target.targetDestroyed') {
      if (m.params.targetId === swTargetId) {
        const end = Date.now();
        spans.push({ start: openedAt, end, ms: end - openedAt });
        note('SW_STOP', { aliveMs: end - openedAt });
        swTargetId = null;
        openedAt = null;
      }
    }
  });

  await c.send('Target.setDiscoverTargets', { discover: true });

  // --- Phase A: fresh browser, nothing happening -----------------------------
  note('PHASE', { phase: 'A-quiet', seconds: 75 });
  await sleep(75000);

  // --- Phase B: real page loads ---------------------------------------------
  note('PHASE', { phase: 'B-browse', sites: SITES.length });
  for (const url of SITES) {
    await c.send('Target.createTarget', { url });
    note('PAGE', { url });
    await sleep(8000);
  }

  // --- Phase C: idle with all tabs open --------------------------------------
  note('PHASE', { phase: 'C-idle', seconds: 120 });
  await sleep(120000);

  // --- Phase D: one attach, purely to read the heap --------------------------
  note('PHASE', { phase: 'D-heap' });
  let heap = null;
  try {
    // Nudge the SW awake so there is something to attach to.
    await c.send('Target.createTarget', { url: 'https://example.com/' });
    await sleep(3000);
    const { targetInfos } = await c.send('Target.getTargets');
    const sw = targetInfos.find((t) => isCad(t));
    if (sw) {
      const { sessionId } = await c.send('Target.attachToTarget', {
        targetId: sw.targetId,
        flatten: true,
      });
      const usage = await c.send('Runtime.getHeapUsage', {}, sessionId);
      heap = usage;
      note('HEAP', {
        usedMB: +(usage.usedSize / 1048576).toFixed(2),
        totalMB: +(usage.totalSize / 1048576).toFixed(2),
      });
      await c.send('Target.detachFromTarget', { sessionId });
    } else {
      note('HEAP', { error: 'no SW target found' });
    }
  } catch (e) {
    note('HEAP', { error: String(e.message) });
  }

  // close out any still-running span
  if (openedAt) spans.push({ start: openedAt, end: Date.now(), ms: Date.now() - openedAt, stillAlive: true });

  const first = log[0].t;
  const last = log[log.length - 1].t;
  const totalMs = last - first;
  const aliveMs = spans.reduce((a, s) => a + s.ms, 0);

  const phaseWindows = {};
  const phases = log.filter((e) => e.ev === 'PHASE');
  for (let i = 0; i < phases.length; i++) {
    const start = phases[i].t;
    const end = i + 1 < phases.length ? phases[i + 1].t : last;
    const overlap = spans.reduce(
      (a, s) => a + Math.max(0, Math.min(s.end, end) - Math.max(s.start, start)),
      0,
    );
    phaseWindows[phases[i].phase] = {
      windowMs: end - start,
      swAliveMs: overlap,
      pctAlive: +((overlap / (end - start)) * 100).toFixed(1),
      coldStarts: log.filter((e) => e.ev === 'SW_START' && e.t >= start && e.t < end).length,
    };
  }

  const report = {
    swUrl,
    totalMs,
    aliveMs,
    pctAlive: +((aliveMs / totalMs) * 100).toFixed(1),
    coldStarts: spans.length,
    spans,
    phaseWindows,
    heap,
    log,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('REAL CAD SERVICE WORKER — LIFETIME & MEMORY');
  console.log('='.repeat(70));
  console.log(`observed window : ${(totalMs / 1000).toFixed(0)}s`);
  console.log(`SW resident     : ${(aliveMs / 1000).toFixed(0)}s (${report.pctAlive}% of the time)`);
  console.log(`cold starts     : ${report.coldStarts}`);
  if (heap) console.log(`JS heap         : ${(heap.usedSize / 1048576).toFixed(2)} MB used / ${(heap.totalSize / 1048576).toFixed(2)} MB total`);
  console.log('');
  console.log('per phase:');
  for (const [k, v] of Object.entries(phaseWindows)) {
    console.log(`  ${k.padEnd(10)} window ${(v.windowMs / 1000).toFixed(0).padStart(4)}s | SW alive ${String(v.pctAlive).padStart(5)}% | cold starts ${v.coldStarts}`);
  }
  console.log(`\n-> ${OUT}`);
  c.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
