/**
 * Copyright (c) 2020-2022 Kenneth Tran and CAD Team
 * (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/graphs/contributors)
 * Copyright (c) 2026 Vasilis Plavos
 * Licensed under MIT
 * (https://github.com/Cookie-AutoDelete/Cookie-AutoDelete/blob/3.X.X-Branch/LICENSE)
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { resolveBuildVersion } = require('./resolveBuildVersion');

const BUILDS = 'builds';
const EXT = 'extension';
const EXTNAME = 'Cookie-AutoDelete-V3_';
const MANIFEST = 'manifest.json';

const ROOTDIR = process.cwd();
const BUILDDIR = path.join(ROOTDIR, BUILDS);
const EXTDIR = path.join(ROOTDIR, EXT);

console.log(
  '\n\nUsing NodeJS Version %s on %s %s',
  process.version,
  process.platform,
  process.arch,
);
console.log('Current Root Directory is:  %s', ROOTDIR);

console.log('GITHUB_REF:  %s', process.env.GITHUB_REF);
console.log('TRAVIS_TAG:  %s', process.env.TRAVIS_TAG);
console.log('GITSHA    :  %s', process.env.GITSHA);

let versionTag = resolveBuildVersion(process.env);

if (!versionTag) {
  console.log(
    'Neither GITHUB_REF nor TRAVIS_TAG contained a valid semver version.  Presuming non-publishing version.\nAdding Dev_ and using Date Format YYYYMMDD_HHMMSS as tag.',
  );
}

const sha = process.env.GITSHA ? `_${process.env.GITSHA.slice(0, 7)}` : '';

const TAG =
  (versionTag ||
    'Dev_' +
      new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .replace(/T/, '_')
        .replace(/-|:|\..+/g, '')) +
  sha +
  '_';

console.log('TAG to append:  %s\n', TAG);

const CHROMEFILENAME = EXTNAME + TAG + 'Chrome';
const FIREFOXFILENAME = EXTNAME + TAG + 'Firefox';

function archiverZip(cb, filename) {
  if (typeof cb !== 'function') {
    console.error('callback is not a function!');
    return null;
  }
  const fileStream = fs.createWriteStream(
    path.join(BUILDDIR, filename + '.zip'),
  );

  const archive = archiver('zip', {
    zlib: { level: 9 }, // Sets the Compression Level.
  });

  // Listen for all archive data to be written
  // 'close' eent is fired only when a file descriptor is involved
  function fileOnClose() {
    console.log(archive.pointer() + ' total bytes');
    console.log(
      'archiver has been finalized and the output file descriptor has closed.',
    );
    cb(0);
  }

  // This event is fired when data source is drained no matter what was the data source.
  // Not part of archiver but from NodeJS Stream API.
  function fileOnEnd() {
    console.log('Data has been drained');
  }

  console.log('Creating an archive in: %s', fileStream.path);

  fileStream.on('close', fileOnClose);
  fileStream.on('end', fileOnEnd);

  // Good Practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
      console.warn(
        'ARCHIVER WARNING %s: %s (%s)',
        err.code,
        err.message,
        err.data,
      );
    } else {
      throw err;
    }
  });

  // Good Practice to catch his error explicitly
  archive.on('error', function (err) {
    throw err;
  });

  // Pipe archive data to the file
  archive.pipe(fileStream);

  // Append files from Extension Folder.
  archive.directory(EXTDIR, false);

  archive.finalize();
}

// Manifest patchers — mutate an in-memory copy of manifest.json and return it.

function chromePatchManifest(mf) {
  // Firefox-only permission must not appear in the Chromium build.
  const ciIdx = mf.permissions ? mf.permissions.indexOf('contextualIdentities') : -1;
  if (ciIdx !== -1) {
    mf.permissions.splice(ciIdx, 1);
  }
  // Firefox-only background script entry (we ship one bundle but declare both keys
  // in the source manifest); Chromium warns about unknown sibling keys.
  if (mf.background && mf.background.scripts) {
    delete mf.background.scripts;
  }
  // Legacy MV2 key — defensive removal in case it ever creeps back in.
  delete mf.applications;
  delete mf.browser_specific_settings;
  return mf;
}

function firefoxPatchManifest(mf) {
  if (!mf.permissions) mf.permissions = [];
  if (!mf.permissions.includes('contextualIdentities')) {
    mf.permissions.push('contextualIdentities');
  }
  mf.browser_specific_settings = {
    gecko: {
      id: 'cookieautodelete@vp.dev',
      strict_min_version: '115.0',
    },
  };
  // Convert the Chromium MV3 service_worker entry to Firefox's event-page scripts form.
  if (mf.background) {
    const sw = mf.background.service_worker;
    if (sw) {
      mf.background.scripts = [sw];
      delete mf.background.service_worker;
    } else if (!mf.background.scripts) {
      // Defensive: source somehow has neither — fall back to the known bundle path.
      mf.background.scripts = ['bundles/background.js'];
    }
  }
  delete mf.minimum_chrome_version;
  return mf;
}

function firefoxBuild(cb) {
  if (typeof cb !== 'function') {
    console.error('callback is not a function!');
    return null;
  }
  console.log('\nGetting a copy of %s to memory...', MANIFEST);
  const mforig = fs.readFileSync(path.join(EXTDIR, MANIFEST));
  console.log('Prepping %s for Mozilla Firefox...', MANIFEST);

  delete require.cache[require.resolve(path.join(EXTDIR, MANIFEST))];
  const mf = firefoxPatchManifest(require(path.join(EXTDIR, MANIFEST)));

  console.log('Overwriting %s for Mozilla Firefox ...', MANIFEST);
  fs.writeFileSync(path.join(EXTDIR, MANIFEST), JSON.stringify(mf, null, 2));

  console.log('\nBuilding unsigned extension for Mozilla Firefox...');
  archiverZip(function (r) {
    if (r === 0) {
      fs.writeFileSync(path.join(EXTDIR, MANIFEST), mforig);
      console.log('%s has been reverted back to original contents!', MANIFEST);
      console.log('Copying .ZIP to .XPI...');
      fs.copyFileSync(
        path.join(BUILDDIR, FIREFOXFILENAME + '.zip'),
        path.join(BUILDDIR, FIREFOXFILENAME + '.xpi'),
      );
      console.log('>> Copy Success!');
      console.log('Mozilla Firefox Build Complete!');
    } else {
      console.warn(
        'Archiver was not successful as it returned [%s]. Stopping the rest of the process.',
        r,
      );
    }
    cb(r);
  }, FIREFOXFILENAME);
}

function chromeBuild(cb) {
  if (typeof cb !== 'function') {
    console.error('callback is not a function!');
    return null;
  }
  console.log('\nGetting a copy of %s to memory...', MANIFEST);
  const mforig = fs.readFileSync(path.join(EXTDIR, MANIFEST));
  console.log('Prepping %s for Google Chrome...', MANIFEST);

  delete require.cache[require.resolve(path.join(EXTDIR, MANIFEST))];
  const mf = chromePatchManifest(require(path.join(EXTDIR, MANIFEST)));

  console.log('Overwriting %s for Google Chrome ...', MANIFEST);
  fs.writeFileSync(path.join(EXTDIR, MANIFEST), JSON.stringify(mf, null, 2));

  console.log('\nBuilding unsigned extension for Google Chrome...');
  archiverZip(function (r) {
    if (r === 0) {
      fs.writeFileSync(path.join(EXTDIR, MANIFEST), mforig);
      console.log('%s has been reverted back to original contents!', MANIFEST);
      console.log('Google Chrome Build Complete!');
    } else {
      console.warn(
        'Archiver was not successful as it returned [%s]. Stopping the rest of the process.',
        r,
      );
    }
    cb(r);
  }, CHROMEFILENAME);
}

function mainBuild() {
  const targetArg = process.argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.slice('--target='.length) : 'all';

  const runChrome = (cb) => chromeBuild((r) => {
    if (r === 0) {
      console.log('\n\n> Chrome Done! <\n');
      cb(0);
    } else {
      console.error('Google Chrome Build did not complete successfully.');
      process.exitCode = 4;
      cb(r);
    }
  });

  const runFirefox = (cb) => firefoxBuild((r) => {
    if (r === 0) {
      console.log('\n\n> Firefox Done! <\n');
      cb(0);
    } else {
      console.error('Firefox Build did not complete successfully.');
      process.exitCode = 3;
      cb(r);
    }
  });

  if (target === 'chrome') {
    runChrome(() => {});
  } else if (target === 'firefox') {
    runFirefox(() => {});
  } else {
    // No --target= flag, or unknown/empty value — build both Firefox and Chrome.
    runFirefox((r) => {
      if (r === 0) runChrome(() => {});
    });
  }
}

function preCheck(cb) {
  if (typeof cb !== 'function') {
    console.error('callback is not a function!');
    return null;
  }
  console.log('Creating %s if it does not exists...', BUILDDIR);
  fs.mkdirSync(BUILDDIR, { recursive: true });

  console.log('Checking if %s folder exists...', EXTDIR);
  const extRes = fs.statSync(EXTDIR);
  if (!extRes) {
    console.error(
      '%s does NOT exist - Cannot build WebExtension.  Terminating.',
      EXTDIR,
    );
    cb(1);
  } else if (!extRes.isDirectory()) {
    console.error(
      '%s is found but is NOT a directory.  Cannot build WebExtension.  Terminating.',
      EXTDIR,
    );
    cb(2);
  } else {
    console.log('Yup.  Directory %s Exists!', EXTDIR);
    cb(0);
  }
}

// Start Point!
preCheck((r) => {
  if (r === 0) {
    mainBuild();
  } else {
    console.warn('PreCheck Failed! Terminating!');
    process.exitCode = r;
  }
});
