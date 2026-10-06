# Sistema de reclamos con QR global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar a Conectoca un formulario público accesible por un QR único y una bandeja exclusiva para administradores, con casos persistidos, evidencias privadas y correos transaccionales.

**Architecture:** Una Edge Function Supabase independiente llamada `complaints` será la única frontera de datos del módulo. Las rutas públicas crearán casos para la organización configurada; las rutas administrativas validarán JWT, rol y negocio. React renderizará `/reclamos` antes del flujo de sesión y añadirá una pantalla interna de lista/detalle para administradores.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind/Radix existentes, Hono, Supabase Postgres/Auth/Storage/Edge Functions, Resend HTTP API, Node test runner y `qrcode` para descargar el QR.

**Spec:** `docs/superpowers/specs/2026-10-05-sistema-reclamos-design.md`

## Global Constraints

- Debe existir una sola URL pública `/reclamos` y un solo QR; el cliente nunca elige empresa.
- La organización se toma exclusivamente de `COMPLAINTS_BUSINESS_ID` en servidor.
- Todos los avisos se envían a una sola casilla configurada en `COMPLAINTS_RECIPIENT_EMAIL`.
- Solo `admin` puede listar, leer o modificar reclamos.
- Estados permitidos: `pending` y `attended`.
- La respuesta final se redacta mediante `mailto:`; abrir el correo nunca cambia el estado.
- Máximo cinco evidencias JPG, PNG, WebP o PDF, de hasta 10 MB cada una.
- La descripción debe contener entre 20 y 5.000 caracteres.
- Los adjuntos permanecen en un bucket privado; nunca se persisten URLs firmadas.
- El reclamo debe conservarse aunque falle uno o ambos correos.
- No añadir rutas al monolito `supabase/functions/make-server-6d979413/index.ts`.
- No mezclar en los commits cambios preexistentes o ajenos al módulo.

---

## File Structure

### Base de datos y backend

- `supabase/migrations/20261005_create_complaints.sql`: tablas, restricciones, índices, triggers, RLS, bucket y RPC atómica de rate limit.
- `supabase/functions/complaints/domain.ts`: tipos puros, normalización, validación, HMAC y tokens de formulario.
- `supabase/functions/complaints/domain.test.ts`: pruebas Node de la lógica pura compartida por handlers.
- `supabase/functions/complaints/emailTemplates.ts`: HTML/texto escapado de confirmación y aviso central.
- `supabase/functions/complaints/emailTemplates.test.ts`: pruebas contra inyección HTML y contenido obligatorio.
- `supabase/functions/complaints/repository.ts`: única capa que accede a Postgres y Storage.
- `supabase/functions/complaints/mailer.ts`: cliente mínimo de Resend.
- `supabase/functions/complaints/publicService.ts`: caso de uso de sucursales y creación pública.
- `supabase/functions/complaints/adminService.ts`: listado, detalle, estados, URLs firmadas y reintentos.
- `supabase/functions/complaints/index.ts`: Hono, CORS, parsing HTTP, autenticación y mapeo de errores.

### Frontend

- `src/features/complaints/types.ts`: contrato de UI/API.
- `src/features/complaints/api.ts`: requests públicos y autenticados a la función nueva.
- `src/features/complaints/validation.ts`: validación inmediata del formulario.
- `src/features/complaints/validation.test.ts`: límites y combinaciones de campos/archivos.
- `src/features/complaints/mailto.ts`: construcción segura del correo de respuesta.
- `src/features/complaints/mailto.test.ts`: codificación del destinatario, asunto y cuerpo.
- `src/features/complaints/PublicComplaintForm.tsx`: formulario móvil y confirmación.
- `src/features/complaints/ComplaintAttachmentsInput.tsx`: selección, previsualización y remoción de evidencias.
- `src/features/complaints/ComplaintFilters.tsx`: búsqueda y filtros controlados.
- `src/features/complaints/ComplaintDetail.tsx`: antecedentes, adjuntos y acciones.
- `src/features/complaints/ComplaintsPanel.tsx`: bandeja, paginación y coordinación del detalle.
- `src/features/complaints/ComplaintQrDownload.tsx`: PNG/SVG de `window.location.origin + '/reclamos'`.
- `src/main.tsx`: selección de la vista pública antes de montar la aplicación autenticada.
- `src/App.tsx`: pantalla interna, autorización y enlace profundo.
- `src/components/HomeScreen.tsx`: acceso administrativo y contador pendiente.
- `package.json` / `package-lock.json`: `qrcode`, sus tipos y globs de tests de backend puro.
- `netlify.toml`: fallback SPA explícito para `/reclamos` y enlaces profundos.

### Operación

- `docs/reclamos-operacion.md`: secretos, despliegue, prueba real, reintento y diagnóstico.

---

### Task 1: Crear el esquema seguro de reclamos

**Files:**
- Create: `supabase/migrations/20261005_create_complaints.sql`

**Interfaces:**
- Consumes: tablas vivas `profiles` y esquema `storage` de Supabase.
- Produces: `complaints`, `complaint_attachments`, `complaint_rate_limits`, bucket `complaint-evidence` y RPC `consume_complaint_rate_limit(text, integer)`.

- [ ] **Step 1: Escribir primero las invariantes SQL que deben fallar sin la migración**

Guardar este bloque al final de una transacción manual de verificación y ejecutarlo antes de aplicar la migración:

```sql
select to_regclass('public.complaints') is not null as complaints_exists;
select to_regclass('public.complaint_attachments') is not null as attachments_exists;
select to_regclass('public.complaint_rate_limits') is not null as rate_limits_exists;
select id, public from storage.buckets where id = 'complaint-evidence';
```

Expected: las tres primeras consultas devuelven `false` y la última no devuelve filas.

- [ ] **Step 2: Crear la migración con restricciones en base de datos**

Implementar exactamente estas tablas base y restricciones; después añadir los triggers e índices indicados en el mismo archivo:

```sql
create extension if not exists pg_trgm;

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  case_serial bigint generated always as identity unique,
  case_number text not null unique,
  business_id uuid not null,
  origin_type text not null check (origin_type in ('branch', 'production', 'other')),
  branch_profile_id uuid references public.profiles(id) on delete set null,
  branch_name_snapshot text,
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  customer_name text check (customer_name is null or char_length(customer_name) <= 120),
  customer_phone text check (customer_phone is null or char_length(customer_phone) <= 40),
  description text not null check (char_length(description) between 20 and 5000),
  status text not null default 'pending' check (status in ('pending', 'attended')),
  confirmation_email_status text not null default 'pending'
    check (confirmation_email_status in ('pending', 'sending', 'sent', 'failed')),
  notification_email_status text not null default 'pending'
    check (notification_email_status in ('pending', 'sending', 'sent', 'failed')),
  confirmation_sent_at timestamptz,
  notification_sent_at timestamptz,
  confirmation_email_error text,
  notification_email_error text,
  attended_at timestamptz,
  attended_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (origin_type = 'branch' and branch_name_snapshot is not null)
    or (origin_type <> 'branch' and branch_profile_id is null and branch_name_snapshot is null)
  ),
  check (
    (status = 'pending' and attended_at is null and attended_by is null)
    or (status = 'attended' and attended_at is not null and attended_by is not null)
  )
);

create table public.complaint_attachments (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);

create table public.complaint_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  submission_count integer not null check (submission_count > 0),
  expires_at timestamptz not null
);
```

