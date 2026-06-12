# Design: Secure, Prune, and Unify the Fork's CI/CD Pipelines

- **Date:** 2026-06-12
- **Author:** Vasileios Plavos (with Claude)
- **Status:** Draft — pending user review
- **Repo:** `VasilisPlavos/Cookie-AutoDeleteV3` (a fork of `Cookie-AutoDelete/Cookie-AutoDelete`)

## Problem

The `.github/` directory was inherited wholesale from the upstream Cookie-AutoDelete
project. It carries elaborate community-management and PR-build-distribution machinery
designed for a popular public project. On a personal fork this is:

1. **A security liability** — the main CI runs on `pull_request_target`, checks out the
   PR head commit, and executes its code (`npm ci`, build, tests) in a privileged context
   with write permissions and access to secrets. A slash-command workflow triggers on any
   issue comment and wields a personal access token.
2. **Mostly dead weight** — PR build-download links, slash commands, upstream issue-template
   enforcement, and funding links for the upstream author are irrelevant here.
3. **Inconsistent on Node** — three different Node versions are in play: `package.json`
   `engines` says `>=20.9`, the CI workflow uses `22.x`, the tag workflows use `20.x`.

A secondary symptom: the CI "Tests" step fails with a JavaScript heap **out-of-memory**
crash, because `jest --coverage` (ts-jest type-checking + coverage instrumentation over
all of `src/**`) is run on Node 22 with old Jest 26 — and the resulting coverage is then
**never uploaded** (all upload steps are disabled or token-gated).

## Operating model (decided)

**Option B:** the fork accepts external pull requests and runs an issue tracker, but does
**not** need PR build-download comments or slash commands.

## Goals (in priority order)

1. **Secure the fork** — eliminate the `pull_request_target` privilege-escalation surface
   and the PAT-wielding, comment-triggered workflows.
2. **Delete everything irrelevant** — remove the upstream PR-build / slash-command /
   issue-automation / funding layer.
3. **One Node version everywhere** — standardize on **Node 22.x**.

Plus one folded-in fix so CI actually goes green:

4. **Resolve the test OOM** — primarily as a *consequence* of removing unused coverage.

## Non-goals

- Refactoring the test suites themselves (the 6,600 lines of unit tests are clean and
  safe — fully mocked WebExtension API, no network/FS). Out of scope.
- Upgrading Jest / ts-jest to a newer major. Out of scope (separate effort if desired).
- Re-enabling Codecov/Coveralls. We are removing them, not reconfiguring them.

---

## Design

### Workstream 1 — Secure (priority 1)

**`continuous-integration-workflow.yml` (name: "CI") — the keystone change:**

- Change the trigger `pull_request_target` → **`pull_request`**. Under `pull_request`,
  external PR code runs with a **read-only** `GITHUB_TOKEN` and **no access to secrets** —
  this neutralizes the privilege-escalation vector.
- Remove the dual-checkout logic. The `pull_request_target`-specific
  "Checkout Specific REF Commit" step (which checks out the untrusted head SHA, `gitSHA`)
  is deleted; a single default `actions/checkout@v4` remains.
- Tighten permissions from `actions: write` / `pull-requests: read` down to
  top-level `permissions: contents: read` (least privilege).
- Simplify the `pre_info` "skip CI" job for the `pull_request` event model (it currently
  curls the commits API using `github.event.after`, which is a push-event field). Keep the
  `[ci skip]` / `l10n_*` behavior but source the branch/message from `pull_request` context.
- Delete the two dead, token-bearing Coveralls upload steps (`if: false && …`).
- Update the artifact-upload `if:` conditions that reference `pull_request_target` to
  reference `pull_request`.

**Action pinning (supply-chain hardening):**

- Pin surviving **third-party** (non-GitHub-owned) actions to a full commit SHA:
  e.g. `softprops/action-gh-release`. GitHub-owned `actions/*` and `github/codeql-action`
  may remain on major-version tags (lower risk, and Dependabot keeps them current).
- `dependabot.yml` is **kept** (it is a security asset). Optionally relax the schedule from
  `daily` to `weekly` to reduce PR noise — decided during planning.

### Workstream 2 — Delete irrelevant (priority 2)

**Delete entirely:**

- `.github/workflows/slash_dispatch.yml` — issue-comment-triggered, holds a PAT
  (`REPO_ACCESS_TOKEN_WORKFLOW`).
- `.github/workflows/get-build-command.yml` — `/get-build` PR build-download links.
- `.github/workflows/ci-pr-comment.yml` — `workflow_run` build-comment + coverage uploads.
- `.github/workflows/issue_closer.yml` — enforces upstream's issue templates, pings
  `@kennethtran93`.
- `.github/FUNDING.yml` — solicits Liberapay sponsorship for the **upstream** author.
- `.github/stale.yml` — requires the probot-stale GitHub App (not installed here);
  references upstream's label taxonomy.
