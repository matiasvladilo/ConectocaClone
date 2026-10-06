export const COMPLAINT_DEEP_LINK_KEY = 'conectoca_pending_complaint_id';

export function complaintIdFromLocation(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get('screen') === 'complaints' ? params.get('case') : null;
}

export function complaintIdForRole(role: string, complaintId: string | null): string | null {
  return role === 'admin' ? complaintId : null;
}

export type ComplaintProfileSource = 'cache' | 'remote';

export type ComplaintDeepLinkDecision =
  | { kind: 'none' | 'defer' | 'deny'; complaintId: null; consume: boolean; shouldLoadComplaint: false }
  | { kind: 'open'; complaintId: string; consume: true; shouldLoadComplaint: true };

export function complaintDeepLinkDecision(
  profileSource: ComplaintProfileSource,
  role: string,
  complaintId: string | null,
): ComplaintDeepLinkDecision {
  if (!complaintId) {
    return { kind: 'none', complaintId: null, consume: false, shouldLoadComplaint: false };
  }
  if (profileSource === 'cache') {
    return { kind: 'defer', complaintId: null, consume: false, shouldLoadComplaint: false };
  }
  if (role !== 'admin') {
    return { kind: 'deny', complaintId: null, consume: true, shouldLoadComplaint: false };
  }
  return { kind: 'open', complaintId, consume: true, shouldLoadComplaint: true };
}
