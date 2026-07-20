/**
 * Chrome build entry point.
 *
 * Optionally bumps the version, then compiles and packages the Chrome build.
 * The bump type is passed positionally (npm forwards it to this script):
 *
 *   npm run build:chrome          # no bump:    1.0.0 -> 1.0.0
 *   npm run build:chrome patch    # patch bump: 1.0.0 -> 1.0.1
 *   npm run build:chrome minor    # minor bump: 1.0.0 -> 1.1.0
 *   npm run build:chrome major    # major bump: 1.0.0 -> 2.0.0
 *
 * The bump must happen before packaging so the built .zip carries the new
 * version. package.json is the source of truth (see tools/bumpVersion.js).
 */
const { execSync } = require('child_process');
const { bumpVersion } = require('./bumpVersion');

bumpVersion(process.argv[2]);

execSync('npm run compile', { stdio: 'inherit' });
execSync('node ./tools/buildFilesDev.js --target=chrome', { stdio: 'inherit' });
