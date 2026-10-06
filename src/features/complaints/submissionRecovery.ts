export type PublicComplaintRecovery =
  | 'refresh-token'
  | 'refresh-branches'
  | 'rate-limited'
  | 'generic';

export type PublicConfigRefreshMode = 'initial' | 'form-token' | 'invalid-branch';

export function getPublicComplaintRecovery(error: unknown): PublicComplaintRecovery {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;

  if (code === 'INVALID_FORM_TOKEN') return 'refresh-token';
  if (code === 'INVALID_BRANCH') return 'refresh-branches';
  if (code === 'RATE_LIMITED') return 'rate-limited';
  return 'generic';
}

export function prepareDraftForConfigRefresh<T extends { branchId: string }>(
  draft: T,
  mode: PublicConfigRefreshMode,
): T {
  return mode === 'invalid-branch' ? { ...draft, branchId: '' } : draft;
}

export function getServerRecoveryFocusTargets(recovery: PublicComplaintRecovery): string[] {
  return recovery === 'refresh-branches'
    ? ['complaint-recovery-alert', 'complaint-branch']
    : ['complaint-recovery-alert'];
}

export function getInvalidBranchMessage(refreshed: boolean): string {
  return refreshed
    ? 'La sucursal seleccionada ya no está disponible. Selecciona otra sucursal.'
    : 'La sucursal seleccionada ya no está disponible. No pudimos actualizar las sucursales; revisa tu conexión e inténtalo nuevamente.';
}
