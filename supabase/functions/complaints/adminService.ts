import type { ComplaintOrigin } from './domain.ts';
import {
  buildCentralNotification,
  buildCustomerConfirmation,
  type ComplaintEmailData,
} from './emailTemplates.ts';
import type { ComplaintMailer } from './mailer.ts';
import type { EmailResult } from './repository.ts';

export interface AdminContext {
  userId: string;
  businessId: string;
}

export interface AdminAuthGateway {
  getUser(token: string): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<{
    id: string;
    role: string;
    businessId: string | null;
  } | null>;
}

export type AdminComplaintErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND';

export class AdminComplaintError extends Error {
  readonly code: AdminComplaintErrorCode;

  constructor(code: AdminComplaintErrorCode, message: string) {
    super(message);
    this.name = 'AdminComplaintError';
    this.code = code;
  }
}

export async function authorizeAdmin(input: {
  token: string;
  expectedBusinessId: string;
  auth: AdminAuthGateway;
}): Promise<AdminContext> {
  const token = input.token.trim();
  if (!token) {
    throw new AdminComplaintError('UNAUTHORIZED', 'Debes iniciar sesión.');
  }

  const user = await input.auth.getUser(token);
  if (!user?.id) {
    throw new AdminComplaintError('UNAUTHORIZED', 'La sesión no es válida o expiró.');
  }

  const profile = await input.auth.getProfile(user.id);
  if (
    !profile
    || profile.id !== user.id
    || profile.role !== 'admin'
    || profile.businessId !== input.expectedBusinessId
  ) {
    throw new AdminComplaintError('FORBIDDEN', 'No tienes permiso para administrar reclamos.');
  }

  return { userId: user.id, businessId: input.expectedBusinessId };
}

