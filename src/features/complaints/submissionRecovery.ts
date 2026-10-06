export type PublicComplaintRecovery =
  | 'refresh-token'
  | 'refresh-branches'
  | 'rate-limited'
  | 'generic';

export function getPublicComplaintRecovery(error: unknown): PublicComplaintRecovery {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;

  if (code === 'INVALID_FORM_TOKEN') return 'refresh-token';
  if (code === 'INVALID_BRANCH') return 'refresh-branches';
  if (code === 'RATE_LIMITED') return 'rate-limited';
  return 'generic';
}
