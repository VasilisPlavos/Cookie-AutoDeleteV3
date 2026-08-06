/**
 * Local collector for the CAD Hot-Path Meter extension.
 * Listens on :8777, accumulates metrics, writes a JSON report, exits on `done`.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

// node tools/perf/collector.js [outDir]   (default: tools/perf/runs/latest)
const OUT_DIR = path.resolve(process.argv[2] || path.join(__dirname, 'runs', 'latest'));
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'measured.json');
const PORT = 8777;

const state = {
  startedAt: Date.now(),
  phases: [],
  ipc: null,
  ipcLoaded: null,
  pages: [],
  totals: {},
  byPhase: {},
  errors: [],
};

function addDelta(phase, delta) {
  const bucket = (state.byPhase[phase] = state.byPhase[phase] || {
    cookieEvents: 0,
    cookieRemoved: 0,
    cookieByCause: {},
    tabUpdatedEvents: 0,
    tabUpdatedComplete: 0,
    tabUpdatedByKey: {},
    tabsRemoved: 0,
    flushes: 0,
  });
  bucket.flushes++;
  for (const k of ['cookieEvents', 'cookieRemoved', 'tabUpdatedEvents', 'tabUpdatedComplete', 'tabsRemoved']) {
    bucket[k] += delta[k] || 0;
    state.totals[k] = (state.totals[k] || 0) + (delta[k] || 0);
  }
  for (const [k, v] of Object.entries(delta.cookieByCause || {})) {
    bucket.cookieByCause[k] = (bucket.cookieByCause[k] || 0) + v;
  }
  for (const [k, v] of Object.entries(delta.tabUpdatedByKey || {})) {
    bucket.tabUpdatedByKey[k] = (bucket.tabUpdatedByKey[k] || 0) + v;
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (req.method !== 'POST') {
    res.writeHead(200);
    return res.end('ok');
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return;
    }
    switch (msg.kind) {
      case 'delta':
        addDelta(msg.phase, msg);
        break;
      case 'ipc':
        state.ipc = msg.results;
        console.log('  [ipc] latency benchmark received');
        break;
      case 'ipc-loaded':
        state.ipcLoaded = { tabCount: msg.tabCount, results: msg.results };
        console.log(`  [ipc] loaded-browser re-measure received (${msg.tabCount} tabs)`);
        break;
      case 'page':
        state.pages.push(msg);
        console.log(`  [page ${state.pages.length}] ${msg.url}  (${msg.openTabs} tabs open)`);
        break;
      case 'phase':
        state.phases.push(msg);
        console.log(`  [phase] ${msg.phase}`);
        break;
      case 'error':
        state.errors.push(msg.message);
        console.log(`  [ERROR] ${msg.message}`);
        break;
      case 'done':
        state.finishedAt = Date.now();
        fs.writeFileSync(OUT, JSON.stringify(state, null, 2));
        console.log(`\nDONE -> ${OUT}`);
        server.close();
        setTimeout(() => process.exit(0), 200);
        break;
    }
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`collector listening on :${PORT}`));

// Safety net: never hang forever.
setTimeout(() => {
  state.timedOut = true;
  state.finishedAt = Date.now();
  fs.writeFileSync(OUT, JSON.stringify(state, null, 2));
  console.log(`\nTIMEOUT -> wrote partial report to ${OUT}`);
  process.exit(0);
}, 6 * 60 * 1000);