Añadir un trigger `set_complaint_case_number()` que produzca `REC-AAAA-NNNNNN`, otro trigger para `updated_at`, índices de bandeja y un índice GIN de búsqueda sobre la concatenación normalizada de número, correo, nombre y descripción.

- [ ] **Step 3: Añadir aislamiento y rate limit atómico**

```sql
alter table public.complaints enable row level security;
alter table public.complaint_attachments enable row level security;
alter table public.complaint_rate_limits enable row level security;

insert into storage.buckets (id, name, public)
values ('complaint-evidence', 'complaint-evidence', false)
on conflict (id) do update set public = false;

create or replace function public.consume_complaint_rate_limit(
  p_key_hash text,
  p_limit integer default 5
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.complaint_rate_limits
    (key_hash, window_started_at, submission_count, expires_at)
  values (p_key_hash, now(), 1, now() + interval '1 hour')
  on conflict (key_hash) do update set
    window_started_at = case
      when complaint_rate_limits.expires_at <= now() then now()
      else complaint_rate_limits.window_started_at
    end,
    submission_count = case
      when complaint_rate_limits.expires_at <= now() then 1
      else complaint_rate_limits.submission_count + 1
    end,
    expires_at = case
      when complaint_rate_limits.expires_at <= now() then now() + interval '1 hour'
      else complaint_rate_limits.expires_at
    end
  returning submission_count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_complaint_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_complaint_rate_limit(text, integer) to service_role;
```

No crear políticas para `anon` ni `authenticated`; el acceso pasa por `service_role` dentro de la función.

- [ ] **Step 4: Aplicar y verificar la migración en Supabase local**

Run:

```bash
npx supabase start
npx supabase db reset
```

Expected: la migración termina sin errores. Repetir las consultas del Step 1; las tablas existen y el bucket devuelve `public = false`. Insertar dos reclamos en una misma transacción y confirmar números distintos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005_create_complaints.sql
git commit -m "feat: add complaints database schema"
```

---

### Task 2: Implementar y probar el dominio puro del backend

**Files:**
- Create: `supabase/functions/complaints/domain.ts`
- Create: `supabase/functions/complaints/domain.test.ts`
- Create: `supabase/functions/complaints/emailTemplates.ts`
- Create: `supabase/functions/complaints/emailTemplates.test.ts`
- Modify: `package.json:70-74`

**Interfaces:**
- Consumes: campos primitivos extraídos de `FormData`.
- Produces: `validateComplaintFields`, `validateAttachments`, `createFormToken`, `verifyFormToken`, `hashRateLimitKey`, `buildCustomerConfirmation` y `buildCentralNotification`.

- [ ] **Step 1: Ampliar el comando de tests y escribir pruebas fallidas**

Cambiar el script a:

```json
"test": "node --test src/utils/*.test.ts src/utils/nutricion/*.test.ts src/features/complaints/*.test.ts supabase/functions/complaints/*.test.ts"
```

Crear pruebas con estos casos exactos:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateComplaintFields,
  validateAttachments,
  createFormToken,
  verifyFormToken,
} from './domain.ts';

test('branch exige una sucursal y normaliza el correo', () => {
  assert.throws(() => validateComplaintFields({
    originType: 'branch', branchId: '', email: 'CLIENTE@MAIL.CL',
    name: '', phone: '', description: 'Descripción suficientemente larga', honeypot: '',
  }), /sucursal/i);
  assert.equal(validateComplaintFields({
    originType: 'other', branchId: '', email: ' CLIENTE@MAIL.CL ',
    name: '', phone: '', description: 'Descripción suficientemente larga', honeypot: '',
  }).email, 'cliente@mail.cl');
});

test('rechaza más de cinco adjuntos o un archivo sobre 10 MB', () => {
  const ok = { name: 'foto.jpg', type: 'image/jpeg', size: 100 };
  assert.throws(() => validateAttachments(Array(6).fill(ok)), /cinco/i);
  assert.throws(() => validateAttachments([{ ...ok, size: 10 * 1024 * 1024 + 1 }]), /10 MB/i);
});

test('token solo vale entre 2 segundos y 2 horas', async () => {
  const token = await createFormToken('secret', 1_000_000);
  assert.equal(await verifyFormToken(token, 'secret', 1_001_999), false);
  assert.equal(await verifyFormToken(token, 'secret', 1_002_000), true);
  assert.equal(await verifyFormToken(token, 'secret', 8_200_001), false);
});
```

En `emailTemplates.test.ts`, usar el mismo dato malicioso en ambas plantillas:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerConfirmation, buildCentralNotification } from './emailTemplates.ts';

const emailData = {
  caseNumber: 'REC-2026-000123',
  createdAt: '2026-10-05T12:00:00.000Z',
  originLabel: 'Otro / no sabe',
  customerEmail: 'cliente@example.com',
  customerName: '<script>alert(1)</script>',
  customerPhone: null,
  description: '<script>alert(2)</script>',
  attachmentCount: 0,
  adminUrl: 'https://conectoca.cl/?screen=complaints&case=case-1',
};

for (const [name, build] of [
  ['cliente', buildCustomerConfirmation],
  ['central', buildCentralNotification],
] as const) {
  test(`plantilla ${name} escapa HTML e incluye el caso`, () => {
    const message = build(emailData);
    assert.match(message.subject, /REC-2026-000123/);
    assert.doesNotMatch(message.html, /<script>/);
    assert.match(message.html, /&lt;script&gt;/);
  });
}
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `npm test`

Expected: FAIL porque los módulos y exports todavía no existen.

- [ ] **Step 3: Implementar los contratos puros**

```ts
export type ComplaintOrigin = 'branch' | 'production' | 'other';

export interface RawComplaintFields {
  originType: string;
  branchId: string;
  email: string;
  name: string;
  phone: string;
  description: string;
  honeypot: string;
}

export interface ValidComplaintFields {
  originType: ComplaintOrigin;
  branchId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  description: string;
}

export interface AttachmentDescriptor { name: string; type: string; size: number }

export function validateComplaintFields(raw: RawComplaintFields): ValidComplaintFields;
export function validateAttachments(files: AttachmentDescriptor[]): void;
export function createFormToken(secret: string, nowMs?: number): Promise<string>;
export function verifyFormToken(token: string, secret: string, nowMs?: number): Promise<boolean>;
export function hashRateLimitKey(secret: string, ip: string, now?: Date): Promise<string>;
export function escapeHtml(value: string): string;
```

