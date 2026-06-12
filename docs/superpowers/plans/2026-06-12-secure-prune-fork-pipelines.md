# Secure, Prune & Unify Fork Pipelines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure this fork's GitHub Actions, delete the irrelevant upstream PR-build/community machinery, standardize on a single Node version (22.x), and make CI green by removing the unused coverage run that causes the heap OOM.

**Architecture:** Pure configuration change across `.github/` and two root files (`package.json`, `jest.config.js`) plus a new `.nvmrc`. The keystone security move is switching the main CI workflow from `pull_request_target` to `pull_request` so untrusted PR code never runs with secrets or write tokens. The OOM is fixed by making CI run `jest` without `--coverage` (nothing consumed coverage anyway).

**Tech Stack:** GitHub Actions (YAML), Node 22.x, npm, Jest 26 / ts-jest.

**Spec:** `docs/superpowers/specs/2026-06-12-secure-prune-fork-pipelines-design.md`

**Verification note:** This is a CI/config plan; most steps verify via `git grep` assertions and `git status`, plus one real local run (`npm test`) that proves the OOM fix. YAML structural validity is ultimately confirmed by GitHub on push (Task 8).

---

## File map

- `package.json` — `engines.node` → `>=22.0.0`; split `test` / add `test:coverage`.
- `.nvmrc` — **new**, contains `22`.
- `jest.config.js` — `collectCoverage: true` → `false` (CLI flag now controls it).
- `.github/workflows/continuous-integration-workflow.yml` — full rewrite: `pull_request`, least-privilege, single checkout, `npm test`, no coverage upload, no `pre_info` skip job.
- `.github/workflows/ci_tag_testbuilds.yml` — Node 22.x + `setup-node@v4`, `npm test`, drop Codecov/Coveralls.
- `.github/workflows/ci_tag_release.yml` — Node 22.x + `setup-node@v4`, `npm test`, drop coverage artifact.
- `.github/ISSUE_TEMPLATE/config.yml`, `bug-report.yaml`, `support-request.yaml` — retarget away from upstream.
- **Deleted:** `slash_dispatch.yml`, `get-build-command.yml`, `ci-pr-comment.yml`, `issue_closer.yml`, `FUNDING.yml`, `stale.yml`, `codecov_alt.sh`, `issue_template.md`, `ISSUE_TEMPLATE/*.md_old`.

---

## Task 1: Standardize Node version to 22.x (root config)

**Files:**
- Modify: `package.json` (`engines` block)
- Create: `.nvmrc`

- [ ] **Step 1: Bump the engines floor**

In `package.json`, change:

```json
  "engines": {
    "node": ">=20.9.0",
    "npm": ">=8.5.0"
  },
```

to:

```json
  "engines": {
    "node": ">=22.0.0",
    "npm": ">=8.5.0"
  },
```

- [ ] **Step 2: Create `.nvmrc`**

Create `.nvmrc` with exactly this single line:

```
22
```

- [ ] **Step 3: Verify**

Run: `node -e "console.log(require('./package.json').engines.node)"` and `cat .nvmrc`
Expected: prints `>=22.0.0` then `22`.

- [ ] **Step 4: Commit**

```bash
git add package.json .nvmrc
git commit -m "chore: standardize Node floor on 22.x and add .nvmrc"
```

---

## Task 2: Split test scripts + stop forcing coverage (the OOM fix)

**Files:**
- Modify: `package.json` (`scripts` block)
- Modify: `jest.config.js`

- [ ] **Step 1: Restructure npm scripts**

In `package.json` `scripts`, replace:

```json
    "test": "jest --coverage",
    "test-all": "npm run test && npm run lint",
```

with:

```json
    "test": "jest",
    "test:coverage": "jest --coverage",
    "test-all": "npm run test && npm run lint",
```

- [ ] **Step 2: Make coverage opt-in in jest config**

In `jest.config.js`, change:

```js
  collectCoverage: true,
```

to:

```js
  collectCoverage: false,
```

- [ ] **Step 3: Run the suite locally WITHOUT coverage and confirm no OOM**

Run (PowerShell): `npm test`
Expected: Jest runs all 12 suites to completion and prints a `Tests:` summary and `Time:` line, with **no** `FATAL ERROR ... heap out of memory`. Note the reported time — it should be dramatically faster than the coverage run. Tests passing is the success signal; if any *assertion* fails that is a pre-existing test issue, but there must be **no heap crash**.

- [ ] **Step 4: (Optional) Confirm coverage still works on demand**

