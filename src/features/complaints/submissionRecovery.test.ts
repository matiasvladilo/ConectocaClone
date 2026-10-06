import assert from 'node:assert/strict';
import test from 'node:test';

test('classifies form-token, branch and rate-limit errors without retrying the submission', async () => {
  const recovery = await import('./submissionRecovery.ts') as {
    getPublicComplaintRecovery?: (error: unknown) => string;
    prepareDraftForConfigRefresh?: <T extends { branchId: string }>(draft: T, mode: string) => T;
    getServerRecoveryFocusTargets?: (recovery: string) => string[];
    getInvalidBranchMessage?: (refreshed: boolean) => string;
  };

  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'INVALID_FORM_TOKEN' }), 'refresh-token');
  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'INVALID_BRANCH' }), 'refresh-branches');
  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'RATE_LIMITED' }), 'rate-limited');
  assert.equal(recovery.getPublicComplaintRecovery!({ code: 'INTERNAL_ERROR' }), 'generic');

  const draft = { branchId: 'branch-1', email: 'cliente@example.com' };
  assert.equal(recovery.prepareDraftForConfigRefresh!(draft, 'form-token'), draft);
  assert.deepEqual(
    recovery.prepareDraftForConfigRefresh!(draft, 'invalid-branch'),
    { branchId: '', email: 'cliente@example.com' },
  );

  assert.deepEqual(recovery.getServerRecoveryFocusTargets!('refresh-token'), ['complaint-recovery-alert']);
  assert.deepEqual(recovery.getServerRecoveryFocusTargets!('refresh-branches'), [
    'complaint-recovery-alert',
    'complaint-branch',
  ]);
  assert.equal(
    recovery.getInvalidBranchMessage!(false),
    'La sucursal seleccionada ya no está disponible. No pudimos actualizar las sucursales; revisa tu conexión e inténtalo nuevamente.',
  );
});
