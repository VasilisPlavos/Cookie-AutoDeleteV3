# Contributing to Cookie AutoDelete V3

Thanks for helping improve the Manifest V3 fork of Cookie AutoDelete!

## Bug reports

[Open an issue](https://github.com/vasilisplavos/Cookie-AutoDeleteV3/issues) on this fork for MV3-specific bugs. For pre-MV3 (3.x) issues, please file at the [upstream repo](https://github.com/Cookie-AutoDelete/Cookie-AutoDelete).

## Security issues

Please do **not** open a public issue for security vulnerabilities. See [`SECURITY.md`](SECURITY.md) for private reporting instructions.

## Code

PRs are welcome. Run `npm install` then `npm test` to verify the suite before submitting.

### Requirements

- Node.js 22+ (see `engines` in `package.json`)

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
