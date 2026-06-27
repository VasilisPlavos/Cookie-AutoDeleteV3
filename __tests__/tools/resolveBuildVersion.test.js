const { resolveBuildVersion } = require('../../tools/resolveBuildVersion');

describe('resolveBuildVersion', () => {
  test('BUILD_VERSION takes priority over GITHUB_REF', () => {
    expect(
      resolveBuildVersion({ BUILD_VERSION: 'v1.2.3', GITHUB_REF: 'refs/tags/v9.9.9' }),
    ).toBe('v1.2.3');
  });

  test('reads a tag from GITHUB_REF, stripping refs/tags/', () => {
    expect(resolveBuildVersion({ GITHUB_REF: 'refs/tags/v1.0.0' })).toBe('v1.0.0');
  });

  test('returns empty string for a branch ref (main push)', () => {
    expect(resolveBuildVersion({ GITHUB_REF: 'refs/heads/main' })).toBe('');
  });

  test('falls back to TRAVIS_TAG', () => {
    expect(resolveBuildVersion({ TRAVIS_TAG: 'v2.0.0' })).toBe('v2.0.0');
  });

  test('accepts a plain semver without the v prefix', () => {
    expect(resolveBuildVersion({ BUILD_VERSION: '1.0.3' })).toBe('1.0.3');
  });

  test('first non-empty source wins; an invalid value yields empty (no fall-through)', () => {
    expect(
      resolveBuildVersion({ BUILD_VERSION: 'garbage', GITHUB_REF: 'refs/tags/v1.0.0' }),
    ).toBe('');
  });

  test('empty env yields empty string', () => {
    expect(resolveBuildVersion({})).toBe('');
  });
});
