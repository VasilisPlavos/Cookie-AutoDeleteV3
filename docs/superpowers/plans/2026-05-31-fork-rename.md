# Cookie AutoDelete V3 — Fork Rename & Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the MV3 migration on `4.X.X-Branch` as a public GitHub-only fork at `vasilisplavos/Cookie-AutoDeleteV3`, with `v4.0.0-beta.1` tagged and a GitHub Release auto-built by the existing tag-distribution workflow.

**Architecture:** One self-contained rename commit changes all user-visible identifiers (package.json, manifest gecko id, locale `extensionName`, build script filename prefix, README, MV3 spec doc, and the tag-workflow trigger pattern). Then a strict-order sequence of `git`/`gh` commands renames the local `origin` remote to `upstream`, creates the new GitHub repo, pushes both branches, sets `4.X.X-Branch` as default, and tags `v4.0.0-beta.1` to trigger the Release workflow.

**Tech Stack:** Git CLI, GitHub CLI (`gh` — authenticated as `VasilisPlavos` with `repo` + `workflow` scopes), npm 8.5+ / Node 16.14+ for build verification, jest 26 for test verification.

**Spec:** `docs/superpowers/specs/2026-05-31-fork-rename-design.md` (committed in `57a48e2`)

---

## File Map

### Modified

| Path | Why |
|---|---|
| `package.json` | npm `name`, `repository.url`, `bugs.url`, `homepage`, `contributors` (add Vasilis Plavos) |
| `extension/manifest.json` | `homepage_url` → new repo |
| `extension/_locales/en/messages.json` | `extensionName.message` → "Cookie AutoDelete V3"; `extensionDescription.message` gets ` (V3 fork)` suffix |
| `extension/_locales/<af,ar,bg,cs,da,de,el,es,fi,fr,gl,hu,id,it,ja,ko,nl,no,pl,pt_BR,pt_PT,ro,ru,sr,sv,tr,uk,vi,zh_CN,zh_TW>/messages.json` | `extensionName.message`: append ` V3` to existing localized name (30 files) |
| `tools/buildFilesDev.js` | `EXTNAME` constant + `firefoxPatchManifest()`'s `gecko.id` literal |
| `docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md` | §2.2 Firefox-build bullet: gecko.id reference |
| `README.md` | Fork-callout blockquote at top; URL rewrites (Cookie-AutoDelete/Cookie-AutoDelete → vasilisplavos/Cookie-AutoDeleteV3); remove Crowdin/Coveralls/Codecov badges; remove Liberapay donation section; remove Crowdin i18n section |
| `.github/workflows/ci_tag_release.yml` | Expand tag pattern from `'v[0-9].[0-9]+.[0-9]+'` to also match prerelease tags like `v4.0.0-beta.1` |

### Untouched (intentional)

- All `src/**` files (per spec §3.4 — original copyright headers stay verbatim for MIT compliance)
- `webpack.config.js` BannerPlugin (same reason)
- `LICENSE` (already MIT — covers fork additions automatically)
- All other `.github/workflows/*.yml` files (CI, codeql, slash dispatch — fork-agnostic)
- 30 non-English locales' `extensionDescription` fields (per spec §3.1 — no auto-translating "V3 fork")

---

## Task 1: One coherent rename commit

This task lands ALL textual changes in a single commit. Working tree never sees the new name half-applied.

**Files:**
- Modify: `package.json`
- Modify: `extension/manifest.json`
- Modify: `extension/_locales/en/messages.json`
- Modify: `extension/_locales/<30 others>/messages.json`
- Modify: `tools/buildFilesDev.js`
- Modify: `docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md`
- Modify: `README.md`
- Modify: `.github/workflows/ci_tag_release.yml`

- [ ] **Step 1: Update `package.json` metadata**

Open `package.json`. Apply these diffs (each surgically targeted by the surrounding context):

```diff
-  "name": "cookie-autodelete",
+  "name": "cookie-autodelete-v3",
```

