# Cookie AutoDelete V3 — Version Reset to 1.0.0 Design

**Status:** Draft for review
**Date:** 2026-05-31
**Target release:** `v1.0.0` on `vasilisplavos/Cookie-AutoDeleteV3` (GitHub-only)
**Supersedes:** the versioning decision in `2026-05-31-fork-rename-design.md` (which continued the `4.X.X` line and shipped `v4.0.0-beta.1`)

## 1. Scope & goals

The MV3 fork was published as `v4.0.0-beta.1` (continuing the inherited Cookie AutoDelete version line). Because this is an independent fork built on the **V3 manifest**, the version line should start from scratch at **`1.0.0`** rather than inherit upstream's 4.x numbering. This work resets all version numbers, renames the default branch to `main`, and replaces the published `v4.0.0-beta.1` pre-release with a clean `v1.0.0` release.

**Success criteria:**

- `package.json` and `extension/manifest.json` report `1.0.0`.
- Built artifacts are named `Cookie-AutoDelete-V3_v1.0.0_<sha>_Chrome.zip` (+ Firefox `.zip`/`.xpi`).
- The `v4.0.0-beta.1` git tag and its published GitHub release are deleted.
- A `v1.0.0` tag exists and a corresponding GitHub release is published.
- The repo's default branch is `main` (renamed from `4.X.X-Branch`).
- In-app release notes show a single `1.0.0` entry.

**Out of scope:** branding/naming changes (already done — `Cookie AutoDelete V3`), Chrome Web Store / AMO submission, icons, translations, any code behavior change.

**Decisions captured during brainstorming (with rejected alternatives):**

| Decision | Chosen | Rejected |
|---|---|---|
| First version | `1.0.0` (stable, no suffix) | `1.0.0-beta.1`; `1.0.0-beta.0` |
| Old `v4.0.0-beta.1` tag + release | Delete both, replace with `v1.0.0` | Keep old and go forward; delete release only |
| Default branch name | Rename to `main` | Rename to `1.X.X-Branch`; keep `4.X.X-Branch` |
| In-app ReleaseNotes | Single `1.0.0` entry, drop legacy history | Relabel `4.0.0`→`1.0.0` keep history; add `1.0.0` on top keep history |

**Why `1.0.0` (no `-beta` suffix) matters for the build:** `tools/buildFilesDev.js:46` validates the tag against `/^v?\d+\.\d+\.\d+$/`, which **rejects any pre-release suffix**. That is exactly why the published `v4.0.0-beta.1` artifacts fell back to `Cookie-AutoDelete-V3_Dev_<timestamp>_…` names. A plain `v1.0.0` tag passes the regex, so artifacts are correctly versioned with no pipeline change required.

## 2. Local code reset

One coherent commit on the working branch:

| File | Change |
|---|---|
| `package.json:3` | `"version": "4.0.0-beta.1"` → `"1.0.0"` |
| `extension/manifest.json:5` | `"version": "4.0.0"` → `"1.0.0"` |
| `src/ui/settings/ReleaseNotes.json` | Replace the entire `releases` array with a single `1.0.0` entry (see §3) |
| `package-lock.json` | Regenerate via `npm install` so root `version` fields track `1.0.0` |
| `README.md:9` | CI badge query `?branch=4.X.X-Branch` → `?branch=main` |
| `.github/workflows/codeql-analysis.yml:16,19` | `branches: [ 3.X.X-Branch ]` → `branches: [ main ]` (push trigger and PR trigger) |

**Left unchanged:**

- `.github/workflows/ci_tag_release.yml` — its tag trigger already matches `v[0-9]+.[0-9]+.[0-9]+` (stable), so `v1.0.0` fires it. No edit needed.
- `.github/workflows/continuous-integration-workflow.yml` — uses `branches-ignore`, so it runs on `main` without modification.
- Existing design docs (`2026-05-30-mv3-upgrade-*`, `2026-05-31-fork-rename-*`) — historical records of prior work; left verbatim. This spec is the record of the reset.
- All `src/**` copyright headers, the webpack `BannerPlugin` banner, and the `tools/buildFilesDev.js` `gecko.id` / `EXTNAME` values — untouched.

## 3. ReleaseNotes 1.0.0 content

`src/ui/settings/ReleaseNotes.json` becomes:

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

The in-app "Release Notes" settings view renders from this file; a single entry is intentional for the clean-slate fork.

## 4. Local verification (before any remote operation)

1. `npm run build` — confirm both built zip manifests report `"version": "1.0.0"`. Inspect both Chrome and Firefox manifests inside the produced archives.
2. `npx jest --no-coverage` — suites pass. The pre-existing `TabEvents.spec.ts` flake noted in prior QA is unrelated to this change and is not a blocker.