export interface ComplaintListQuery {
  search?: string;
  status?: 'pending' | 'attended';
  originType?: ComplaintOrigin;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

export interface ComplaintSummary {
  id: string;
  caseNumber: string;
  originType: ComplaintOrigin;
  branchName: string | null;
  customerEmail: string;
  customerName: string | null;
  descriptionPreview: string;
  status: 'pending' | 'attended';
  hasEmailFailure: boolean;
  createdAt: string;
}

export type ComplaintEmailStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface ComplaintDetail extends ComplaintSummary {
  customerPhone: string | null;
  description: string;
  confirmationEmailStatus: ComplaintEmailStatus;
  notificationEmailStatus: ComplaintEmailStatus;
  confirmationEmailError: string | null;
  notificationEmailError: string | null;
  attendedAt: string | null;
  attendedBy: string | null;
  attachments: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
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

export interface AdminComplaintService {
  list(query: ComplaintListQuery, admin: AdminContext): Promise<ComplaintPage>;
  getDetail(id: string, admin: AdminContext): Promise<ComplaintDetail>;
  setStatus(
    id: string,
    status: 'pending' | 'attended',
    admin: AdminContext,
  ): Promise<ComplaintDetail>;
  createAttachmentUrl(
    id: string,
    admin: AdminContext,
  ): Promise<{ url: string; expiresIn: 300 }>;
  retryEmails(
    id: string,
    kinds: Array<'confirmation' | 'notification'>,
    admin: AdminContext,
  ): Promise<EmailStatuses>;
}

export interface AdminComplaintRepository {
  list(query: ComplaintListQuery, businessId: string): Promise<ComplaintPage>;
  getDetail(id: string, businessId: string): Promise<ComplaintDetail>;
  setStatus(id: string, businessId: string, update: {
    status: 'pending' | 'attended';
    attendedAt: string | null;
    attendedBy: string | null;
  }): Promise<ComplaintDetail>;
  createAttachmentUrl(
    attachmentId: string,
    businessId: string,
    expiresIn: number,
  ): Promise<string>;
  claimEmailRetry(
    id: string,
    businessId: string,
    kind: 'confirmation' | 'notification',
  ): Promise<boolean>;
  getEmailData(id: string, businessId: string): Promise<ComplaintEmailData>;
  completeEmailRetry(
    id: string,
    kind: 'confirmation' | 'notification',
    result: EmailResult,
    businessId: string,
  ): Promise<void>;
}

function validationError(message: string): never {
  throw new AdminComplaintError('VALIDATION_ERROR', message);
}

function parseInteger(value: string | null, fallback: number, label: string): number {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) validationError(`${label} debe ser un número entero.`);
  return Number(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

export function parseComplaintListQuery(params: URLSearchParams): ComplaintListQuery {
  const page = parseInteger(params.get('page'), 1, 'La página');
  const limit = parseInteger(params.get('limit'), 20, 'El límite');
  if (page < 1) validationError('La página debe ser mayor o igual a 1.');
  if (limit < 1 || limit > 100) validationError('El límite debe estar entre 1 y 100.');

  const query: ComplaintListQuery = { page, limit };
  const search = params.get('search')?.trim();
  if (search) query.search = search.slice(0, 200);

  const status = params.get('status');
  if (status) {
    if (status !== 'pending' && status !== 'attended') {
      validationError('El estado no es válido.');
    }
    query.status = status;
  }

  const originType = params.get('originType');
  if (originType) {
    if (originType !== 'branch' && originType !== 'production' && originType !== 'other') {
      validationError('El origen no es válido.');
    }
    query.originType = originType;
  }

  const branchId = params.get('branchId')?.trim();
  if (branchId) query.branchId = branchId;

  for (const [parameter, key] of [
    ['dateFrom', 'dateFrom'],
    ['dateTo', 'dateTo'],
  ] as const) {
    const value = params.get(parameter)?.trim();
    if (!value) continue;
    if (!isIsoDate(value)) validationError(`La fecha ${parameter === 'dateFrom' ? 'desde' : 'hasta'} no es válida.`);
    query[key] = value;
  }

  if (query.dateFrom && query.dateTo && Date.parse(query.dateFrom) > Date.parse(query.dateTo)) {
    validationError('La fecha desde no puede ser posterior a la fecha hasta.');
  }
  return query;
}

export function parseStatus(body: unknown): 'pending' | 'attended' {
  const status = typeof body === 'object' && body !== null
    ? (body as { status?: unknown }).status
    : undefined;
  if (status !== 'pending' && status !== 'attended') {
    validationError('El estado debe ser pending o attended.');
  }
  return status;
}

export function parseRetryKinds(body: unknown): Array<'confirmation' | 'notification'> {
  const kinds = typeof body === 'object' && body !== null
    ? (body as { kinds?: unknown }).kinds
    : undefined;
  if (!Array.isArray(kinds) || kinds.length === 0) {
    validationError('Debes seleccionar al menos un correo para reintentar.');
  }
  if (kinds.some(kind => kind !== 'confirmation' && kind !== 'notification')) {
    validationError('El tipo de correo no es válido.');
  }
  return [...new Set(kinds)] as Array<'confirmation' | 'notification'>;
}

function reducedError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown email error';
  return message.replace(/\s+/g, ' ').trim().slice(0, 240) || 'Unknown email error';
}

function emailDataForCase(
  data: ComplaintEmailData,
  appPublicUrl: string,
  complaintId: string,
): ComplaintEmailData {
  const url = new URL(appPublicUrl);
  url.pathname = '/';
  url.search = new URLSearchParams({ screen: 'complaints', case: complaintId }).toString();
  url.hash = '';
  return { ...data, adminUrl: url.toString() };
}

export function createAdminComplaintService(
  options: {
    repository: AdminComplaintRepository;
    mailer: ComplaintMailer;
    fromEmail: string;
    recipientEmail: string;
    appPublicUrl: string;
    now?: () => Date;
  },
): AdminComplaintService {
  const now = options.now ?? (() => new Date());

  async function retryOne(
    id: string,
    kind: 'confirmation' | 'notification',
    admin: AdminContext,
  ): Promise<ComplaintEmailStatus> {
    const claimed = await options.repository.claimEmailRetry(id, admin.businessId, kind);
    if (!claimed) return 'sending';

    let result: EmailResult;
    try {
      const storedData = await options.repository.getEmailData(id, admin.businessId);
      const data = emailDataForCase(storedData, options.appPublicUrl, id);
      const message = kind === 'confirmation'
        ? buildCustomerConfirmation(data)
        : buildCentralNotification(data);
      const to = kind === 'confirmation' ? data.customerEmail : options.recipientEmail;
      await options.mailer.send({ from: options.fromEmail, to, ...message });
      result = { status: 'sent', sentAt: now().toISOString(), error: null };
    } catch (error) {
      result = { status: 'failed', sentAt: null, error: reducedError(error) };
    }

    await options.repository.completeEmailRetry(id, kind, result, admin.businessId);
    return result.status;
  }

  return {
    list(query, admin) {
      return options.repository.list(query, admin.businessId);
    },

    getDetail(id, admin) {
      return options.repository.getDetail(id, admin.businessId);
    },

    setStatus(id, status, admin) {
      return options.repository.setStatus(id, admin.businessId, status === 'attended'
        ? {
          status,
          attendedAt: now().toISOString(),
          attendedBy: admin.userId,
        }
        : { status, attendedAt: null, attendedBy: null });
    },

    async createAttachmentUrl(id, admin) {
      const expiresIn = 300 as const;
      const url = await options.repository.createAttachmentUrl(
        id,
        admin.businessId,
        expiresIn,
      );
      return { url, expiresIn };
    },

    async retryEmails(id, kinds, admin) {
      const statuses: EmailStatuses = {
        confirmationEmailStatus: 'pending',
        notificationEmailStatus: 'pending',
      };
      await Promise.all([...new Set(kinds)].map(async kind => {
        statuses[`${kind}EmailStatus`] = await retryOne(id, kind, admin);
      }));

      // Production repositories expose detail, which returns the authoritative
      // status of requested and non-requested messages after concurrent claims.
      // The guard also keeps the service usable with narrow repository doubles.
      if (typeof options.repository.getDetail === 'function') {
        const detail = await options.repository.getDetail(id, admin.businessId);
        return {
          confirmationEmailStatus: detail.confirmationEmailStatus,
          notificationEmailStatus: detail.notificationEmailStatus,
        };
      }
      return statuses;
    },
  };
}
