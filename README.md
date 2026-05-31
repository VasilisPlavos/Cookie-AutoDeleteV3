[link-upstream]: https://github.com/Cookie-AutoDelete/Cookie-AutoDelete

# Cookie AutoDelete V3

> **This is a community fork** of the original [Cookie AutoDelete][link-upstream] by Kenny Do and the CAD Team. The fork focuses on shipping Manifest V3 support for Chrome 109+, Firefox 115+, and Edge 109+. The original 3.x line (MV2) continues at the upstream repo.
>
> All MV2 functionality is preserved. The MV3 architecture is documented in [`docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md`](docs/superpowers/specs/2026-05-30-mv3-upgrade-design.md).

![Tagged Release Distribution](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/Tagged%20Release%20Distribution/badge.svg) ![Node.js CI Tests](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/CI/badge.svg?branch=main)

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