`validateComplaintFields` debe rechazar honeypot lleno, origen desconocido, correo inválido, `branch` sin `branchId`, otros orígenes con `branchId` y descripción fuera de rango. `validateAttachments` debe aceptar únicamente los cuatro MIME de la especificación.

Las plantillas deben exponer:

```ts
export interface ComplaintEmailData {
  caseNumber: string;
  createdAt: string;
  originLabel: string;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  description: string;
  attachmentCount: number;
  adminUrl: string;
}

export function buildCustomerConfirmation(data: ComplaintEmailData): {
  subject: string; html: string; text: string;
};
export function buildCentralNotification(data: ComplaintEmailData): {
  subject: string; html: string; text: string;
};
```

- [ ] **Step 4: Ejecutar los tests**

Run: `npm test`

Expected: PASS en tests existentes y los nuevos del dominio y plantillas.

- [ ] **Step 5: Commit**

```bash
git add package.json supabase/functions/complaints/domain.ts supabase/functions/complaints/domain.test.ts supabase/functions/complaints/emailTemplates.ts supabase/functions/complaints/emailTemplates.test.ts
git commit -m "test: define complaints backend domain"
```

---

### Task 3: Crear el flujo público de la Edge Function

**Files:**
- Create: `supabase/functions/complaints/repository.ts`
- Create: `supabase/functions/complaints/mailer.ts`
- Create: `supabase/functions/complaints/publicService.ts`
- Create: `supabase/functions/complaints/publicService.test.ts`
- Create: `supabase/functions/complaints/index.ts`

**Interfaces:**
- Consumes: exports de Task 2 y secretos de entorno.
- Produces: `GET /public/branches` y `POST /public/complaints`.

- [ ] **Step 1: Escribir una prueba fallida del caso de uso público con dependencias falsas**

```ts
test('guarda primero y conserva el caso si falla el correo central', async () => {
  const events: string[] = [];
  const repository: ComplaintRepository = {
    listBranches: async () => [],
    findBranch: async () => null,
    consumeRateLimit: async () => { events.push('rate-limit'); return true; },
    uploadEvidence: async () => undefined,
    removeEvidence: async () => undefined,
    insertComplaint: async () => {
      events.push('insert');
      return {
        id: 'case-1', caseNumber: 'REC-2026-000001', createdAt: '2026-10-05T12:00:00.000Z',
        originType: 'other', branchName: null, customerEmail: 'cliente@mail.cl',
        customerName: null, customerPhone: null,
        description: 'Descripción suficientemente larga', attachmentCount: 0,
      };
    },
    updateEmailResult: async (_id, kind, result) => events.push(`result:${kind}:${result.status}`),
  };
  const service = createPublicComplaintService({
    businessId: 'biz-1', appPublicUrl: 'https://conectoca.cl',
    rateLimitSecret: 'secret', recipientEmail: 'central@empresa.cl', fromEmail: 'reclamos@empresa.cl',
    repository,
    mailer: {
      send: async ({ to }) => {
        events.push(`mail:${to}`);
        if (to === 'central@empresa.cl') throw new Error('provider down');
      },
    },
    now: () => new Date('2026-10-05T12:00:05.000Z'),
  });

  const formToken = await createFormToken('secret', new Date('2026-10-05T12:00:00.000Z').getTime());
  const result = await service.submit({
    fields: {
      originType: 'other', branchId: '', email: 'cliente@mail.cl', name: '', phone: '',
      description: 'Descripción suficientemente larga', honeypot: '',
    },
    files: [], formToken, ip: '203.0.113.10',
  });
  assert.equal(result.caseNumber, 'REC-2026-000001');
  assert.deepEqual(events.slice(0, 2), ['rate-limit', 'insert']);
  assert.equal(result.notificationEmailStatus, 'failed');
});
```

Definir en el test un constructor base y cubrir sucursal, límite y limpieza sin duplicar mocks:

```ts
const storedComplaint: StoredComplaint = {
  id: 'case-1', caseNumber: 'REC-2026-000001', createdAt: '2026-10-05T12:00:00.000Z',
  originType: 'other', branchName: null, customerEmail: 'cliente@mail.cl',
  customerName: null, customerPhone: null,
  description: 'Descripción suficientemente larga', attachmentCount: 0,
};

function baseRepository(overrides: Partial<ComplaintRepository> = {}): ComplaintRepository {
  return {
    listBranches: async () => [],
    findBranch: async () => null,
    consumeRateLimit: async () => true,
    uploadEvidence: async () => undefined,
    removeEvidence: async () => undefined,
    insertComplaint: async () => storedComplaint,
    updateEmailResult: async () => undefined,
    ...overrides,
  };
}

const VALID_FORM_TOKEN = await createFormToken(
  'secret', new Date('2026-10-05T12:00:00.000Z').getTime(),
);

function jpeg(name: string): File {
  return new File([new Uint8Array([1])], name, { type: 'image/jpeg' });
}

function submissionForTest(
  overrides: Partial<RawComplaintFields> & { files?: File[] } = {},
): PublicComplaintSubmission {
  const { files = [], ...fieldOverrides } = overrides;
  return {
    fields: {
      originType: 'other', branchId: '', email: 'cliente@mail.cl', name: '', phone: '',
      description: 'Descripción suficientemente larga', honeypot: '', ...fieldOverrides,
    },
    files, formToken: VALID_FORM_TOKEN, ip: '203.0.113.10',
  };
}

function publicServiceForTest({ repository }: { repository: ComplaintRepository }) {
  return createPublicComplaintService({
    businessId: 'biz-1', appPublicUrl: 'https://conectoca.cl',
    rateLimitSecret: 'secret', recipientEmail: 'central@empresa.cl',
    fromEmail: 'reclamos@empresa.cl', repository,
    mailer: { send: async () => undefined },
    now: () => new Date('2026-10-05T12:00:05.000Z'),
  });
}

test('rechaza una sucursal que ya no existe', async () => {
  const service = publicServiceForTest({ repository: baseRepository() });
  await assert.rejects(
    () => service.submit(submissionForTest({ originType: 'branch', branchId: 'missing' })),
    (error: any) => error.code === 'INVALID_BRANCH',
  );
});

test('rechaza cuando el límite fue agotado', async () => {
  const service = publicServiceForTest({
    repository: baseRepository({ consumeRateLimit: async () => false }),
  });
  await assert.rejects(
    () => service.submit(submissionForTest()),
    (error: any) => error.code === 'RATE_LIMITED',
  );
});

test('limpia archivos previos si una carga posterior falla', async () => {
  const removed: string[][] = [];
  let uploads = 0;
  const service = publicServiceForTest({
    repository: baseRepository({
      uploadEvidence: async () => { uploads += 1; if (uploads === 2) throw new Error('storage'); },
      removeEvidence: async (paths) => { removed.push(paths); },
    }),
  });
  await assert.rejects(() => service.submit(submissionForTest({ files: [jpeg('a.jpg'), jpeg('b.jpg')] })));
  assert.equal(removed.length, 1);
  assert.equal(removed[0].length, 1);
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `node --test supabase/functions/complaints/publicService.test.ts`

Expected: FAIL porque `createPublicComplaintService` no existe.

- [ ] **Step 3: Implementar repositorio, mailer y servicio**

Definir interfaces inyectables para que la lógica no dependa de Hono:

```ts
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