Run: `npm run test:coverage`
Expected: produces a `coverage/` directory. If this OOMs locally that is acceptable and expected (it's the same heavy path CI no longer runs); skip if your machine is constrained. This step does not gate the commit.

- [ ] **Step 5: Commit**

```bash
git add package.json jest.config.js
git commit -m "perf(test): run jest without coverage by default to fix heap OOM"
```

---

## Task 3: Secure the main CI workflow

**Files:**
- Modify (full rewrite): `.github/workflows/continuous-integration-workflow.yml`

- [ ] **Step 1: Replace the entire file with the secured version**

Overwrite `.github/workflows/continuous-integration-workflow.yml` with exactly:

```yaml
name: CI

on:
  push:
    branches-ignore:
      - '_archived__**'
  pull_request:
    branches-ignore:
      - '_archived__**'
    paths-ignore:
      - '**/README.md'

permissions:
  contents: read

jobs:
  all_jobs:
    name: Tests, Builds, Coverage
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Use Node.js 22.x
        id: node
        uses: actions/setup-node@v4
        with:
          node-version: '22.x'
      - name: Cache Node Modules
        id: nodeCache
        uses: actions/cache@v4
        with:
          # npm cache files stored in `~/.npm` on Linux
          path: ~/.npm
          key: ${{ runner.os }}-nodejs-${{ steps.node.outputs.node-version }}-npm-${{ hashFiles('**/package.json', '**/package-lock.json') }}
      - name: Install dependencies from cache (npm install --prefer-offline)
        if: steps.nodeCache.outputs.cache-hit == 'true'
        run: npm install --prefer-offline --no-fund
      - name: Install dependencies (npm ci)
        if: steps.nodeCache.outputs.cache-hit != 'true'
        run: npm ci --no-fund
      - name: Run Tests
        run: npm test
      - name: Run Lint
        run: npm run lint
      - name: Run Build
        run: npm run build
        env:
          GITSHA: ${{ github.sha }}
      - name: Extract zip builds for individual artifact upload
        if: github.event_name == 'pull_request'
        id: extbuilds
        run: |
          for i in *.zip; do echo "${i%.zip}"; done | xargs -I fn unzip fn.zip -d fn
          echo "ffdir=$(ls -d *Firefox)" >> $GITHUB_OUTPUT
          echo "crdir=$(ls -d *Chrome)" >> $GITHUB_OUTPUT
        working-directory: ./builds
      - name: Upload Artifact for Mozilla Firefox Build
        if: github.event_name == 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: ${{ steps.extbuilds.outputs.ffdir }}
          path: builds/${{ steps.extbuilds.outputs.ffdir }}
      - name: Upload Artifact for Google Chrome Build
        if: github.event_name == 'pull_request'
        uses: actions/upload-artifact@v4
        with:
          name: ${{ steps.extbuilds.outputs.crdir }}
          path: builds/${{ steps.extbuilds.outputs.crdir }}
```

What changed and why:
- `pull_request_target` → `pull_request` (no secrets / read-only token for fork PRs).
- Top-level `permissions: contents: read` (dropped `actions: write`, `pull-requests: read`).
- Deleted the `pre_info` skip-CI job and the dual `pull_request_target` checkout. GitHub natively honors `[skip ci]` in commit messages, so the bespoke logic is unnecessary.
- `npm run test -- --verbose` → `npm test` (no coverage, no verbose noise).
- Deleted both dead `if: false && …` Coveralls steps and the coverage-artifact upload.
- Build gets `GITSHA: ${{ github.sha }}` (only used to decorate the build filename).

- [ ] **Step 2: Verify the dangerous patterns are gone**

Run: `git grep -nE "pull_request_target|actions: write|coveralls|if: false" -- .github/workflows/continuous-integration-workflow.yml`
Expected: **no output** (exit code 1 / nothing matched).

- [ ] **Step 3: Verify the safe trigger is present**

Run: `git grep -n "pull_request:" -- .github/workflows/continuous-integration-workflow.yml`
Expected: one match showing the `pull_request:` trigger.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/continuous-integration-workflow.yml
git commit -m "security(ci): run CI on pull_request with least-privilege token"
```

---

## Task 4: Delete the irrelevant upstream machinery

**Files (all deleted):**
- `.github/workflows/slash_dispatch.yml`
- `.github/workflows/get-build-command.yml`
- `.github/workflows/ci-pr-comment.yml`
- `.github/workflows/issue_closer.yml`
- `.github/FUNDING.yml`
- `.github/stale.yml`
- `.github/codecov_alt.sh`
- `.github/issue_template.md`
- `.github/ISSUE_TEMPLATE/bug-report.md_old`
- `.github/ISSUE_TEMPLATE/feature-request.md_old`
- `.github/ISSUE_TEMPLATE/support-request.md_old`

- [ ] **Step 1: Remove the files**

```bash
git rm .github/workflows/slash_dispatch.yml \
       .github/workflows/get-build-command.yml \
       .github/workflows/ci-pr-comment.yml \
       .github/workflows/issue_closer.yml \
       .github/FUNDING.yml \
       .github/stale.yml \
       .github/codecov_alt.sh \
       .github/issue_template.md \
       ".github/ISSUE_TEMPLATE/bug-report.md_old" \
       ".github/ISSUE_TEMPLATE/feature-request.md_old" \
       ".github/ISSUE_TEMPLATE/support-request.md_old"
```

- [ ] **Step 2: Verify the PAT and slash machinery are gone repo-wide**

Run: `git grep -nE "REPO_ACCESS_TOKEN_WORKFLOW|slash-command|get-build" -- .github`
Expected: **no output**.

- [ ] **Step 3: Verify remaining workflows**

Run: `ls .github/workflows`
Expected exactly: `ci_tag_release.yml`, `ci_tag_testbuilds.yml`, `codeql-analysis.yml`, `continuous-integration-workflow.yml`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove upstream PR-build, slash-command, issue, and funding machinery"
```

---

## Task 5: Clean Codecov/Coveralls + Node bump from tag workflows

**Files:**
- Modify: `.github/workflows/ci_tag_testbuilds.yml`
- Modify: `.github/workflows/ci_tag_release.yml`

- [ ] **Step 1: Rewrite `ci_tag_testbuilds.yml`**

Overwrite `.github/workflows/ci_tag_testbuilds.yml` with exactly:

```yaml
name: Tagged Test Builds

on:
  push:
    tags:
      - 'v[0-9].[0-9]+.[0-9]+-alpha*'
      - 'v[0-9].[0-9]+.[0-9]+-beta*'

jobs:
  all_jobs:
    name: Tests, Builds, Release Uploads
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Commit
        uses: actions/checkout@v4
      - name: Use Node.js 22.x
        uses: actions/setup-node@v4
        with:
          node-version: '22.x'
      - name: Install Dependencies (npm ci)
        run: npm ci --no-fund
      - name: Run Tests
        run: npm test
      - name: Run Lint
        run: npm run lint
      - name: Ensure Version is Updated
        run: node ./tools/replaceVersionNumber.js
      - name: Run Build
        run: npm run build
        env:
          GITSHA: ${{ github.event.after }}
      - name: GitHub Releases
        id: github_releases
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          files: |
            builds/Cookie-AutoDelete_*_Chrome.zip
            builds/Cookie-AutoDelete_*_Firefox.xpi
          body: This is an automatically generated test build.  See commits for changes.
          draft: true
          prerelease: true
```

- [ ] **Step 2: Rewrite `ci_tag_release.yml`**

Overwrite `.github/workflows/ci_tag_release.yml` with exactly:

```yaml
name: Tagged Release Distribution

on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'
      - 'v[0-9]+.[0-9]+.[0-9]+-*'

permissions:
  contents: write

jobs:
  all_jobs:
    name: Tests, Builds, Release Uploads
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Commit
        uses: actions/checkout@v4
      - name: Use Node.js 22.x
        uses: actions/setup-node@v4
        with:
          node-version: '22.x'
      - name: Install Dependencies (npm ci)
        run: npm ci --no-fund
      - name: Run Tests
        run: npm test
      - name: Run Lint
        run: npm run lint
      - name: Ensure Version is Updated
        run: node ./tools/replaceVersionNumber.js
      - name: Run Build
        id: runbuild
        run: |
          npm run build
          echo "ffxpi=$(ls builds/*Firefox.xpi)" >> $GITHUB_OUTPUT
      - name: Archive Production Build Artifacts
        if: success()
        uses: actions/upload-artifact@v4
        with:
          name: builds
          path: builds
      - name: GitHub Releases
        id: github_releases
        uses: softprops/action-gh-release@v1
        if: startsWith(github.ref, 'refs/tags/')
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          files: |
            builds/Cookie-AutoDelete-V3_*_Chrome.zip
            builds/Cookie-AutoDelete-V3_*_Firefox.zip
            builds/Cookie-AutoDelete-V3_*_Firefox.xpi
          body: This is an auto-generated tagged release - Change log will be manually inserted soon! Built artifacts are attached below. This fork distributes via GitHub Releases only -- install via 'Load unpacked' (Chrome/Edge) or 'Load Temporary Add-on' (Firefox). See the README for instructions.
          prerelease: ${{ contains(github.ref, '-') }}
          draft: true
```

- [ ] **Step 3: Verify no coverage integrations remain anywhere**

Run: `git grep -niE "codecov|coveralls|--coverage" -- .github`
Expected: **no output**.

- [ ] **Step 4: Verify single Node version across all workflows**

Run: `git grep -nE "node-version|setup-node@" -- .github/workflows`
Expected: every `node-version` is `'22.x'` and every `setup-node` is `@v4`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci_tag_testbuilds.yml .github/workflows/ci_tag_release.yml
git commit -m "chore(ci): drop Codecov/Coveralls and align tag workflows to Node 22"
```

---

## Task 6: Retarget issue templates to this fork

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/config.yml`
- Modify: `.github/ISSUE_TEMPLATE/bug-report.yaml`
- Modify: `.github/ISSUE_TEMPLATE/support-request.yaml`

- [ ] **Step 1: Replace `config.yml`**

Overwrite `.github/ISSUE_TEMPLATE/config.yml` with exactly:

```yaml
blank_issues_enabled: true
```

(This fork has no separate wiki/discussions to link; allowing blank issues keeps the tracker usable without pointing contributors at the upstream project.)

- [ ] **Step 2: Remove upstream wiki links from `bug-report.yaml`**

In `.github/ISSUE_TEMPLATE/bug-report.yaml`, replace this block:

```yaml
        - PLEASE READ THE FAQ AND DOCUMENTATION BEFORE POSTING:
          - https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/wiki/Documentation
          - https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/wiki/FAQ:-Common-Questions-and-Issues
        - Issues that have an answer in the Documentation and/or FAQ WILL get closed and be pointed into the right direction

        - Please ensure that the bug report title starts with `[BUG] `.

        Stale issues without any relevant activity WILL get closed after a reasonable amount of time.
```

with:

```yaml
        - Please ensure that the bug report title starts with `[BUG] `.
```

(The "WILL get closed" warnings referenced the now-deleted `issue_closer`/`stale` automation, so they are no longer true.)

- [ ] **Step 3: Fix `support-request.yaml` — drop upstream assignee and discussions link**

In `.github/ISSUE_TEMPLATE/support-request.yaml`, replace:

```yaml
labels: support
assignees:
  - kennethtran93
body:
```

with:

```yaml
labels: support
body:
```

Then replace:

```yaml
        This support form is an alternate to support issues.  Support Q&A can now be created in the new Discussions area https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/discussions/new.  This allows marking a discussion post as answered to assist others.  Feel free to create support questions here or through the discussions area.  Support questions created here can be moved to discussions by a member of CAD Team.

        - Please check both open and closed issues to ensure that your support question has not been answered yet!  Duplicate issues will be closed and pointed to its duplicated/relevant issue.
```

with:

```yaml
        - Please check both open and closed issues to ensure that your support question has not been answered yet.
```

- [ ] **Step 4: Verify no upstream references remain in templates**

Run: `git grep -nE "Cookie-AutoDelete/Cookie-AutoDelete|kennethtran93|CAD Team" -- .github/ISSUE_TEMPLATE`
Expected: **no output**.

- [ ] **Step 5: Commit**

```bash
git add .github/ISSUE_TEMPLATE
git commit -m "docs: retarget issue templates to this fork"
```

---

## Task 7: Repo-wide verification sweep

**Files:** none (read-only checks)

- [ ] **Step 1: Confirm no `pull_request_target` anywhere**

Run: `git grep -nE "pull_request_target|REPO_ACCESS_TOKEN_WORKFLOW|codecov|coveralls" -- .github`
Expected: **no output**.

- [ ] **Step 2: Confirm the workflow set is exactly the four we want**

Run: `ls .github/workflows`
Expected: `ci_tag_release.yml`, `ci_tag_testbuilds.yml`, `codeql-analysis.yml`, `continuous-integration-workflow.yml`.

- [ ] **Step 3: Confirm one Node version everywhere**

Run: `git grep -nE "20\.9|18\.x|20\.x|node.*>=20" -- package.json .github .nvmrc`
Expected: **no output** (nothing on the old versions).

- [ ] **Step 4: Final local test run**

Run: `npm test`
Expected: completes with no heap OOM (same as Task 2 Step 3).

---

## Task 8: Push and confirm CI is green

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Watch the run**

Run: `gh run watch $(gh run list --branch fix/high-severity-vulns --workflow CI --limit 1 --json databaseId -q '.[0].databaseId')`
Expected: the `CI` workflow's "Tests, Builds, Coverage" job concludes **success** — no heap OOM.

- [ ] **Step 3: Confirm PR check status**

Run: `gh pr checks`
Expected: the `CI` test job is passing (the previously-failing "Tests, Builds, Coverage" is now green).

- [ ] **Step 4 (if CI fails): debug, do not paper over**

If the run fails, capture the failing log (`gh run view <id> --log-failed`) and fix the root cause. A YAML structural error surfaces here first; correct it and push again. Do not silence failures with `continue-on-error`.

---

## Self-review notes

- **Spec coverage:** priority 1 (secure) → Tasks 3, 4; priority 2 (delete) → Tasks 4, 5, 6; priority 3 (one Node) → Tasks 1, 5, 7; priority 4 (OOM/green CI) → Tasks 2, 8. `isolatedModules` correctly excluded (const enums present). Dependabot intentionally untouched (kept as a security asset).
- **Out of scope confirmed:** no test-suite refactor, no Jest major upgrade.
