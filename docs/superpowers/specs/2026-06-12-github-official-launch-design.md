# Make Cookie AutoDelete V3 Official on GitHub — Design

**Date:** 2026-06-12
**Status:** Approved (pending spec review)
**Branch:** `fix/high-severity-vulns` (work will land here or a dedicated branch)

## Context

The extension is now live on the Chrome Web Store:
<https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd>

The repository still reflects the pre-store reality. The README states the
extension is "distributed **via GitHub Releases only (no Chrome Web Store / AMO
submission)**" and markets a non-existent "version 4.x" while the code
(`manifest.json`, `package.json`, git tag) is at `1.0.0`. Upstream's funding
pointer (`CAD_Developers` on Liberapay) is still present in both the repo
metadata and the live extension UI.

This is a one-time "we're official now" sweep that reconciles the repo with the
store listing, polishes the GitHub presence, cuts a real release, adds
community-health files, and removes all upstream-funding references.

## Source of truth

- **Version:** `1.0.0` is canonical. All `4.x` references in the README are
  wrong and must be removed. Chrome 109+ / Firefox 115+ / Edge 109+ support
  statements stay.
- **Distribution:** Chrome Web Store is the **headline/primary** channel.
  GitHub Releases is the fallback for Firefox, Edge sideload, and manual
  install.

## Scope

### 1. README rewrite

- Add a **Chrome Web Store badge + install button** near the top, linking to the
  store URL above.
- Rewrite the **Installation** section:
  - Headline: "Install for Chrome / Edge" → Chrome Web Store.
  - Fallback: GitHub Releases for Firefox (`.xpi`) and manual/sideload installs.
  - **Delete** the false "distributed via GitHub Releases only (no Chrome Web
    Store / AMO submission)" line.
- **Purge all `4.x`** references; align wording to `1.0.0`.
- Extract the inline **Contributing** section into `CONTRIBUTING.md`, leaving a
  short pointer link in the README.

### 2. Remove all `CAD_Developers` / upstream-funding references

- **Delete `.github/FUNDING.yml`** entirely — its only active entry is
  `liberapay: CAD_Developers`, which funds the upstream maintainers.
- **Remove the Contribute link** in `src/ui/settings/components/SideBar.tsx`
  (the `<a href="https://liberapay.com/CAD_Developers/">…</a>` block, lines
  ~116–123) plus the now-stray `<br />` immediately above it (line ~115).
- **Preserve** all in-source MIT copyright headers that reference "Kenneth
  Tran" / "CAD Team" / `Cookie-AutoDelete/Cookie-AutoDelete` — these are legal
  attribution and are explicitly preserved verbatim per the fork's LICENSE/README.
- The `contributeText` i18n key remains in ~30 `_locales/*/messages.json`
  files. It becomes unused (harmless). Leaving it avoids churning 30 locale
  files and is out of scope.

### 3. Repo metadata (applied via `gh` CLI)

- **Description:** update to note it's available on the Chrome Web Store
  (e.g. "Manifest V3 fork of Cookie AutoDelete — now on the Chrome Web Store").
- **Homepage URL (repo About):** repoint from the GitHub URL to the Chrome Web
  Store listing.
- **`manifest.json` `homepage_url`:** **keep pointing at GitHub** (the support /
  bug-report hub the README routes users to). Flagged here for the reviewer to
  flip to the store URL if preferred.
- **Topics:** add `chrome-extension`, `firefox-extension`, `edge-extension`,
  `manifest-v3`, `cookies`, `privacy`, `webextension`, `browser-extension`.
- **Social preview image:** cannot be set via API — provided as a manual
  checklist item (Settings → General → Social preview, upload an image from
  `store-assets/`).

### 4. GitHub Release

- Cut **`v1.0.0`** (the tag already exists) using `gh release create` with
  auto-generated notes, marked as the latest release, with a line noting Chrome
  Web Store availability and the store link.

### 5. Community-health files

- **`CONTRIBUTING.md`** — built from the README's existing Contributing content
  (requirements, dev/build/test commands, local-load instructions).
- **`SECURITY.md`** — private vulnerability-reporting instructions (aligns with
  the current `fix/high-severity-vulns` work). Use GitHub private security
  advisories / a contact path; state supported versions (`1.0.x`).
- **`CODE_OF_CONDUCT.md`** — Contributor Covenant (standard text).
- **Templates audit:** the `.github/ISSUE_TEMPLATE/` directory has both `.yaml`
  forms and stale `*.md_old` files. Delete the `*.md_old` files; verify the
  `.yaml` templates and `config.yml` reference this fork's repo, not upstream.

## Out of scope

- Edge Add-ons / Firefox AMO store submissions (GitHub Releases remains their
  channel for now).
- Removing the orphaned `contributeText` locale strings.
- Any change to MV2/MV3 functionality or build pipeline behavior.
- Refactoring unrelated to the above.

## Sequencing & verification

1. Edit in-repo files (README, `CONTRIBUTING.md`, `SECURITY.md`,
   `CODE_OF_CONDUCT.md`, `SideBar.tsx`, delete `FUNDING.yml` + `*.md_old`).
2. Run `npm run lint` and `npm test` — confirm the `SideBar.tsx` edit compiles
   and no test regressed.
3. Commit the file changes.
4. Apply repo metadata via `gh` (description, homepage, topics).
5. Cut the `v1.0.0` GitHub Release via `gh` last.
6. Hand the reviewer the manual checklist (social preview image, the
   `homepage_url` decision).

## Risks

- **Legal/attribution:** must NOT touch MIT copyright headers — only the funding
  pointer is removed. Verified the distinction during exploration.
- **UI test coverage:** no test references the sidebar Contribute link
  (confirmed), so removal is low-risk.
- **`gh` auth:** confirmed authenticated as `VasilisPlavos` with repo scope.
