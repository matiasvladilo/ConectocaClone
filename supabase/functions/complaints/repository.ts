import type { ComplaintOrigin } from './domain.ts';

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

export function createSupabaseComplaintRepository(
  client: SupabaseClientLike,
): ComplaintRepository {
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
  };
}
