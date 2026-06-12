# Make Cookie AutoDelete V3 Official on GitHub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the repo with the now-live Chrome Web Store listing — rewrite the README, remove all upstream-funding (`CAD_Developers`) references including the live UI link, add community-health files, polish repo metadata, and cut a `v1.0.0` GitHub Release.

**Architecture:** Mostly documentation and metadata changes plus one small UI edit (removing a sidebar link). In-repo file edits land first and are verified with `npm run lint` + `npm test`; GitHub-side changes (metadata, release) are applied via the authenticated `gh` CLI; a short manual checklist covers what has no API (social preview image).

**Tech Stack:** Markdown, React/TSX (webextension), `gh` CLI, npm scripts (eslint + jest).

**Source of truth:** version is `1.0.0`; Chrome Web Store is the headline channel; store URL is `https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd`.

---

## File Structure

**Create:**
- `CONTRIBUTING.md` — extracted contributor guide (requirements, dev/build/test, local load).
- `SECURITY.md` — private vulnerability-reporting policy + supported versions.
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1.

**Modify:**
- `README.md` — store badge/button, rewritten Installation, purge `4.x`, Contributing → pointer.
- `src/ui/settings/components/SideBar.tsx` — remove the `CAD_Developers` Contribute link.
- `.github/ISSUE_TEMPLATE/config.yml` — repoint the "Discussion" support link to the fork.

**Delete:**
- `.github/FUNDING.yml`
- `.github/ISSUE_TEMPLATE/bug-report.md_old`
- `.github/ISSUE_TEMPLATE/feature-request.md_old`
- `.github/ISSUE_TEMPLATE/support-request.md_old`
- `.github/issue_template.md` (legacy top-level template, superseded by the `ISSUE_TEMPLATE/` forms; points to upstream)

**Out of scope (do not touch):** workflow files under `.github/workflows/` (intentional upstream refs belong to the separate fork-CI/CD effort), the `bug-report.yaml`/`support-request.yaml` upstream *documentation* links (upstream docs intentionally apply), and the orphaned `contributeText` locale strings.

---

## Task 1: Remove all CAD_Developers / upstream-funding references

**Files:**
- Delete: `.github/FUNDING.yml`
- Modify: `src/ui/settings/components/SideBar.tsx:115-123`

- [ ] **Step 1: Delete the funding file**

```bash
git rm .github/FUNDING.yml
```

- [ ] **Step 2: Remove the Contribute link from the sidebar UI**

In `src/ui/settings/components/SideBar.tsx`, delete the trailing `<br />` and the
entire Contribute anchor. Replace this block:

```tsx
            ))}
            <br />
            <a
              className={`pure-menu-item`}
              href="https://liberapay.com/CAD_Developers/"
              target="_blank"
              rel="noreferrer"
            >
              <span>{browser.i18n.getMessage('contributeText')}</span>
            </a>
          </div>
```

with:

```tsx
            ))}
          </div>
```

- [ ] **Step 3: Verify no CAD_Developers / Liberapay references remain in source (excluding lockfile)**

Run:
```bash
grep -rn "CAD_Developers\|liberapay" src/ .github/ README.md
```
Expected: no matches (empty output).

- [ ] **Step 4: Lint the changed TSX**

Run: `npm run lint`
Expected: PASS, no errors introduced in `SideBar.tsx`.

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS — the full jest suite is green (no test references the removed link, so nothing should break).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove upstream CAD_Developers funding pointer (UI + FUNDING.yml)"
```

---

## Task 2: README — Chrome Web Store badge and install button

**Files:**
- Modify: `README.md:9` (insert after the existing CI badges line)

- [ ] **Step 1: Add the store badge + install button**

In `README.md`, immediately after line 9 (the existing
`![Tagged Release Distribution]…` badges line), insert a new paragraph:

```markdown