```diff
   "repository": {
     "type": "git",
-    "url": "https://github.com/Cookie-AutoDelete/Cookie-AutoDelete.git"
+    "url": "https://github.com/vasilisplavos/Cookie-AutoDeleteV3.git"
   },
```

```diff
   "bugs": {
-    "url": "https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/issues"
+    "url": "https://github.com/vasilisplavos/Cookie-AutoDeleteV3/issues"
   },
-  "homepage": "https://github.com/Cookie-AutoDelete/Cookie-AutoDelete#readme"
+  "homepage": "https://github.com/vasilisplavos/Cookie-AutoDeleteV3#readme"
```

```diff
   "contributors": [
     {
       "name": "CAD Team",
       "url": "https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors"
+    },
+    {
+      "name": "Vasilis Plavos",
+      "url": "https://github.com/vasilisplavos"
     }
   ],
```

(The `author` field `"Kenny Do"` stays unchanged per the spec.)

- [ ] **Step 2: Update `extension/manifest.json` homepage_url**

Open `extension/manifest.json`. Replace:

```diff
-  "homepage_url": "https://github.com/Cookie-AutoDelete/Cookie-AutoDelete",
+  "homepage_url": "https://github.com/vasilisplavos/Cookie-AutoDeleteV3",
```

(The `name`/`description` stay as `__MSG_extensionName__`/`__MSG_extensionDescription__` — locale files provide the actual strings.)

- [ ] **Step 3: Update English locale**

Open `extension/_locales/en/messages.json`. Apply:

```diff
   "extensionDescription": {
-    "message": "Control your cookies! Automatically delete unwanted cookies from your closed tabs while keeping the ones you want.",
+    "message": "Control your cookies! Automatically delete unwanted cookies from your closed tabs while keeping the ones you want. (V3 fork)",
     "description": "Control your cookies! Automatically delete unwanted cookies from your closed tabs while keeping the ones you want."
   },
```

```diff
   "extensionName": {
-    "message": "Cookie AutoDelete",
+    "message": "Cookie AutoDelete V3",
     "description": "Name of the extension."
   },
```

- [ ] **Step 4: Append ` V3` to 30 non-English `extensionName` messages**

Run this PowerShell loop. It reads each non-English locale file, finds the `extensionName` block's `"message"` field, and appends ` V3` to its value:

```powershell
$locales = @('af','ar','bg','cs','da','de','el','es','fi','fr','gl','hu','id','it','ja','ko','nl','no','pl','pt_BR','pt_PT','ro','ru','sr','sv','tr','uk','vi','zh_CN','zh_TW')
foreach ($l in $locales) {
  $path = "extension/_locales/$l/messages.json"
  if (-not (Test-Path $path)) { Write-Warning "skip: $path"; continue }
  $raw = Get-Content -Raw -Encoding UTF8 $path
  $obj = $raw | ConvertFrom-Json
  if ($obj.extensionName -and $obj.extensionName.message) {
    if (-not ($obj.extensionName.message.TrimEnd().EndsWith('V3'))) {
      $obj.extensionName.message = $obj.extensionName.message.TrimEnd() + ' V3'
    } else {
      Write-Host "already-suffixed: $l"
      continue
    }
    # Preserve readable formatting (2-space indent, no escaping of unicode/slashes)
    $json = $obj | ConvertTo-Json -Depth 20
    # Restore CRLF/LF to match input
    [System.IO.File]::WriteAllText((Resolve-Path $path), $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host "updated: $l"
  } else {
    Write-Warning "no extensionName.message in: $path"
  }
}
```

Expected output: 30 `updated:` lines (one per locale). If you see `already-suffixed:` lines, that locale was processed before — safe to ignore. If you see `no extensionName.message in:` warnings, inspect that file and apply the suffix manually with `Edit`.

**Caveat:** PowerShell's `ConvertTo-Json` reformats whitespace. After this step, run `git diff extension/_locales` and confirm the ONLY semantic change in each file is the `extensionName.message` value. If `ConvertTo-Json` mangled the file (e.g., escape sequences, reordered keys, indent changed in distracting ways), revert and do the 30 files via individual `Edit` calls instead — one literal `"message": "<old>"` → `"message": "<old> V3"` per file.