export interface PublicComplaintSubmission {
  fields: RawComplaintFields;
  files: File[];
  formToken: string;
  ip: string;
}

export interface ComplaintRepository {
  listBranches(businessId: string): Promise<Array<{ id: string; name: string }>>;
  findBranch(businessId: string, id: string): Promise<{ id: string; name: string } | null>;
  consumeRateLimit(keyHash: string): Promise<boolean>;
  uploadEvidence(path: string, file: File): Promise<void>;
  removeEvidence(paths: string[]): Promise<void>;
  insertComplaint(input: NewComplaintRecord, attachments: NewAttachmentRecord[]): Promise<StoredComplaint>;
  updateEmailResult(id: string, kind: 'confirmation' | 'notification', result: EmailResult): Promise<void>;
}

export interface ComplaintMailer {
  send(input: { from: string; to: string; subject: string; html: string; text: string }): Promise<void>;
}

export interface PublicComplaintResult {
  caseNumber: string;
  receivedAt: string;
  confirmationEmailStatus: 'sent' | 'failed';
  notificationEmailStatus: 'sent' | 'failed';
}
```

`mailer.ts` debe llamar `POST https://api.resend.com/emails` con `Authorization: Bearer ${RESEND_API_KEY}` y lanzar un error reducido cuando la respuesta no sea 2xx.

El servicio debe ejecutar en este orden: verificar token → rate limit → validar sucursal → validar archivos → subir con UUID preasignado → insertar caso y metadatos → enviar confirmación y aviso por separado → registrar cada resultado → devolver el caso aunque falle correo.

- [ ] **Step 4: Montar las rutas públicas en Hono**

```ts
app.get('/complaints/public/branches', async (c) => {
  const result = await publicService.getBranches();
  return c.json(result, 200, { 'Cache-Control': 'public, max-age=300' });
});

app.post('/complaints/public/complaints', async (c) => {
  const form = await c.req.formData();
  const result = await publicService.submit({
    fields: {
      originType: String(form.get('originType') || ''),
      branchId: String(form.get('branchId') || ''),
      email: String(form.get('email') || ''),
      name: String(form.get('name') || ''),
      phone: String(form.get('phone') || ''),
      description: String(form.get('description') || ''),
      honeypot: String(form.get('website') || ''),
    },
    files: form.getAll('files').filter((value): value is File => value instanceof File),
    formToken: String(form.get('formToken') || ''),
    ip: c.req.header('cf-connecting-ip')
      || c.req.header('x-forwarded-for')?.split(',')[0].trim()
      || 'unknown',
  });
  return c.json({ caseNumber: result.caseNumber, receivedAt: result.receivedAt }, 201);
});
```

`getBranches()` siempre debe emitir un `formToken`. Si la consulta a `profiles` falla, devuelve `{ branches: [], branchesUnavailable: true, formToken }`; si funciona, devuelve `branchesUnavailable: false`. Así Producción y Otro siguen disponibles sin inventar sucursales.

Configurar CORS solo para `APP_PUBLIC_URL` y los orígenes locales explícitos. Mapear errores de validación a `400`, rate limit a `429` y fallos inesperados a `500` sin filtrar detalles.

- [ ] **Step 5: Ejecutar pruebas y chequeo de función**

Run:

```bash
npm test
npx supabase functions serve complaints --no-verify-jwt --env-file .env.local
```

Expected: tests PASS; `GET /functions/v1/complaints/public/branches` devuelve `{ branches, formToken }` y no incluye email ni `business_id`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/complaints
git commit -m "feat: add public complaints edge function"
```

---

### Task 4: Añadir autorización y operaciones administrativas al backend

**Files:**
- Modify: `supabase/functions/complaints/repository.ts`
- Create: `supabase/functions/complaints/adminService.ts`
- Create: `supabase/functions/complaints/adminService.test.ts`
- Modify: `supabase/functions/complaints/index.ts`

**Interfaces:**
- Consumes: JWT Supabase, `ComplaintRepository`, `ComplaintMailer` y plantillas.
- Produces: listado, detalle, cambio de estado, URL firmada y reintento de correo.

- [ ] **Step 1: Escribir pruebas fallidas de límites de autorización y negocio**

```ts
test('rechaza a un usuario no administrador', async () => {
  await assert.rejects(
    () => authorizeAdmin({
      token: 'token-local', expectedBusinessId: 'biz-1',
      auth: {
        getUser: async () => ({ id: 'user-1' }),
        getProfile: async () => ({ id: 'user-1', role: 'local', businessId: 'biz-1' }),
      },
    }),
    (error: any) => error.code === 'FORBIDDEN',
  );
});

test('el detalle siempre consulta por id y businessId', async () => {
  const calls: unknown[] = [];
  const service = createAdminComplaintService({
    repository: {
      getDetail: async (id, businessId) => {
        calls.push({ operation: 'detail', id, businessId });
        return { id, businessId, caseNumber: 'REC-2026-000001' } as ComplaintDetail;
      },
    } as AdminComplaintRepository,
    mailer: { send: async () => undefined },
    fromEmail: 'reclamos@empresa.cl', recipientEmail: 'central@empresa.cl',
    appPublicUrl: 'https://conectoca.cl',
  });
  await service.getDetail('case-1', { userId: 'admin-1', businessId: 'biz-1' });
  assert.deepEqual(calls[0], { operation: 'detail', id: 'case-1', businessId: 'biz-1' });
});

