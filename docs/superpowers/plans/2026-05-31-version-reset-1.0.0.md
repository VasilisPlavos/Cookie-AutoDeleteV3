# Cookie AutoDelete V3 — Version Reset to 1.0.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset the fork's version line from the inherited `4.x` to a clean `1.0.0`, rename the default branch to `main`, and replace the published `v4.0.0-beta.1` pre-release with a `v1.0.0` release.

**Architecture:** One self-contained commit resets every version field and the two stale branch references; local build + test prove it before any remote change. Then a strict-order `gh`/`git` sequence deletes the old release/tag, renames `4.X.X-Branch` → `main`, and tags `v1.0.0` to trigger the existing `Tagged Release Distribution` workflow (which produces correctly-named artifacts because `v1.0.0` has no pre-release suffix).

**Tech Stack:** npm, webpack, Jest, GitHub Actions, `gh` CLI, Git. Shell is Windows PowerShell.

**Spec:** [`docs/superpowers/specs/2026-05-31-version-reset-1.0.0-design.md`](../specs/2026-05-31-version-reset-1.0.0-design.md)

---

## Preconditions

- Current branch is `4.X.X-Branch` (PR #11 already merged here).
- `package.json` `version` = `4.0.0-beta.1`; `extension/manifest.json` `version` = `4.0.0`.
- Remote `origin` = `https://github.com/vasilisplavos/Cookie-AutoDeleteV3.git`; `upstream` = the original repo.
- A published pre-release `v4.0.0-beta.1` exists on `origin` with three assets.
- `gh` is authenticated against `vasilisplavos/Cookie-AutoDeleteV3`.

Verify before starting:

```powershell
git branch --show-current   # expect: 4.X.X-Branch
node -e "console.log(require('./package.json').version)"   # expect: 4.0.0-beta.1
gh release view v4.0.0-beta.1 --repo vasilisplavos/Cookie-AutoDeleteV3 --json tagName --jq .tagName   # expect: v4.0.0-beta.1
```

---

## File Structure

Files touched by the reset commit (Task 1), each with one responsibility:

- `package.json` — npm package version (source of truth the release workflow validates the tag against).
- `extension/manifest.json` — the extension version browsers read.
- `package-lock.json` — regenerated so its root `version` fields track `package.json`.
- `src/ui/settings/ReleaseNotes.json` — in-app "Release Notes" content; reset to a single `1.0.0` entry.
- `README.md` — CI badge branch query.
- `.github/workflows/codeql-analysis.yml` — CodeQL push/PR branch targets.

Tasks 2–4 touch no files — they are remote Git/GitHub operations.

---

## Task 1: Reset all version numbers and stale branch references

**Files:**
- Modify: `package.json:3`
- Modify: `extension/manifest.json:5`
- Modify: `src/ui/settings/ReleaseNotes.json` (replace `releases` array)
- Modify: `README.md:9`
- Modify: `.github/workflows/codeql-analysis.yml:16,19`
- Regenerate: `package-lock.json`

- [ ] **Step 1: Set `package.json` version to `1.0.0`**

Change line 3 from:

```json
  "version": "4.0.0-beta.1",
```

to:

```json
  "version": "1.0.0",
```

- [ ] **Step 2: Set `extension/manifest.json` version to `1.0.0`**

Change line 5 from:

```json
  "version": "4.0.0",
```

to:

```json
  "version": "1.0.0",
```

- [ ] **Step 3: Replace the `ReleaseNotes.json` `releases` array with a single 1.0.0 entry**

Overwrite the entire contents of `src/ui/settings/ReleaseNotes.json` with:

```json
{
  "releases": [
    {
      "version": "1.0.0",
      "notes": [
        "First release of Cookie AutoDelete V3 — a Manifest V3 fork of Cookie AutoDelete.",
        "Supports Chrome 109+, Firefox 115+, and Edge 109+.",
        "All cookie cleanup, whitelist/greylist, and settings behavior carried over from the original extension.",
        "Distributed via GitHub Releases (sideload)."
      ]
    }
  ]
}
```

- [ ] **Step 4: Update the README CI badge branch**

In `README.md` line 9, change the trailing badge query `?branch=4.X.X-Branch` to `?branch=main`. The full line becomes:

```markdown
![Tagged Release Distribution](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/Tagged%20Release%20Distribution/badge.svg) ![Node.js CI Tests](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/CI/badge.svg?branch=main)
```

- [ ] **Step 5: Point CodeQL at `main`**

In `.github/workflows/codeql-analysis.yml`, change both occurrences (line 16 push trigger and line 19 pull_request trigger) from `branches: [ 3.X.X-Branch ]` to:

```yaml
    branches: [ main ]
```

- [ ] **Step 6: Regenerate `package-lock.json`**

Run: `npm install --package-lock-only`
Expected: command completes; `package-lock.json` root and `packages[""]` version fields now read `1.0.0`.

Verify:

```powershell
node -e "const l=require('./package-lock.json'); console.log(l.version, l.packages[''].version)"
```

Expected output: `1.0.0 1.0.0`

- [ ] **Step 7: Build and confirm the bundled manifest reports 1.0.0**

Run: `npm run build`
Expected: build succeeds; `builds/` contains `Cookie-AutoDelete-V3_Dev_<timestamp>_Chrome.zip`, `..._Firefox.zip`, `..._Firefox.xpi`.

> Note: locally there is no Git tag in `GITHUB_REF`, so `buildFilesDev.js` uses the `Dev_<timestamp>` filename prefix. That is expected — the *filename* gets the real `v1.0.0` only in CI on the tag push (Task 4). What matters here is the **version inside the bundled manifest**.

Confirm the bundled Chrome manifest version:

```powershell
$zip = Get-ChildItem builds/Cookie-AutoDelete-V3_*_Chrome.zip | Select-Object -First 1
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
$entry = $archive.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
$reader = New-Object System.IO.StreamReader($entry.Open())
($reader.ReadToEnd() | ConvertFrom-Json).version
$reader.Close(); $archive.Dispose()
```

Expected output: `1.0.0`

- [ ] **Step 8: Run the test suite**

Run: `npx jest --no-coverage`
Expected: suites pass. (A pre-existing `TabEvents.spec.ts` flake noted in prior QA is unrelated to this change and is not a blocker — if it surfaces, confirm it is the same failure and proceed.)

- [ ] **Step 9: Commit the reset**

```powershell
git add package.json extension/manifest.json package-lock.json src/ui/settings/ReleaseNotes.json README.md .github/workflows/codeql-analysis.yml
git commit -m "chore: reset version to 1.0.0 and retarget branch refs to main"
```

Expected: one commit on `4.X.X-Branch` with 6 files changed.

---

## Task 2: Delete the published `v4.0.0-beta.1` release and tags

**Files:** none (remote + local Git operations).

- [ ] **Step 1: Delete the GitHub release and its remote tag**

Run:

```powershell
gh release delete v4.0.0-beta.1 --repo vasilisplavos/Cookie-AutoDeleteV3 --yes --cleanup-tag
```

Expected: `✓ Deleted release v4.0.0-beta.1` and the remote tag is removed.

- [ ] **Step 2: Confirm the remote tag is gone**

Run: `git ls-remote --tags origin v4.0.0-beta.1`
Expected: **no output** (the ref no longer exists on the remote).

- [ ] **Step 3: Delete the local tag**

Run: `git tag -d v4.0.0-beta.1`
Expected: `Deleted tag 'v4.0.0-beta.1' (was 9889285)`.

> If the local tag was already removed by `--cleanup-tag` fetch pruning, the command prints `error: tag 'v4.0.0-beta.1' not found` — that is acceptable; the goal (no local tag) is met.

---

## Task 3: Rename `4.X.X-Branch` to `main` and make it the default

**Files:** none (remote + local Git operations).

- [ ] **Step 1: Push the reset commit to the current remote branch first**

Run: `git push origin 4.X.X-Branch`
Expected: the Task 1 commit is pushed to `origin/4.X.X-Branch`.

> Pushing before the rename keeps the operation recoverable: the remote has the reset commit under the old name until `main` is established.

- [ ] **Step 2: Rename the local branch**

Run: `git branch -m 4.X.X-Branch main`
Expected: no output. Verify with `git branch --show-current` → `main`.

- [ ] **Step 3: Push `main` and set upstream tracking**

Run: `git push -u origin main`
Expected: `* [new branch] main -> main` and `branch 'main' set up to track 'origin/main'.`

- [ ] **Step 4: Set `main` as the GitHub default branch**

Run:

```powershell
gh api -X PATCH repos/vasilisplavos/Cookie-AutoDeleteV3 -f default_branch=main --jq .default_branch
```

Expected output: `main`

- [ ] **Step 5: Delete the stale remote `4.X.X-Branch`**

Run: `git push origin --delete 4.X.X-Branch`
Expected: `- [deleted] 4.X.X-Branch`.

> If GitHub blocks deletion because an open PR still targets it, the PR was auto-retargeted to `main` on default-branch change — re-run the delete. If it still blocks, retarget the PR base to `main` in the GitHub UI, then re-run.

- [ ] **Step 6: Verify the remote branch state**

Run: `git ls-remote --heads origin`
Expected: `refs/heads/main` present; `refs/heads/4.X.X-Branch` absent.

---

## Task 4: Tag `v1.0.0`, trigger the release, verify, and publish

**Files:** none (Git tag + GitHub Actions + release).

- [ ] **Step 1: Confirm `main` HEAD is the reset commit**

Run: `git log --oneline -1`
Expected: the `chore: reset version to 1.0.0 ...` commit from Task 1.

- [ ] **Step 2: Create the `v1.0.0` tag**

Run: `git tag v1.0.0`
Expected: no output. Verify with `git tag --list v1.0.0` → `v1.0.0`.

- [ ] **Step 3: Push the tag to trigger the release workflow**

Run: `git push origin v1.0.0`
Expected: `* [new tag] v1.0.0 -> v1.0.0`. This starts the `Tagged Release Distribution` workflow.

- [ ] **Step 4: Watch the workflow run to completion**

Run:

```powershell
gh run watch --repo vasilisplavos/Cookie-AutoDeleteV3 (gh run list --repo vasilisplavos/Cookie-AutoDeleteV3 --workflow "Tagged Release Distribution" --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: the run completes with conclusion `success`. (The workflow's `Ensure Version is Updated` step runs `replaceVersionNumber.js`, which compares the tag `1.0.0` to `package.json` `1.0.0` — they match because of Task 1.)

> If the run fails at `Ensure Version is Updated`, `package.json` was not `1.0.0` on the tagged commit — re-check Task 1 Step 1 landed on `main` before tagging.

- [ ] **Step 5: Verify the draft release and its artifact names**

The workflow creates the release as a **draft** (`draft: true`).

Run:

```powershell
gh release view v1.0.0 --repo vasilisplavos/Cookie-AutoDeleteV3 --json isDraft,isPrerelease,assets --jq "{isDraft, isPrerelease, assets: [.assets[].name]}"
```

Expected: `isDraft` = `true`, `isPrerelease` = `false`, and three asset names each matching `Cookie-AutoDelete-V3_v1.0.0_<sha>_{Chrome.zip,Firefox.zip,Firefox.xpi}`.

> If asset names contain `_Dev_<timestamp>_` instead of `_v1.0.0_`, the build did not receive the tag — confirm the tag push (Step 3) triggered the run on `refs/tags/v1.0.0`, not a branch push.

- [ ] **Step 6: Edit release notes and publish**

Edit the draft notes (changelog, link to README install instructions, minimum browser versions, upstream credit), then publish:

```powershell
gh release edit v1.0.0 --repo vasilisplavos/Cookie-AutoDeleteV3 --draft=false --notes "Cookie AutoDelete V3 — 1.0.0`n`nFirst release of the Manifest V3 fork. Supports Chrome 109+, Firefox 115+, Edge 109+.`n`nInstall via the attached artifacts (sideload). See the README for instructions. Based on the original Cookie AutoDelete by Kenny Do and the CAD Team."
```

Expected: the release is published (no longer a draft) at `https://github.com/vasilisplavos/Cookie-AutoDeleteV3/releases/tag/v1.0.0` with all three artifacts.

- [ ] **Step 7: Final verification**

Run:

```powershell
gh release view v1.0.0 --repo vasilisplavos/Cookie-AutoDeleteV3 --json isDraft,url,assets --jq "{isDraft, url, asset_count: (.assets | length)}"
```

Expected: `isDraft` = `false`, `asset_count` = `3`, and the `url` points at the `v1.0.0` tag.

---

## Done When

- `package.json`, `extension/manifest.json`, and built bundle manifest all report `1.0.0`.
- `v4.0.0-beta.1` tag and release no longer exist (local or remote).
- Default branch is `main`; `4.X.X-Branch` is gone from the remote.
- `v1.0.0` tag exists; a published (non-draft) release has three `..._v1.0.0_...` artifacts.
