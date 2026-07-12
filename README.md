# Cookie AutoDelete V3

> Cookie AutoDelete V3 brings Manifest V3 support to Chrome 109+, Edge 109+ and other Chromium browsers. Firefox manual / sideload install is also available. All prior MV2 functionality is preserved.

![Tagged Release Distribution](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/Tagged%20Release%20Distribution/badge.svg) ![Node.js CI Tests](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/workflows/CI/badge.svg?branch=main)

[![Available in the Chrome Web Store](https://img.shields.io/chrome-web-store/v/jofioghmpdcgiiobkhmdojhjbjiejfbd?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd)

**▶ [Install from the Chrome Web Store](https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd)**

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

> **Manifest V3 — version 1.0.0:** Requires Chrome 109+, Edge 109+, or any Chromium 109+ browser.

### Chrome, Edge and any Chromium browser (recommended)

Install directly from the **[Chrome Web Store](https://chromewebstore.google.com/detail/cookie-autodelete-v3/jofioghmpdcgiiobkhmdojhjbjiejfbd)**. Other Chromium browsers can install the same extension from the Web Store (Edge requires enabling "Allow extensions from other stores" in `edge://extensions`), but **only Chrome is officially supported**.

### Firefox & manual install (GitHub Releases)

For Firefox, or to sideload an unpacked build on any supported browser, use the [GitHub Releases](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/releases) artifacts:

1. Download the latest `Cookie-AutoDelete-V3_<version>_Chrome.zip` (or `_Firefox.xpi`) from [Releases](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/releases).
2. **Chrome / Edge / Any Chromium browser:** extract the zip, open `chrome://extensions` (or `edge://extensions`, etc.), enable Developer Mode, click "Load unpacked", and select the extracted folder.
3. **Firefox Nightly:** the `.xpi` is unsigned, so it only installs on Firefox Nightly. Open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select the `.xpi` file. (Note: temporary add-ons are removed when Firefox restarts.)

> **Officially supported: Google Chrome only.** Chrome is the only browser that is actively maintained and tested (via the Chrome Web Store). Other Chromium browsers (Edge, Brave, Vivaldi, Opera, …) can install the same extension from the Web Store and it will likely work, but they are **not supported**. A Firefox `.xpi` build is published on GitHub Releases for those who want it, but it is unsigned and unsupported.

## Release

```sh
npm run build:chrome           # no bump:    1.0.0 → 1.0.0
npm run build:chrome patch     # patch bump: 1.0.0 → 1.0.1
npm run build:chrome minor     # minor bump: 1.0.0 → 1.1.0
npm run build:chrome major     # major bump: 1.0.0 → 2.0.0
```

## Attribution

This project is distributed under the MIT License (see [`LICENSE`](LICENSE)). It builds on prior MIT-licensed work whose original copyright notices are retained in the [`LICENSE`](LICENSE) file and in every source file's header, alongside this fork's copyright (© 2026 Vasilis Plavos).

## Contributing

PRs and bug reports are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, build, and test instructions, and [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities.

## Documentation

Wiki documentation: <https://github.com/vasilisplavos/Cookie-AutoDeleteV3/wiki/Documentation>.