- [ ] **Step 5: Verify locales updated correctly**

Run:

```powershell
foreach ($l in @('af','de','fr','ja','zh_CN','pt_BR')) {
  $obj = Get-Content -Raw "extension/_locales/$l/messages.json" | ConvertFrom-Json
  Write-Host "$l : $($obj.extensionName.message)"
}
```

Expected: each line ends with ` V3` (e.g., `de : Cookie AutoDelete V3`, `ja : Cookie AutoDelete V3` or the localized form + ` V3`).

- [ ] **Step 6: Update `tools/buildFilesDev.js`**

Open `tools/buildFilesDev.js`. Two changes:

```diff
-const EXTNAME = 'Cookie-AutoDelete_';
+const EXTNAME = 'Cookie-AutoDelete-V3_';
```

In `firefoxPatchManifest()`:

```diff
   mf.browser_specific_settings = {
     gecko: {
-      id: 'CookieAutoDelete@kennydo.com',
+      id: 'cookieautodelete@vp.dev',
       strict_min_version: '115.0',
     },
   };
```

- [ ] **Step 7: Update the MV3 spec's gecko.id reference**

Open `docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md`. Find §2.2 (the Firefox-build bullet) and update the gecko.id literal:

```diff
-- **Firefox build:** add `browser_specific_settings.gecko = { id: 'CookieAutoDelete@kennydo.com', strict_min_version: '115.0' }`; add `"contextualIdentities"` to `permissions`; remove `minimum_chrome_version`; convert `background.service_worker` → `background.scripts: [...]`. Firefox uses `scripts` (event page).
+- **Firefox build:** add `browser_specific_settings.gecko = { id: 'cookieautodelete@vp.dev', strict_min_version: '115.0' }`; add `"contextualIdentities"` to `permissions`; remove `minimum_chrome_version`; convert `background.service_worker` → `background.scripts: [...]`. Firefox uses `scripts` (event page).
```

(One-line literal swap; no other content change.)

- [ ] **Step 8: Rewrite README**

Overwrite `README.md` with this content (preserves all upstream-attribution while making fork status unambiguous):

```markdown
[link-upstream]: https://github.com/Cookie-AutoDelete/Cookie-AutoDelete

# Cookie AutoDelete V3

> **This is a community fork** of the original [Cookie AutoDelete][link-upstream] by Kenny Do and the CAD Team. The fork focuses on shipping Manifest V3 support for Chrome 109+, Firefox 115+, and Edge 109+. The original 3.x line (MV2) continues at the upstream repo.
>
> All MV2 functionality is preserved. The MV3 architecture is documented in [`docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md`](docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md).

![Tagged Release Distribution](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/Tagged%20Release%20Distribution/badge.svg) ![Node.js CI Tests](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/CI/badge.svg?branch=4.X.X-Branch)

Control your cookies! This extension is inspired by [Self-Destructing Cookies](https://addons.mozilla.org/firefox/addon/self-destructing-cookies/). When a tab closes, any cookies not being used are automatically deleted. Prevent tracking by other cookies and add only the ones you trust. Easily import and export your cookie whitelist.

## Main features

- Automatically deletes cookies from closed tabs
- Whitelist/Greylist support for cookies
- Easily export/import your configurations
- Clear all cookies for a domain
- Supports manual mode cleaning from the popup
- Easily see the number of cookies for a site
- Support for Container Tabs (Firefox 53+ only)

### Usage

1. Add the sites you want to keep cookies for to the whitelist (permanently) or greylist (until browser restart)
2. Enable "Automatic Cleaning" in settings or "Auto-Clean" in popup
3. Watch those unused cookies disappear :)

## Installation

> **Manifest V3 — version 4.x:** Requires Chrome 109+, Firefox 115+, or Edge 109+.

This fork is distributed **via GitHub Releases only** (no Chrome Web Store / AMO submission). For store-distributed builds use the [upstream project][link-upstream].

### Install from GitHub Releases

1. Download the latest `Cookie-AutoDelete-V3_<version>_Chrome.zip` (or `_Firefox.xpi`) from [Releases](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/releases).
2. **Chrome / Edge:** extract the zip, open `chrome://extensions` (or `edge://extensions`), enable Developer Mode, click "Load unpacked", and select the extracted folder.
3. **Firefox:** open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select the `.xpi` file. (Note: temporary add-ons are removed when Firefox restarts — for a permanent install, use the `.xpi` via a signed self-distribution channel.)

