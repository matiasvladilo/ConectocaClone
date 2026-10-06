import { useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  RotateCcw,
  UserRound,
  X,
} from 'lucide-react';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Separator } from '../../components/ui/separator';
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
  if (status === 'pending') return 'Pendiente';
  if (status === 'sending') return 'Enviando';
  if (status === 'sent') return 'Enviado';
  return 'Falló';
}

function EmailStatusBadge({ status }: { status: ComplaintEmailStatus }) {
  const styles = status === 'sent'
    ? 'border-green-200 bg-green-50 text-green-800'
    : status === 'failed'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-amber-200 bg-amber-50 text-amber-900';
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

  return (
    <article className="min-w-0 text-gray-900">
      <header className="flex items-start justify-between gap-4 pr-8">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Detalle del reclamo</p>
          <h2 className="mt-1 break-words text-2xl font-black tracking-tight">{complaint.caseNumber}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className={complaint.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}>
              {complaint.status === 'pending' ? 'Pendiente' : 'Atendido'}
            </Badge>
            <span className="text-sm text-gray-500">Recibido {formatDate(complaint.createdAt)}</span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar detalle">
          <X aria-hidden="true" />
        </Button>
      </header>

      {actionError && (
        <div role="alert" aria-live="assertive" className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{actionError}</p>
        </div>
      )}

      <section aria-labelledby="complaint-contact-title" className="mt-6 rounded-2xl bg-gray-50 p-4 sm:p-5">
        <h3 id="complaint-contact-title" className="font-bold">Cliente y origen</h3>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div className="flex min-w-0 gap-3">
            <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <div className="min-w-0"><dt className="text-gray-500">Nombre</dt><dd className="break-words font-medium">{complaint.customerName || 'No informado'}</dd></div>
          </div>
          <div className="flex min-w-0 gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <div className="min-w-0"><dt className="text-gray-500">Correo</dt><dd className="break-all font-medium">{complaint.customerEmail}</dd></div>
          </div>
          <div className="flex min-w-0 gap-3">
            <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <div className="min-w-0"><dt className="text-gray-500">Teléfono</dt><dd className="break-words font-medium">{complaint.customerPhone || 'No informado'}</dd></div>
          </div>
          <div className="flex min-w-0 gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <div className="min-w-0"><dt className="text-gray-500">Origen</dt><dd className="break-words font-medium">{originLabel(complaint)}</dd></div>
          </div>
        </dl>
      </section>

      <section aria-labelledby="complaint-description-title" className="mt-6">
        <h3 id="complaint-description-title" className="font-bold">Descripción</h3>
        <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-700">{complaint.description}</p>
      </section>

      <section aria-labelledby="complaint-attachments-title" className="mt-6">
        <h3 id="complaint-attachments-title" className="font-bold">Evidencias ({complaint.attachments.length})</h3>
        {complaint.attachments.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Este reclamo no incluye evidencias.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {complaint.attachments.map(attachment => {
              const isOpening = action === `attachment:${attachment.id}`;
              return (
                <li key={attachment.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-gray-200 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={attachment.originalName}>{attachment.originalName}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(attachment.sizeBytes)}</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void openAttachment(attachment.id)} disabled={action !== null}>
                    {isOpening ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                    <span className="hidden sm:inline">Abrir</span>
                    <span className="sr-only sm:hidden">Abrir {attachment.originalName}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Separator className="my-6" />

      <section aria-labelledby="complaint-email-title">
        <h3 id="complaint-email-title" className="font-bold">Correos automáticos</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Confirmación al cliente</p>
              <EmailStatusBadge status={complaint.confirmationEmailStatus} />
            </div>
            {complaint.confirmationEmailStatus === 'failed' && complaint.confirmationEmailError && <p className="mt-2 break-words text-xs text-red-700">{complaint.confirmationEmailError}</p>}
            {complaint.confirmationEmailStatus === 'failed' && (
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => void retryEmail('confirmation')} disabled={action !== null}>
                {action === 'confirmation' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {action === 'confirmation' ? 'Reintentando…' : 'Reintentar confirmación'}
              </Button>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Aviso a central</p>
              <EmailStatusBadge status={complaint.notificationEmailStatus} />
            </div>
            {complaint.notificationEmailStatus === 'failed' && complaint.notificationEmailError && <p className="mt-2 break-words text-xs text-red-700">{complaint.notificationEmailError}</p>}
            {complaint.notificationEmailStatus === 'failed' && (
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => void retryEmail('notification')} disabled={action !== null}>
                {action === 'notification' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                {action === 'notification' ? 'Reintentando…' : 'Reintentar aviso central'}
              </Button>
            )}
          </div>
        </div>
        {hasSendingEmail && (
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void refreshDetail()} disabled={action !== null}>
            {action === 'refresh' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {action === 'refresh' ? 'Actualizando…' : 'Actualizar estado de correos'}
          </Button>
        )}
      </section>

      {complaint.status === 'attended' && (
        <div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-900">
          <CalendarClock className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p>Atendido {formatDate(complaint.attendedAt)}</p>
        </div>
      )}

      <footer className="mt-6 grid gap-3 border-t border-gray-200 pt-5 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
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

        <Button type="button" className="h-11" disabled={action !== null} onClick={confirmStatusChange}>
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
