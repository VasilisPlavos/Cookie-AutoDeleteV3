# Cookie AutoDelete V3 — Fork Rename & Publish Design

**Status:** Draft for review
**Date:** 2026-05-31
**Target release:** `v4.0.0-beta.1` on `vasilisplavos/Cookie-AutoDeleteV3` (GitHub-only)
**Source branch:** `4.X.X-Branch` (current local, 26 commits ahead of upstream `origin/3.X.X-Branch`)

## 1. Scope & goals

Publish the MV3 migration work on `4.X.X-Branch` as a public GitHub-only fork at **`vasilisplavos/Cookie-AutoDeleteV3`**. Users install via GitHub Releases (sideload `.zip`/`.xpi`). No store submissions; no upstream PR (upstream isn't accepting contributions).

**Success criteria:**

- Public repo at `https://github.com/vasilisplavos/Cookie-AutoDeleteV3` exists.
- `4.X.X-Branch` is the default branch.
- Tag `v4.0.0-beta.1` pushed to the new origin triggers the existing `Tagged Release Distribution` workflow, attaching both `_Chrome.zip` and `_Firefox.zip` + `.xpi` to a GitHub Release.
- Installable in Firefox alongside the original CAD (distinct `gecko.id`).
- Installable in Chrome unpacked alongside the original.
- README clearly identifies as a fork and preserves attribution.

**Out of scope:** Chrome Web Store / AMO submission, new icon, Crowdin translation setup, store-listing copy, new logo.

**Decisions captured during brainstorming (with rejected alternatives):**

| Decision | Chosen | Rejected |
|---|---|---|
| Publish scope | GitHub only — Releases workflow attaches built `.zip`/`.xpi` | Stores (CWS + AMO); just AMO |
| Firefox `gecko.id` | `cookieautodelete@vp.dev` | `CookieAutoDeleteV3@vasilisplavos.com`; a fresh UUID; reuse upstream `CookieAutoDelete@kennydo.com` |
| Naming | Display `Cookie AutoDelete V3` / npm `cookie-autodelete-v3` / zip prefix `Cookie-AutoDelete-V3_` / repo `Cookie-AutoDeleteV3` | `Cookie AutoDelete (V3)`; keep `Cookie AutoDelete` |
| Attribution | Keep original per-file copyright headers untouched; add a fork note + attribution to README | Add a second copyright line to every source file; replace headers with a single root NOTICE |

## 2. Naming

| Where | Value |
|---|---|
| Repo slug | `Cookie-AutoDeleteV3` |
| GitHub owner | `vasilisplavos` |
| Repo URL | `https://github.com/vasilisplavos/Cookie-AutoDeleteV3` |
| Display name (toolbar tooltip, listings) | `Cookie AutoDelete V3` |
| npm `package.json` `name` | `cookie-autodelete-v3` |
| Built zip filename prefix | `Cookie-AutoDelete-V3_` |
| README `<h1>` | `Cookie AutoDelete V3` |
| Firefox `gecko.id` | `cookieautodelete@vp.dev` |

## 3. File changes

### 3.1 Metadata / manifest

- **`package.json`**
  - `name` → `cookie-autodelete-v3`
  - `repository.url` → `https://github.com/vasilisplavos/Cookie-AutoDeleteV3.git`
  - `bugs.url` → `https://github.com/vasilisplavos/Cookie-AutoDeleteV3/issues`
  - `homepage` → `https://github.com/vasilisplavos/Cookie-AutoDeleteV3#readme`
  - `author` — stays `"Kenny Do"` (upstream original author; this is the npm `author` field and reflects original authorship)
  - `contributors` — add `{ "name": "Vasilis Plavos", "url": "https://github.com/vasilisplavos" }` alongside the existing CAD Team entry

- **`extension/manifest.json`**
  - `homepage_url` → `https://github.com/vasilisplavos/Cookie-AutoDeleteV3`
  - `name`/`description` stay as `__MSG_extensionName__` / `__MSG_extensionDescription__` — the locale files supply the actual strings (see §3.2)

- **`extension/_locales/en/messages.json`**
  - `extensionName.message`: `"Cookie AutoDelete"` → `"Cookie AutoDelete V3"`
  - `extensionDescription.message`: append ` (V3 fork)` to the existing description

- **`extension/_locales/<other-30>/messages.json`**
  - `extensionName.message`: append ` V3` to each locale's existing translation (mechanical find-and-replace per file). Non-English users see, e.g., `Cookie AutoDelete V3` regardless of locale — the suffix carries through. Awkward translations can be fixed by a future contributor.
  - `extensionDescription.message`: leave alone (no auto-translation of "V3 fork" is reliable — keep existing translated description as-is)

- **`tools/buildFilesDev.js`**
  - `const EXTNAME = 'Cookie-AutoDelete_';` → `'Cookie-AutoDelete-V3_';`
  - In `firefoxPatchManifest()`: `gecko.id` literal `'CookieAutoDelete@kennydo.com'` → `'cookieautodelete@vp.dev'`

### 3.2 Spec consistency

- **`docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md`** §2.2: update the Firefox-build bullet to reference the new gecko id (`cookieautodelete@vp.dev` instead of `CookieAutoDelete@kennydo.com`). This is one line — it keeps the upgrade spec aligned with what ships.

### 3.3 README

Top of `README.md` gains a blockquote callout:

```markdown
# Cookie AutoDelete V3

> **This is a community fork** of the original [Cookie AutoDelete](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete) by Kenny Do and the CAD Team. The fork focuses on shipping Manifest V3 support for Chrome 109+, Firefox 115+, and Edge 109+. The original 3.x line (MV2) continues at the upstream repo.
>
> All MV2 functionality is preserved. The MV3 architecture is documented in [`docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md`](docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md).
```

All `https://github.com/Cookie-AutoDelete/Cookie-AutoDelete` URLs throughout the README — link references at the top, badge URLs, donation/Crowdin links — get rewritten to `https://github.com/vasilisplavos/Cookie-AutoDeleteV3`.

Badges that point at upstream-only services (Crowdin localization, Coveralls, Codecov) get **removed** entirely rather than pointed at the fork (the fork doesn't have those services set up yet; broken badges look worse than no badges). The GitHub Actions CI + Release-Distribution badges stay since they'll work after the first run in the new repo.

The Installation section gets the GitHub-Releases-only path called out: official store installs are upstream-only; install the fork via GitHub Releases on the new repo.

Donation / Liberapay link removed (that funds upstream maintainers).

### 3.4 Source-file copyright headers

**Untouched.** Every `Copyright (c) 2017-202x Kenny Do and CAD Team` header in `src/**` stays verbatim. The MIT license requires this and per the brainstorming decision, the fork's attribution lives in README only.

### 3.5 `webpack.config.js` BannerPlugin

The webpack BannerPlugin currently emits the upstream copyright into the head of each bundle. That stays as-is (same MIT compliance argument).

### 3.6 GitHub workflows (`.github/workflows/`)

- **`Tagged Release Distribution`** — verify it uses `${{ github.repository }}` for upload targets (not a hardcoded `Cookie-AutoDelete/Cookie-AutoDelete`). If it has hardcoded refs, fix them. Either way, the workflow runs in the new fork repo automatically once a tag is pushed.
- **`Node.js CI Tests`** — runs on push/PR; should work unmodified in the fork. The CI badge in README references this.
- **Crowdin workflow** (if present) — disable or delete. The fork doesn't have a Crowdin project, and the workflow would fail or push to upstream's Crowdin slug.

Spot-check these files during implementation; fix any hardcoded org/repo refs.

## 4. Git remote + repo creation

In this order:

1. **Rename `origin` → `upstream`** locally:
   ```
   git remote rename origin upstream
   ```
   `upstream` continues to point at `Cookie-AutoDelete/Cookie-AutoDelete`. Useful for future `git fetch upstream` to pull upstream MV2 bugfixes.

2. **Create the new repo** via `gh`:
   ```
   gh repo create vasilisplavos/Cookie-AutoDeleteV3 \
     --public \
     --description "Manifest V3 fork of Cookie AutoDelete" \
     --homepage "https://github.com/vasilisplavos/Cookie-AutoDeleteV3"
   ```
   (No `--source` / `--push` flags — we'll push manually after pointing origin.)

3. **Add new `origin`** pointing at the fork:
   ```
   git remote add origin https://github.com/vasilisplavos/Cookie-AutoDeleteV3.git
   ```

4. **Push branches** to new origin:
   ```
   git push -u origin 4.X.X-Branch
   git push -u origin 3.X.X-Branch
   ```
   `4.X.X-Branch` is the MV3 working branch. `3.X.X-Branch` carries the design spec + plan commits and serves as the fork's MV2 baseline.

5. **Set `4.X.X-Branch` as default**:
   ```
   gh api -X PATCH repos/vasilisplavos/Cookie-AutoDeleteV3 \
     -f default_branch=4.X.X-Branch
   ```

## 5. Tag + Release

After the rename commits land and remote is set:

1. `git tag v4.0.0-beta.1` on `4.X.X-Branch` HEAD.
2. `git push origin v4.0.0-beta.1`.
3. The `Tagged Release Distribution` workflow runs in the fork, builds both targets, creates a GitHub Release with the artifacts attached:
   - `Cookie-AutoDelete-V3_v4.0.0-beta.1_<sha>_Chrome.zip`
   - `Cookie-AutoDelete-V3_v4.0.0-beta.1_<sha>_Firefox.zip`
   - `Cookie-AutoDelete-V3_v4.0.0-beta.1_<sha>_Firefox.xpi`
4. Manually edit the Release notes to:
   - Flag as **beta**
   - Link to README install instructions
   - Note minimum browser versions
   - Credit the upstream project

## 6. Order of operations

Strict execution order so no commit ships in a half-renamed state:

1. **One coherent rename commit** on `4.X.X-Branch`: `package.json`, `extension/manifest.json`, all 31 locale `extensionName` entries, `tools/buildFilesDev.js`, `README.md`, `docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md` §2.2.
2. **`npm run build`** — produces `Cookie-AutoDelete-V3_…_Chrome.zip` / `_Firefox.zip` / `_Firefox.xpi` with the new `gecko.id` in the Firefox manifest. Manually inspect both zip manifests to confirm.
3. **`npx jest --no-coverage`** — 12/12 suites still pass (no test depends on the upstream name; the pre-existing `TabEvents.spec.ts` crash from QA is unrelated).
4. **Rename `origin` → `upstream`** and **create new repo**.
5. **Add new `origin`** and **push** both branches.
6. **Set default branch** in the new repo.
7. **Tag `v4.0.0-beta.1`** on `4.X.X-Branch` and **push the tag**.
8. **Verify the Release** appears on the new repo with all three artifacts.

## 7. Risks / non-goals

- **`TabEvents.spec.ts` pre-existing crash**: surfaced during QA but never root-caused. Not a fork-rename concern — file an issue in the new repo so it doesn't get lost.
- **First workflow run**: `Tagged Release Distribution` has never executed under the fork's repo permissions. Likely to "just work" since it uses default `GITHUB_TOKEN` for release uploads. If it fails on permissions or missing secrets, manual investigation in the new repo's Actions tab.
- **Crowdin badge in README** if not removed will show broken — handled in §3.3 by removing.
- **Chrome extension ID at install time**: unpacked Chrome extensions derive a random ID per install absent a `key` field in the manifest. Means each install of the sideloaded zip can have a different ID. Acceptable for GitHub-only distribution; only relevant if/when shipping to Chrome Web Store.
- **MV2-locale `extensionName` mechanical suffix**: appending ` V3` may produce slightly awkward strings in some languages (e.g., the suffix is English). Future Crowdin pass can fix; not a blocker for beta.
- **Donation link removal**: removes a small revenue path for upstream maintainers — that's intentional since the fork is independent, but worth being explicit.

## 8. Implementation checklist (for writing-plans)

In dependency order:

1. Rename commit: metadata, manifest, locales (all 31), tools/buildFilesDev.js, README rewrite, spec §2.2 update.
2. Build + zip-inspection verification.
3. Test suite verification.
4. `git remote rename origin upstream`.
5. `gh repo create vasilisplavos/Cookie-AutoDeleteV3 --public …`.
6. `git remote add origin <new url>`.
7. `git push -u origin 4.X.X-Branch` and `3.X.X-Branch`.
8. Set default branch via `gh api`.
9. `git tag v4.0.0-beta.1` + `git push origin v4.0.0-beta.1`.
10. Verify Release artifacts in the new repo's Releases tab.
11. Edit Release notes (beta flag, install instructions link, upstream credit).