> Officially supported browsers: Chrome, Firefox, Edge Chromium. Other Chromium/Gecko variants may work but are not tested.

## Attribution

The original Cookie AutoDelete is © 2017–2026 Kenny Do and the [CAD Team](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors), licensed under MIT. All in-source copyright headers are preserved verbatim. This fork's contributions are © 2026 Vasilis Plavos, distributed under the same MIT terms (see [`LICENSE`](LICENSE)).

## Contributing

### Bug reports

[Open an issue](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/issues) on this fork for MV3-specific bugs. For pre-MV3 (3.x) issues, please file at the [upstream repo][link-upstream].

### Code

PRs welcome. Run `npm install` then `npm test` to verify the suite before submitting.

#### Requirements

- Node.js 16.14+

#### Development

- `npm install` - Installs all dependencies
- `npm run dev` - Webpack watcher; rebuilds `/src/background/index.ts`, popup, and settings into `/extension/bundles`
- `npm run lint` - eslint over `src/`
- `npm test` - jest suite under `__tests__/`
- `npm run build` - Builds both Firefox (.xpi/.zip) and Chrome (.zip) MV3 packages into `/builds`
- `npm run build:chrome` / `npm run build:firefox` - Build a single target

#### Testing the extension locally

1. `npm install`
2. `npm run dev` (keeps rebuilding bundles as you change source)
3. Load `/extension` into your browser:
   - **Chrome / Edge:** `chrome://extensions` → Developer Mode → Load unpacked → select `/extension`
   - **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `/extension/manifest.json`

#### Building release artifacts

1. `npm install`
2. `npm run build`
3. Built files appear in `/builds/`.

## Documentation

Upstream wiki documentation: <https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/wiki/Documentation>. Fork-specific MV3 details: [`docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md`](docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md).
```

This rewrite:
- Adds the fork-status blockquote at the very top (per spec §3.3)
- Keeps the two CI/Release badges (these work in the fork once the workflows run)
- Strips upstream-only badges (Crowdin, Coveralls, Codecov) and the entire Liberapay/Crowdin contributing sections
- Adds an Attribution section calling out MIT compliance and credit
- Updates Installation to be GitHub-Releases-only with explicit install steps per browser
- Removes the upstream wiki-linking section but still links to the wiki for reference

- [ ] **Step 9: Update tag workflow trigger to match prerelease tags**

The current `Tagged Release Distribution` workflow only triggers on stable tags. To run on `v4.0.0-beta.1`, expand the pattern.

Open `.github/workflows/ci_tag_release.yml`. Apply:

```diff
 on:
   push:
     tags:
