export type ComplaintKind = 'complaint' | 'suggestion' | 'compliment';
export type ComplaintOrigin = 'branch' | 'production' | 'other';
export type ComplaintStatus = 'pending' | 'attended';
export type ComplaintEmailStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface PublicComplaintConfig {
  branches: Array<{ id: string; name: string }>;
  formToken: string;
  branchesUnavailable: boolean;
}

export interface ComplaintDraft {
  kind: ComplaintKind | '';
  originType: ComplaintOrigin;
  branchId: string;
  email: string;
  name: string;
  phone: string;
  description: string;
  files: File[];
}

export interface ComplaintValidationErrors {
  kind?: string;
  originType?: string;
  branchId?: string;
  email?: string;
  name?: string;
  phone?: string;
  description?: string;
  files?: string;
}

export interface ComplaintSummary {
  id: string;
  kind: ComplaintKind;
  caseNumber: string;
  originType: ComplaintOrigin;
  branchName: string | null;
  customerEmail: string;
  customerName: string | null;
  descriptionPreview: string;
  status: ComplaintStatus;
  hasEmailFailure: boolean;
  createdAt: string;
}

export interface ComplaintAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ComplaintDetail extends ComplaintSummary {
  customerPhone: string | null;
  description: string;
  confirmationEmailStatus: ComplaintEmailStatus;
  notificationEmailStatus: ComplaintEmailStatus;
  confirmationEmailError: string | null;
  notificationEmailError: string | null;
  attendedAt: string | null;
  attendedBy: string | null;
  attachments: ComplaintAttachment[];
}

export interface ComplaintFilters {
  search: string;
  kind: ComplaintKind | '';
  status: ComplaintStatus | '';
  originType: ComplaintOrigin | '';
  branchId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}

export interface ComplaintPage {
  data: ComplaintSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface EmailStatuses {
  confirmationEmailStatus: ComplaintEmailStatus;
  notificationEmailStatus: ComplaintEmailStatus;
}
