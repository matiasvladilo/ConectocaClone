import {
  createFormToken,
  hashRateLimitKey,
  validateAttachments,
  validateComplaintFields,
  verifyFormToken,
  type RawComplaintFields,
} from './domain.ts';
import { buildCentralNotification, buildCustomerConfirmation } from './emailTemplates.ts';
import type { ComplaintMailer } from './mailer.ts';
import type {
  ComplaintRepositoryError,
  ComplaintRepository,
  EmailResult,
  NewAttachmentRecord,
  StoredComplaint,
} from './repository.ts';

export interface ComplaintTelemetry {
  error(event: string, context: Record<string, unknown>): void;
}

export interface PublicComplaintSubmission {
  fields: RawComplaintFields;
  files: File[];
  formToken: string;
  ip: string;
}

export interface PublicComplaintResult {
  caseNumber: string;
  receivedAt: string;
  confirmationEmailStatus: 'sent' | 'failed';
  notificationEmailStatus: 'sent' | 'failed';
}

export interface PublicBranchesResult {
  branches: Array<{ id: string; name: string }>;
  branchesUnavailable: boolean;
  formToken: string;
}

export type PublicComplaintErrorCode =
  | 'INVALID_FORM_TOKEN'
  | 'VALIDATION_ERROR'
  | 'INVALID_BRANCH'
  | 'RATE_LIMITED';

export class PublicComplaintError extends Error {
  readonly code: PublicComplaintErrorCode;

  constructor(
    code: PublicComplaintErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PublicComplaintError';
    this.code = code;
  }
}

interface PublicComplaintServiceOptions {
  businessId: string;
  appPublicUrl: string;
  rateLimitSecret: string;
  recipientEmail: string;
  fromEmail: string;
  repository: ComplaintRepository;
  mailer: ComplaintMailer;
  logger?: ComplaintTelemetry;
  now?: () => Date;
  uuid?: () => string;
}

function safeFileName(value: string): string {
  const leaf = value.replaceAll('\\', '/').split('/').pop()?.trim() || 'archivo';
  const normalized = leaf.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const safe = normalized.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return (safe || 'archivo').slice(0, 120);
}

function originLabel(complaint: StoredComplaint): string {
  if (complaint.originType === 'branch') return `Sucursal — ${complaint.branchName ?? 'Sin nombre'}`;
  if (complaint.originType === 'production') return 'Producción / producto';
  return 'Otro / no sabe';
}

function reducedError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown email error';
  return message.replace(/\s+/g, ' ').trim().slice(0, 240) || 'Unknown email error';
}

function telemetryError(error: unknown): string {
  const repositoryError = error as Partial<ComplaintRepositoryError>;
  if (repositoryError.name === 'ComplaintRepositoryError' && repositoryError.operation) {
    const code = repositoryError.supabaseCode ? ` (${repositoryError.supabaseCode})` : '';
    return `Supabase ${repositoryError.operation} failed${code}`;
  }
  return reducedError(error);
}

async function ignoreCleanupFailure(
  repository: ComplaintRepository,
  paths: string[],
  logger: ComplaintTelemetry,
): Promise<void> {
  if (paths.length === 0) return;
  try {
    await repository.removeEvidence(paths);
  } catch (error) {
    logger.error('complaint_evidence_cleanup_failed', {
      pathCount: paths.length,
      error: telemetryError(error),
    });
  }
}

