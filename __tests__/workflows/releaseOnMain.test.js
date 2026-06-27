const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadWorkflow(name) {
  const p = path.join(__dirname, '..', '..', '.github', 'workflows', name);
  return yaml.safeLoad(fs.readFileSync(p, 'utf8'));
}
function stepById(doc, jobKey, id) {
  return doc.jobs[jobKey].steps.find((s) => s.id === id);
}

describe('release-on-main.yml', () => {
  const doc = loadWorkflow('release-on-main.yml');
  const jobKey = Object.keys(doc.jobs)[0];

  test('triggers on push to main and via workflow_dispatch', () => {
    expect(doc.on.push.branches).toContain('main');
    expect(doc.on).toHaveProperty('workflow_dispatch');
  });

  test('workflow_dispatch exposes a dry_run input', () => {
    expect(doc.on.workflow_dispatch.inputs).toHaveProperty('dry_run');
  });

  test('grants contents: write and serializes releases', () => {
    expect(doc.permissions.contents).toBe('write');
    expect(doc.concurrency.group).toBe('release-main');
  });

  test('build step feeds BUILD_VERSION', () => {
    const build = stepById(doc, jobKey, 'build');
    expect(build.env.BUILD_VERSION).toMatch(/version/);
  });

  test('publish step is a full, latest, auto-noted release', () => {
    const publish = stepById(doc, jobKey, 'publish');
    expect(publish.uses).toMatch(/^softprops\/action-gh-release@[0-9a-f]{40}/);
    expect(publish.with.draft).toBe(false);
    expect(publish.with.make_latest).toBe(true);
    expect(publish.with.generate_release_notes).toBe(true);
  });

  test('publish attaches only Chrome.zip and Firefox.xpi', () => {
    const files = stepById(doc, jobKey, 'publish').with.files;
    expect(files).toContain('Chrome.zip');
    expect(files).toContain('Firefox.xpi');
    expect(files).not.toContain('Firefox.zip');
  });

  test('publish is skipped on dry runs', () => {
    const publish = stepById(doc, jobKey, 'publish');
    expect(publish.if).toContain("dry_run");
  });
});
