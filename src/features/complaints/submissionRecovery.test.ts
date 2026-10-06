import assert from 'node:assert/strict';
import test from 'node:test';

test('classifies form-token, branch and rate-limit errors without retrying the submission', async () => {
  const recovery = await import('./submissionRecovery.ts') as {
    getPublicComplaintRecovery?: (error: unknown) => string;
  };

  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'INVALID_FORM_TOKEN' }), 'refresh-token');
  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'INVALID_BRANCH' }), 'refresh-branches');
  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'RATE_LIMITED' }), 'rate-limited');
  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'INTERNAL_ERROR' }), 'generic');
});
