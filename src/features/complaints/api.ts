import { publicAnonKey, projectId } from '../../utils/supabase/info';
import { createClient } from '../../utils/supabase/client';
import { readComplaintResponse } from './apiError';
import type {
  ComplaintDetail,
  ComplaintDraft,
  ComplaintFilters,
  ComplaintPage,
  ComplaintStatus,
  EmailStatuses,
  PublicComplaintConfig,
} from './types';

export { ComplaintApiError } from './apiError';

const COMPLAINTS_API_URL = `https://${projectId}.supabase.co/functions/v1/complaints`;

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { data, error } = await createClient().auth.refreshSession();
        return error || !data.session ? null : data.session.access_token;
      } catch {
        return null;
      } finally {
        setTimeout(() => { refreshPromise = null; }, 0);
      }
    })();
  }
  return refreshPromise;
}

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${COMPLAINTS_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
      ...(options.headers ?? {}),
    },
  });
  return readComplaintResponse<T>(response);
}

async function adminRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const request = (accessToken: string) => fetch(`${COMPLAINTS_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let response = await request(token);
  if (response.status === 401) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) response = await request(refreshedToken);
  }
  return readComplaintResponse<T>(response);
}

function publicComplaintForm(input: ComplaintDraft, formToken: string): FormData {
  const form = new FormData();
  form.append('originType', input.originType);
  form.append('branchId', input.branchId);
  form.append('email', input.email);
  form.append('name', input.name);
  form.append('phone', input.phone);
  form.append('description', input.description);
  form.append('website', '');
  form.append('formToken', formToken);
  for (const file of input.files) form.append('files', file);
  return form;
}

function complaintQuery(filters: ComplaintFilters): string {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.originType) params.set('originType', filters.originType);
  if (filters.branchId.trim()) params.set('branchId', filters.branchId.trim());
  if (filters.dateFrom.trim()) params.set('dateFrom', filters.dateFrom.trim());
  if (filters.dateTo.trim()) params.set('dateTo', filters.dateTo.trim());
  return params.toString();
}

export const complaintsAPI = {
  getPublicConfig(): Promise<PublicComplaintConfig> {
    return publicRequest('/public/branches');
  },

  submitPublic(input: ComplaintDraft, formToken: string): Promise<{ caseNumber: string; receivedAt: string }> {
    return publicRequest('/public/complaints', {
      method: 'POST',
      body: publicComplaintForm(input, formToken),
    });
  },

  list(token: string, filters: ComplaintFilters): Promise<ComplaintPage> {
    return adminRequest(`/admin/complaints?${complaintQuery(filters)}`, token);
  },

  get(token: string, id: string): Promise<ComplaintDetail> {
    return adminRequest(`/admin/complaints/${encodeURIComponent(id)}`, token);
  },

  setStatus(token: string, id: string, status: ComplaintStatus): Promise<ComplaintDetail> {
    return adminRequest(`/admin/complaints/${encodeURIComponent(id)}/status`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  retryEmails(
    token: string,
    id: string,
    kinds: Array<'confirmation' | 'notification'>,
  ): Promise<EmailStatuses> {
    return adminRequest(`/admin/complaints/${encodeURIComponent(id)}/retry-emails`, token, {
      method: 'POST',
      body: JSON.stringify({ kinds }),
    });
  },

  createAttachmentUrl(token: string, attachmentId: string): Promise<{ url: string; expiresIn: number }> {
    return adminRequest(`/admin/attachments/${encodeURIComponent(attachmentId)}/signed-url`, token, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
