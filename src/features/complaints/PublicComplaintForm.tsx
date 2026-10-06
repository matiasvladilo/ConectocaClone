import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  MessageSquareText,
  PackageOpen,
  RotateCw,
  Send,
  UserRound,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';

import { complaintsAPI } from './api';
import { ComplaintAttachmentsInput } from './ComplaintAttachmentsInput';
import { firstInvalidComplaintField } from './formAccessibility';
import {
  getInvalidBranchMessage,
  getPublicComplaintRecovery,
  getServerRecoveryFocusTargets,
  prepareDraftForConfigRefresh,
  type PublicConfigRefreshMode,
  type PublicComplaintRecovery,
} from './submissionRecovery';
import type {
  ComplaintDraft,
  ComplaintOrigin,
  ComplaintValidationErrors,
  PublicComplaintConfig,
} from './types';
import { validateComplaintDraft } from './validation';

type PublicFormState = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

const EMPTY_COMPLAINT_DRAFT: ComplaintDraft = {
  originType: 'branch',
  branchId: '',
  email: '',
  name: '',
  phone: '',
  description: '',
  files: [],
};

const fieldClassName = 'h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';
const fieldErrorClassName = `${fieldClassName} border-red-500 focus:border-red-600 focus:ring-red-100`;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1.5 text-sm text-red-700" role="alert">{message}</p>;
}

function ComplaintFormSkeleton() {
  return (
    <div role="status" aria-label="Cargando formulario" className="min-h-screen animate-pulse bg-gray-100">
      <div className="h-40 bg-gray-900" />
      <div className="mx-auto -mt-8 max-w-2xl space-y-4 px-4 pb-12">
        <div className="h-64 rounded-3xl bg-white shadow-xl" />
        <div className="h-64 rounded-3xl bg-white shadow-xl" />
      </div>
    </div>
  );
}

function ComplaintLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-gray-50 p-6">
      <section className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-xl">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-700">
          <AlertCircle className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-gray-900">No pudimos cargar el formulario</h1>
        <p className="mt-3 text-gray-600">Revisa tu conexión e inténtalo nuevamente.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
        >
          <RotateCw className="h-5 w-5" aria-hidden="true" />
          Reintentar
        </button>
      </section>
    </main>
  );
}

function ComplaintSuccess({ result }: { result: { caseNumber: string; receivedAt: string } }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-blue-700 to-blue-900 p-6">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl" role="status" aria-live="polite" aria-atomic="true">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-green-100 text-green-700">
          <CheckCircle2 className="h-11 w-11" aria-hidden="true" />
        </span>
        <p className="mt-6 text-sm font-bold uppercase tracking-widest text-blue-700">Envío confirmado</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-2 text-3xl font-bold text-gray-900">Recibimos tu reclamo</h1>
        <p className="mt-6 text-sm text-gray-500">Tu número de caso es</p>
        <p className="mt-1 break-words text-3xl font-black tracking-tight text-blue-900">{result.caseNumber}</p>
        <p className="mt-5 leading-7 text-gray-600">
          Guarda este número. Recibirás la respuesta por correo.
        </p>
      </section>
    </main>
  );
}

