import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  MailWarning,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  ComplaintDetailRequestGuard,
  complaintStatusCountFilters,
  DEFAULT_COMPLAINT_FILTERS,
  getComplaintEmptyMessage,
  mergeComplaintEmailStatuses,
  normalizeComplaintPage,
  replaceComplaintInPage,
  requestedEmailsAreSending,
  type ComplaintDetailRequestToken,
  type ComplaintEmailKind,
} from './adminPanelState';
import { ComplaintApiError, complaintsAPI } from './api';
import { ComplaintDetail } from './ComplaintDetail';
import { BuscadorReclamos, ComplaintFilters } from './ComplaintFilters';
import { ComplaintKindIcon, STATUS_COLOR } from './ComplaintKindBadge';
import { ComplaintQrDownload } from './ComplaintQrDownload';
import { complaintKindLabel } from './complaintKinds';
import { resolveComplaintQrOrigin } from './complaintQr';
import type {
  ComplaintDetail as ComplaintDetailData,
  ComplaintFilters as ComplaintFiltersValue,
  ComplaintPage,
  ComplaintStatus,
} from './types';

export interface ComplaintsPanelProps {
  accessToken: string;
  initialComplaintId?: string | null;
  onComplaintClose?: () => void;
  onBack: () => void;
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; page: ComplaintPage };

type DetailState =
  | { kind: 'closed' }
  | { kind: 'loading'; id: string }
  | { kind: 'error'; id: string; message: string }
  | { kind: 'ready'; complaint: ComplaintDetailData };

type BranchState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; branches: Array<{ id: string; name: string }> };

type StatusCounts = { pending: number; attended: number } | null | 'error';


const EMAIL_RECONCILIATION_ATTEMPTS = 4;
const EMAIL_RECONCILIATION_DELAY_MS = 750;

const horaFormatter = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const diaFormatter = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' });
const diaAnioFormatter = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

/** Como la lista de Mail: hoy → hora, ayer → "Ayer", este año → "3 nov", antes → con año. */
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const t = date.getTime();
  if (t >= inicioHoy) return horaFormatter.format(date);
  if (t >= inicioHoy - 86_400_000) return 'Ayer';
  return date.getFullYear() === hoy.getFullYear() ? diaFormatter.format(date) : diaAnioFormatter.format(date);
}

function originLabel(originType: ComplaintDetailData['originType'], branchName: string | null): string {
  if (originType === 'branch') return branchName || 'Sucursal eliminada';
  if (originType === 'production') return 'Producción / producto';
  return 'Otro / no sabe';
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ComplaintApiError && error.message ? error.message : fallback;
}

function waitForReconciliation(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve(true);
    }, EMAIL_RECONCILIATION_DELAY_MS);
    const handleAbort = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

