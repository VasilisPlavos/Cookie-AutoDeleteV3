/**
 * Hot-path measurement harness.
 *
 * Runs the REAL background code (lifecycle.init, TabEvents, CookieEvents,
 * SettingService) against an instrumented `browser.*` mock and reports:
 *   - exact extension-API (IPC) call counts per event
 *   - real JS CPU time per event, measured on this machine
 *
 * It does NOT measure browser-process IPC latency (not observable from Node);
 * call counts are reported so that cost can be applied separately.
 */

/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any, no-console */

import { ReduxConstants } from '../../src/typings/ReduxConstants';

const perf = require('../../tools/perf/instrumentedBrowser');

// setup.js replaces global.console with jest.fn()s but keeps the originals.
const out: (...a: unknown[]) => void =
  (global.console as any)._log || console.log;

const HR = () => process.hrtime.bigint();
const MS = (a: bigint, b: bigint) => Number(b - a) / 1e6;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmt(n: number, d = 3): string {
  return n.toFixed(d);
}

/** Non-zero call counts, sorted desc, as "name×n" */
function callSummary(calls: Record<string, number>): string {
  return Object.entries(calls)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`)
    .join(', ');
}

/** Drain pending microtasks + timers so async subscribers finish. */
const drain = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * jest.resetModules() gives each measurement a fresh lifecycle module, and each
 * one arms its own 1 s save debounce. Keep every instance so afterAll can clear
 * them rather than leaving timers armed past the suite.
 */
const lifecycles: Array<{ _resetForTests: () => void }> = [];
function requireLifecycle(): any {
  const mod = require('../../src/background/lifecycle');
  lifecycles.push(mod);
  return mod;
}

/**
 * A realistic "returning user" stored state: default settings plus a populated
 * whitelist/greylist. Built once from the real reducers.
 */
function buildSeedState(expressionCount: number): string {
  jest.resetModules();
  perf.install({ tabCount: 1 });
  const createStore = require('../../src/redux/Store').default;
  const store = createStore({});
  store.dispatch({ type: ReduxConstants.ON_STARTUP });
  for (let i = 0; i < expressionCount; i++) {
    store.dispatch({
      type: ReduxConstants.ADD_EXPRESSION,
      payload: {
        expression: `*.site-${i}.com`,
        listType: i % 3 === 0 ? ListType.GREY : ListType.WHITE,
        storeId: 'default',
        cleanSiteData: i % 2 === 0 ? [SiteDataType.LOCALSTORAGE] : [],
      },
    });
  }
  return JSON.stringify(store.getState());
}

interface ColdResult {
  ms: number;
  calls: Record<string, number>;
  total: number;
}

async function measureColdInit(
  tabCount: number,
  seed: string,
): Promise<ColdResult> {
  jest.resetModules();
  const env = perf.install({ tabCount });
  env.storageLocal.data.state = seed;
  perf.resetCalls();

  const lifecycle = requireLifecycle();
  const t0 = HR();
  await lifecycle.ready();
  const t1 = HR();
  await drain();

  return { ms: MS(t0, t1), calls: { ...perf.calls }, total: perf.totalCalls() };
}

jest.setTimeout(120000);

describe('CAD hot-path measurements', () => {
  const SEED = buildSeedState(20);

  afterAll(() => {
    for (const l of lifecycles) l._resetForTests();
  });

  it('M1 — cold service-worker init vs open-tab count', async () => {
    out('\n' + '='.repeat(78));
    out('M1  COLD SW INIT  (lifecycle.ready() — runs on every SW wake)');
    out('='.repeat(78));
    out(
      `seed state: ${(SEED.length / 1024).toFixed(1)} KB JSON, 20 expressions\n`,
    );
    out(
      'tabs |  CPU ms (median of 7)  |  ext API calls  |  breakdown',
    );
    out('-'.repeat(78));

    const rows: Array<[number, number, number, string]> = [];
    for (const tabCount of [1, 10, 30, 60]) {
      const runs: ColdResult[] = [];
      for (let i = 0; i < 7; i++) {
        runs.push(await measureColdInit(tabCount, SEED));
      }
      const ms = median(runs.map((r) => r.ms));
      const last = runs[runs.length - 1];
      rows.push([tabCount, ms, last.total, callSummary(last.calls)]);
      out(
        `${String(tabCount).padStart(4)} | ${fmt(ms).padStart(20)}  | ${String(
          last.total,
        ).padStart(15)}  | ${callSummary(last.calls)}`,
      );
    }

    out('');
    const [t1, t60] = [rows[0], rows[3]];
    out(
      `scaling: ${t1[0]} tab = ${fmt(t1[1])} ms / ${t1[2]} calls  ->  ${
        t60[0]
      } tabs = ${fmt(t60[1])} ms / ${t60[2]} calls`,
    );
    out(
      `per extra tab: +${fmt(
        (t60[1] - t1[1]) / (t60[0] - t1[0]),
      )} ms CPU, +${fmt((t60[2] - t1[2]) / (t60[0] - t1[0]), 2)} API calls`,
    );
    expect(rows.length).toBe(4);
  });

  it('M2 — cookies.onChanged: cost paid by EVERY cookie write in the browser', async () => {
    jest.resetModules();
    const env = perf.install({ tabCount: 30 });
    env.storageLocal.data.state = SEED;
    const lifecycle = requireLifecycle();
    await lifecycle.ready();
    await drain();
    const CookieEvents = require('../../src/services/CookieEvents').default;

    const activeTab = env.tabs.find((t: any) => t.active);
    const activeDomain = new URL(activeTab.url).hostname.replace(/^www\./, '');

    const cases: Array<[string, string]> = [
      ['matches active tab', activeDomain],
      ['unrelated 3rd-party', 'tracker.adnetwork-example.com'],
    ];

    out('\n' + '='.repeat(78));
    out('M2  cookies.onChanged  (fires on every cookie set/overwrite/delete)');
    out('='.repeat(78));
    out('case                  | CPU us/event | ext API calls/event | which');
    out('-'.repeat(78));

    const results: Array<[string, number, number]> = [];
    for (const [label, domain] of cases) {
      const N = 300;
      // warm-up
      for (let i = 0; i < 50; i++) {
        await CookieEvents.onCookieChanged({
          removed: false,
          cause: 'explicit',
          cookie: perf.makeCookie(i, domain),
        });
      }
      perf.resetCalls();
      const t0 = HR();
      for (let i = 0; i < N; i++) {
        await CookieEvents.onCookieChanged({
          removed: false,
          cause: 'explicit',
          cookie: perf.makeCookie(i, domain),
        });
      }
      const t1 = HR();
      const usPer = (MS(t0, t1) * 1000) / N;
      const callsPer = perf.totalCalls() / N;
      results.push([label, usPer, callsPer]);
      out(
        `${label.padEnd(21)} | ${fmt(usPer, 1).padStart(12)} | ${fmt(
          callsPer,
          2,
        ).padStart(19)} | ${callSummary(perf.calls)}`,
      );
    }
    out('');
    out(
      'NOTE: the 750 ms debounce in TabEvents.onTabUpdate suppresses the downstream',
    );
    out(
      '      work, but tabs.query above is paid unconditionally, per event.',
    );
    expect(results.length).toBe(2);
  });

  it('M3 — getAllCookieActions: per page-load work (debounced, <=1.3/s)', async () => {
    jest.resetModules();
    const env = perf.install({ tabCount: 30, cookiesPerDomain: 25 });
    env.storageLocal.data.state = SEED;
    const lifecycle = requireLifecycle();
    await lifecycle.ready();
    await drain();
    const TabEvents = require('../../src/services/TabEvents').default;

    const tab = env.tabs[0];
    for (let i = 0; i < 30; i++) await TabEvents.getAllCookieActions(tab);
    await drain();

    const N = 200;
    perf.resetCalls();
    const t0 = HR();
    for (let i = 0; i < N; i++) await TabEvents.getAllCookieActions(tab);
    const t1 = HR();
    await drain();

    out('\n' + '='.repeat(78));
    out('M3  TabEvents.getAllCookieActions  (per completed page load)');
    out('='.repeat(78));
    out(`CPU: ${fmt((MS(t0, t1) * 1000) / N, 1)} us/call`);
    out(`ext API calls: ${fmt(perf.totalCalls() / N, 2)} per call`);
    out(`breakdown: ${callSummary(perf.calls)}`);
    expect(perf.totalCalls()).toBeGreaterThan(0);
  });

  it('M4 — store dispatch overhead (subscribers are slice-scoped, Task 2)', async () => {
    jest.resetModules();
    const env = perf.install({ tabCount: 30 });
    env.storageLocal.data.state = SEED;
    const lifecycle = requireLifecycle();
    await lifecycle.ready();
    await drain();
    const store = lifecycle.getStore();

    out('\n' + '='.repeat(78));
    out('M4  REDUX DISPATCH  (lifecycle.ts subscribes SettingService.onSettingsChange');
    out('    to the `settings` slice only, and checkIfProtected to `lists` only —');
    out('    via onSlicesChange — instead of running both on every dispatch)');
    out('='.repeat(78));

    // --- Part A: a slice neither subscriber reads (cache) ------------------
    // warm-up
    for (let i = 0; i < 30; i++) {
      store.dispatch({
        type: ReduxConstants.ADD_CACHE,
        payload: { key: `warm${i}`, value: i },
      });
    }
    await drain();

    const N = 200;
    perf.resetCalls();
    let t0 = HR();
    for (let i = 0; i < N; i++) {
      store.dispatch({
        type: ReduxConstants.ADD_CACHE,
        payload: { key: `k${i}`, value: i },
      });
    }
    let t1 = HR();
    const unrelatedSyncMs = MS(t0, t1);
    await drain();
    await drain();
    let t2 = HR();

    out(`ADD_CACHE (unrelated slice) x${N}:`);
    out(
      `  sync CPU on the dispatch stack : ${fmt((unrelatedSyncMs * 1000) / N, 1)} us/dispatch`,
    );
    out(
      `  total incl. async subscribers  : ${fmt((MS(t0, t2) * 1000) / N, 1)} us/dispatch`,
    );
    out(`  ext API calls                  : ${perf.totalCalls()} total`);
    out(
      '  onSlicesChange filters this out before SettingService.onSettingsChange or',
    );
    out('  checkIfProtected ever run — this is Task 2\'s intended effect.');

    expect(perf.totalCalls()).toBe(0);

    // --- Part B: the settings slice, which onSettingsChange DOES read ------
    for (let i = 0; i < 5; i++) {
      store.dispatch({
        type: ReduxConstants.UPDATE_SETTING,
        payload: { name: SettingID.DEBUG_MODE, value: i % 2 === 0 },
      });
    }
    await drain();

    perf.resetCalls();
    t0 = HR();
    for (let i = 0; i < N; i++) {
      store.dispatch({
        type: ReduxConstants.UPDATE_SETTING,
        payload: { name: SettingID.DEBUG_MODE, value: i % 2 === 0 },
      });
    }
    t1 = HR();
    const settingsSyncMs = MS(t0, t1);
    await drain();
    await drain();
    t2 = HR();

    out('');
    out(`UPDATE_SETTING (settings slice) x${N}:`);
    out(
      `  sync CPU on the dispatch stack : ${fmt((settingsSyncMs * 1000) / N, 1)} us/dispatch`,
    );
    out(
      `  total incl. async subscribers  : ${fmt((MS(t0, t2) * 1000) / N, 1)} us/dispatch`,
    );
    out(
      `  ext API calls                  : ${fmt(perf.totalCalls() / N, 2)} per dispatch`,
    );
    out(`  breakdown: ${callSummary(perf.calls)}`);
    out(
      '  This is SettingService.onSettingsChange -> checkIfProtected(), which now',
    );
    out('  only runs when the settings slice actually changed identity.');

    expect(perf.totalCalls()).toBeGreaterThan(0);
  });
});