-      - 'v[0-9].[0-9]+.[0-9]+'
+      - 'v[0-9]+.[0-9]+.[0-9]+'
+      - 'v[0-9]+.[0-9]+.[0-9]+-*'
```

Two pattern lines: one for stable (`v4.0.0`), one for prerelease (`v4.0.0-beta.1`, `v4.0.0-rc.2`, etc.). The first pattern also fixes a pre-existing limitation: the original `v[0-9].` (single-digit major) won't match `v10.0.0` someday — `[0-9]+` matches one-or-more digits.

- [ ] **Step 10: Run typecheck + tests**

```powershell
npx tsc --noEmit -p tsconfig.json
```

Expected: only the pre-existing `@types/node` `Cannot redeclare block-scoped variable 'global'` error. No new errors.

```powershell
npx jest --no-coverage 2>&1 | Select-String -Pattern 'Suites:|Tests:'
```

Expected: same pass count as before this task (the MV3-migration final state — 12/12 suites or 11/12 with the pre-existing `TabEvents.spec.ts` crash; no NEW failures introduced by the rename).

- [ ] **Step 11: Build and inspect both zip manifests**

```powershell
Remove-Item extension/bundles/*.js* -ErrorAction SilentlyContinue
Remove-Item builds/* -Recurse -ErrorAction SilentlyContinue
npm run build
Get-ChildItem builds/ | Format-Table Name, Length
```

Expected: three files in `builds/`, all prefixed `Cookie-AutoDelete-V3_…`:
- `Cookie-AutoDelete-V3_…_Chrome.zip`
- `Cookie-AutoDelete-V3_…_Firefox.zip`
- `Cookie-AutoDelete-V3_…_Firefox.xpi`

If the prefix still reads `Cookie-AutoDelete_…` (missing the `-V3`), Step 6's `EXTNAME` change didn't take effect — re-inspect `tools/buildFilesDev.js`.

Then verify the Firefox build's `gecko.id`:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ffZip = (Get-ChildItem builds/*Firefox.zip | Select-Object -First 1).FullName
$tmp = "$env:TEMP\cad-v3-inspect"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $ffZip -DestinationPath $tmp
$mf = Get-Content -Raw "$tmp/manifest.json" | ConvertFrom-Json
$mf.browser_specific_settings.gecko
```

Expected output:
```
id                              strict_min_version
--                              ------------------
cookieautodelete@vp.dev         115.0
```

Then the Chrome build's manifest:

```powershell
$crZip = (Get-ChildItem builds/*Chrome.zip | Select-Object -First 1).FullName
$tmp2 = "$env:TEMP\cad-v3-chrome-inspect"
Remove-Item $tmp2 -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $crZip -DestinationPath $tmp2
$cmf = Get-Content -Raw "$tmp2/manifest.json" | ConvertFrom-Json
$cmf.homepage_url
$cmf.browser_specific_settings   # should be $null
```

Expected: homepage_url is the new repo URL; no `browser_specific_settings` (Chrome build correctly strips it).

- [ ] **Step 12: Inspect English locale in the built zips**

```powershell
(Get-Content -Raw "$tmp/_locales/en/messages.json" | ConvertFrom-Json).extensionName.message
(Get-Content -Raw "$tmp2/_locales/en/messages.json" | ConvertFrom-Json).extensionName.message
```

Expected: both print `Cookie AutoDelete V3`.

- [ ] **Step 13: Confirm source `extension/manifest.json` was reverted after the build**

```powershell
git diff --stat extension/manifest.json
```

Expected: empty output (the per-target patcher reverts the source manifest after each zip). If `extension/manifest.json` shows as modified, the revert logic in `tools/buildFilesDev.js` has a problem — investigate before continuing.

- [ ] **Step 14: Stage and commit**

```bash
git add package.json extension/manifest.json extension/_locales tools/buildFilesDev.js docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md README.md .github/workflows/ci_tag_release.yml
git commit -m "$(cat <<'EOF'
chore: rebrand to Cookie AutoDelete V3 fork

- package.json: name → cookie-autodelete-v3; repo/bugs/homepage URLs;
  add Vasilis Plavos to contributors
- extension/manifest.json: homepage_url → vasilisplavos/Cookie-AutoDeleteV3
- extension/_locales/en: extensionName → "Cookie AutoDelete V3";
  description gets "(V3 fork)" suffix
- extension/_locales/<30 others>: append " V3" to extensionName
- tools/buildFilesDev.js: zip prefix → "Cookie-AutoDelete-V3_";
  Firefox gecko.id → "cookieautodelete@vp.dev"
- docs/.../2026-05-30-mv3-upgrade-design.md §2.2: gecko.id update
- README.md: fork-status callout; URL rewrites; remove upstream-only
  badges (Crowdin/Coveralls/Codecov) and donation/Crowdin sections;
  add Attribution section
- .github/workflows/ci_tag_release.yml: expand tag trigger to match
  prerelease tags (v4.0.0-beta.1, v4.0.0-rc.2, etc.) and fix the
  single-digit major version pattern

Upstream source-file copyright headers stay verbatim per MIT.
EOF
)"
```

- [ ] **Step 15: Verify clean tree**

```powershell
git status
```

Expected: `nothing to commit, working tree clean`.

---

## Task 2: Rename current `origin` remote to `upstream`

This frees `origin` for the new fork repo without losing the upstream tracking info.

- [ ] **Step 1: Confirm current remote**

```powershell
git remote -v
```

Expected: `origin` points at `https://github.com/Cookie-AutoDelete/Cookie-AutoDelete.git` (fetch + push). No other remotes.

- [ ] **Step 2: Rename `origin` → `upstream`**

```powershell
git remote rename origin upstream
```

- [ ] **Step 3: Verify rename**

```powershell
git remote -v
```

Expected: `upstream` points at the upstream repo. No `origin` exists yet.

---

## Task 3: Create the new GitHub repo

- [ ] **Step 1: Confirm gh CLI authentication**

```powershell
gh auth status
```

Expected: logged in to `github.com` as `VasilisPlavos` with token scopes including `repo` and `workflow`.

- [ ] **Step 2: Create the repo**

```powershell
gh repo create vasilisplavos/Cookie-AutoDeleteV3 `
  --public `
  --description "Manifest V3 fork of Cookie AutoDelete by Kenny Do and the CAD Team" `
  --homepage "https://github.com/vasilisplavos/Cookie-AutoDeleteV3"
```

Expected: `✓ Created repository vasilisplavos/Cookie-AutoDeleteV3 on github.com`.

If `gh` says the repo already exists, that's fine — verify with the next step.

- [ ] **Step 3: Verify repo exists and is public**

```powershell
gh repo view vasilisplavos/Cookie-AutoDeleteV3 --json name,visibility,isPrivate,defaultBranchRef
```

Expected JSON contains `"visibility": "PUBLIC"` and `"isPrivate": false`. `defaultBranchRef` may be null until we push the first branch.

---

## Task 4: Add new `origin` and push branches

- [ ] **Step 1: Add the new origin remote**

```powershell
git remote add origin https://github.com/vasilisplavos/Cookie-AutoDeleteV3.git
git remote -v
```

Expected: both `origin` (vasilisplavos/Cookie-AutoDeleteV3) and `upstream` (Cookie-AutoDelete/Cookie-AutoDelete) listed.

- [ ] **Step 2: Confirm current branch and HEAD**

```powershell
git branch --show-current
git log --oneline -3
```

Expected: branch is `4.X.X-Branch`; HEAD is the rename commit from Task 1.

- [ ] **Step 3: Push `4.X.X-Branch`**

```powershell
git push -u origin 4.X.X-Branch
```

Expected: `Branch '4.X.X-Branch' set up to track 'origin/4.X.X-Branch'.` Output also shows how many objects were uploaded.

- [ ] **Step 4: Push `3.X.X-Branch`**

This carries the design spec + plan commits (`922b1fe`, `b9992cb`) plus upstream history. It serves as the fork's MV2 baseline.

```powershell
git push -u origin 3.X.X-Branch
```

Expected: `Branch '3.X.X-Branch' set up to track 'origin/3.X.X-Branch'.`

- [ ] **Step 5: Verify both branches exist on remote**

```powershell
gh api repos/vasilisplavos/Cookie-AutoDeleteV3/branches --jq '.[].name'
```

Expected: lists both `3.X.X-Branch` and `4.X.X-Branch`.

---

## Task 5: Set `4.X.X-Branch` as default branch

The repo was created with whichever branch GitHub picked first as default (typically the first pushed branch). Force it to `4.X.X-Branch` so users land on the MV3 code.

- [ ] **Step 1: Set default branch via gh API**

```powershell
gh api -X PATCH repos/vasilisplavos/Cookie-AutoDeleteV3 -f default_branch=4.X.X-Branch
```

Expected: JSON response with `"default_branch": "4.X.X-Branch"` near the bottom.

- [ ] **Step 2: Verify**

```powershell
gh repo view vasilisplavos/Cookie-AutoDeleteV3 --json defaultBranchRef --jq '.defaultBranchRef.name'
```

Expected: prints `4.X.X-Branch`.

---

## Task 6: Tag `v4.0.0-beta.1` and verify release

- [ ] **Step 1: Confirm `4.X.X-Branch` HEAD is the rename commit**

```powershell
git log --oneline -1
```

Expected: shows the `chore: rebrand to Cookie AutoDelete V3 fork` commit from Task 1.

- [ ] **Step 2: Create the tag**

```powershell
git tag v4.0.0-beta.1
```

Verify:

```powershell
git tag -l
```

Expected: includes `v4.0.0-beta.1` in the list.

- [ ] **Step 3: Push the tag**

```powershell
git push origin v4.0.0-beta.1
```

Expected: `* [new tag] v4.0.0-beta.1 -> v4.0.0-beta.1`. This triggers the `Tagged Release Distribution` workflow on the new repo.

- [ ] **Step 4: Watch the workflow run**

```powershell
# Wait a few seconds for GitHub to register the tag push
Start-Sleep -Seconds 5
gh run list --repo vasilisplavos/Cookie-AutoDeleteV3 --workflow "Tagged Release Distribution" --limit 1
```

Expected: one in-progress (or queued) run. Note the run ID from the leftmost column.

Then watch:

```powershell
gh run watch <run-id> --repo vasilisplavos/Cookie-AutoDeleteV3
```

Or for non-blocking polling:

```powershell
gh run view <run-id> --repo vasilisplavos/Cookie-AutoDeleteV3
```

Expected (eventually): `✓ <run-id>` indicating success.

- [ ] **Step 5: Handle a failed workflow (if it fails)**

Common failure modes and recoveries:

1. **`tools/replaceVersionNumber.js` rejects `4.0.0-beta.1`**: the script likely expects pure semver and may error on the `-beta.1` suffix. If the run fails at the "Ensure Version is Updated" step, read `tools/replaceVersionNumber.js` to see what regex it uses. Most likely fix: update the regex to accept a prerelease suffix. Apply the fix, commit, retag (`git tag -d v4.0.0-beta.1; git tag v4.0.0-beta.1 HEAD; git push origin :refs/tags/v4.0.0-beta.1; git push origin v4.0.0-beta.1`), and re-watch.

2. **Permissions error on Release upload**: the workflow needs `contents: write` permission. Check `.github/workflows/ci_tag_release.yml` for a `permissions:` block. If absent, you may need to add `permissions: { contents: write }` at the workflow or job level. Commit + retag.

3. **`npm ci` fails**: usually means `package-lock.json` is out of sync. Run `npm install` locally, commit the updated `package-lock.json`, retag.

For each fix, the retag dance is:

```powershell
git tag -d v4.0.0-beta.1
git push origin :refs/tags/v4.0.0-beta.1
# (now make and commit the fix)
git tag v4.0.0-beta.1
git push origin v4.0.0-beta.1
```

If the workflow succeeds on the first try, skip to Step 6.

- [ ] **Step 6: Verify the Release exists with all three artifacts**

```powershell
gh release view v4.0.0-beta.1 --repo vasilisplavos/Cookie-AutoDeleteV3
```

Expected: shows the release with `Cookie-AutoDelete-V3_…_Chrome.zip`, `Cookie-AutoDelete-V3_…_Firefox.zip`, and `Cookie-AutoDelete-V3_…_Firefox.xpi` listed under "Assets".

- [ ] **Step 7: Edit release notes**

```powershell
gh release edit v4.0.0-beta.1 --repo vasilisplavos/Cookie-AutoDeleteV3 `
  --prerelease `
  --notes @"
# Cookie AutoDelete V3 — 4.0.0-beta.1

First beta of the Manifest V3 fork. **Use at your own risk** — this is pre-release software for testing.

## Install

Download a build below and follow the [install instructions](https://github.com/vasilisplavos/Cookie-AutoDeleteV3#install-from-github-releases) in the README. Requires Chrome 109+, Firefox 115+, or Edge 109+.

## What's new

- Migrated from Manifest V2 to Manifest V3.
- Background script runs as a service worker on Chromium and as a non-persistent event page on Firefox.
- All MV2 functionality preserved; no data migration needed.

## Acknowledgments

This fork is built on top of the original [Cookie AutoDelete](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete) by Kenny Do and the CAD Team. All original copyright is preserved per the MIT license.

## Known issues

- `TabEvents.spec.ts` crashes in jest under Node 22 (pre-existing from QA; functional behaviour unaffected).
- Cross-browser QA for Firefox 115 ESR / Firefox latest pending — only Chrome stable has been smoke-tested.
"@
```

Note: PowerShell here-strings (`@"…"@`) preserve newlines and don't expand `$` inside the body if you use `@'…'@` (single quotes). Here we use double-quoted because there are no variables; if you want extra safety, swap to `@'…'@`.

Expected: command returns silently. Verify with another `gh release view v4.0.0-beta.1`.

- [ ] **Step 8: Final verification**

```powershell
# Confirm the release URL and pre-release flag
gh release view v4.0.0-beta.1 --repo vasilisplavos/Cookie-AutoDeleteV3 --json url,isPrerelease,assets --jq '{url, isPrerelease, asset_count: (.assets | length)}'
```

Expected JSON:
```json
{
  "url": "https://github.com/vasilisplavos/Cookie-AutoDeleteV3/releases/tag/v4.0.0-beta.1",
  "isPrerelease": true,
  "asset_count": 3
}
```

If `asset_count` is anything other than 3, inspect the workflow logs for the upload step.

---

## Self-Review Notes (the plan author's)

Spec coverage (against `2026-05-31-fork-rename-design.md`):
- §1 Scope & goals → Task 6 produces the GitHub Release (success criterion); Tasks 2–5 establish the repo.
- §2 Naming table → Task 1 Steps 1, 3, 6, 7, 8.
- §3.1 metadata/manifest → Task 1 Steps 1, 2.
- §3.1 English locale → Task 1 Step 3.
- §3.1 30 non-English locales → Task 1 Step 4.
- §3.1 `tools/buildFilesDev.js` → Task 1 Step 6.
- §3.2 spec consistency update → Task 1 Step 7.
- §3.3 README → Task 1 Step 8.
- §3.4 source copyright headers untouched → not implemented (intentional — file map explicitly lists them as Untouched).
- §3.5 webpack BannerPlugin → also Untouched intentionally.
- §3.6 GitHub workflows → Task 1 Step 9 (tag trigger). The Crowdin workflow removal is a no-op because there's no Crowdin workflow file in `.github/workflows/`.
- §4 Git remote + repo creation → Tasks 2, 3, 4, 5.
- §5 Tag + Release → Task 6.
- §6 Order of operations → Tasks 1–6 mirror the order exactly.
- §7 Risks/non-goals → addressed by Task 6 Step 5 (workflow failure recovery), Task 1 Step 13 (manifest revert sanity).
- §8 Implementation checklist (1-11) → Task numbering maps directly.

Placeholder scan: no "TBD"/"TODO"/"implement later"/"similar to" patterns. Every command, diff, and expected output is concrete.

Type consistency: the `gecko.id` literal `cookieautodelete@vp.dev` is identical in Task 1 Step 6 and Task 1 Step 7 and Step 11's verification. The `EXTNAME` value `Cookie-AutoDelete-V3_` is consistent across Step 6 and Step 11. The repo URL `https://github.com/vasilisplavos/Cookie-AutoDeleteV3.git` is identical in Task 1 Step 1, Task 3 Step 2, and Task 4 Step 1.