test('reabrir limpia actor y fecha', async () => {
  let update: unknown;
  const service = createAdminComplaintService({
    repository: {
      setStatus: async (_id, _businessId, next) => { update = next; return next as ComplaintDetail; },
    } as AdminComplaintRepository,
    mailer: { send: async () => undefined },
    fromEmail: 'reclamos@empresa.cl', recipientEmail: 'central@empresa.cl',
    appPublicUrl: 'https://conectoca.cl',
  });
  await service.setStatus('case-1', 'pending', { userId: 'admin-1', businessId: 'biz-1' });
  assert.deepEqual(update, { status: 'pending', attendedAt: null, attendedBy: null });
});
```

Añadir una prueba concurrente usando el claim condicional del repositorio:

```ts
test('dos reintentos concurrentes producen un solo correo', async () => {
  let claimed = false;
  let sends = 0;
  const complaintEmailFixture: ComplaintEmailData = {
    caseNumber: 'REC-2026-000001', createdAt: '2026-10-05T12:00:00.000Z',
    originLabel: 'Otro / no sabe', customerEmail: 'cliente@mail.cl',
    customerName: null, customerPhone: null,
    description: 'Descripción suficientemente larga', attachmentCount: 0,
    adminUrl: 'https://conectoca.cl/?screen=complaints&case=case-1',
  };
  const repository = {
    claimEmailRetry: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    getEmailData: async () => complaintEmailFixture,
    completeEmailRetry: async () => undefined,
  } as AdminComplaintRepository;
  const service = createAdminComplaintService({
    repository,
    mailer: { send: async () => { sends += 1; } },
    fromEmail: 'reclamos@empresa.cl', recipientEmail: 'central@empresa.cl',
    appPublicUrl: 'https://conectoca.cl',
  });
  const admin = { userId: 'admin-1', businessId: 'biz-1' };

  await Promise.all([
    service.retryEmails('case-1', ['notification'], admin),
    service.retryEmails('case-1', ['notification'], admin),
  ]);

  assert.equal(sends, 1);
});
```

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `node --test supabase/functions/complaints/adminService.test.ts`

Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: Implementar autorización y servicio administrativo**

```ts
export interface AdminContext { userId: string; businessId: string }

export interface AdminAuthGateway {
  getUser(token: string): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<{ id: string; role: string; businessId: string | null } | null>;
}