[![Available in the Chrome Web Store](https://img.shields.io/chrome-web-store/v/jofioghmpdcgiiobkhmdojhjbjiejfbd?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd)

**▶ [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd)**
```

- [ ] **Step 2: Verify the markdown renders the store link**

Run: `grep -n "chromewebstore.google.com" README.md`
Expected: at least two matches (badge + button), both with the full
`/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd` path.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): add Chrome Web Store badge and install button"
```

---

## Task 3: README — rewrite Installation and purge `4.x`

**Files:**
- Modify: `README.md:29-41` (Installation section) and the `4.x` reference at `README.md:31`

- [ ] **Step 1: Replace the Installation section**

Replace the entire current Installation block (from `## Installation` through the
"Officially supported browsers" note, currently lines ~29–41) with:

```markdown
## Installation

> **Manifest V3 — version 1.0.0:** Requires Chrome 109+, Firefox 115+, or Edge 109+.

### Chrome & Edge (recommended)

Install directly from the **[Chrome Web Store](https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd)**. Edge users can install Chrome Web Store extensions after enabling "Allow extensions from other stores" in `edge://extensions`.

### Firefox & manual install (GitHub Releases)

For Firefox, or to sideload an unpacked build on any supported browser, use the [GitHub Releases](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/releases) artifacts:

1. Download the latest `Cookie-AutoDelete-V3_<version>_Chrome.zip` (or `_Firefox.xpi`) from [Releases](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/releases).
2. **Chrome / Edge:** extract the zip, open `chrome://extensions` (or `edge://extensions`), enable Developer Mode, click "Load unpacked", and select the extracted folder.
3. **Firefox:** open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select the `.xpi` file. (Note: temporary add-ons are removed when Firefox restarts — for a permanent install, use the `.xpi` via a signed self-distribution channel.)

> Officially supported browsers: Chrome, Firefox, Edge Chromium. Other Chromium/Gecko variants may work but are not tested.
```

- [ ] **Step 2: Verify the false "GitHub Releases only" claim and all `4.x` refs are gone**

Run:
```bash
grep -n "GitHub Releases only\|version 4.x\|4\.x" README.md
```
Expected: no matches (empty output).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite Installation for Chrome Web Store; drop stale 4.x/no-store wording"
```

---

## Task 4: Extract CONTRIBUTING.md and leave a README pointer

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `README.md` (the `## Contributing` section, currently lines ~47–82)

- [ ] **Step 1: Create `CONTRIBUTING.md`**

```markdown
# Contributing to Cookie AutoDelete V3

Thanks for helping improve the Manifest V3 fork of Cookie AutoDelete!

## Bug reports

[Open an issue](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/issues) on this fork for MV3-specific bugs. For pre-MV3 (3.x) issues, please file at the [upstream repo](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete).

## Security issues

Please do **not** open a public issue for security vulnerabilities. See [`SECURITY.md`](SECURITY.md) for private reporting instructions.

## Code

PRs are welcome. Run `npm install` then `npm test` to verify the suite before submitting.

### Requirements

- Node.js 20.9+ (see `engines` in `package.json`)

### Development

- `npm install` — installs all dependencies
- `npm run dev` — webpack watcher; rebuilds `/src/background/index.ts`, popup, and settings into `/extension/bundles`
- `npm run lint` — eslint over `src/`
- `npm test` — jest suite under `__tests__/`
- `npm run build` — builds both Firefox (.xpi/.zip) and Chrome (.zip) MV3 packages into `/builds`
- `npm run build:chrome` / `npm run build:firefox` — build a single target

### Testing the extension locally

1. `npm install`
2. `npm run dev` (keeps rebuilding bundles as you change source)
3. Load `/extension` into your browser:
   - **Chrome / Edge:** `chrome://extensions` → Developer Mode → Load unpacked → select `/extension`
   - **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → select `/extension/manifest.json`

### Building release artifacts

1. `npm install`
2. `npm run build`
3. Built files appear in `/builds/`.
```

> Note: README currently states "Node.js 16.14+" but `package.json` `engines`
> requires `>=20.9.0`. CONTRIBUTING.md uses the correct `20.9+`.

- [ ] **Step 2: Replace the README `## Contributing` section with a pointer**

Replace the entire `## Contributing` section in `README.md` (heading through the
"Building release artifacts" subsection, currently ~lines 47–82) with:

```markdown
## Contributing

PRs and bug reports are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, build, and test instructions, and [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities.
```

- [ ] **Step 3: Verify the README no longer duplicates the dev commands**

Run: `grep -c "npm run dev" README.md`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md README.md
git commit -m "docs: extract CONTRIBUTING.md and link it from the README"
```

---

## Task 5: Add SECURITY.md

**Files:**
- Create: `SECURITY.md`

- [ ] **Step 1: Create `SECURITY.md`**

```markdown
# Security Policy

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

Please report security vulnerabilities **privately** — do not open a public
issue.

Preferred: use GitHub's [private vulnerability reporting](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/security/advisories/new)
("Report a vulnerability" under the repository's **Security** tab).

You can expect an initial acknowledgement within 7 days. If the report is
accepted, a fix will be prepared and released, and you will be credited in the
release notes unless you request otherwise.

This fork only covers the Manifest V3 (4.x architecture, versioned 1.0.x here)
codebase. Vulnerabilities in the upstream MV2 line should be reported to the
[upstream project](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete).
```

- [ ] **Step 2: Verify**

Run: `grep -n "security/advisories/new" SECURITY.md`
Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add SECURITY.md
git commit -m "docs: add SECURITY.md with private vulnerability reporting policy"
```

---

## Task 6: Add CODE_OF_CONDUCT.md

**Files:**
- Create: `CODE_OF_CONDUCT.md`

- [ ] **Step 1: Create `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)**

Write the standard Contributor Covenant v2.1 text. Use the canonical content
from <https://www.contributor-covenant.org/version/2/1/code_of_conduct/>, with
the enforcement contact line set to:

```markdown
reported to the community leaders responsible for enforcement via a [private security advisory](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/security/advisories/new) or by opening a confidential issue.
```

The file MUST include all standard sections: Our Pledge, Our Standards,
Enforcement Responsibilities, Scope, Enforcement, Enforcement Guidelines
(Correction / Warning / Temporary Ban / Permanent Ban), and Attribution.

- [ ] **Step 2: Verify the file has the expected structure**

Run: `grep -c "## " CODE_OF_CONDUCT.md`
Expected: `>= 6` (the major sections).

- [ ] **Step 3: Commit**

```bash
git add CODE_OF_CONDUCT.md
git commit -m "docs: add Contributor Covenant code of conduct"
```

---

## Task 7: Issue-template audit

**Files:**
- Delete: `.github/ISSUE_TEMPLATE/bug-report.md_old`, `.github/ISSUE_TEMPLATE/feature-request.md_old`, `.github/ISSUE_TEMPLATE/support-request.md_old`, `.github/issue_template.md`
- Modify: `.github/ISSUE_TEMPLATE/config.yml:3-5`

- [ ] **Step 1: Delete the stale template files**

```bash
git rm .github/ISSUE_TEMPLATE/bug-report.md_old \
       .github/ISSUE_TEMPLATE/feature-request.md_old \
       .github/ISSUE_TEMPLATE/support-request.md_old \
       .github/issue_template.md
```

- [ ] **Step 2: Repoint the "Discussion" contact link to this fork**

In `.github/ISSUE_TEMPLATE/config.yml`, replace the first contact link block:

```yaml
  - name: Discussion - For new support issues
    url: https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/discussions/new
    about: A new way of interacting with our community (in beta).  New support issues and feature requests can be created and discussed here.
```

with:

```yaml
  - name: Discussions - Ask a question or request support
    url: https://github.com/vasilisplavos/Cookie-AutoDeleteV3/discussions/new
    about: Ask questions, request support, or propose features for this MV3 fork.
```

Leave the Documentation and FAQ links pointing to the upstream wiki (upstream
docs intentionally apply to this fork).

- [ ] **Step 3: Verify the stale files are gone and the discussion link is repointed**

Run:
```bash
ls .github/ISSUE_TEMPLATE/*.md_old 2>/dev/null; ls .github/issue_template.md 2>/dev/null; grep -n "vasilisplavos/Cookie-AutoDeleteV3/discussions" .github/ISSUE_TEMPLATE/config.yml
```
Expected: the two `ls` commands print nothing (files deleted); the `grep` prints one match.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(github): prune stale issue templates; repoint discussions to fork"
```

---

## Task 8: Apply repo metadata via gh CLI

**Files:** none (GitHub-side settings)

- [ ] **Step 1: Confirm gh is authenticated**

Run: `gh auth status`
Expected: logged in as `VasilisPlavos`.

- [ ] **Step 2: Set description, homepage, and topics**

```bash
gh repo edit VasilisPlavos/Cookie-AutoDeleteV3 \
  --description "Manifest V3 fork of Cookie AutoDelete — automatically deletes unused cookies. Now on the Chrome Web Store." \
  --homepage "https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd" \
  --add-topic chrome-extension \
  --add-topic firefox-extension \
  --add-topic edge-extension \
  --add-topic manifest-v3 \
  --add-topic cookies \
  --add-topic privacy \
  --add-topic webextension \
  --add-topic browser-extension
```

- [ ] **Step 3: Verify the metadata applied**

Run:
```bash
gh repo view VasilisPlavos/Cookie-AutoDeleteV3 --json description,homepageUrl,repositoryTopics
```
Expected: description mentions the Chrome Web Store, `homepageUrl` is the store
URL, and `repositoryTopics` lists the eight topics above.

> Note: `manifest.json`'s `homepage_url` is intentionally left pointing at
> GitHub (the support/bug-report hub). No change in this task.

---

## Task 9: Push the branch and cut the v1.0.0 GitHub Release

**Files:** none (GitHub-side)

- [ ] **Step 1: Push the working branch**

```bash
git push origin fix/high-severity-vulns
```
Expected: branch pushed; no errors.

- [ ] **Step 2: Confirm the v1.0.0 tag exists locally and remotely**

Run: `git ls-remote --tags origin v1.0.0; git tag -l v1.0.0`
Expected: `v1.0.0` listed. If the remote tag is missing, push it:
`git push origin v1.0.0`.

- [ ] **Step 3: Create the release with auto-generated notes**

```bash
gh release create v1.0.0 \
  --title "v1.0.0 — Manifest V3, live on the Chrome Web Store" \
  --generate-notes \
  --latest \
  --notes-start-tag v1.0.0 \
  --notes "Cookie AutoDelete V3 (Manifest V3) is now available on the [Chrome Web Store](https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd).

See the README for Firefox / manual-install instructions."
```

> If `gh release create` reports the release already exists, edit instead:
> `gh release edit v1.0.0 --latest --notes "<same body>"`.

- [ ] **Step 4: Verify the release is published and marked latest**

Run: `gh release view v1.0.0 --json isLatest,tagName,name`
Expected: `isLatest: true`, `tagName: v1.0.0`.

---

## Task 10: Manual checklist handoff

**Files:** none

- [ ] **Step 1: Present the manual items that have no API**

Output this checklist for the user to complete in the browser:

```
[ ] Social preview image: GitHub → repo Settings → General → Social preview →
    upload a 1280×640 image (a store screenshot from store-assets/screenshots/
    or a custom banner).
[ ] (Optional) Enable GitHub Discussions: Settings → General → Features →
    Discussions — required for the config.yml "Discussions" contact link to
    resolve. If you prefer not to, change that link to the Issues page instead.
[ ] (Decision) manifest.json homepage_url currently points at GitHub. Flip it to
    the Chrome Web Store URL if you'd rather the extension's "Homepage" link go
    to the store.
```

---

## Self-Review Notes

- **Spec coverage:** README rewrite (Tasks 2–4), CAD_Developers removal incl. UI
  (Task 1), repo metadata (Task 8), GitHub Release (Task 9), community-health
  files — CONTRIBUTING/SECURITY/CODE_OF_CONDUCT + template audit (Tasks 4–7),
  manual social-preview/homepage handoff (Task 10). All spec sections mapped.
- **Verification:** the only code change (Task 1, `SideBar.tsx`) is gated by
  `npm run lint` + `npm test`. Doc/metadata tasks use `grep`/`gh` verification.
- **Consistency:** the store URL string is identical everywhere; `1.0.0` /
  `1.0.x` used consistently; `homepage_url` left on GitHub per the approved spec.
```
