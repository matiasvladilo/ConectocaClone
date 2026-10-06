import type { ComplaintOrigin } from './domain.ts';
// Shared bounds keep handler validation and PostgREST filtering identical.
import {
  complaintDateFromBoundary,
  complaintDateToBoundary,
  type AdminComplaintRepository,
  type ComplaintDetail,
  type ComplaintListQuery,
  type ComplaintPage,
  type ComplaintSummary,
} from './adminService.ts';
import type { ComplaintEmailData } from './emailTemplates.ts';

const EVIDENCE_BUCKET = 'complaint-evidence';

export interface NewComplaintRecord {
  id: string;
  businessId: string;
  originType: ComplaintOrigin;
  branchProfileId: string | null;
  branchNameSnapshot: string | null;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  description: string;
}

export interface NewAttachmentRecord {
  id: string;
  complaintId: string;
  storagePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StoredComplaint {
  id: string;
  caseNumber: string;
  createdAt: string;
  originType: ComplaintOrigin;
  branchName: string | null;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  description: string;
  attachmentCount: number;
}

export interface EmailResult {
  status: 'sent' | 'failed';
  sentAt: string | null;
  error: string | null;
}

export interface ComplaintRepository {
  listBranches(businessId: string): Promise<Array<{ id: string; name: string }>>;
  findBranch(businessId: string, id: string): Promise<{ id: string; name: string } | null>;
  consumeRateLimit(keyHash: string): Promise<boolean>;
  uploadEvidence(path: string, file: File): Promise<void>;
  removeEvidence(paths: string[]): Promise<void>;
  insertComplaint(
    input: NewComplaintRecord,
    attachments: NewAttachmentRecord[],
  ): Promise<StoredComplaint>;
  updateEmailResult(
    id: string,
    kind: 'confirmation' | 'notification',
    result: EmailResult,
  ): Promise<void>;
}

interface SupabaseClientLike {
  from(table: string): any;
  rpc(name: string, parameters: Record<string, unknown>): any;
  storage: {
    from(bucket: string): any;
  };
}

interface ComplaintRow {
  id: string;
  case_number: string;
  created_at: string;
  origin_type: ComplaintOrigin;
  branch_name_snapshot: string | null;
  customer_email: string;
  customer_name: string | null;
  customer_phone: string | null;
  description: string;
  attachment_count: number;
}

interface AdminComplaintRow {
  id: string;
  business_id: string;
  case_number: string;
  origin_type: ComplaintOrigin;
  branch_name_snapshot: string | null;
  customer_email: string;
  customer_name: string | null;
  customer_phone?: string | null;
  description: string;
  status: 'pending' | 'attended';
  confirmation_email_status: ComplaintDetail['confirmationEmailStatus'];
  notification_email_status: ComplaintDetail['notificationEmailStatus'];
  confirmation_email_error?: string | null;
  notification_email_error?: string | null;
  attended_at?: string | null;
  attended_by?: string | null;
  created_at: string;
  complaint_attachments?: Array<{
    id: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
  }>;
}

interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export class ComplaintRepositoryError extends Error {
  readonly operation: string;
  readonly supabaseCode: string | null;

  constructor(operation: string, error: SupabaseError) {
    super(`Supabase ${operation} failed: ${error.message}`);
    this.name = 'ComplaintRepositoryError';
    this.operation = operation;
    this.supabaseCode = error.code ?? null;
  }
}

export class ComplaintNotFoundError extends Error {
  constructor(resource: 'complaint' | 'attachment') {
    super(resource === 'complaint' ? 'Complaint not found' : 'Attachment not found');
    this.name = 'ComplaintNotFoundError';
  }
}

function throwIfError(operation: string, error: SupabaseError | null): void {
  if (error) throw new ComplaintRepositoryError(operation, error);
}

function toStoredComplaint(row: ComplaintRow): StoredComplaint {
  return {
    id: row.id,
    caseNumber: row.case_number,
    createdAt: row.created_at,
    originType: row.origin_type,
    branchName: row.branch_name_snapshot,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    description: row.description,
    attachmentCount: row.attachment_count,
  };
}

function toComplaintSummary(row: AdminComplaintRow): ComplaintSummary {
  return {
    id: row.id,
    caseNumber: row.case_number,
    originType: row.origin_type,
    branchName: row.branch_name_snapshot,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    descriptionPreview: row.description.slice(0, 180),
    status: row.status,
    hasEmailFailure: row.confirmation_email_status === 'failed'
      || row.notification_email_status === 'failed',
    createdAt: row.created_at,
  };
}

function toComplaintDetail(row: AdminComplaintRow): ComplaintDetail {
  return {
    ...toComplaintSummary(row),
    customerPhone: row.customer_phone ?? null,
    description: row.description,
    confirmationEmailStatus: row.confirmation_email_status,
    notificationEmailStatus: row.notification_email_status,
    confirmationEmailError: row.confirmation_email_error ?? null,
    notificationEmailError: row.notification_email_error ?? null,
    attendedAt: row.attended_at ?? null,
    attendedBy: row.attended_by ?? null,
    attachments: (row.complaint_attachments ?? []).map(attachment => ({
      id: attachment.id,
      originalName: attachment.original_name,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
    })),
  };
}

const ADMIN_SUMMARY_SELECT = [
  'id',
  'business_id',
  'case_number',
  'origin_type',
  'branch_name_snapshot',
  'customer_email',
  'customer_name',
  'description',
  'status',
  'confirmation_email_status',
  'notification_email_status',
  'created_at',
].join(',');

const ADMIN_DETAIL_SELECT = [
  ADMIN_SUMMARY_SELECT,
  'customer_phone',
  'confirmation_email_error',
  'notification_email_error',
  'attended_at',
  'attended_by',
  'complaint_attachments(id,original_name,mime_type,size_bytes)',
].join(',');

function originLabel(row: AdminComplaintRow): string {
  if (row.origin_type === 'branch') {
    return `Sucursal — ${row.branch_name_snapshot ?? 'Sin nombre'}`;
  }
  if (row.origin_type === 'production') return 'Producción / producto';
  return 'Otro / no sabe';
}

function safeSearchValue(value: string): string {
  return value.replace(/[\\(),*]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function createSupabaseComplaintRepository(
  client: SupabaseClientLike,
): ComplaintRepository & AdminComplaintRepository {
  return {
    async listBranches(businessId) {
      const { data, error } = await client
        .from('profiles')
        .select('id, name')
        .eq('business_id', businessId)
        .eq('role', 'local')
        .order('name', { ascending: true });
      throwIfError('list branches', error);
      return (data ?? []).map((row: { id: string; name: string }) => ({
        id: row.id,
        name: row.name,
      }));
    },

    async findBranch(businessId, id) {
      const { data, error } = await client
        .from('profiles')
        .select('id, name')
        .eq('business_id', businessId)
        .eq('role', 'local')
        .eq('id', id)
        .maybeSingle();
      throwIfError('find branch', error);
      return data ? { id: data.id, name: data.name } : null;
    },

    async consumeRateLimit(keyHash) {
      const { data, error } = await client.rpc('consume_complaint_rate_limit', {
        p_key_hash: keyHash,
        p_limit: 5,
      });
      throwIfError('consume rate limit', error);
      return data === true;
    },

    async uploadEvidence(path, file) {
      const { error } = await client.storage.from(EVIDENCE_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      throwIfError('upload evidence', error);
    },

    async removeEvidence(paths) {
      if (paths.length === 0) return;
      const { error } = await client.storage.from(EVIDENCE_BUCKET).remove(paths);
      throwIfError('remove evidence', error);
    },

    async insertComplaint(input, attachments) {
      const { data, error } = await client.rpc('insert_complaint_with_attachments', {
        p_id: input.id,
        p_business_id: input.businessId,
        p_origin_type: input.originType,
        p_branch_profile_id: input.branchProfileId,
        p_branch_name_snapshot: input.branchNameSnapshot,
        p_customer_email: input.customerEmail,
        p_customer_name: input.customerName,
        p_customer_phone: input.customerPhone,
        p_description: input.description,
        p_attachments: attachments.map(attachment => ({
          id: attachment.id,
          storage_path: attachment.storagePath,
          original_name: attachment.originalName,
          mime_type: attachment.mimeType,
          size_bytes: attachment.sizeBytes,
        })),
      });
      throwIfError('insert complaint with attachments', error);
      if (!data) {
        throw new Error('Supabase insert complaint with attachments returned no data');
      }

      return toStoredComplaint(data as ComplaintRow);
    },

    async updateEmailResult(id, kind, result) {
      const { error } = await client
        .from('complaints')
        .update({
          [`${kind}_email_status`]: result.status,
          [`${kind}_sent_at`]: result.sentAt,
          [`${kind}_email_error`]: result.error,
        })
        .eq('id', id);
      throwIfError('update email result', error);
    },

    async list(query: ComplaintListQuery, businessId: string): Promise<ComplaintPage> {
      const first = (query.page - 1) * query.limit;
      let request = client
        .from('complaints')
        .select(ADMIN_SUMMARY_SELECT, { count: 'exact' })
        .eq('business_id', businessId);

      if (query.status) request = request.eq('status', query.status);
      if (query.originType) request = request.eq('origin_type', query.originType);
      if (query.branchId) request = request.eq('branch_profile_id', query.branchId);
      if (query.dateFrom) request = request.gte('created_at', complaintDateFromBoundary(query.dateFrom));
      if (query.dateTo) request = request.lte('created_at', complaintDateToBoundary(query.dateTo));
      if (query.search) {
        const search = safeSearchValue(query.search);
        if (search) {
          const pattern = `*${search}*`;
          request = request.or([
            `case_number.ilike.${pattern}`,
            `customer_email.ilike.${pattern}`,
            `customer_name.ilike.${pattern}`,
            `description.ilike.${pattern}`,
          ].join(','));
        }
      }

      const { data, error, count } = await request
        .order('created_at', { ascending: false })
        .range(first, first + query.limit - 1);
      throwIfError('list complaints', error);
      const total = count ?? 0;
      const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
      return {
        data: (data ?? []).map((row: AdminComplaintRow) => toComplaintSummary(row)),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages,
          hasNext: query.page < totalPages,
          hasPrev: query.page > 1,
        },
      };
    },

    async getDetail(id, businessId) {
      const { data, error } = await client
        .from('complaints')
        .select(ADMIN_DETAIL_SELECT)
        .eq('id', id)
        .eq('business_id', businessId)
        .maybeSingle();
      throwIfError('get complaint detail', error);
      if (!data) throw new ComplaintNotFoundError('complaint');
      return toComplaintDetail(data as AdminComplaintRow);
    },

    async setStatus(id, businessId, update) {
      const { data, error } = await client
        .from('complaints')
        .update({
          status: update.status,
          attended_at: update.attendedAt,
          attended_by: update.attendedBy,
        })
        .eq('id', id)
        .eq('business_id', businessId)
        .select(ADMIN_DETAIL_SELECT)
        .maybeSingle();
      throwIfError('set complaint status', error);
      if (!data) throw new ComplaintNotFoundError('complaint');
      return toComplaintDetail(data as AdminComplaintRow);
    },

    async createAttachmentUrl(attachmentId, businessId, expiresIn) {
      const { data, error } = await client
        .from('complaint_attachments')
        .select('storage_path,complaints!inner(business_id)')
        .eq('id', attachmentId)
        .eq('complaints.business_id', businessId)
        .maybeSingle();
      throwIfError('get complaint attachment', error);
      if (!data?.storage_path) throw new ComplaintNotFoundError('attachment');

      const signed = await client.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(data.storage_path, expiresIn);
      throwIfError('create attachment signed URL', signed.error);
      if (!signed.data?.signedUrl) throw new ComplaintNotFoundError('attachment');
      return signed.data.signedUrl;
    },

    async claimEmailRetry(id, businessId, kind) {
      const { data, error } = await client
        .from('complaints')
        .update({
          [`${kind}_email_status`]: 'sending',
          [`${kind}_email_error`]: null,
        })
        .eq('id', id)
        .eq('business_id', businessId)
        .eq(`${kind}_email_status`, 'failed')
        .select('id')
        .maybeSingle();
      throwIfError('claim email retry', error);
      return Boolean(data);
    },

    async getEmailData(id, businessId): Promise<ComplaintEmailData> {
      const { data, error } = await client
        .from('complaints')
        .select(ADMIN_DETAIL_SELECT)
        .eq('id', id)
        .eq('business_id', businessId)
        .maybeSingle();
      throwIfError('get complaint email data', error);
      if (!data) throw new ComplaintNotFoundError('complaint');
      const row = data as AdminComplaintRow;
      return {
        caseNumber: row.case_number,
        createdAt: row.created_at,
        originLabel: originLabel(row),
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        customerPhone: row.customer_phone ?? null,
        description: row.description,
        attachmentCount: row.complaint_attachments?.length ?? 0,
        adminUrl: '',
      };
    },

    async completeEmailRetry(id, kind, result, businessId) {
      const { error } = await client
        .from('complaints')
        .update({
          [`${kind}_email_status`]: result.status,
          [`${kind}_sent_at`]: result.sentAt,
          [`${kind}_email_error`]: result.error,
        })
        .eq('id', id)
        .eq('business_id', businessId)
        .eq(`${kind}_email_status`, 'sending');
      throwIfError('complete email retry', error);
    },
  };
}