export interface ComplaintListQuery {
  search?: string;
  status?: 'pending' | 'attended';
  originType?: 'branch' | 'production' | 'other';
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

export interface ComplaintDetail extends ComplaintSummary {
  customerPhone: string | null;
  description: string;
  confirmationEmailStatus: 'pending' | 'sending' | 'sent' | 'failed';
  notificationEmailStatus: 'pending' | 'sending' | 'sent' | 'failed';
  confirmationEmailError: string | null;
  notificationEmailError: string | null;
  attendedAt: string | null;
  attendedBy: string | null;
  attachments: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>;
}

export interface ComplaintPage {
  data: ComplaintSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

export interface EmailStatuses {
  confirmationEmailStatus: ComplaintDetail['confirmationEmailStatus'];
  notificationEmailStatus: ComplaintDetail['notificationEmailStatus'];
}

export interface AdminComplaintService {
  list(query: ComplaintListQuery, admin: AdminContext): Promise<ComplaintPage>;
  getDetail(id: string, admin: AdminContext): Promise<ComplaintDetail>;
  setStatus(id: string, status: 'pending' | 'attended', admin: AdminContext): Promise<ComplaintDetail>;
  createAttachmentUrl(id: string, admin: AdminContext): Promise<{ url: string; expiresIn: 300 }>;
  retryEmails(id: string, kinds: Array<'confirmation' | 'notification'>, admin: AdminContext): Promise<EmailStatuses>;
}

export interface AdminComplaintRepository {
  list(query: ComplaintListQuery, businessId: string): Promise<ComplaintPage>;
  getDetail(id: string, businessId: string): Promise<ComplaintDetail>;
  setStatus(id: string, businessId: string, update: {
    status: 'pending' | 'attended'; attendedAt: string | null; attendedBy: string | null;
  }): Promise<ComplaintDetail>;
  createAttachmentUrl(attachmentId: string, businessId: string, expiresIn: number): Promise<string>;
  claimEmailRetry(id: string, businessId: string, kind: 'confirmation' | 'notification'): Promise<boolean>;
  getEmailData(id: string, businessId: string): Promise<ComplaintEmailData>;
  completeEmailRetry(id: string, kind: 'confirmation' | 'notification', result: EmailResult): Promise<void>;
}
```

`authorizeAdmin` debe validar el token con `supabaseAuth.auth.getUser`, cargar `profiles`, exigir `role === 'admin'`, `profile.business_id === COMPLAINTS_BUSINESS_ID` y devolver el contexto. El reintento debe adquirir el correo con una actualización condicional `failed → sending`; si no obtiene la fila, no envía.

- [ ] **Step 4: Añadir rutas administrativas**

```ts
app.get('/complaints/admin/complaints', requireAdmin, listComplaintsHandler);
app.get('/complaints/admin/complaints/:id', requireAdmin, getComplaintHandler);
app.patch('/complaints/admin/complaints/:id/status', requireAdmin, setComplaintStatusHandler);
app.post('/complaints/admin/complaints/:id/retry-emails', requireAdmin, retryComplaintEmailsHandler);
app.post('/complaints/admin/attachments/:id/signed-url', requireAdmin, createAttachmentUrlHandler);
```

Validar `page >= 1`, `1 <= limit <= 100`, fechas ISO y enums antes de llamar al repositorio. Firmar adjuntos por 300 segundos.

- [ ] **Step 5: Ejecutar pruebas y probes HTTP**

Run: `npm test`

Con la función local activa:

```bash
curl -i http://127.0.0.1:54321/functions/v1/complaints/admin/complaints
```

Expected: tests PASS y el probe sin token devuelve `401`, no `200` ni datos.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/complaints
git commit -m "feat: add admin complaints API"
```

---

### Task 5: Definir contrato, validación y cliente API del frontend

**Files:**
- Create: `src/features/complaints/types.ts`
- Create: `src/features/complaints/validation.ts`
- Create: `src/features/complaints/validation.test.ts`
- Create: `src/features/complaints/mailto.ts`
- Create: `src/features/complaints/mailto.test.ts`
- Create: `src/features/complaints/api.ts`

**Interfaces:**
- Consumes: JSON de Task 3 y Task 4.
- Produces: `complaintsAPI`, validación inmediata y `buildComplaintMailto` para componentes.

- [ ] **Step 1: Escribir pruebas fallidas de validación y mailto**

```ts
test('requiere sucursal solo cuando el origen es branch', () => {
  const validDraft: ComplaintDraft = {
    originType: 'other', branchId: '', email: 'cliente@example.com', name: '', phone: '',
    description: 'Descripción suficientemente larga', files: [],
  };
  assert.equal(validateComplaintDraft({ ...validDraft, originType: 'branch', branchId: '' }).branchId,
    'Selecciona una sucursal');
  assert.equal(validateComplaintDraft({ ...validDraft, originType: 'production', branchId: '' }).branchId,
    undefined);
});

test('mailto incluye destinatario y caso codificados', () => {
  const url = buildComplaintMailto({
    email: 'cliente@example.com', caseNumber: 'REC-2026-000123', customerName: 'Ana',
  });
  assert.ok(url.startsWith('mailto:cliente%40example.com?'));
  assert.ok(decodeURIComponent(url).includes('Respuesta a tu reclamo REC-2026-000123'));
});
```

Cubrir descripción corta, email inválido, seis archivos, MIME prohibido y archivo mayor a 10 MB.

- [ ] **Step 2: Ejecutar y confirmar el fallo**

Run: `node --test src/features/complaints/validation.test.ts src/features/complaints/mailto.test.ts`

Expected: FAIL por exports inexistentes.

- [ ] **Step 3: Crear tipos y funciones puras**

```ts
export type ComplaintOrigin = 'branch' | 'production' | 'other';
export type ComplaintStatus = 'pending' | 'attended';
export type ComplaintEmailStatus = 'pending' | 'sending' | 'sent' | 'failed';

export interface PublicComplaintConfig {
  branches: Array<{ id: string; name: string }>;
  formToken: string;
  branchesUnavailable: boolean;
}

export interface ComplaintDraft {
  originType: ComplaintOrigin;
  branchId: string;
  email: string;
  name: string;
  phone: string;
  description: string;
  files: File[];
}

export interface ComplaintValidationErrors {
  originType?: string;
  branchId?: string;
  email?: string;
  name?: string;
  phone?: string;
  description?: string;
  files?: string;
}

export interface ComplaintSummary {
  id: string;
  caseNumber: string;
  originType: ComplaintOrigin;
  branchName: string | null;
  customerEmail: string;
  customerName: string | null;
  descriptionPreview: string;
  status: ComplaintStatus;
  hasEmailFailure: boolean;
  createdAt: string;
}

export interface ComplaintAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ComplaintDetail extends ComplaintSummary {
  customerPhone: string | null;
  description: string;
  confirmationEmailStatus: ComplaintEmailStatus;
  notificationEmailStatus: ComplaintEmailStatus;
  confirmationEmailError: string | null;
  notificationEmailError: string | null;
  attendedAt: string | null;
  attendedBy: string | null;
  attachments: ComplaintAttachment[];
}

export interface ComplaintFilters {
  search: string;
  status: ComplaintStatus | '';
  originType: ComplaintOrigin | '';
  branchId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  limit: number;
}

export interface ComplaintPage {
  data: ComplaintSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

export interface EmailStatuses {
  confirmationEmailStatus: ComplaintEmailStatus;
  notificationEmailStatus: ComplaintEmailStatus;
}
```

Exportar `validateComplaintDraft(draft: ComplaintDraft): ComplaintValidationErrors` desde `validation.ts`.

- [ ] **Step 4: Implementar el cliente API separado**

```ts
const COMPLAINTS_API_URL = `https://${projectId}.supabase.co/functions/v1/complaints`;

export const complaintsAPI = {
  getPublicConfig(): Promise<PublicComplaintConfig>,
  submitPublic(input: ComplaintDraft, formToken: string): Promise<{ caseNumber: string; receivedAt: string }>,
  list(token: string, filters: ComplaintFilters): Promise<ComplaintPage>,
  get(token: string, id: string): Promise<ComplaintDetail>,
  setStatus(token: string, id: string, status: ComplaintStatus): Promise<ComplaintDetail>,
  retryEmails(token: string, id: string, kinds: Array<'confirmation' | 'notification'>): Promise<EmailStatuses>,
  createAttachmentUrl(token: string, attachmentId: string): Promise<{ url: string; expiresIn: number }>,
};
```

`submitPublic` debe construir `FormData` y no establecer manualmente `Content-Type`. Las rutas administrativas agregan `Authorization: Bearer` y, ante `401`, intentan un único `refreshSession` usando el cliente compartido.

- [ ] **Step 5: Ejecutar tests y build**

Run:

```bash
npm test
npm run build
```

Expected: PASS y build sin errores TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/features/complaints
git commit -m "feat: add complaints frontend contract"
```

---

### Task 6: Construir el formulario público y la ruta del QR

**Files:**
- Create: `src/features/complaints/ComplaintAttachmentsInput.tsx`
- Create: `src/features/complaints/PublicComplaintForm.tsx`
- Modify: `src/main.tsx:1-5`
- Modify: `netlify.toml:1-6`

**Interfaces:**
- Consumes: `complaintsAPI`, `ComplaintDraft`, `validateComplaintDraft`.
- Produces: `/reclamos` funcional sin restaurar sesión ni iniciar polling.

- [ ] **Step 1: Añadir el fallback SPA y comprobar el fallo actual**

Run: `npm run build && python3 -m http.server 4173 -d build`

Abrir `http://localhost:4173/reclamos`.

Expected antes del cambio de hosting: `404` al pedir la ruta directa. Este servidor solo documenta el problema; la regla de Netlify se valida con `npx netlify-cli dev` después del cambio.

Añadir a `netlify.toml`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Implementar el input de evidencias**

```ts
interface ComplaintAttachmentsInputProps {
  files: File[];
  onChange: (files: File[]) => void;
  errors?: string[];
  disabled?: boolean;
}
```

Debe ofrecer cámara/galería en móvil, aceptar `.jpg,.jpeg,.png,.webp,.pdf`, mostrar nombre/tamaño, permitir remover cada archivo y bloquear el sexto antes de enviarlo. Crear URLs locales solo para previsualizar imágenes y revocarlas en cleanup.

- [ ] **Step 3: Implementar el formulario de una pantalla**

```tsx
type PublicFormState = 'loading' | 'ready' | 'submitting' | 'success' | 'error';

const EMPTY_COMPLAINT_DRAFT: ComplaintDraft = {
  originType: 'branch', branchId: '', email: '', name: '', phone: '', description: '', files: [],
};

function ComplaintFormSkeleton() {
  return <div role="status" aria-label="Cargando formulario" className="min-h-screen animate-pulse bg-gray-100" />;
}

function ComplaintSuccess({ result }: {
  result: { caseNumber: string; receivedAt: string };
}) {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <section className="max-w-md text-center">
        <h1>Recibimos tu reclamo</h1>
        <p className="text-2xl font-semibold">{result.caseNumber}</p>
        <p>Guarda este número. Recibirás la respuesta por correo.</p>
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

  useEffect(() => {
    complaintsAPI.getPublicConfig()
      .then((next) => { setConfig(next); setState('ready'); })
      .catch(() => setState('error'));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validateComplaintDraft(draft);
    setErrors(errors);
    if (Object.keys(errors).length > 0 || !config) return;
    setState('submitting');
    try {
      setResult(await complaintsAPI.submitPublic(draft, config.formToken));
      setState('success');
    } catch {
      setState('ready');
      toast.error('No pudimos enviar el reclamo. Inténtalo nuevamente.');
    }
  }

  if (state === 'loading') return <ComplaintFormSkeleton />;
  if (state === 'success' && result) return <ComplaintSuccess result={result} />;
  const update = (patch: Partial<ComplaintDraft>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <form onSubmit={handleSubmit}>
      <select value={draft.originType} onChange={(e) => update({
        originType: e.target.value as ComplaintOrigin,
        branchId: e.target.value === 'branch' ? draft.branchId : '',
      })}>
        <option value="branch">Sucursal</option>
        <option value="production">Producción o producto</option>
        <option value="other">Otro / no sabe</option>
      </select>
      {draft.originType === 'branch' && (
        <select value={draft.branchId} onChange={(e) => update({ branchId: e.target.value })}
          disabled={config?.branchesUnavailable}>
          <option value="">Selecciona una sucursal</option>
          {config?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      )}
      <input type="email" required value={draft.email} onChange={(e) => update({ email: e.target.value })} />
      <input value={draft.name} onChange={(e) => update({ name: e.target.value })} />
      <input type="tel" value={draft.phone} onChange={(e) => update({ phone: e.target.value })} />
      <textarea required minLength={20} maxLength={5000} value={draft.description}
        onChange={(e) => update({ description: e.target.value })} />
      <ComplaintAttachmentsInput files={draft.files} onChange={(files) => update({ files })}
        errors={errors.files ? [errors.files] : undefined} disabled={state === 'submitting'} />
      <button type="submit" disabled={state === 'submitting'}>Enviar reclamo</button>
    </form>
  );
}
```

La jerarquía visual debe seguir el mockup aprobado: encabezado azul, selector de origen, contacto, descripción, evidencias, botón amarillo y aviso de privacidad. En éxito, sustituir el formulario por el número de caso y “recibirás la respuesta por correo”.

- [ ] **Step 4: Seleccionar la aplicación pública antes de montar `App`**

Reemplazar el render de `src/main.tsx` por una selección estable de raíz:

```tsx
import { PublicComplaintForm } from './features/complaints/PublicComplaintForm.tsx';

const isPublicComplaintRoute = window.location.pathname.replace(/\/+$/, '') === '/reclamos';

createRoot(document.getElementById('root')!).render(
  isPublicComplaintRoute ? <PublicComplaintForm /> : <App />,
);
```

Así `/reclamos` no monta `App` y por lo tanto no registra listeners de sesión, polling ni notificaciones internas.

- [ ] **Step 5: Verificar el flujo en móvil**

Run: `npm test && npm run build && npx netlify-cli dev`

Comprobar a 390×844:

- `/reclamos` nunca muestra login.
- Producción y Otro funcionan aunque falle la carga de sucursales.
- Branch exige sucursal.
- Un error conserva texto y archivos.
- Doble clic no duplica envío.
- La pantalla de éxito muestra el número retornado.

- [ ] **Step 6: Commit**

```bash
git add netlify.toml src/main.tsx src/features/complaints/ComplaintAttachmentsInput.tsx src/features/complaints/PublicComplaintForm.tsx
git commit -m "feat: add public complaints form"
```

---

### Task 7: Construir la bandeja y el detalle administrativo

**Files:**
- Create: `src/features/complaints/ComplaintFilters.tsx`
- Create: `src/features/complaints/ComplaintDetail.tsx`
- Create: `src/features/complaints/ComplaintsPanel.tsx`

**Interfaces:**
- Consumes: métodos administrativos de `complaintsAPI` y `PaginationControls`.
- Produces: pantalla controlada por `accessToken`, `initialComplaintId` y `onBack`.

- [ ] **Step 1: Definir los props y estados de pantalla antes del JSX**

```ts
export interface ComplaintsPanelProps {
  accessToken: string;
  initialComplaintId?: string | null;
  onBack: () => void;
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; page: ComplaintPage };
```

`ComplaintDetail` debe recibir `complaint`, `onStatusChange`, `onRetryEmail`, `onOpenAttachment` y `onClose`; ninguna acción debe realizar fetch directamente fuera de esos callbacks.

- [ ] **Step 2: Implementar filtros con debounce explícito**

```ts
interface ComplaintFiltersProps {
  value: ComplaintFilters;
  branches: Array<{ id: string; name: string }>;
  onChange: (next: ComplaintFilters) => void;
  disabled?: boolean;
}
```

Aplicar 300 ms de debounce solo al texto; estado, origen, sucursal y fechas recargan inmediatamente y siempre reinician `page` a 1.

- [ ] **Step 3: Implementar lista y estados vacíos**

La bandeja debe renderizar número, origen/sucursal, cliente, resumen, fecha, badge de estado y advertencia de email. Usar `PaginationControls` con la paginación del backend. Diferenciar:

```ts
const hasActiveFilters = Boolean(
  filters.search || filters.status || filters.originType || filters.branchId
  || filters.dateFrom || filters.dateTo
);
const emptyMessage = hasActiveFilters
  ? 'Ningún reclamo coincide con los filtros.'
  : 'Todavía no hay reclamos recibidos.';
```

- [ ] **Step 4: Implementar detalle y acciones seguras**

`Responder por correo` usa `window.location.href = buildComplaintMailto(...)` y no invoca `setStatus`. `Marcar como atendido` y `Reabrir` actualizan servidor, reemplazan el detalle y refrescan la fila. Un adjunto llama primero a `createAttachmentUrl` y luego `window.open(url, '_blank', 'noopener,noreferrer')`.

Para fallos de email, mostrar botones separados:

```tsx
{complaint.confirmationEmailStatus === 'failed' && (
  <Button onClick={() => onRetryEmail(['confirmation'])}>Reintentar confirmación</Button>
)}
{complaint.notificationEmailStatus === 'failed' && (
  <Button onClick={() => onRetryEmail(['notification'])}>Reintentar aviso central</Button>
)}
```

- [ ] **Step 5: Verificar errores, filtros y detalle**

Run: `npm test && npm run build`

Prueba manual con fixtures o staging:

- 0 casos sin filtros.
- 0 resultados con filtros.
- Más de una página.
- Selección y cierre del detalle.
- Atender y reabrir.
- Abrir adjunto.
- Mailto no cambia estado.
- Reintento muestra `sending`, luego `sent` o `failed`.

- [ ] **Step 6: Commit**

```bash
git add src/features/complaints/ComplaintFilters.tsx src/features/complaints/ComplaintDetail.tsx src/features/complaints/ComplaintsPanel.tsx
git commit -m "feat: add admin complaints panel"
```

---

### Task 8: Integrar navegación administrativa, enlace profundo y QR

**Files:**
- Create: `src/features/complaints/ComplaintQrDownload.tsx`
- Modify: `src/App.tsx:145-162,576-618,1638-1675`
- Modify: `src/components/HomeScreen.tsx:1-28,420-555`
- Modify: `package.json:5-68`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `ComplaintsPanel`, `qrcode`, rol de usuario y query params.
- Produces: acceso admin, contador, deep link y descarga del QR universal.

- [ ] **Step 1: Instalar QR y crear la descarga**

Run:

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

Implementar:

```tsx
export interface ComplaintQrDownloadProps { publicUrl: string }

export async function downloadComplaintQr(publicUrl: string): Promise<void> {
  const qrUrl = new URL('/reclamos', publicUrl).toString();
  const dataUrl = await QRCode.toDataURL(qrUrl, { width: 1024, margin: 2, errorCorrectionLevel: 'H' });
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = 'qr-reclamos-conectoca.png';
  anchor.click();
}

export function ComplaintQrDownload({ publicUrl }: ComplaintQrDownloadProps) {
  return <Button type="button" variant="outline" onClick={() => void downloadComplaintQr(publicUrl)}>
    Descargar QR
  </Button>;
}
```

El componente usa `window.location.origin` en producción; la URL del QR siempre termina en `/reclamos` y nunca contiene `businessId`.

- [ ] **Step 2: Añadir pantalla y acceso solo admin**

Agregar `'complaints'` a `Pantalla`. Extender `HomeScreenProps`:

```ts
onViewComplaints?: () => void;
pendingComplaintsCount?: number;
```

Renderizar el botón únicamente cuando `user.role === 'admin' && onViewComplaints`, con badge de pendientes. En `App`, pasar el callback solo a admin y renderizar:

```tsx
{currentScreen === 'complaints' && currentUser?.role === 'admin' && accessToken && (
  <ComplaintsPanel
    accessToken={accessToken}
    initialComplaintId={pendingComplaintId}
    onBack={() => setCurrentScreen('home')}
  />
)}
```

Definir `const [pendingComplaintId, setPendingComplaintId] = useState<string | null>(null);` junto al resto del estado de navegación y limpiarlo al cerrar el detalle.

- [ ] **Step 3: Conservar y consumir enlaces profundos**

Definir funciones puras en `src/features/complaints/deepLink.ts` y probarlas:

```ts
export const COMPLAINT_DEEP_LINK_KEY = 'conectoca_pending_complaint_id';

export function complaintIdFromLocation(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get('screen') === 'complaints' ? params.get('case') : null;
}
```

Antes de login, guardar el UUID en `sessionStorage`. Después de restaurar perfil, si el rol es admin, abrir `complaints`; para cualquier otro rol, borrar el valor sin consultar el backend. Limpiar el query string con `history.replaceState` una vez consumido.

- [ ] **Step 4: Cargar el contador sin acoplarlo a pedidos**

Agregar un request administrativo con `status=pending&limit=1` y usar `pagination.total`. Cargarlo solo para admin al entrar a home; un error deja el badge oculto y no bloquea pedidos ni navegación.

- [ ] **Step 5: Verificar roles, deep link y QR**

Run: `npm test && npm run build`

Comprobar:

- Admin ve Reclamos y el contador correcto.
- `local`, `production`, `dispatch`, `worker`, `user` y `pastry` no ven el botón.
- Un deep link sin sesión abre login y después el caso para admin.
- El mismo enlace con rol no admin no consulta el caso.
- El PNG escaneado abre exactamente `/reclamos`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/App.tsx src/components/HomeScreen.tsx src/features/complaints/ComplaintQrDownload.tsx src/features/complaints/deepLink.ts src/features/complaints/deepLink.test.ts
git commit -m "feat: integrate complaints navigation and QR"
```

---

### Task 9: Documentar operación y ejecutar verificación integral

**Files:**
- Create: `docs/reclamos-operacion.md`

**Interfaces:**
- Consumes: sistema completo y valores reales de staging.
- Produces: procedimiento reproducible de despliegue y evidencia de aceptación.

- [ ] **Step 1: Escribir la guía operacional con comandos exactos**

La guía debe incluir:

```bash
npx supabase secrets set \
  COMPLAINTS_BUSINESS_ID="$COMPLAINTS_BUSINESS_ID" \
  COMPLAINTS_RECIPIENT_EMAIL="$COMPLAINTS_RECIPIENT_EMAIL" \
  COMPLAINTS_FROM_EMAIL="$COMPLAINTS_FROM_EMAIL" \
  RESEND_API_KEY="$RESEND_API_KEY" \
  APP_PUBLIC_URL="$APP_PUBLIC_URL" \
  COMPLAINTS_RATE_LIMIT_SECRET="$COMPLAINTS_RATE_LIMIT_SECRET"

npx supabase functions deploy complaints --no-verify-jwt
```

Explicar cómo verificar dominio remitente, rotar secretos, detectar `failed` en el panel, reintentar correos, probar el QR después de cada cambio de dominio y mantener privado el bucket.

- [ ] **Step 2: Ejecutar toda la suite local**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: todos los tests pasan, Vite compila y no hay errores de whitespace.

- [ ] **Step 3: Ejecutar matriz de seguridad en staging**

Usar tokens reales separados y registrar resultado de cada probe:

```text
Sin token              → public branches 200; admin list 401
Token local            → admin list 403
Token production       → admin list 403
Token admin otro negocio → admin list 403
Token admin correcto   → admin list 200
URL firmada expirada   → Storage rechaza acceso
```

- [ ] **Step 4: Ejecutar el recorrido de aceptación**

1. Escanear el QR con un teléfono.
2. Enviar un reclamo de sucursal con imagen y PDF.
3. Confirmar que pantalla, correo del cliente y correo central muestran el mismo número.
4. Abrir el enlace central, iniciar sesión y verificar que abre el caso.
5. Abrir ambas evidencias desde el panel.
6. Pulsar `Responder por correo` y verificar destinatario, asunto y cuerpo.
7. Volver sin enviar y confirmar que sigue `Pendiente`.
8. Marcar `Atendido`, recargar y confirmar persistencia.
9. Reabrir y confirmar que vuelve a `Pendiente`.
10. Simular API de correo fallida, crear otro caso y confirmar que se conserva y puede reintentarse.

- [ ] **Step 5: Revisar que el commit no incluya trabajo ajeno**

Run:

```bash
git status --short
git diff --name-only HEAD~1
```

Separar cualquier archivo preexistente que no pertenezca al módulo antes de confirmar.

- [ ] **Step 6: Commit**

```bash
git add docs/reclamos-operacion.md
git commit -m "docs: add complaints operations runbook"
```

---

## Final Acceptance Criteria

- El mismo QR funciona para todas las sucursales y no expone información de empresa.
- Un cliente sin cuenta puede crear exactamente un caso y recibe un número legible.
- El caso y las evidencias sobreviven a fallos de correo.
- El correo central y la confirmación se registran por separado y pueden reintentarse.
- Solo administradores de la organización configurada pueden acceder al panel.
- El botón de respuesta abre el correo y el estado solo cambia por acción explícita.
- La bandeja busca, filtra, pagina, atiende, reabre y abre evidencias privadas.
- Los tests, build, probes de seguridad y recorrido móvil final pasan antes de producción.
