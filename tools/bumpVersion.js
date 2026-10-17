/**
 * Version bumper for the Chrome build pipeline.
 *
 * package.json is the source of truth for the current version (matching
 * tools/replaceVersionNumber.js and the release workflows). The release type
 * is chosen by the caller:
 *
 *   bumpVersion()          -> no bump; only re-syncs manifest.json to package.json
 *   bumpVersion('patch')   -> X.Y.Z -> X.Y.(Z+1)
 *   bumpVersion('minor')   -> X.Y.Z -> X.(Y+1).0
 *   bumpVersion('major')   -> X.Y.Z -> (X+1).0.0
 *
 * The resulting version is written to BOTH package.json and
 * extension/manifest.json, keeping them in sync. Only the version string is
 * rewritten; the rest of each file (formatting, key order) is left untouched.
 *
 * Exposed as a function (used by tools/buildChrome.js) and runnable directly:
 *   node ./tools/bumpVersion.js [patch|minor|major]
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const MANIFEST_JSON = path.join(ROOT, 'extension', 'manifest.json');
const VERSION_RE = /("version"\s*:\s*")(\d+)\.(\d+)\.(\d+)(")/;
const RELEASE_TYPES = ['patch', 'minor', 'major'];

function computeNext(version, releaseType) {
  const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10));
  switch (releaseType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version; // no bump
  }
}

function readVersion(fp) {
  const m = VERSION_RE.exec(fs.readFileSync(fp, 'utf8'));
  return m ? `${m[2]}.${m[3]}.${m[4]}` : null;
}

function writeVersion(fp, version) {
  const txt = fs.readFileSync(fp, 'utf8');
  if (!VERSION_RE.test(txt)) {
    console.warn(
      `WARN: no version field found in ${path.basename(fp)}, skipping.`,
    );
    return;
  }
  fs.writeFileSync(fp, txt.replace(VERSION_RE, `$1${version}$5`));
}

/**
 * @param {string|undefined} releaseType 'patch' | 'minor' | 'major' | undefined
 * @returns {string} the resulting version
 */
function bumpVersion(releaseType) {
  if (releaseType && !RELEASE_TYPES.includes(releaseType)) {
    console.error(
      `ERROR: unknown release type "${releaseType}". Use one of: ${RELEASE_TYPES.join(
        ', ',
      )} (or omit for no bump).`,
    );
    process.exit(1);
  }

  const current = readVersion(PACKAGE_JSON);
  if (!current) {
    console.error(
      'ERROR: could not find a "version": "X.Y.Z" field in package.json',
    );
    process.exit(1);
  }

  const next = computeNext(current, releaseType);

  writeVersion(PACKAGE_JSON, next);
  writeVersion(MANIFEST_JSON, next);

  if (next === current) {
    console.log(
      `Version unchanged at ${next} (manifest.json synced to package.json).`,
    );
  } else {
    console.log(`Version bumped ${current} -> ${next} (${releaseType}).`);
  }
  return next;
}

module.exports = { bumpVersion, computeNext };

if (require.main === module) {
  bumpVersion(process.argv[2]);
}
