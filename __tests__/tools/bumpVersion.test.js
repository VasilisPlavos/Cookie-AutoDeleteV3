const fs = require('fs');
const os = require('os');
const path = require('path');

function writeJson(fp, obj) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, `${JSON.stringify(obj, null, 2)}\n`);
}

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

describe('bumpVersion', () => {
  let dir;
  let cwd;
  let bumpVersion;

  beforeEach(() => {
    cwd = process.cwd();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-bump-'));
    writeJson(path.join(dir, 'package.json'), { name: 'cad', version: '1.3.4' });
    writeJson(path.join(dir, 'extension', 'manifest.json'), {
      manifest_version: 3,
      version: '1.3.4',
    });
    writeJson(path.join(dir, 'package-lock.json'), {
      name: 'cad',
      version: '1.3.4',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': { name: 'cad', version: '1.3.4' },
        'node_modules/dep': { version: '9.9.9' },
      },
    });
    process.chdir(dir);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.isolateModules(() => {
      ({ bumpVersion } = require('../../tools/bumpVersion'));
    });
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test('writes the bumped version to package.json, manifest and lockfile', () => {
    expect(bumpVersion('patch')).toBe('1.3.5');

    expect(readJson(path.join(dir, 'package.json')).version).toBe('1.3.5');
    expect(readJson(path.join(dir, 'extension', 'manifest.json')).version).toBe(
      '1.3.5',
    );
    const lock = readJson(path.join(dir, 'package-lock.json'));
    expect(lock.version).toBe('1.3.5');
    expect(lock.packages[''].version).toBe('1.3.5');
    expect(lock.packages['node_modules/dep'].version).toBe('9.9.9');
  });

  test('keeps the lockfile in npm format', () => {
    bumpVersion('minor');

    const raw = fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8');
    expect(raw).toBe(`${JSON.stringify(JSON.parse(raw), null, 2)}\n`);
  });

  test('re-syncs a stale lockfile without a bump', () => {
    writeJson(path.join(dir, 'package.json'), { name: 'cad', version: '1.4.0' });

    bumpVersion();

    const lock = readJson(path.join(dir, 'package-lock.json'));
    expect(lock.version).toBe('1.4.0');
    expect(lock.packages[''].version).toBe('1.4.0');
  });
});
