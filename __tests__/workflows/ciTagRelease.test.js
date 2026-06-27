const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadWorkflow(name) {
  const p = path.join(__dirname, '..', '..', '.github', 'workflows', name);
  return yaml.safeLoad(fs.readFileSync(p, 'utf8'));
}

describe('ci_tag_release.yml (manual fallback)', () => {
  const doc = loadWorkflow('ci_tag_release.yml');
  const jobKey = Object.keys(doc.jobs)[0];
  const release = doc.jobs[jobKey].steps.find((s) => s.id === 'github_releases');

  test('keeps the tag trigger and adds manual dispatch', () => {
    expect(doc.on.push.tags).toBeDefined();
    expect(doc.on).toHaveProperty('workflow_dispatch');
  });

  test('publishes (not draft)', () => {
    expect(release.with.draft).toBe(false);
  });

  test('attaches only Chrome.zip and Firefox.xpi', () => {
    expect(release.with.files).toContain('Chrome.zip');
    expect(release.with.files).toContain('Firefox.xpi');
    expect(release.with.files).not.toContain('Firefox.zip');
  });
});
