# Clear 3 High-Severity Vulnerabilities via npm Overrides

**Date:** 2026-06-12
**Branch:** `fix/high-severity-vulns`
**Status:** Approved design

## Problem

`npm audit` reports 26 vulnerabilities (3 low, 20 moderate, 3 high). The 3
**high** advisories all originate from deep transitive dependencies of
**dev/build tooling** — none of them ship in the built browser extension:

| High advisory | Count | Origin chain |
|---------------|-------|--------------|
| `serialize-javascript` <=7.0.4 (RCE via RegExp.flags + CPU-exhaustion DoS) | 2 | `copy-webpack-plugin@10.2.4` → `serialize-javascript@6.0.2` |
| `braces` <3.0.3 (uncontrolled resource consumption) | 1 | `jest@26.6.3` → `jest-haste-map` → `sane@4.1.0` → `micromatch@3.1.10` → `braces@2.3.2` |

The "proper" upgrades npm proposes are both breaking and carry a hidden cost:

- **serialize-javascript:** only `copy-webpack-plugin@14.0.0` pulls a patched
  `serialize-javascript@^7.0.3`. cwp@13 still depends on `^6.0.2` (does **not**
  fix it). cwp@14 requires **node >=20.9.0**, which would break the project's
  18.x CI leg and force a node-floor bump.
- **braces:** every `braces` in the tree is already `3.0.3` **except** the one
  copy at `braces@2.3.2`, reachable only through jest@26's deprecated `sane`
  watcher. The clean removal of that path is a jest 27+ upgrade (jest dropped
  `sane`), i.e. the deferred jest 26→30 migration.

## Goal

Clear all **3 high** advisories with the smallest possible blast radius:

- No parent-package upgrades.
- No change to the node floor (`engines.node` stays `>=16.14.0`).
- No change to the CI matrix (stays 18.x + 22.x).
- Test suite and webpack build continue to pass.

Out of scope: the 20 moderate and 3 low advisories.

## Approach: npm `overrides`

Add an `overrides` block to `package.json`. No other dependency edits.

```json
"overrides": {
  "serialize-javascript": "^7.0.5",
  "braces": "^3.0.3"
}
```

### Why each override clears its advisory

- **`serialize-javascript ^7.0.5`** — `7.0.5` is the patched release (advisory
  is `<=7.0.4`). The override forces copy-webpack-plugin@10's bundled `6.0.2`
  up to `7.0.5`. The `serialize(obj, opts)` signature is stable across the 6→7
  range, so copy-webpack-plugin keeps functioning. Clears both
  serialize-javascript highs.
- **`braces ^3.0.3`** — forces the lone vulnerable `braces@2.3.2` (under
  `sane → micromatch@3.1.10`) to `3.0.3`. Because the advisory matches
  `<3.0.3`, raising it clears the advisory and cascades clean up through
  `micromatch` / `anymatch` / `sane` (those entries were only flagged as
  "depends on vulnerable braces").

### Known trade-off (verified, not assumed)

braces 3 exports a different API than the braces 2 that `micromatch@3.1.10`
expects. That micromatch@3 path exists **only** inside `sane`, jest's
**watch-mode** file watcher. CI and `npm test` run `jest --coverage` with no
watch, so the path is not exercised. The design's acceptance is contingent on
the test suite and build actually passing — see verification gates below — not
on assuming the path is dead.

## Verification gates

All must pass before the work is considered done:

1. `npm install` regenerates `package-lock.json` without errors.
2. `npm audit` reports **0 high** severity (moderate/low may remain).
3. `npm test` (`jest --coverage`) — full suite passes.
4. `npm run compile` (`webpack --config webpack.config.js`) — build succeeds
   and the copied global files (bootstrap css/js, jquery) are emitted.

## Deferred follow-up work

Tracked for a future task gated on raising the node floor to **>=20.9.0**:

- **jest 26 → 30** (also `ts-jest` and `@types/jest`) — the clean, override-free
  removal of the `sane`/`braces@2` chain.
- **copy-webpack-plugin 10 → 14** — the clean, override-free serialize-javascript
  fix. Bumps `engines.node` to `>=20.9.0` and requires dropping 18.x from CI.

When that node-floor bump happens, both overrides above can be removed.
