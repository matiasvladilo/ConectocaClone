import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { buildComplaintMailto } from './mailto';
import type {
  ComplaintDetail as ComplaintDetailData,
  ComplaintEmailStatus,
  ComplaintStatus,
} from './types';

export interface ComplaintDetailProps {
  complaint: ComplaintDetailData;
  onStatusChange: (status: ComplaintStatus) => Promise<void>;
  onRetryEmail: (kinds: Array<'confirmation' | 'notification'>) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenAttachment: (attachmentId: string) => Promise<void>;
  onClose: () => void;
}

type DetailAction = 'status' | 'confirmation' | 'notification' | 'refresh' | `attachment:${string}` | null;

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateFormatter.format(date);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function originLabel(complaint: ComplaintDetailData): string {
  if (complaint.originType === 'branch') return complaint.branchName || 'Sucursal eliminada';
  if (complaint.originType === 'production') return 'Producción / producto';
  return 'Otro / no sabe';
}

function emailStatusLabel(status: ComplaintEmailStatus): string {
  if (status === 'pending') return 'Sin enviar';
  if (status === 'sending') return 'Enviando';
  if (status === 'sent') return 'Enviado';
  return 'Falló';
}

function EmailStatusBadge({ status }: { status: ComplaintEmailStatus }) {
  const styles = status === 'sent'
    ? 'border-green-200 bg-green-50 text-green-800'
    : status === 'failed'
      ? 'border-red-200 bg-red-50 text-red-800'
      : status === 'sending'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-gray-200 bg-gray-50 text-gray-600';
  return <Badge variant="outline" className={styles}>{emailStatusLabel(status)}</Badge>;
}

