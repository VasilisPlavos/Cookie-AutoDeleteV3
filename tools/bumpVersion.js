/**
 * Auto-increments the patch component of the version (X.Y.Z -> X.Y.Z+1) in
 * both extension/manifest.json and package.json, keeping them in sync.
 *
 * Wired as the "prebuild:chrome" npm hook, so it runs automatically before
 * every `npm run build:chrome`, guaranteeing each Chrome build has a higher
 * version than the last (which the Chrome Web Store requires for updates).
 *
 * Only the version string is rewritten; the rest of each file (formatting,
 * key order) is left untouched.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FILES = [
  path.join(ROOT, 'extension', 'manifest.json'),
  path.join(ROOT, 'package.json'),
];
const VERSION_RE = /("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")/;

const manifestTxt = fs.readFileSync(FILES[0], 'utf8');
const m = VERSION_RE.exec(manifestTxt);
if (!m) {
  console.error('ERROR: could not find a "version": "X.Y.Z" field in manifest.json');
  process.exit(1);
}

const next = `${m[2]}.${m[3]}.${parseInt(m[4], 10) + 1}`;

for (const fp of FILES) {
  const txt = fs.readFileSync(fp, 'utf8');
  if (!VERSION_RE.test(txt)) {
    console.warn(`WARN: no version field found in ${path.basename(fp)}, skipping.`);
    continue;
  }
  fs.writeFileSync(fp, txt.replace(VERSION_RE, `$1${next}$5`));
}

console.log(`Version bumped to ${next}`);