export function PublicComplaintForm() {
  const [state, setState] = useState<PublicFormState>('loading');
  const [config, setConfig] = useState<PublicComplaintConfig | null>(null);
  const [draft, setDraft] = useState<ComplaintDraft>(EMPTY_COMPLAINT_DRAFT);
  const [errors, setErrors] = useState<ComplaintValidationErrors>({});
  const [result, setResult] = useState<{ caseNumber: string; receivedAt: string } | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const submissionLocked = useRef(false);
  const errorSummaryRef = useRef<HTMLElement>(null);
  const recoveryAlertRef = useRef<HTMLParagraphElement>(null);

  const refreshConfig = useCallback(async (mode: PublicConfigRefreshMode) => {
    if (mode === 'invalid-branch') {
      setDraft(current => prepareDraftForConfigRefresh(current, mode));
    }
    try {
      const nextConfig = await complaintsAPI.getPublicConfig();
      setConfig(nextConfig);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setState('loading');
    setState(await refreshConfig('initial') ? 'ready' : 'error');
  }, [refreshConfig]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  function update(patch: Partial<ComplaintDraft>, fieldsToClear: Array<keyof ComplaintValidationErrors>) {
    setDraft(current => ({ ...current, ...patch }));
    setSubmissionMessage(null);
    setErrors(current => {
      const next = { ...current };
      fieldsToClear.forEach(field => delete next[field]);
      return next;
    });
  }

  function focusValidationError(nextErrors: ComplaintValidationErrors) {
    window.requestAnimationFrame(() => {
      const fieldId = firstInvalidComplaintField(nextErrors);
      const target = fieldId ? document.getElementById(fieldId) ?? errorSummaryRef.current : errorSummaryRef.current;
      target?.focus();
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  function focusServerRecovery(recovery: PublicComplaintRecovery) {
    const [alertId, nextFieldId] = getServerRecoveryFocusTargets(recovery);
    window.requestAnimationFrame(() => {
      const alert = document.getElementById(alertId) ?? recoveryAlertRef.current ?? errorSummaryRef.current;
      alert?.focus();
      alert?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!nextFieldId) return;

      window.requestAnimationFrame(() => {
        const field = document.getElementById(nextFieldId) ?? alert;
        field?.focus();
        field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submissionLocked.current || state === 'submitting') return;

    const nextErrors = validateComplaintDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !config) {
      focusValidationError(nextErrors);
      return;
    }

    submissionLocked.current = true;
    setSubmissionMessage(null);
    setState('submitting');
    try {
      const nextResult = await complaintsAPI.submitPublic(draft, config.formToken);
      setResult(nextResult);
      setState('success');
    } catch (error) {
      const recovery = getPublicComplaintRecovery(error);
      if (recovery === 'refresh-token') {
        const refreshed = await refreshConfig('form-token');
        setSubmissionMessage(refreshed
          ? 'Actualizamos el formulario porque expiró. Tus datos y archivos se conservaron; puedes enviarlo nuevamente.'
          : 'El formulario expiró y no pudimos actualizarlo. Tus datos y archivos se conservaron; revisa tu conexión e inténtalo nuevamente.');
      } else if (recovery === 'refresh-branches') {
        const refreshed = await refreshConfig('invalid-branch');
        const branchMessage = getInvalidBranchMessage(refreshed);
        setErrors(current => ({ ...current, branchId: branchMessage }));
        setSubmissionMessage(refreshed
          ? 'Actualizamos las sucursales y limpiamos la selección que ya no está disponible. Tus datos y archivos se conservaron.'
          : branchMessage);
      } else if (recovery === 'rate-limited') {
        setSubmissionMessage('No podemos recibir más reclamos desde esta conexión por ahora. Espera una hora e inténtalo nuevamente.');
      } else {
        setSubmissionMessage('No pudimos enviar el reclamo. Tus datos y archivos se conservaron; inténtalo nuevamente.');
        toast.error('No pudimos enviar el reclamo. Inténtalo nuevamente.');
      }
      setState('ready');
      submissionLocked.current = false;
      focusServerRecovery(recovery);
    }
  }

  if (state === 'loading') return <ComplaintFormSkeleton />;
  if (state === 'error') return <ComplaintLoadError onRetry={() => void loadConfig()} />;
  if (state === 'success' && result) return <ComplaintSuccess result={result} />;

  const isSubmitting = state === 'submitting';

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <Toaster richColors position="top-center" />
      <header className="bg-gradient-to-br from-blue-700 to-blue-900 px-5 pb-14 pt-10 text-white">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-200">CONECTOCA</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cuéntanos qué ocurrió</h1>
          <p className="mt-3 max-w-xl leading-7 text-blue-100">
            Completa este formulario y nuestro equipo revisará tu reclamo.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-8 max-w-2xl px-4 pb-12 sm:px-6">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {Object.keys(errors).length > 0 && (
            <section ref={errorSummaryRef} tabIndex={-1} role="alert" aria-labelledby="complaint-error-summary-title" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
              <h2 id="complaint-error-summary-title" className="font-bold">Revisa los campos marcados antes de enviar</h2>
              <ul className="mt-2 list-inside list-disc text-sm">
                {Object.values(errors).map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
              </ul>
            </section>
          )}
          {submissionMessage && (
            <p id="complaint-recovery-alert" ref={recoveryAlertRef} tabIndex={-1} role="alert" aria-live="assertive" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              {submissionMessage}
            </p>
          )}
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-xl sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-800">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Paso 1</p>
                <h2 className="text-xl font-bold text-gray-900">¿Dónde se originó?</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="complaint-origin" className="mb-2 block text-sm font-semibold text-gray-800">
                  Origen del reclamo
                </label>
                <div className="relative">
                  <select
                    id="complaint-origin"
                    value={draft.originType}
                    required
                    aria-required="true"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.originType)}
                    aria-describedby={errors.originType ? 'complaint-origin-error' : undefined}
                    onChange={event => {
                      const originType = event.target.value as ComplaintOrigin;
                      update(
                        { originType, branchId: originType === 'branch' ? draft.branchId : '' },
                        ['originType', 'branchId'],
                      );
                    }}
                    className={`${errors.originType ? fieldErrorClassName : fieldClassName} appearance-none pr-11`}
                  >
                    <option value="branch">Sucursal</option>
                    <option value="production">Producción o producto</option>
                    <option value="other">Otro / no sabe</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                </div>
                <FieldError id="complaint-origin-error" message={errors.originType} />
              </div>

              {draft.originType === 'branch' && (
                <div>
                  <label htmlFor="complaint-branch" className="mb-2 block text-sm font-semibold text-gray-800">
                    Sucursal
                  </label>
                  {config?.branchesUnavailable ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                      <p>No pudimos cargar las sucursales. Puedes elegir Producción o producto, u Otro / no sabe.</p>
                      <button
                        type="button"
                        onClick={() => void loadConfig()}
                        className="mt-3 inline-flex items-center gap-2 font-semibold text-blue-800 underline underline-offset-4"
                      >
                        <RotateCw className="h-4 w-4" aria-hidden="true" />
                        Reintentar sucursales
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        id="complaint-branch"
                        value={draft.branchId}
                        required
                        aria-required="true"
                        disabled={isSubmitting}
                        aria-invalid={Boolean(errors.branchId)}
                        aria-describedby={errors.branchId ? 'complaint-branch-error' : undefined}
                        onChange={event => update({ branchId: event.target.value }, ['branchId'])}
                        className={`${errors.branchId ? fieldErrorClassName : fieldClassName} appearance-none pr-11`}
                      >
                        <option value="">Selecciona una sucursal</option>
                        {config?.branches.map(branch => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden="true" />
                    </div>
                  )}
                  <FieldError id="complaint-branch-error" message={errors.branchId} />
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-lg sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-800">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Paso 2</p>
                <h2 className="text-xl font-bold text-gray-900">Tus datos de contacto</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="complaint-email" className="mb-2 block text-sm font-semibold text-gray-800">
                  Correo electrónico <span className="text-red-600">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    id="complaint-email"
                    type="email"
                    required
                    aria-required="true"
                    inputMode="email"
                    autoComplete="email"
                    value={draft.email}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'complaint-email-error' : undefined}
                    placeholder="tu@correo.cl"
                    onChange={event => update({ email: event.target.value }, ['email'])}
                    className={`${errors.email ? fieldErrorClassName : fieldClassName} pl-12`}
                  />
                </div>
                <FieldError id="complaint-email-error" message={errors.email} />
              </div>

              <div>
                <label htmlFor="complaint-name" className="mb-2 block text-sm font-semibold text-gray-800">
                  Nombre <span className="font-normal text-gray-500">(opcional)</span>
                </label>
                <input
                  id="complaint-name"
                  type="text"
                  autoComplete="name"
                  maxLength={120}
                  value={draft.name}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'complaint-name-error' : undefined}
                  placeholder="Cómo quieres que te llamemos"
                  onChange={event => update({ name: event.target.value }, ['name'])}
                  className={errors.name ? fieldErrorClassName : fieldClassName}
                />
                <FieldError id="complaint-name-error" message={errors.name} />
              </div>

              <div>
                <label htmlFor="complaint-phone" className="mb-2 block text-sm font-semibold text-gray-800">
                  Teléfono <span className="font-normal text-gray-500">(opcional)</span>
                </label>
                <input
                  id="complaint-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={40}
                  value={draft.phone}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'complaint-phone-error' : undefined}
                  placeholder="+56 9 1234 5678"
                  onChange={event => update({ phone: event.target.value }, ['phone'])}
                  className={errors.phone ? fieldErrorClassName : fieldClassName}
                />
                <FieldError id="complaint-phone-error" message={errors.phone} />
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-lg sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-800">
                <MessageSquareText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Paso 3</p>
                <h2 className="text-xl font-bold text-gray-900">Describe lo ocurrido</h2>
              </div>
            </div>

            <label htmlFor="complaint-description" className="mb-2 block text-sm font-semibold text-gray-800">
              Detalle del reclamo <span className="text-red-600">*</span>
            </label>
            <textarea
              id="complaint-description"
              value={draft.description}
              disabled={isSubmitting}
              required
              aria-required="true"
              minLength={20}
              maxLength={5000}
              rows={7}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={`complaint-description-count${errors.description ? ' complaint-description-error' : ''}`}
              placeholder="Cuéntanos qué pasó, cuándo ocurrió y cualquier detalle que nos ayude a entenderlo."
              onChange={event => update({ description: event.target.value }, ['description'])}
              className={`${errors.description ? fieldErrorClassName : fieldClassName} h-40 resize-y py-3 leading-6`}
            />
            <div className="mt-1.5 flex items-start justify-between gap-4">
              <FieldError id="complaint-description-error" message={errors.description} />
              <p id="complaint-description-count" className="ml-auto shrink-0 text-xs text-gray-500">
                {draft.description.length}/5.000
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-lg sm:p-7">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-800">
                <PackageOpen className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Paso 4</p>
                <h2 className="text-xl font-bold text-gray-900">Agrega evidencias</h2>
              </div>
            </div>
            <ComplaintAttachmentsInput
              files={draft.files}
              onChange={files => update({ files }, ['files'])}
              errors={errors.files ? [errors.files] : undefined}
              disabled={isSubmitting}
            />
          </section>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-yellow-500 px-6 py-4 text-lg font-bold text-blue-900 shadow-lg transition hover:bg-yellow-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Enviando reclamo…
              </>
            ) : (
              <>
                <Send className="h-5 w-5" aria-hidden="true" />
                Enviar reclamo
              </>
            )}
          </button>

          <p className="flex items-start justify-center gap-2 px-3 text-center text-xs leading-5 text-gray-500">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Usaremos tus datos únicamente para gestionar y responder este reclamo.
          </p>
        </form>
      </main>
    </div>
  );
}
