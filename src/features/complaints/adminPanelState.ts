import type {
  ComplaintDetail,
  ComplaintFilters,
  ComplaintPage,
  EmailStatuses,
} from './types';

export const DEFAULT_COMPLAINT_FILTERS: ComplaintFilters = {
  search: '',
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

export function hasActiveComplaintFilters(filters: ComplaintFilters): boolean {
  return Boolean(
    filters.search
    || filters.status
    || filters.originType
    || filters.branchId
    || filters.dateFrom
    || filters.dateTo,
  );
}

export function getComplaintEmptyMessage(filters: ComplaintFilters): string {
  return hasActiveComplaintFilters(filters)
    ? 'Ningún reclamo coincide con los filtros.'
    : 'Todavía no hay reclamos recibidos.';
}

export function mergeComplaintEmailStatuses(
  complaint: ComplaintDetail,
  statuses: EmailStatuses,
): ComplaintDetail {
  return {
    ...complaint,
    ...statuses,
    hasEmailFailure: statuses.confirmationEmailStatus === 'failed'
      || statuses.notificationEmailStatus === 'failed',
  };
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
