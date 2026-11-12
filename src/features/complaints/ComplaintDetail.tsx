import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';

import { complaintKindLabel, complaintKindNoun } from './complaintKinds';
import { buildComplaintMailto } from './mailto';
import { ComplaintKindIcon, KIND_COLOR, STATUS_COLOR } from './ComplaintKindBadge';
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

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  azul: '#007AFF',
  rojo: '#FF3B30',
  verde: '#34C759',
  naranja: '#FF9500',
};

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
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

function emailStatus(status: ComplaintEmailStatus): { texto: string; color: string } {
  if (status === 'pending') return { texto: 'Sin enviar', color: IOS.secundario };
  if (status === 'sending') return { texto: 'Enviando…', color: IOS.naranja };
  if (status === 'sent') return { texto: 'Enviado', color: IOS.verde };
  return { texto: 'Falló', color: IOS.rojo };
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
  const [confirmando, setConfirmando] = useState(false);

  async function run(next: Exclude<DetailAction, null>, task: () => Promise<void>, fallback: string) {
    setAction(next);
    setActionError(null);
    try {
      await task();
    } catch (error) {
      setActionError(actionErrorMessage(error, fallback));
    } finally {
      setAction(null);
    }
  }

  const nextStatus: ComplaintStatus = complaint.status === 'pending' ? 'attended' : 'pending';
  const hasSendingEmail = complaint.confirmationEmailStatus === 'sending'
    || complaint.notificationEmailStatus === 'sending';
  const pendiente = complaint.status === 'pending';
  const noun = complaintKindNoun(complaint.kind);
  // "sugerencia" y "felicitación" son femeninos: "esta felicitación … atendida".
  const femenino = complaint.kind !== 'complaint';

  function cambiarEstado() {
    setConfirmando(false);
    void run('status', () => onStatusChange(nextStatus), 'No pudimos cambiar el estado. Inténtalo nuevamente.');
  }

  function responder() {
    window.location.href = buildComplaintMailto({
      kind: complaint.kind,
      email: complaint.customerEmail,
      caseNumber: complaint.caseNumber,
      customerName: complaint.customerName,
    });
  }

  const correos: Array<{ kind: 'confirmation' | 'notification'; titulo: string; status: ComplaintEmailStatus; error: string | null; reintentar: string }> = [
    { kind: 'confirmation', titulo: 'Confirmación al cliente', status: complaint.confirmationEmailStatus, error: complaint.confirmationEmailError, reintentar: 'Reintentar confirmación' },
    { kind: 'notification', titulo: 'Aviso a central', status: complaint.notificationEmailStatus, error: complaint.notificationEmailError, reintentar: 'Reintentar aviso a central' },
  ];

  return (
    <article style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: IOS.texto }}>
      {/* Barra de la hoja */}
      <div style={{ flexShrink: 0, padding: '8px 16px 10px' }}>
        <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(60,60,67,0.3)', margin: '0 auto 10px' }} aria-hidden="true" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="truncate" style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{complaint.caseNumber}</h3>
            <p className="truncate" style={{ fontSize: 13, color: IOS.secundario, margin: 0 }}>{formatDate(complaint.createdAt)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"
            style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: '#E3E3E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
            <X style={{ width: 17, height: 17, color: '#3C3C43' }} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 16px 16px' }}>
        {/* Resumen */}
        <div style={{ ...tarjeta, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ComplaintKindIcon kind={complaint.kind} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 17, fontWeight: 600, margin: 0, color: KIND_COLOR[complaint.kind] }}>{complaintKindLabel(complaint.kind)}</p>
            <p className="truncate" style={{ fontSize: 15, color: IOS.secundario, margin: 0 }}>{originLabel(complaint)}</p>
          </div>
          <span style={{
            flexShrink: 0, height: 26, padding: '0 10px', borderRadius: 13, display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 13, fontWeight: 600, color: STATUS_COLOR[complaint.status], background: `${STATUS_COLOR[complaint.status]}1F`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: STATUS_COLOR[complaint.status] }} />
            {pendiente ? 'Pendiente' : 'Atendido'}
          </span>
        </div>

        {actionError && (
          <div role="alert" aria-live="assertive" style={{ ...tarjeta, marginTop: 12, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FFEBEA' }}>
            <AlertCircle style={{ width: 18, height: 18, color: IOS.rojo, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <p style={{ fontSize: 14, color: '#8A1C14', margin: 0 }}>{actionError}</p>
          </div>
        )}

        <Titulo>Cliente</Titulo>
        <div style={tarjeta}>
          <div style={{ padding: '12px 16px' }}>
            <p style={{ fontSize: 17, fontWeight: 600, margin: 0, overflowWrap: 'anywhere' }}>{complaint.customerName || 'Sin nombre'}</p>
          </div>
          <Separador />
          <a href={`mailto:${complaint.customerEmail}`} className="fila-ios" style={filaEnlace}>
            <Mail style={iconoFila} aria-hidden="true" />
            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: IOS.azul }}>{complaint.customerEmail}</span>
          </a>
          {complaint.customerPhone && (
            <>
              <Separador />
              <a href={`tel:${complaint.customerPhone.replace(/[^\d+]/g, '')}`} className="fila-ios" style={filaEnlace}>
                <Phone style={iconoFila} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: IOS.azul }}>{complaint.customerPhone}</span>
              </a>
            </>
          )}
        </div>

        <Titulo>Mensaje</Titulo>
        <div style={{ ...tarjeta, padding: '12px 16px' }}>
          <p style={{ fontSize: 16, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{complaint.description}</p>
        </div>

        <Titulo>{`Evidencias (${complaint.attachments.length})`}</Titulo>
        <div style={tarjeta}>
          {complaint.attachments.length === 0 ? (
            <p style={{ fontSize: 15, color: IOS.secundario, margin: 0, padding: '12px 16px' }}>Sin evidencias adjuntas.</p>
          ) : complaint.attachments.map((attachment, index) => {
            const isOpening = action === `attachment:${attachment.id}`;
            const isImage = attachment.mimeType.startsWith('image/');
            return (
              <div key={attachment.id}>
                {index > 0 && <Separador inset={60} />}
                <button
                  type="button"
                  onClick={() => void run(`attachment:${attachment.id}`, () => onOpenAttachment(attachment.id), 'No pudimos abrir esta evidencia. Inténtalo nuevamente.')}
                  disabled={action !== null}
                  aria-label={`Abrir ${attachment.originalName}`}
                  className="fila-ios"
                  style={{ width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', opacity: action !== null && !isOpening ? 0.5 : 1 }}
                >
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,122,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isOpening
                      ? <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: IOS.azul }} aria-hidden="true" />
                      : isImage
                        ? <ImageIcon style={{ width: 16, height: 16, color: IOS.azul }} aria-hidden="true" />
                        : <FileText style={{ width: 16, height: 16, color: IOS.azul }} aria-hidden="true" />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', fontSize: 16, color: IOS.texto }}>{attachment.originalName}</span>
                    <span style={{ display: 'block', fontSize: 13, color: IOS.secundario }}>{formatFileSize(attachment.sizeBytes)}</span>
                  </span>
                  <span style={{ fontSize: 15, color: IOS.azul, flexShrink: 0 }}>Ver</span>
                </button>
              </div>
            );
          })}
        </div>

        <Titulo>Correos automáticos</Titulo>
        <div style={tarjeta}>
          {correos.map((correo, index) => {
            const estado = emailStatus(correo.status);
            return (
              <div key={correo.kind}>
                {index > 0 && <Separador />}
                <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 16 }}>{correo.titulo}</span>
                  <span style={{ fontSize: 15, fontWeight: correo.status === 'failed' ? 600 : 400, color: estado.color }}>{estado.texto}</span>
                </div>
                {correo.status === 'failed' && correo.error && (
                  <p style={{ fontSize: 13, color: IOS.rojo, margin: 0, padding: '0 16px 8px', overflowWrap: 'anywhere' }}>{correo.error}</p>
                )}
                {correo.status === 'failed' && (
                  <>
                    <Separador />
                    <button
                      type="button"
                      onClick={() => void run(correo.kind, () => onRetryEmail([correo.kind]), 'No pudimos reintentar el correo. Inténtalo nuevamente.')}
                      disabled={action !== null}
                      className="fila-ios"
                      style={{ ...filaBotonAzul, opacity: action !== null && action !== correo.kind ? 0.5 : 1 }}
                    >
                      {action === correo.kind
                        ? <Loader2 className="animate-spin" style={{ width: 17, height: 17 }} aria-hidden="true" />
                        : <RotateCcw style={{ width: 17, height: 17 }} aria-hidden="true" />}
                      {action === correo.kind ? 'Reintentando…' : correo.reintentar}
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {hasSendingEmail && (
            <>
              <Separador />
              <button
                type="button"
                onClick={() => void run('refresh', onRefresh, 'No pudimos actualizar el detalle. Inténtalo nuevamente.')}
                disabled={action !== null}
                className="fila-ios"
                style={filaBotonAzul}
              >
                {action === 'refresh'
                  ? <Loader2 className="animate-spin" style={{ width: 17, height: 17 }} aria-hidden="true" />
                  : <RefreshCw style={{ width: 17, height: 17 }} aria-hidden="true" />}
                {action === 'refresh' ? 'Actualizando…' : 'Actualizar estado de correos'}
              </button>
            </>
          )}
        </div>

        {complaint.status === 'attended' && (
          <p style={{ fontSize: 13, color: IOS.secundario, margin: '8px 16px 0' }}>
            Atendido el {formatDate(complaint.attendedAt)}
          </p>
        )}
      </div>

      {/* Acciones */}
      <div style={{ flexShrink: 0, padding: '10px 16px max(env(safe-area-inset-bottom), 16px)', borderTop: `0.5px solid ${IOS.separador}`, background: 'rgba(242,242,247,0.94)' }}>
        {confirmando ? (
          <div>
            <p style={{ fontSize: 14, color: IOS.secundario, textAlign: 'center', margin: '0 8px 10px', lineHeight: 1.4 }}>
              {nextStatus === 'attended'
                ? `¿Marcar ${femenino ? 'esta' : 'este'} ${noun} como ${femenino ? 'atendida' : 'atendido'}? No se envía ningún correo al cliente.`
                : `¿Reabrir ${femenino ? 'esta' : 'este'} ${noun}? Volverá a aparecer como pendiente.`}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setConfirmando(false)} className="boton-ios"
                style={{ ...botonBase, flex: 1, background: '#E3E3E8', color: IOS.texto }}>
                Cancelar
              </button>
              <button type="button" onClick={cambiarEstado} className="boton-ios"
                style={{ ...botonBase, flex: 1, background: nextStatus === 'attended' ? IOS.verde : IOS.naranja, color: '#fff' }}>
                {nextStatus === 'attended' ? 'Sí, atendido' : 'Sí, reabrir'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={responder} disabled={action !== null} className="boton-ios"
              style={{ ...botonBase, flex: 1, background: IOS.azul, color: '#fff', opacity: action !== null ? 0.5 : 1 }}>
              <Mail style={{ width: 18, height: 18 }} aria-hidden="true" />
              Responder
            </button>
            <button type="button" onClick={() => setConfirmando(true)} disabled={action !== null} className="boton-ios"
              style={{
                ...botonBase, flex: 1, opacity: action !== null && action !== 'status' ? 0.5 : 1,
                background: pendiente ? 'rgba(52,199,89,0.15)' : '#E3E3E8',
                color: pendiente ? '#248A3D' : IOS.texto,
              }}>
              {action === 'status'
                ? <Loader2 className="animate-spin" style={{ width: 18, height: 18 }} aria-hidden="true" />
                : pendiente
                  ? <CheckCircle2 style={{ width: 18, height: 18 }} aria-hidden="true" />
                  : <RotateCcw style={{ width: 18, height: 18 }} aria-hidden="true" />}
              {action === 'status' ? 'Guardando…' : pendiente ? 'Marcar atendido' : 'Reabrir'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const filaEnlace: React.CSSProperties = {
  minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', fontSize: 16, textDecoration: 'none',
};

const iconoFila: React.CSSProperties = { width: 18, height: 18, color: IOS.secundario, flexShrink: 0 };

const filaBotonAzul: React.CSSProperties = {
  width: '100%', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  border: 'none', background: 'transparent', fontSize: 16, color: IOS.azul, cursor: 'pointer',
};

const botonBase: React.CSSProperties = {
  height: 50, borderRadius: 12, border: 'none', fontSize: 17, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h4 style={{ fontSize: 13, fontWeight: 400, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '22px 16px 7px' }}>
      {children}
    </h4>
  );
}

function Separador({ inset = 16 }: { inset?: number }) {
  return <div style={{ height: 0.5, background: IOS.separador, marginLeft: inset }} />;
}
