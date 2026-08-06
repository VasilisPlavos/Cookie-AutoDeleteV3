// The harness's three failure categories, in one place.
//
// The prefix carries the whole diagnostic value: against real websites a bare
// stack trace cannot say whether CAD regressed, the site misbehaved, or the
// harness never started. Only CLEANUP FAILED should ever block a release.
function taggedError(tag, name) {
  return class extends Error {
    constructor(message) {
      super(`${tag}: ${message}`);
      this.name = name;
    }
  };
}

const SetupError = taggedError('SETUP FAILED', 'SetupError');
const PreconditionError = taggedError('PRECONDITION FAILED', 'PreconditionError');
const CleanupError = taggedError('CLEANUP FAILED', 'CleanupError');

module.exports = {
  CleanupError,
  PreconditionError,
  SetupError,
};