export function createPublicComplaintService(options: PublicComplaintServiceOptions) {
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const logger = options.logger ?? console;

  async function recordEmail(
    complaint: StoredComplaint,
    kind: 'confirmation' | 'notification',
    message: { subject: string; html: string; text: string },
    to: string,
  ): Promise<'sent' | 'failed'> {
    let result: EmailResult;
    try {
      await options.mailer.send({ from: options.fromEmail, to, ...message });
      result = { status: 'sent', sentAt: now().toISOString(), error: null };
    } catch (error) {
      result = { status: 'failed', sentAt: null, error: reducedError(error) };
    }

    try {
      await options.repository.updateEmailResult(complaint.id, kind, result);
    } catch (error) {
      logger.error('complaint_email_result_update_failed', {
        complaintId: complaint.id,
        kind,
        status: result.status,
        error: telemetryError(error),
      });
    }
    return result.status;
  }

  return {
    async getBranches(): Promise<PublicBranchesResult> {
      const formToken = await createFormToken(options.rateLimitSecret, now().getTime());
      try {
        return {
          branches: await options.repository.listBranches(options.businessId),
          branchesUnavailable: false,
          formToken,
        };
      } catch (error) {
        logger.error('complaint_branch_list_failed', {
          error: telemetryError(error),
        });
        return { branches: [], branchesUnavailable: true, formToken };
      }
    },

    async submit(submission: PublicComplaintSubmission): Promise<PublicComplaintResult> {
      const requestTime = now();
      const validToken = await verifyFormToken(
        submission.formToken,
        options.rateLimitSecret,
        requestTime.getTime(),
      );
      if (!validToken) {
        throw new PublicComplaintError('INVALID_FORM_TOKEN', 'El formulario expiró. Recarga e intenta nuevamente.');
      }

      const rateLimitKey = await hashRateLimitKey(
        options.rateLimitSecret,
        submission.ip,
        requestTime,
      );
      if (!await options.repository.consumeRateLimit(rateLimitKey)) {
        throw new PublicComplaintError('RATE_LIMITED', 'No pudimos recibir otro reclamo en este momento.');
      }

      let fields;
      try {
        fields = validateComplaintFields(submission.fields);
      } catch (error) {
        throw new PublicComplaintError(
          'VALIDATION_ERROR',
          error instanceof Error ? error.message : 'Los datos del reclamo no son válidos.',
        );
      }

      let branch: { id: string; name: string } | null = null;
      if (fields.originType === 'branch') {
        branch = await options.repository.findBranch(options.businessId, fields.branchId!);
        if (!branch) {
          throw new PublicComplaintError('INVALID_BRANCH', 'La sucursal seleccionada ya no está disponible.');
        }
      }

      try {
        validateAttachments(submission.files.map(file => ({
          name: file.name,
          type: file.type,
          size: file.size,
        })));
      } catch (error) {
        throw new PublicComplaintError(
          'VALIDATION_ERROR',
          error instanceof Error ? error.message : 'Los archivos adjuntos no son válidos.',
        );
      }

      const complaintId = uuid();
      const attachments: NewAttachmentRecord[] = submission.files.map(file => {
        const id = uuid();
        const originalName = safeFileName(file.name);
        return {
          id,
          complaintId,
          storagePath: `${options.businessId}/${complaintId}/${id}-${originalName}`,
          originalName,
          mimeType: file.type,
          sizeBytes: file.size,
        };
      });
      const uploadedPaths: string[] = [];

      try {
        for (let index = 0; index < submission.files.length; index += 1) {
          await options.repository.uploadEvidence(
            attachments[index].storagePath,
            submission.files[index],
          );
          uploadedPaths.push(attachments[index].storagePath);
        }
      } catch (error) {
        await ignoreCleanupFailure(options.repository, uploadedPaths, logger);
        throw error;
      }

      let complaint: StoredComplaint;
      try {
        complaint = await options.repository.insertComplaint({
          id: complaintId,
          businessId: options.businessId,
          originType: fields.originType,
          branchProfileId: branch?.id ?? null,
          branchNameSnapshot: branch?.name ?? null,
          customerEmail: fields.email,
          customerName: fields.name,
          customerPhone: fields.phone,
          description: fields.description,
        }, attachments);
      } catch (error) {
        await ignoreCleanupFailure(options.repository, uploadedPaths, logger);
        throw error;
      }

      const data = {
        caseNumber: complaint.caseNumber,
        createdAt: complaint.createdAt,
        originLabel: originLabel(complaint),
        customerEmail: complaint.customerEmail,
        customerName: complaint.customerName,
        customerPhone: complaint.customerPhone,
        description: complaint.description,
        attachmentCount: complaint.attachmentCount,
        adminUrl: new URL(
          `/?screen=complaints&case=${encodeURIComponent(complaint.id)}`,
          options.appPublicUrl,
        ).toString(),
      };

      const [confirmationEmailStatus, notificationEmailStatus] = await Promise.all([
        recordEmail(
          complaint,
          'confirmation',
          buildCustomerConfirmation(data),
          complaint.customerEmail,
        ),
        recordEmail(
          complaint,
          'notification',
          buildCentralNotification(data),
          options.recipientEmail,
        ),
      ]);

      return {
        caseNumber: complaint.caseNumber,
        receivedAt: complaint.createdAt,
        confirmationEmailStatus,
        notificationEmailStatus,
      };
    },
  };
}
