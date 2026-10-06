import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Inbox,
  Loader2,
  MailWarning,
  MapPin,
  RefreshCw,
  UserRound,
} from 'lucide-react';

import { PaginationControls } from '../../components/PaginationControls';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  DEFAULT_COMPLAINT_FILTERS,
  getComplaintEmptyMessage,
  mergeComplaintEmailStatuses,
  replaceComplaintInPage,
} from './adminPanelState';
import { ComplaintApiError, complaintsAPI } from './api';
import { ComplaintDetail } from './ComplaintDetail';
import { ComplaintFilters } from './ComplaintFilters';
import type {
  ComplaintDetail as ComplaintDetailData,
  ComplaintFilters as ComplaintFiltersValue,
  ComplaintPage,
  ComplaintStatus,
} from './types';

export interface ComplaintsPanelProps {
  accessToken: string;
  initialComplaintId?: string | null;
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

type PanelNotice = { tone: 'success' | 'warning'; message: string } | null;

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateFormatter.format(date);
}

function originLabel(originType: ComplaintDetailData['originType'], branchName: string | null): string {
  if (originType === 'branch') return branchName || 'Sucursal eliminada';
  if (originType === 'production') return 'Producción / producto';
  return 'Otro / no sabe';
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ComplaintApiError && error.message ? error.message : fallback;
}