export function ComplaintsPanel({ accessToken, initialComplaintId = null, onComplaintClose, onBack }: ComplaintsPanelProps) {
  const [filters, setFilters] = useState<ComplaintFiltersValue>({ ...DEFAULT_COMPLAINT_FILTERS });
  const [listState, setListState] = useState<ListState>({ kind: 'loading' });
  const [detailState, setDetailState] = useState<DetailState>({ kind: 'closed' });
  const [branchState, setBranchState] = useState<BranchState>({ kind: 'loading' });
  const [counts, setCounts] = useState<StatusCounts>(null);
  const countsRequestRef = useRef(0);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const detailDialogRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const filtersRef = useRef(filters);
  const detailStateRef = useRef<DetailState>(detailState);
  const mountedRef = useRef(true);
  const detailOperationGuardRef = useRef(new ComplaintDetailRequestGuard());

  const setCurrentFilters = useCallback((next: ComplaintFiltersValue) => {
    filtersRef.current = next;
    setFilters(next);
  }, []);

  const commitDetailState = useCallback((next: DetailState) => {
    detailStateRef.current = next;
    if (mountedRef.current) setDetailState(next);
  }, []);

  function openComplaintId(): string | null {
    const current = detailStateRef.current;
    if (current.kind === 'closed') return null;
    return current.kind === 'ready' ? current.complaint.id : current.id;
  }

  function detailOperationIsCurrent(token: ComplaintDetailRequestToken): boolean {
    return mountedRef.current
      && detailOperationGuardRef.current.isCurrent(token, openComplaintId());
  }

  const loadList = useCallback(async (nextFilters: ComplaintFiltersValue, showLoading = true) => {
    const requestId = ++listRequestRef.current;
    if (showLoading) setListState({ kind: 'loading' });
    try {
      const page = await complaintsAPI.list(accessToken, nextFilters);
      if (requestId !== listRequestRef.current || nextFilters !== filtersRef.current) return;
      const normalizedPage = normalizeComplaintPage(nextFilters.page, page.pagination.totalPages);
      if (normalizedPage !== nextFilters.page) {
        setCurrentFilters({ ...nextFilters, page: normalizedPage });
        return;
      }
      setListState({ kind: 'ready', page });
    } catch (error) {
      if (requestId !== listRequestRef.current || nextFilters !== filtersRef.current) return;
      if (showLoading) {
        setListState({
          kind: 'error',
          message: safeErrorMessage(error, 'No pudimos cargar los mensajes. Revisa tu conexión e inténtalo nuevamente.'),
        });
      } else {
        toast.warning('El cambio se guardó, pero no pudimos actualizar la bandeja.', {
          action: { label: 'Actualizar', onClick: () => void loadList(filtersRef.current) },
        });
      }
    }
  }, [accessToken, setCurrentFilters]);

  // Los totales ignoran la búsqueda y los filtros activos: describen la bandeja completa.
  const loadCounts = useCallback(async () => {
    const requestId = ++countsRequestRef.current;
    try {
      const [pending, attended] = await Promise.all([
        complaintsAPI.list(accessToken, complaintStatusCountFilters('pending')),
        complaintsAPI.list(accessToken, complaintStatusCountFilters('attended')),
      ]);
      if (requestId !== countsRequestRef.current || !mountedRef.current) return;
      setCounts({ pending: pending.pagination.total, attended: attended.pagination.total });
    } catch {
      if (requestId !== countsRequestRef.current || !mountedRef.current) return;
      setCounts('error');
    }
  }, [accessToken]);

  const loadBranches = useCallback(async () => {
    setBranchState({ kind: 'loading' });
    try {
      const config = await complaintsAPI.getPublicConfig();
      setBranchState({ kind: 'ready', branches: config.branches });
    } catch {
      setBranchState({ kind: 'error' });
    }
  }, []);

  const openDetail = useCallback(async (id: string) => {
    if (detailStateRef.current.kind === 'closed') {
      const activeElement = document.activeElement;
      detailTriggerRef.current = activeElement instanceof HTMLElement
        && activeElement.isConnected
        && !detailDialogRef.current?.contains(activeElement)
        ? activeElement
        : null;
    }
    detailOperationGuardRef.current.invalidate();
    const requestId = ++detailRequestRef.current;
    commitDetailState({ kind: 'loading', id });
    try {
      const complaint = await complaintsAPI.get(accessToken, id);
      if (requestId === detailRequestRef.current) commitDetailState({ kind: 'ready', complaint });
    } catch (error) {
      if (requestId === detailRequestRef.current) {
        commitDetailState({
          kind: 'error',
          id,
          message: safeErrorMessage(error, 'No pudimos cargar este mensaje. Inténtalo nuevamente.'),
        });
      }
    }
  }, [accessToken, commitDetailState]);

  useEffect(() => {
    void loadList(filters);
  }, [filters, loadList]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    if (initialComplaintId) void openDetail(initialComplaintId);
  }, [initialComplaintId, openDetail]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      listRequestRef.current += 1;
      detailRequestRef.current += 1;
      detailOperationGuardRef.current.invalidate();
    };
  }, []);

  useEffect(() => {
    if (detailState.kind === 'closed') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => detailDialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [detailState.kind]);

  function closeDetail() {
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    detailRequestRef.current += 1;
    detailOperationGuardRef.current.invalidate();
    commitDetailState({ kind: 'closed' });
    onComplaintClose?.();
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected && !trigger.closest('[role="dialog"]')) trigger.focus();
    });
  }

  async function handleStatusChange(status: ComplaintStatus) {
    const current = detailStateRef.current;
    if (current.kind !== 'ready') return;
    const token = detailOperationGuardRef.current.begin(current.complaint.id);
    try {
      const updated = await complaintsAPI.setStatus(accessToken, current.complaint.id, status);
      if (!detailOperationIsCurrent(token)) return;
      commitDetailState({ kind: 'ready', complaint: updated });
      setListState(current => current.kind === 'ready'
        ? { kind: 'ready', page: replaceComplaintInPage(current.page, updated) }
        : current);
      toast.success(status === 'attended' ? 'Marcado como atendido' : 'Reabierto como pendiente');
      void loadCounts();
      await loadList(filtersRef.current, false);
    } catch (error) {
      if (!detailOperationIsCurrent(token)) return;
      throw new Error(safeErrorMessage(error, 'No pudimos cambiar el estado. Inténtalo nuevamente.'));
    }
  }

  function applyDetailToOpenComplaint(token: ComplaintDetailRequestToken, complaint: ComplaintDetailData): boolean {
    if (!detailOperationIsCurrent(token)) return false;
    commitDetailState({ kind: 'ready', complaint });
    setListState(current => current.kind === 'ready'
      ? { kind: 'ready', page: replaceComplaintInPage(current.page, complaint) }
      : current);
    return true;
  }

  async function reconcileEmailSending(
    token: ComplaintDetailRequestToken,
    kinds: ComplaintEmailKind[],
  ): Promise<ComplaintDetailData | null> {
    let latest = detailStateRef.current.kind === 'ready' ? detailStateRef.current.complaint : null;
    let lastReadFailed = false;

    for (let attempt = 0; attempt < EMAIL_RECONCILIATION_ATTEMPTS; attempt += 1) {
      if (attempt > 0 && !await waitForReconciliation(token.signal)) return null;
      if (!detailOperationIsCurrent(token)) return null;
      try {
        const refreshed = await complaintsAPI.get(accessToken, token.complaintId);
        lastReadFailed = false;
        if (!applyDetailToOpenComplaint(token, refreshed)) return null;
        latest = refreshed;
        if (!requestedEmailsAreSending(refreshed, kinds)) return refreshed;
      } catch {
        lastReadFailed = true;
      }
    }

    if (detailOperationIsCurrent(token)) {
      toast.warning(lastReadFailed
        ? 'No pudimos confirmar el resultado del correo. Actualiza el detalle para volver a consultarlo.'
        : 'El correo sigue procesándose. Actualiza el detalle para confirmar el resultado.');
    }
    return latest;
  }

  function setEmailResultNotice(complaint: ComplaintDetailData, kinds: ComplaintEmailKind[]) {
    const requestedFailed = kinds.some(kind => kind === 'confirmation'
      ? complaint.confirmationEmailStatus === 'failed'
      : complaint.notificationEmailStatus === 'failed');
    if (requestedFailed) toast.warning('El correo volvió a fallar. Puedes reintentarlo desde el detalle.');
    else toast.success('Correo reenviado');
  }

  async function handleRetryEmail(kinds: ComplaintEmailKind[]) {
    const current = detailStateRef.current;
    if (current.kind !== 'ready') return;
    const previous = current.complaint;
    const token = detailOperationGuardRef.current.begin(previous.id);
    const optimistic = mergeComplaintEmailStatuses(previous, {
      confirmationEmailStatus: kinds.includes('confirmation') ? 'sending' : previous.confirmationEmailStatus,
      notificationEmailStatus: kinds.includes('notification') ? 'sending' : previous.notificationEmailStatus,
    }, kinds);
    applyDetailToOpenComplaint(token, optimistic);
    try {
      const statuses = await complaintsAPI.retryEmails(accessToken, previous.id, kinds);
      if (!detailOperationIsCurrent(token)) return;
      const updated = mergeComplaintEmailStatuses(previous, statuses, kinds);
      if (!applyDetailToOpenComplaint(token, updated)) return;
      if (requestedEmailsAreSending(statuses, kinds)) {
        const reconciled = await reconcileEmailSending(token, kinds);
        if (reconciled && detailOperationIsCurrent(token)
          && !requestedEmailsAreSending(reconciled, kinds)) {
          setEmailResultNotice(reconciled, kinds);
        }
        return;
      }
      setEmailResultNotice(updated, kinds);
    } catch (error) {
      if (!detailOperationIsCurrent(token)) return;
      applyDetailToOpenComplaint(token, previous);
      throw new Error(safeErrorMessage(error, 'No pudimos reintentar el correo. Inténtalo nuevamente.'));
    }
  }

  async function handleRefreshDetail() {
    const current = detailStateRef.current;
    if (current.kind !== 'ready') return;
    const token = detailOperationGuardRef.current.begin(current.complaint.id);
    try {
      const refreshed = await complaintsAPI.get(accessToken, current.complaint.id);
      if (!applyDetailToOpenComplaint(token, refreshed)) return;
      if (!requestedEmailsAreSending(refreshed, ['confirmation', 'notification'])) {
        toast.success('Detalle actualizado');
      }
    } catch (error) {
      if (!detailOperationIsCurrent(token)) return;
      throw new Error(safeErrorMessage(error, 'No pudimos actualizar el detalle. Inténtalo nuevamente.'));
    }
  }

  async function handleOpenAttachment(attachmentId: string) {
    try {
      const { url } = await complaintsAPI.createAttachmentUrl(accessToken, attachmentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      throw new Error(safeErrorMessage(error, 'No pudimos abrir esta evidencia. Inténtalo nuevamente.'));
    }
  }

  function trapDetailFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (activeElement === event.currentTarget || !event.currentTarget.contains(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const branches = branchState.kind === 'ready' ? branchState.branches : [];
  const conteos = counts && counts !== 'error' ? counts : null;
  const refreshAll = () => {
    void loadList(filtersRef.current);
    void loadCounts();
  };
  const pildoras: Array<{ key: ComplaintFiltersValue['status']; label: string; color: string; total: number | null }> = [
    { key: '', label: 'Todos', color: IOS.azul, total: conteos ? conteos.pending + conteos.attended : null },
    { key: 'pending', label: 'Pendientes', color: STATUS_COLOR.pending, total: conteos?.pending ?? null },
    { key: 'attended', label: 'Atendidos', color: STATUS_COLOR.attended, total: conteos?.attended ?? null },
  ];
  const cargando = listState.kind === 'loading';

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-7xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" className="boton-ios" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Reclamos</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Mensajes de clientes desde el QR</p>
            </div>
            <button type="button" onClick={refreshAll} disabled={cargando} aria-label="Actualizar" className="boton-ios" style={botonRedondo}>
              <RefreshCw className={cargando ? 'animate-spin' : ''} style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
            <ComplaintQrDownload
              publicUrl={resolveComplaintQrOrigin(
                import.meta.env.VITE_APP_PUBLIC_URL as string | undefined,
                window.location.origin,
              )}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <BuscadorReclamos value={filters} onChange={setCurrentFilters} />
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Estado */}
        <div className="sin-scrollbar" role="group" aria-label="Estado" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 12px', padding: '0 16px' }}>
          {pildoras.map(p => {
            const activo = filters.status === p.key;
            return (
              <button
                key={p.key || 'todos'}
                type="button"
                aria-pressed={activo}
                onClick={() => setCurrentFilters({ ...filtersRef.current, status: p.key, page: 1 })}
                style={{
                  flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: activo ? 600 : 500,
                  background: activo ? p.color : IOS.tarjeta, color: activo ? '#fff' : IOS.texto,
                  boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
                }}
              >
                {!activo && p.key && <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />}
                {p.label}
                <span style={{ fontSize: 12, fontWeight: 600, opacity: activo ? 0.9 : 0.5 }}>{counts === 'error' ? '—' : p.total ?? '…'}</span>
              </button>
            );
          })}
        </div>

        <ComplaintFilters value={filters} branches={branches} onChange={setCurrentFilters} disabled={cargando} />

        {branchState.kind === 'error' && (
          <button type="button" onClick={() => void loadBranches()}
            style={{ display: 'block', width: '100%', border: 'none', background: 'transparent', fontSize: 13, color: IOS.secundario, textAlign: 'left', padding: '8px 16px 0', cursor: 'pointer' }}>
            No se cargaron las sucursales. <span style={{ color: IOS.azul }}>Reintentar</span>
          </button>
        )}

        {/* Lista */}
        <section aria-labelledby="complaints-list-title" style={{ marginTop: 20 }}>
          <h2 id="complaints-list-title" style={{ fontSize: 13, fontWeight: 400, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '0 16px 7px' }}>
            {listState.kind === 'ready'
              ? `${listState.page.pagination.total} ${listState.page.pagination.total === 1 ? 'mensaje' : 'mensajes'}`
              : 'Mensajes'}
          </h2>

          {listState.kind === 'loading' && (
            <div aria-busy="true" aria-label="Cargando mensajes" style={{ ...tarjeta, padding: '48px 16px', display: 'flex', justifyContent: 'center' }}>
              <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: IOS.secundario }} aria-hidden="true" />
            </div>
          )}

          {listState.kind === 'error' && (
            <div role="alert" style={{ ...tarjeta, padding: '32px 20px', textAlign: 'center' }}>
              <AlertCircle style={{ width: 36, height: 36, color: IOS.rojo, margin: '0 auto 10px' }} aria-hidden="true" />
              <p style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>No pudimos cargar la bandeja</p>
              <p style={{ fontSize: 15, color: IOS.secundario, margin: '0 0 14px' }}>{listState.message}</p>
              <button type="button" onClick={refreshAll} className="boton-ios"
                style={{ height: 40, padding: '0 18px', borderRadius: 20, border: 'none', background: IOS.azul, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                Reintentar
              </button>
            </div>
          )}

          {listState.kind === 'ready' && (listState.page.data.length === 0 ? (
            <div style={{ ...tarjeta, padding: '40px 20px', textAlign: 'center' }}>
              <Inbox style={{ width: 40, height: 40, color: '#C7C7CC', margin: '0 auto 10px' }} aria-hidden="true" />
              <p style={{ fontSize: 16, color: IOS.secundario, margin: 0 }}>{getComplaintEmptyMessage(filters)}</p>
            </div>
          ) : (
            <ul style={{ ...tarjeta, listStyle: 'none', margin: 0, padding: 0 }}>
              {listState.page.data.map((complaint, index) => {
                const pendiente = complaint.status === 'pending';
                return (
                  <li key={complaint.id}>
                    {index > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 64 }} />}
                    <button
                      type="button"
                      onClick={() => void openDetail(complaint.id)}
                      className="fila-ios"
                      aria-label={`Abrir ${complaint.caseNumber}, ${complaintKindLabel(complaint.kind)}, ${pendiente ? 'pendiente' : 'atendido'}`}
                      style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 12px 12px 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <ComplaintKindIcon kind={complaint.kind} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {pendiente && <span title="Pendiente" style={{ width: 8, height: 8, borderRadius: 4, background: STATUS_COLOR.pending, flexShrink: 0 }} />}
                          <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: IOS.texto }}>
                            {complaint.caseNumber}
                          </span>
                          {complaint.hasEmailFailure && (
                            <MailWarning style={{ width: 15, height: 15, color: IOS.rojo, flexShrink: 0 }} aria-label="Correo automático fallido" />
                          )}
                          <span style={{ fontSize: 14, color: IOS.secundario, flexShrink: 0 }}>{formatDate(complaint.createdAt)}</span>
                          <ChevronRight style={{ width: 16, height: 16, color: '#C7C7CC', flexShrink: 0 }} aria-hidden="true" />
                        </div>
                        <p className="truncate" style={{ fontSize: 14, color: IOS.secundario, margin: '1px 0 0' }}>
                          {complaintKindLabel(complaint.kind)} · {originLabel(complaint.originType, complaint.branchName)}
                          {!pendiente && <span style={{ color: STATUS_COLOR.attended }}> · Atendido</span>}
                        </p>
                        <p style={{
                          fontSize: 15, color: '#3C3C43', margin: '3px 0 0', lineHeight: 1.35, overflow: 'hidden',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere',
                        }}>
                          {complaint.descriptionPreview}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

          {listState.kind === 'ready' && listState.page.pagination.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
              <button type="button" disabled={!listState.page.pagination.hasPrev}
                onClick={() => setCurrentFilters({ ...filtersRef.current, page: listState.page.pagination.page - 1 })}
                className="boton-ios" style={{ ...botonPagina, opacity: listState.page.pagination.hasPrev ? 1 : 0.4 }}>
                <ChevronLeft style={{ width: 18, height: 18 }} aria-hidden="true" /> Anterior
              </button>
              <span style={{ fontSize: 14, color: IOS.secundario }}>
                Página {listState.page.pagination.page} de {listState.page.pagination.totalPages}
              </span>
              <button type="button" disabled={!listState.page.pagination.hasNext}
                onClick={() => setCurrentFilters({ ...filtersRef.current, page: listState.page.pagination.page + 1 })}
                className="boton-ios" style={{ ...botonPagina, opacity: listState.page.pagination.hasNext ? 1 : 0.4 }}>
                Siguiente <ChevronRight style={{ width: 18, height: 18 }} aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      </main>

      {createPortal(
        <AnimatePresence>
          {detailState.kind !== 'closed' && (
            <>
              <motion.div key="fondo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeDetail}
                role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50 }} />
              <motion.section
                key="hoja"
                ref={detailDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="complaint-detail-dialog-title"
                aria-describedby="complaint-detail-dialog-description"
                tabIndex={-1}
                onKeyDown={trapDetailFocus}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                style={{
                  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 51, margin: '0 auto', maxWidth: 640, height: '92dvh',
                  background: IOS.fondo, borderRadius: '14px 14px 0 0', display: 'flex', flexDirection: 'column', outline: 'none',
                }}
              >
                <h2 id="complaint-detail-dialog-title" className="sr-only">Detalle del mensaje</h2>
                <p id="complaint-detail-dialog-description" className="sr-only">Antecedentes, evidencias y acciones del mensaje seleccionado.</p>

                {detailState.kind === 'loading' && (
                  <div aria-busy="true" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 className="animate-spin" style={{ width: 26, height: 26, color: IOS.secundario }} aria-hidden="true" />
                  </div>
                )}

                {detailState.kind === 'error' && (
                  <div role="alert" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
                    <AlertCircle style={{ width: 40, height: 40, color: IOS.rojo, marginBottom: 12 }} aria-hidden="true" />
                    <p style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px' }}>No pudimos cargar el detalle</p>
                    <p style={{ fontSize: 15, color: IOS.secundario, margin: '0 0 20px' }}>{detailState.message}</p>
                    <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
                      <button type="button" onClick={closeDetail} className="boton-ios"
                        style={{ ...botonPagina, flex: 1, justifyContent: 'center', height: 50, borderRadius: 12, background: '#E3E3E8', color: IOS.texto }}>Cerrar</button>
                      <button type="button" onClick={() => void openDetail(detailState.id)} className="boton-ios"
                        style={{ ...botonPagina, flex: 1, justifyContent: 'center', height: 50, borderRadius: 12, background: IOS.azul, color: '#fff' }}>Reintentar</button>
                    </div>
                  </div>
                )}

                {detailState.kind === 'ready' && (
                  <ComplaintDetail
                    key={detailState.complaint.id}
                    complaint={detailState.complaint}
                    onStatusChange={handleStatusChange}
                    onRetryEmail={handleRetryEmail}
                    onRefresh={handleRefreshDetail}
                    onOpenAttachment={handleOpenAttachment}
                    onClose={closeDetail}
                  />
                )}
              </motion.section>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  azul: '#007AFF',
  rojo: '#FF3B30',
};

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
};

const botonPagina: React.CSSProperties = {
  height: 36, padding: '0 12px', borderRadius: 18, border: 'none', background: IOS.tarjeta, color: IOS.azul,
  fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
};
