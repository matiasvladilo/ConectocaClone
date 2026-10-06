export const COMPLAINT_DEEP_LINK_KEY = 'conectoca_pending_complaint_id';

export function complaintIdFromLocation(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get('screen') === 'complaints' ? params.get('case') : null;
}

export function complaintIdForRole(role: string, complaintId: string | null): string | null {
  return role === 'admin' ? complaintId : null;
}