export function ComplaintsPanel({ accessToken, initialComplaintId = null, onBack }: ComplaintsPanelProps) {
  const [filters, setFilters] = useState<ComplaintFiltersValue>({ ...DEFAULT_COMPLAINT_FILTERS });
  const [listState, setListState] = useState<ListState>({ kind: 'loading' });
  const [detailState, setDetailState] = useState<DetailState>({ kind: 'closed' });
  const [branchState, setBranchState] = useState<BranchState>({ kind: 'loading' });
  const [notice, setNotice] = useState<PanelNotice>(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const detailDialogRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);

  const loadList = useCallback(async (nextFilters: ComplaintFiltersValue, showLoading = true) => {
    const requestId = ++listRequestRef.current;
    if (showLoading) setListState({ kind: 'loading' });
    try {
      const page = await complaintsAPI.list(accessToken, nextFilters);
      if (requestId === listRequestRef.current) setListState({ kind: 'ready', page });
    } catch (error) {
      if (requestId !== listRequestRef.current) return;
      if (showLoading) {
        setListState({
          kind: 'error',
          message: safeErrorMessage(error, 'No pudimos cargar los reclamos. Revisa tu conexión e inténtalo nuevamente.'),
        });
      } else {
        setNotice({ tone: 'warning', message: 'El cambio se guardó, pero no pudimos actualizar la bandeja. Vuelve a intentarlo.' });
      }
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
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const requestId = ++detailRequestRef.current;
    setDetailState({ kind: 'loading', id });
    try {
      const complaint = await complaintsAPI.get(accessToken, id);
      if (requestId === detailRequestRef.current) setDetailState({ kind: 'ready', complaint });
    } catch (error) {
      if (requestId === detailRequestRef.current) {
        setDetailState({
          kind: 'error',
          id,
          message: safeErrorMessage(error, 'No pudimos cargar este reclamo. Inténtalo nuevamente.'),
        });
      }
    }
  }, [accessToken]);

  useEffect(() => {
    void loadList(filters);
  }, [filters, loadList]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  useEffect(() => {
    if (initialComplaintId) void openDetail(initialComplaintId);
  }, [initialComplaintId, openDetail]);

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
    detailRequestRef.current += 1;
    setDetailState({ kind: 'closed' });
    window.requestAnimationFrame(() => detailTriggerRef.current?.focus());
  }

  async function handleStatusChange(status: ComplaintStatus) {
    if (detailState.kind !== 'ready') return;
    try {
      const updated = await complaintsAPI.setStatus(accessToken, detailState.complaint.id, status);
      setDetailState({ kind: 'ready', complaint: updated });
      setListState(current => current.kind === 'ready'
        ? { kind: 'ready', page: replaceComplaintInPage(current.page, updated) }
        : current);
      setNotice({
        tone: 'success',
        message: status === 'attended' ? 'Reclamo marcado como atendido.' : 'Reclamo reabierto como pendiente.',
      });
      await loadList(filters, false);
    } catch (error) {
      throw new Error(safeErrorMessage(error, 'No pudimos cambiar el estado. Inténtalo nuevamente.'));
    }
  }

  async function handleRetryEmail(kinds: Array<'confirmation' | 'notification'>) {
    if (detailState.kind !== 'ready') return;
    const previous = detailState.complaint;
    const optimistic = mergeComplaintEmailStatuses(previous, {
      confirmationEmailStatus: kinds.includes('confirmation') ? 'sending' : previous.confirmationEmailStatus,
      notificationEmailStatus: kinds.includes('notification') ? 'sending' : previous.notificationEmailStatus,
    });
    setDetailState({ kind: 'ready', complaint: optimistic });
    try {
      const statuses = await complaintsAPI.retryEmails(accessToken, previous.id, kinds);
      const updated = mergeComplaintEmailStatuses(previous, statuses);
      setDetailState({ kind: 'ready', complaint: updated });
      setListState(current => current.kind === 'ready'
        ? { kind: 'ready', page: replaceComplaintInPage(current.page, updated) }
        : current);
      const requestedFailed = (kinds.includes('confirmation') && statuses.confirmationEmailStatus === 'failed')
        || (kinds.includes('notification') && statuses.notificationEmailStatus === 'failed');
      setNotice(requestedFailed
        ? { tone: 'warning', message: 'El correo volvió a fallar. Puedes reintentarlo desde el detalle.' }
        : { tone: 'success', message: 'Correo reenviado correctamente.' });
    } catch (error) {
      setDetailState(current => current.kind === 'ready' && current.complaint.id === previous.id
        ? { kind: 'ready', complaint: previous }
        : current);
      throw new Error(safeErrorMessage(error, 'No pudimos reintentar el correo. Inténtalo nuevamente.'));
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
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const branches = branchState.kind === 'ready' ? branchState.branches : [];

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="border-b border-gray-800 bg-gray-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <Button type="button" variant="ghost" size="icon" onClick={onBack} className="text-white hover:bg-white/10 hover:text-white" aria-label="Volver">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-300">Administración</p>
            <h1 className="text-2xl font-black tracking-tight">Reclamos</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${notice.tone === 'success' ? 'border-green-200 bg-green-50 text-green-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
          >
            <p>{notice.message}</p>
            <div className="flex gap-2">
              {notice.tone === 'warning' && <Button type="button" variant="outline" size="sm" onClick={() => void loadList(filters)}>Actualizar</Button>}
              <Button type="button" variant="ghost" size="sm" onClick={() => setNotice(null)}>Cerrar</Button>
            </div>
          </div>
        )}

        <ComplaintFilters
          value={filters}
          branches={branches}
          onChange={setFilters}
          disabled={listState.kind === 'loading'}
        />

        {branchState.kind === 'error' && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p>No pudimos cargar las sucursales. Los demás filtros siguen disponibles.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadBranches()}>
              <RefreshCw aria-hidden="true" />
              Reintentar sucursales
            </Button>
          </div>
        )}

        {listState.kind === 'loading' && (
          <section aria-label="Cargando reclamos" aria-busy="true" className="grid min-h-72 place-items-center rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="text-center text-gray-600">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-700" aria-hidden="true" />
              <p className="mt-3 text-sm">Cargando reclamos…</p>
            </div>
          </section>
        )}

        {listState.kind === 'error' && (
          <section role="alert" className="grid min-h-72 place-items-center rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <div className="max-w-md">
              <AlertCircle className="mx-auto h-10 w-10 text-red-700" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-bold">No pudimos cargar la bandeja</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{listState.message}</p>
              <Button type="button" className="mt-5" onClick={() => void loadList(filters)}>
                <RefreshCw aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          </section>
        )}

        {listState.kind === 'ready' && (
          <section aria-labelledby="complaints-list-title" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
              <div>
                <h2 id="complaints-list-title" className="font-bold">Bandeja de reclamos</h2>
                <p className="mt-1 text-sm text-gray-500">{listState.page.pagination.total} {listState.page.pagination.total === 1 ? 'caso' : 'casos'}</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadList(filters)}>
                <RefreshCw aria-hidden="true" />
                Actualizar
              </Button>
            </div>

            {listState.page.data.length === 0 ? (
              <div className="grid min-h-64 place-items-center px-6 py-12 text-center">
                <div>
                  <Inbox className="mx-auto h-11 w-11 text-gray-300" aria-hidden="true" />
                  <p className="mt-4 font-medium text-gray-700">{getComplaintEmptyMessage(filters)}</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {listState.page.data.map(complaint => (
                  <li key={complaint.id}>
                    <button
                      type="button"
                      onClick={() => void openDetail(complaint.id)}
                      className="group grid w-full min-w-0 gap-3 px-4 py-4 text-left transition hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-200 sm:px-5 lg:grid-cols-[minmax(9rem,0.8fr)_minmax(10rem,1fr)_minmax(13rem,1.4fr)_minmax(9rem,0.8fr)_auto] lg:items-center"
                      aria-label={`Abrir ${complaint.caseNumber}, ${complaint.status === 'pending' ? 'pendiente' : 'atendido'}`}
                    >
                      <div className="min-w-0">
                        <p className="break-words font-bold text-blue-800">{complaint.caseNumber}</p>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{originLabel(complaint.originType, complaint.branchName)}</span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <UserRound className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                          <span className="truncate">{complaint.customerName || 'Sin nombre'}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-gray-500">{complaint.customerEmail}</p>
                      </div>

                      <p className="min-w-0 break-words text-sm leading-5 text-gray-600 lg:line-clamp-2">{complaint.descriptionPreview}</p>

                      <p className="text-xs text-gray-500">{formatDate(complaint.createdAt)}</p>

                      <div className="flex items-center justify-between gap-3 lg:justify-end">
                        <div className="flex flex-wrap items-center gap-2">
                          {complaint.hasEmailFailure && (
                            <span title="Hay un correo automático fallido" className="inline-flex items-center text-red-700">
                              <MailWarning className="h-5 w-5" aria-hidden="true" />
                              <span className="sr-only">Correo automático fallido</span>
                            </span>
                          )}
                          <Badge className={complaint.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-green-100 text-green-800'}>
                            {complaint.status === 'pending' ? 'Pendiente' : 'Atendido'}
                          </Badge>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" aria-hidden="true" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-gray-200">
              <PaginationControls
                pagination={listState.page.pagination}
                onPageChange={page => setFilters(current => ({ ...current, page }))}
                compact={typeof window !== 'undefined' && window.innerWidth < 640}
              />
            </div>
          </section>
        )}
      </main>

      {detailState.kind !== 'closed' && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-2 sm:p-6" role="presentation">
          <section
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="complaint-detail-dialog-title"
            aria-describedby="complaint-detail-dialog-description"
            tabIndex={-1}
            onKeyDown={trapDetailFocus}
            className="max-h-[calc(100vh-1rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl outline-none focus-visible:ring-4 focus-visible:ring-blue-200 sm:max-h-[calc(100vh-3rem)] sm:p-6"
          >
          <h2 id="complaint-detail-dialog-title" className="sr-only">Detalle del reclamo</h2>
          <p id="complaint-detail-dialog-description" className="sr-only">Antecedentes, evidencias y acciones del reclamo seleccionado.</p>

          {detailState.kind === 'loading' && (
            <div aria-busy="true" className="grid min-h-80 place-items-center text-center text-gray-600">
              <div><Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-700" aria-hidden="true" /><p className="mt-3 text-sm">Cargando detalle…</p></div>
            </div>
          )}

          {detailState.kind === 'error' && (
            <div role="alert" className="grid min-h-80 place-items-center p-4 text-center">
              <div className="max-w-sm">
                <AlertCircle className="mx-auto h-10 w-10 text-red-700" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-bold">No pudimos cargar el detalle</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{detailState.message}</p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button type="button" onClick={() => void openDetail(detailState.id)}><RefreshCw aria-hidden="true" />Reintentar</Button>
                  <Button type="button" variant="outline" onClick={closeDetail}>Cerrar</Button>
                </div>
              </div>
            </div>
          )}

          {detailState.kind === 'ready' && (
            <ComplaintDetail
              complaint={detailState.complaint}
              onStatusChange={handleStatusChange}
              onRetryEmail={handleRetryEmail}
              onOpenAttachment={handleOpenAttachment}
              onClose={closeDetail}
            />
          )}
          </section>
        </div>
      )}
    </div>
  );
}
