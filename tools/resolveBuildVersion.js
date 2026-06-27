/**
 * Resolves the version tag used for build-artifact filenames.
 *
 * Priority: BUILD_VERSION (explicit, used by the main-push release workflow)
 * > GITHUB_REF (tag pushes) > TRAVIS_TAG (legacy). The first non-empty source
 * wins; if that value is not valid semver (e.g. a branch ref like
 * refs/heads/main) the result is '' so the build falls back to Dev_ naming.
 *
 * @param {Record<string, string|undefined>} env  Environment map (process.env).
 * @returns {string} e.g. 'v1.0.3' / '1.0.3', or '' when no valid source.
 */
const SEMVER_RE = /^v?\d+\.\d+\.\d+$/;

function resolveBuildVersion(env = {}) {
  let version = env.BUILD_VERSION || env.GITHUB_REF || env.TRAVIS_TAG || '';
  if (version.startsWith('refs/tags/')) {
    version = version.slice('refs/tags/'.length);
  }
  if (version && !SEMVER_RE.test(version)) {
    return '';
  }
  return version;
}

module.exports = { resolveBuildVersion };