No remote-destructive step runs until both pass.

## 5. Remote operations (Approach A — local-correct-first)

In strict order, only after §4 passes:

1. **Delete the published release + remote tag:**
   ```
   gh release delete v4.0.0-beta.1 --repo vasilisplavos/Cookie-AutoDeleteV3 --yes --cleanup-tag
   ```
   `--cleanup-tag` removes the remote `v4.0.0-beta.1` tag as well.

2. **Delete the local tag:**
   ```
   git tag -d v4.0.0-beta.1
   ```

3. **Land the reset commit and rename the branch to `main`:**
   - The reset commit (§2) lands directly on `4.X.X-Branch`, which is the current checkout and HEAD of the published MV3 line. (PR #11 `chore/gitignore-claude-and-lockfile` was merged into `4.X.X-Branch`, so there is no in-flight feature branch to reconcile.) This design's spec commit also lives here.
   - Rename locally: `git branch -m 4.X.X-Branch main`.
   - Push: `git push -u origin main`.
   - Set GitHub default branch: `gh api -X PATCH repos/vasilisplavos/Cookie-AutoDeleteV3 -f default_branch=main`.
   - Delete the stale remote branch: `git push origin :4.X.X-Branch`.
   - GitHub auto-retargets open PRs to the renamed default branch; confirm any open PR (e.g. `chore/gitignore-claude-and-lockfile`) retargeted correctly.

4. **Tag and trigger the release:**
   ```
   git tag v1.0.0
   git push origin v1.0.0
   ```
   This fires `Tagged Release Distribution`.

## 6. Release outcome

The workflow runs with `GITHUB_REF=refs/tags/v1.0.0`:

- `tools/replaceVersionNumber.js` confirms the tag matches `package.json` `version` (`1.0.0`) — they must match or the workflow errors, which is why §2 bumps `package.json` first.
- `tools/buildFilesDev.js` accepts the tag (passes the semver regex) and names artifacts:
  - `Cookie-AutoDelete-V3_v1.0.0_<sha>_Chrome.zip`
  - `Cookie-AutoDelete-V3_v1.0.0_<sha>_Firefox.zip`
  - `Cookie-AutoDelete-V3_v1.0.0_<sha>_Firefox.xpi`
- The release is created as a **draft** (`draft: true` in the workflow). Publish it manually after editing notes (changelog, install instructions link, minimum browser versions, upstream credit).

## 7. Risks / notes

- **Manifest version downgrade (4.0.0 → 1.0.0):** browsers refuse to "update" an installed extension to a lower version. With ~1 download of the beta (the author) and sideload-only distribution, this is negligible — a fresh install of `1.0.0` works normally.
- **Legacy bare tags `1.2.0`–`1.4.4`, `2.x`, `3.x`** exist in repo history (inherited from upstream). New tags use the `v` prefix (`v1.0.0`), so there is no literal collision now. A future `v1.2.0` would coexist in the tag list with the bare `1.2.0` — cosmetic only.
- **Branch rename:** `chore/gitignore-claude-and-lockfile` (PR #11) is already merged into `4.X.X-Branch`, so the rename to `main` has no in-flight feature branch to reconcile. GitHub auto-retargets any future open PRs on default-branch rename; the stale remote `4.X.X-Branch` is deleted after `main` is pushed and set as default.
- **`TabEvents.spec.ts` pre-existing flake:** unrelated to this change; track separately, not a blocker.
- **First `v1.0.0` workflow run** builds and uploads under the fork's permissions (already proven working for the beta release). If it fails, investigate in the repo's Actions tab.

## 8. Implementation checklist (for writing-plans)

In dependency order:

1. Reset commit: `package.json`, `extension/manifest.json`, `src/ui/settings/ReleaseNotes.json`, `README.md` badge, `codeql-analysis.yml`; regenerate `package-lock.json`.
2. `npm run build` + inspect both archive manifests for `1.0.0`.
3. `npx jest --no-coverage` — confirm pass.
4. `gh release delete v4.0.0-beta.1 --yes --cleanup-tag`.
5. `git tag -d v4.0.0-beta.1`.
6. Land reset commit on the MV3 branch; `git branch -m 4.X.X-Branch main`; push `main`.
7. Set default branch to `main` via `gh api`; delete remote `4.X.X-Branch`.
8. `git tag v1.0.0` + `git push origin v1.0.0`.
9. Verify draft release artifacts are named `…_v1.0.0_…`; publish release with edited notes.