function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ComplaintDetail({
  complaint,
  onStatusChange,
  onRetryEmail,
  onRefresh,
  onOpenAttachment,
  onClose,
}: ComplaintDetailProps) {
  const [action, setAction] = useState<DetailAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runStatusChange(status: ComplaintStatus) {
    setAction('status');
    setActionError(null);
    try {
      await onStatusChange(status);
    } catch (error) {
      setActionError(actionErrorMessage(error, 'No pudimos cambiar el estado. Inténtalo nuevamente.'));
    } finally {
      setAction(null);
    }
  }

  async function retryEmail(kind: 'confirmation' | 'notification') {
    setAction(kind);
    setActionError(null);
    try {
      await onRetryEmail([kind]);
    } catch (error) {
      setActionError(actionErrorMessage(error, 'No pudimos reintentar el correo. Inténtalo nuevamente.'));
    } finally {
      setAction(null);
    }
  }

  async function openAttachment(attachmentId: string) {
    setAction(`attachment:${attachmentId}`);
    setActionError(null);
    try {
      await onOpenAttachment(attachmentId);
    } catch (error) {
      setActionError(actionErrorMessage(error, 'No pudimos abrir esta evidencia. Inténtalo nuevamente.'));
    } finally {
      setAction(null);
    }
  }

  async function refreshDetail() {
    setAction('refresh');
    setActionError(null);
    try {
      await onRefresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, 'No pudimos actualizar el detalle. Inténtalo nuevamente.'));
    } finally {
      setAction(null);
    }
  }

  const nextStatus: ComplaintStatus = complaint.status === 'pending' ? 'attended' : 'pending';
  const statusActionLabel = nextStatus === 'attended' ? 'Marcar como atendido' : 'Reabrir';
  const hasSendingEmail = complaint.confirmationEmailStatus === 'sending'
    || complaint.notificationEmailStatus === 'sending';

  function confirmStatusChange() {
    const confirmed = window.confirm(nextStatus === 'attended'
      ? '¿Marcar este reclamo como atendido? Este cambio no envía ningún correo al cliente.'
      : '¿Reabrir este reclamo? Volverá a aparecer como pendiente.');
    if (confirmed) void runStatusChange(nextStatus);
  }

  const cardClassName = 'rounded-xl border border-gray-200 bg-white p-4';

  return (
    <article className="min-w-0 text-gray-900">
      <header className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={onClose} aria-label="Volver a la bandeja">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold">{complaint.caseNumber}</h2>
          <p className="text-sm text-gray-600">{originLabel(complaint)}</p>
          <p className="text-xs text-gray-500">{formatDate(complaint.createdAt)}</p>
        </div>
        <Badge className={complaint.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}>
          {complaint.status === 'pending' ? 'Pendiente' : 'Atendido'}
        </Badge>
      </header>

      {actionError && (
        <div role="alert" aria-live="assertive" className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{actionError}</p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <section aria-labelledby="complaint-contact-title" className={cardClassName}>
          <h3 id="complaint-contact-title" className="text-xs font-medium text-gray-500">Cliente</h3>
          <p className="mt-1 font-semibold" style={{ overflowWrap: 'anywhere' }}>{complaint.customerName || 'Sin nombre'}</p>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>{complaint.customerEmail}</span>
            </p>
            {complaint.customerPhone && (
              <p className="flex min-w-0 items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>{complaint.customerPhone}</span>
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="complaint-description-title" className={cardClassName}>
          <h3 id="complaint-description-title" className="text-xs font-medium text-gray-500">Reclamo</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800" style={{ overflowWrap: 'anywhere', lineHeight: 1.6 }}>{complaint.description}</p>
        </section>

        <section aria-labelledby="complaint-attachments-title" className={cardClassName}>
          <h3 id="complaint-attachments-title" className="text-xs font-medium text-gray-500">Evidencias ({complaint.attachments.length})</h3>
          {complaint.attachments.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Sin evidencias adjuntas.</p>
          ) : (
            <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {complaint.attachments.map(attachment => {
                const isOpening = action === `attachment:${attachment.id}`;
                const isImage = attachment.mimeType.startsWith('image/');
                return (
                  <li key={attachment.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => void openAttachment(attachment.id)}
                      disabled={action !== null}
                      title={attachment.originalName}
                      aria-label={`Abrir ${attachment.originalName}`}
                      className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-left transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-blue-700">
                        {isOpening
                          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          : isImage
                            ? <ImageIcon className="h-4 w-4" aria-hidden="true" />
                            : <FileText className="h-4 w-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-gray-800">{attachment.originalName}</span>
                        <span className="block text-xs text-gray-500">{formatFileSize(attachment.sizeBytes)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="complaint-email-title" className={cardClassName}>
          <h3 id="complaint-email-title" className="text-xs font-medium text-gray-500">Correos automáticos</h3>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Confirmación al cliente</span>
              <EmailStatusBadge status={complaint.confirmationEmailStatus} />
            </div>
            {complaint.confirmationEmailStatus === 'failed' && complaint.confirmationEmailError && <p className="text-xs text-red-600" style={{ overflowWrap: 'anywhere' }}>{complaint.confirmationEmailError}</p>}
            {complaint.confirmationEmailStatus === 'failed' && (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void retryEmail('confirmation')} disabled={action !== null}>
                {action === 'confirmation' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {action === 'confirmation' ? 'Reintentando…' : 'Reintentar confirmación'}
              </Button>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Aviso a central</span>
              <EmailStatusBadge status={complaint.notificationEmailStatus} />
            </div>
            {complaint.notificationEmailStatus === 'failed' && complaint.notificationEmailError && <p className="text-xs text-red-600" style={{ overflowWrap: 'anywhere' }}>{complaint.notificationEmailError}</p>}
            {complaint.notificationEmailStatus === 'failed' && (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void retryEmail('notification')} disabled={action !== null}>
                {action === 'notification' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {action === 'notification' ? 'Reintentando…' : 'Reintentar aviso central'}
              </Button>
            )}
            {hasSendingEmail && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void refreshDetail()} disabled={action !== null}>
                {action === 'refresh' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                {action === 'refresh' ? 'Actualizando…' : 'Actualizar estado de correos'}
              </Button>
            )}
          </div>
        </section>

        {complaint.status === 'attended' && (
          <div className="flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-900">
            <CalendarClock className="h-5 w-5 shrink-0" aria-hidden="true" />
            <p>Atendido {formatDate(complaint.attendedAt)}</p>
          </div>
        )}
      </div>

      <footer className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          className="h-12 text-white"
          style={{
            background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
            borderRadius: '12px',
            fontSize: '15px',
            fontWeight: 600,
          }}
          onClick={() => { window.location.href = buildComplaintMailto({
            email: complaint.customerEmail,
            caseNumber: complaint.caseNumber,
            customerName: complaint.customerName,
          }); }}
          disabled={action !== null}
        >
          <Mail aria-hidden="true" />
          Responder por correo
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-12 bg-white"
          style={{ borderRadius: '12px', fontSize: '15px', fontWeight: 600 }}
          disabled={action !== null}
          onClick={confirmStatusChange}
        >
          {action === 'status'
            ? <Loader2 className="animate-spin" aria-hidden="true" />
            : nextStatus === 'attended'
              ? <CheckCircle2 aria-hidden="true" />
              : <RotateCcw aria-hidden="true" />}
          {action === 'status' ? 'Actualizando…' : statusActionLabel}
        </Button>
      </footer>
    </article>
  );
}
