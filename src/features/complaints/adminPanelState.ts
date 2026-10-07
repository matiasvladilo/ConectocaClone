import type {
  ComplaintDetail,
  ComplaintFilters,
  ComplaintPage,
  EmailStatuses,
} from './types';

export type ComplaintEmailKind = 'confirmation' | 'notification';

export interface ComplaintDetailRequestToken {
  complaintId: string;
  generation: number;
  signal: AbortSignal;
}

export class ComplaintDetailRequestGuard {
  private generation = 0;
  private controller: AbortController | null = null;

  begin(complaintId: string): ComplaintDetailRequestToken {
    this.controller?.abort();
    this.controller = new AbortController();
    this.generation += 1;
    return {
      complaintId,
      generation: this.generation,
      signal: this.controller.signal,
    };
  }

  invalidate(): void {
    this.controller?.abort();
    this.controller = null;
    this.generation += 1;
  }

  isCurrent(token: ComplaintDetailRequestToken, openComplaintId: string | null): boolean {
    return !token.signal.aborted
      && token.generation === this.generation
      && token.complaintId === openComplaintId;
  }
}

export const DEFAULT_COMPLAINT_FILTERS: ComplaintFilters = {
  search: '',
  kind: '',
  status: '',
  originType: '',
  branchId: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  limit: 20,
};

export function applyComplaintFilter(
  value: ComplaintFilters,
  patch: Partial<Omit<ComplaintFilters, 'page' | 'limit'>>,
): ComplaintFilters {
  return { ...value, ...patch, page: 1 };
}

// Origen y sucursal se muestran en un único selector: "branch:<id>" elige una
// sucursal concreta; "production" y "other" son los orígenes sin sucursal.
export function complaintOriginFilterValue(filters: ComplaintFilters): string {
  if (filters.originType === 'branch') return filters.branchId ? `branch:${filters.branchId}` : 'branch';
  return filters.originType;
}

export function applyComplaintOriginFilter(filters: ComplaintFilters, value: string): ComplaintFilters {
  if (value.startsWith('branch:')) {
    return applyComplaintFilter(filters, { originType: 'branch', branchId: value.slice('branch:'.length) });
  }
  if (value === 'branch' || value === 'production' || value === 'other') {
    return applyComplaintFilter(filters, { originType: value, branchId: '' });
  }
  return applyComplaintFilter(filters, { originType: '', branchId: '' });
}

export function complaintStatusCountFilters(status: ComplaintFilters['status']): ComplaintFilters {
  return { ...DEFAULT_COMPLAINT_FILTERS, status, page: 1, limit: 1 };
}

export function hasActiveComplaintFilters(filters: ComplaintFilters): boolean {
  return Boolean(
    filters.search
    || filters.status
    || filters.kind
    || filters.originType
    || filters.branchId
    || filters.dateFrom
    || filters.dateTo,
  );
}

export function getComplaintEmptyMessage(filters: ComplaintFilters): string {
  return hasActiveComplaintFilters(filters)
    ? 'Ningún mensaje coincide con los filtros.'
    : 'Todavía no hay mensajes recibidos.';
}

export function mergeComplaintEmailStatuses(
  complaint: ComplaintDetail,
  statuses: EmailStatuses,
  kinds: ComplaintEmailKind[] = ['confirmation', 'notification'],
): ComplaintDetail {
  return {
    ...complaint,
    ...statuses,
    confirmationEmailError: kinds.includes('confirmation') ? null : complaint.confirmationEmailError,
    notificationEmailError: kinds.includes('notification') ? null : complaint.notificationEmailError,
    hasEmailFailure: statuses.confirmationEmailStatus === 'failed'
      || statuses.notificationEmailStatus === 'failed',
  };
}

export function requestedEmailsAreSending(
  statuses: EmailStatuses,
  kinds: ComplaintEmailKind[],
): boolean {
  return kinds.some(kind => kind === 'confirmation'
    ? statuses.confirmationEmailStatus === 'sending'
    : statuses.notificationEmailStatus === 'sending');
}

export function normalizeComplaintPage(requestedPage: number, totalPages: number): number {
  return Math.min(Math.max(1, requestedPage), Math.max(1, totalPages));
}

export function isCompactPaginationWidth(width: number): boolean {
  return width < 640;
}

export function replaceComplaintInPage(
  page: ComplaintPage,
  complaint: ComplaintDetail,
): ComplaintPage {
  return {
    ...page,
    data: page.data.map(item => item.id === complaint.id ? complaint : item),
  };
}
