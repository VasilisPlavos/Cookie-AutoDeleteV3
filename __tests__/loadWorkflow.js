const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadWorkflow(name) {
  const p = path.join(__dirname, '..', '.github', 'workflows', name);
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

module.exports = { loadWorkflow };