- `.github/codecov_alt.sh` — Codecov helper; Codecov is being removed.
- `.github/issue_template.md` and the three `.github/ISSUE_TEMPLATE/*.md_old` files —
  legacy leftovers superseded by the `.yaml` templates.

**Remove coverage upload integrations from all remaining workflows** (priority 2 + 4):

- Strip Codecov and Coveralls steps from `ci_tag_testbuilds.yml` and the coverage-artifact
  upload from `ci_tag_release.yml` and `continuous-integration-workflow.yml`. Nothing
  consumes coverage, and `ci_tag_testbuilds.yml` currently has `fail_ci_if_error: true`
  on Codecov, which would fail a tagged build if `CODECOV_TOKEN` is absent.

### Workstream 3 — Retarget community files (priority 2)

- **`.github/ISSUE_TEMPLATE/config.yml`** — repoint `contact_links` from
  `Cookie-AutoDelete/Cookie-AutoDelete` discussions/wiki to this fork (or remove the links
  if no fork wiki/discussions exist).
- Scan the surviving `ISSUE_TEMPLATE/*.yaml` (bug-report, feature-request, support-request)
  for hard-coded upstream URLs / `@kennethtran93` mentions and retarget or remove them.

### Workstream 4 — One Node version + OOM fix (priorities 3 & 4)

**Standardize on Node 22.x:**

- `package.json` `engines.node` → `>=22.0.0` (exact floor confirmed in planning).
- All workflows use `node-version: '22.x'` via `actions/setup-node`. Upgrade the tag
  workflows' `setup-node@v3` → `@v4` for consistency with CI.
- Add a `.nvmrc` containing `22` so local installs match.

**Resolve the OOM (mostly by deletion):**

- The primary lever is removing `--coverage` from the CI test run — coverage was the
  memory hog and nothing consumed it. Restructure npm scripts:
  - `"test": "jest"` (no coverage; what CI runs)
  - `"test:coverage": "jest --coverage"` (opt-in, local use)
  - `jest.config.js`: flip the hardcoded `collectCoverage: true` to `false` so the CLI
    flag controls it.
- Workflows call `npm test` (dropping the `-- --verbose` noise).
- **Backstop levers if tests still strain memory without coverage** (applied/tuned during
  implementation, not assumed up front):
  - Cap Jest workers (e.g. `--maxWorkers=2`) so total worker memory stays within the
    runner's ~16 GB.
  - Raise the V8 heap ceiling via `NODE_OPTIONS=--max-old-space-size=…` if needed.
  - `ts-jest` `isolatedModules: true` is a large speed/memory win but is **out of scope
    for this minimal fix**: the source contains `const enum`s (10 occurrences across 4
    files in `src/typings`), which `isolatedModules` cannot compile. Adopting it would
    require first converting those to regular `enum`s — a separate change. (Test-time
    type-checking is not load-bearing, since the build's `tsc` step type-checks anyway,
    so this remains a viable future optimization.)

## Data / control flow after the change

- **External PR opened** → `CI` workflow runs on `pull_request` with a read-only token,
  no secrets, single safe checkout → runs `npm ci`, `npm test` (no coverage), lint, build,
  uploads build artifacts. No comment/slash/coverage side-channels.
- **Push to a branch** → same `CI` workflow runs (build + test gate).
- **Tag `vX.Y.Z` / `-alpha`/`-beta`** → tag workflow builds and publishes a GitHub Release.
- **Issue opened** → no automation; issue templates guide the reporter to the right form.

## Risks & mitigations

- **Skip-CI logic regresses under `pull_request`.** The `pre_info` job assumes push-event
  fields. Mitigation: rework it against `pull_request` context, or drop the bespoke
  skip-CI mechanism in favor of GitHub's native `[skip ci]` handling. Decided in planning.
- **Removing coverage hides a metric.** Accepted: nothing currently consumes it;
  `test:coverage` remains for local use.
- **Tag workflows still on `setup-node@v3`/old patterns.** Bring them in line during the
  Node-unification step; verify a dry tag build if practical.
- **`isolatedModules` breaking on enums.** Mitigated by making it conditional on a
  `const enum` check; not on the critical path.

## Success criteria

1. No workflow uses `pull_request_target`; no workflow is triggerable by an untrusted
   issue comment; no PAT (`REPO_ACCESS_TOKEN_WORKFLOW`) is referenced anywhere.
2. The PR-build / slash-command / issue-closer / funding / stale files are gone; surviving
   community files point at this fork, not upstream.
3. Exactly one Node version (22.x) appears across `engines`, all workflows, and `.nvmrc`.
4. The `CI` workflow's "Tests, Builds, Coverage" job passes (no heap OOM).
