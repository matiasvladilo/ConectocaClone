# Opina: reclamos, sugerencias y felicitaciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el formulario público del QR acepte reclamos, sugerencias y felicitaciones, con número, etiqueta, filtro y mensaje de cierre propios de cada tipo.

**Architecture:** Se agrega `kind` (`complaint` | `suggestion` | `compliment`) al modelo existente de reclamos: columna en Postgres, parámetro en la RPC de inserción, campo validado en la Edge Function `complaints` y en el frontend. Los nombres internos (`complaints`, `ComplaintsPanel`, etc.) no cambian. El despliegue pasa por una fase de transición en que la función acepta envíos sin `kind` como reclamo.

**Tech Stack:** React 18 + Vite + Tailwind **precompilado** (`src/index.css`), Supabase (Postgres, Storage, Edge Functions en Deno con Hono), tests con `node --test` (TypeScript con strip-types).

**Spec:** `docs/superpowers/specs/2026-10-06-opina-tipos-design.md`

## Global Constraints

- Trabajar en el worktree `.worktrees/opina-tipos`, rama `feat/opina-tipos`. Ejecutar `npm install` una vez antes de la Task 1 si `node_modules` no existe.
- Proyecto Supabase vivo: `xxmiujtywnnlqmekakzq` ("conectocadev"). Las migraciones se aplican con la herramienta MCP `apply_migration`, **no** con `supabase db push`.
- Tailwind es precompilado: cualquier clase que no exista en `src/index.css` falla en silencio. Antes de cada commit de UI ejecutar el verificador de la sección "Verificador de clases". Clases que **no** existen y no deben usarse: `grid-cols-3`, `ring-blue-500`, `place-items-center`, `break-words`, `leading-6`, `rounded-2xl` (usar `rounded-xl`).
- Tipos: `complaint`, `suggestion`, `compliment`. Prefijos de número: `REC`, `SUG`, `FEL`.
- Etiquetas visibles: "Reclamo", "Sugerencia", "Felicitación". Colores: reclamo `bg-red-100 text-red-800`, sugerencia `bg-blue-100 text-blue-800`, felicitación `bg-green-100 text-green-800`.
- Descripción: entre **10** y 5.000 caracteres (servidor, cliente y base de datos).
- Mensajes de cierre (pantalla y correo al cliente):
  - Reclamo — "Recibimos tu reclamo" / "Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo."
  - Sugerencia — "Gracias por tu sugerencia" / "Ya la estamos revisando con el equipo para seguir mejorando."
  - Felicitación — "¡Gracias por felicitarnos!" / "Le haremos llegar tus palabras al equipo."
- Rutas públicas: `/opina` y `/reclamos` muestran el mismo formulario. El QR apunta a `/opina`.
- Nombre del panel: "Reclamos y sugerencias".
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Verificador de clases

Guardar como `/tmp/checkcls.py` (o en el scratchpad) y ejecutar con los archivos `.tsx` modificados. No debe imprimir nada más allá de líneas con `lucide-react`, `-`, `-2rem` o identificadores que no son clases (`invalid-branch`, `refresh-token`, `form-token`, `refresh-branches`, `rate-limited`, `top-center`).

```python
import re, sys
css = open('src/index.css').read()
def esc(c): return re.sub(r'([:/\[\]\.\(\)%>,#=!])', r'\\\1', c)
def has(c): return re.search(re.escape('.' + esc(c)) + r'([\s,:{]|$)', css) is not None
tok = re.compile(r'^[a-z0-9:\-/\[\]\.\(\)%_!]+$')
for f in sys.argv[1:]:
    src = open(f).read()
    for m in re.finditer(r'"([^"\n]*)"|\'([^\'\n]*)\'|`([^`]*)`', src):
        val = next(g for g in m.groups() if g is not None)
        val = re.sub(r'\$\{[^}]*\}', ' ', val)
        parts = val.split()
        if not parts or not all(tok.match(p) for p in parts) or not any('-' in p for p in parts):
            continue
        for c in parts:
            if c == 'group' or c.startswith('complaint'):
                continue
            if not has(c):
                print(f.split('/')[-1], c)
```

Run: `python3 /tmp/checkcls.py src/features/complaints/*.tsx src/components/UserProfile.tsx`

---

### Task 1: Dominio y plantillas de correo del backend

**Files:**
- Modify: `supabase/functions/complaints/domain.ts`
- Modify: `supabase/functions/complaints/emailTemplates.ts`
- Test: `supabase/functions/complaints/domain.test.ts`
- Test: `supabase/functions/complaints/emailTemplates.test.ts`
- Test (fixture): `supabase/functions/complaints/adminService.test.ts`

**Interfaces:**
- Produces (`domain.ts`):
  - `export type ComplaintKind = 'complaint' | 'suggestion' | 'compliment';`
  - `export const COMPLAINT_KINDS: readonly ComplaintKind[]`
  - `RawComplaintFields.kind?: string` (opcional solo durante la transición; Task 8 lo vuelve obligatorio)
  - `ValidComplaintFields.kind: ComplaintKind`
- Produces (`emailTemplates.ts`): `ComplaintEmailData.kind: ComplaintKind`. `buildCustomerConfirmation` y `buildCentralNotification` mantienen su firma.

- [ ] **Step 1: Tests de dominio que fallan**

Agregar al final de `supabase/functions/complaints/domain.test.ts`:

```ts
const baseFields = {
  originType: 'other', branchId: '', email: 'cliente@mail.cl',
  name: '', phone: '', description: 'Muy buena atención', honeypot: '',
};

test('acepta los tres tipos de mensaje', () => {
  for (const kind of ['complaint', 'suggestion', 'compliment']) {
    assert.equal(validateComplaintFields({ ...baseFields, kind }).kind, kind);
  }
});

test('rechaza un tipo desconocido', () => {
  assert.throws(() => validateComplaintFields({ ...baseFields, kind: 'queja' }), /tipo/i);
});

test('TRANSICIÓN: sin tipo se trata como reclamo', () => {
  assert.equal(validateComplaintFields({ ...baseFields }).kind, 'complaint');
});

test('la descripción admite desde 10 caracteres', () => {
  assert.equal(validateComplaintFields({ ...baseFields, kind: 'compliment', description: 'Excelente!' }).description, 'Excelente!');
  assert.throws(
    () => validateComplaintFields({ ...baseFields, kind: 'compliment', description: 'Muy bien' }),
    /entre 10 y 5\.000/,
  );
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `node --test supabase/functions/complaints/domain.test.ts`
Expected: FAIL (`kind` es `undefined`; "Muy buena atención" tiene 18 caracteres y hoy se rechaza por el mínimo de 20).

- [ ] **Step 3: Implementar en `domain.ts`**

Debajo de `export type ComplaintOrigin = ...`:

```ts
export type ComplaintKind = 'complaint' | 'suggestion' | 'compliment';

export const COMPLAINT_KINDS: readonly ComplaintKind[] = ['complaint', 'suggestion', 'compliment'];
```

En `RawComplaintFields` agregar `kind?: string;` y en `ValidComplaintFields` agregar `kind: ComplaintKind;`.

En `validateComplaintFields`, justo después del chequeo de `honeypot`:

```ts
  // TRANSICIÓN: el frontend publicado antes de este cambio no envía `kind`.
  // Se elimina en la Task 8, una vez que Netlify publique el formulario nuevo.
  const kind = (String(raw.kind ?? '').trim() || 'complaint') as ComplaintKind;
  if (!COMPLAINT_KINDS.includes(kind)) {
    throw new Error('Tipo de mensaje inválido');
  }
```

Reemplazar el chequeo de longitud de la descripción:

```ts
  if (description.length < 10 || description.length > 5_000) {
    throw new Error('La descripción debe tener entre 10 y 5.000 caracteres');
  }
```

y agregar `kind,` como primer campo del objeto retornado.

- [ ] **Step 4: Verificar dominio**

Run: `node --test supabase/functions/complaints/domain.test.ts`
Expected: PASS.

- [ ] **Step 5: Tests de plantillas que fallan**

Reemplazar `supabase/functions/complaints/emailTemplates.test.ts` completo:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerConfirmation, buildCentralNotification } from './emailTemplates.ts';

const emailData = {
  kind: 'complaint' as const,
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

test('la confirmación al cliente usa el mensaje de cada tipo', () => {
  const cases = [
    ['complaint', 'Recibimos tu reclamo', 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.'],
    ['suggestion', 'Gracias por tu sugerencia', 'Ya la estamos revisando con el equipo para seguir mejorando.'],
    ['compliment', '¡Gracias por felicitarnos!', 'Le haremos llegar tus palabras al equipo.'],
  ] as const;
  for (const [kind, title, message] of cases) {
    const email = buildCustomerConfirmation({ ...emailData, kind, caseNumber: 'X-1' });
    assert.equal(email.subject, `${title} — X-1`);
    assert.ok(email.text.includes(message));
    assert.ok(email.html.includes(message));
  }
});

test('el aviso central nombra el tipo', () => {
  assert.match(buildCentralNotification({ ...emailData, kind: 'suggestion' }).subject, /^Nueva sugerencia REC-2026-000123/);
  assert.match(buildCentralNotification({ ...emailData, kind: 'compliment' }).subject, /^Nueva felicitación /);
  assert.match(buildCentralNotification(emailData).subject, /^Nuevo reclamo /);
});
```

- [ ] **Step 6: Verificar que fallan**

Run: `node --test supabase/functions/complaints/emailTemplates.test.ts`
Expected: FAIL en los dos tests nuevos.

- [ ] **Step 7: Implementar en `emailTemplates.ts`**

Cambiar la importación y agregar el campo y el mapa de textos:

```ts
import { escapeHtml, type ComplaintKind } from './domain.ts';

export interface ComplaintEmailData {
  kind: ComplaintKind;
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

const KIND_COPY: Record<ComplaintKind, {
  noun: string;
  title: string;
  message: string;
  centralPrefix: string;
}> = {
  complaint: {
    noun: 'Reclamo',
    title: 'Recibimos tu reclamo',
    message: 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.',
    centralPrefix: 'Nuevo reclamo',
  },
  suggestion: {
    noun: 'Sugerencia',
    title: 'Gracias por tu sugerencia',
    message: 'Ya la estamos revisando con el equipo para seguir mejorando.',
    centralPrefix: 'Nueva sugerencia',
  },
  compliment: {
    noun: 'Felicitación',
    title: '¡Gracias por felicitarnos!',
    message: 'Le haremos llegar tus palabras al equipo.',
    centralPrefix: 'Nueva felicitación',
  },
};
```

En `commonHtml`, reemplazar `<h1>Reclamo ${escapeHtml(data.caseNumber)}</h1>` por `<h1>${KIND_COPY[data.kind].noun} ${escapeHtml(data.caseNumber)}</h1>`.

Reemplazar el cuerpo de `buildCustomerConfirmation`:

```ts
  const copy = KIND_COPY[data.kind];
  const caseNumber = escapeHtml(data.caseNumber);
  return {
    subject: `${copy.title} — ${data.caseNumber}`,
    html: `<p>${escapeHtml(copy.title)}. Tu número de caso es <strong>${caseNumber}</strong>.</p>${commonHtml(data)}<p>${escapeHtml(copy.message)}</p>`,
    text: `${copy.title}. Tu número de caso es ${data.caseNumber}.\n\nFecha: ${data.createdAt}\nOrigen: ${data.originLabel}\n\n${copy.message}`,
  };
```

Reemplazar el cuerpo de `buildCentralNotification`:

```ts
  const copy = KIND_COPY[data.kind];
  const adminUrl = escapeHtml(data.adminUrl);
  return {
    subject: `${copy.centralPrefix} ${data.caseNumber} — ${data.originLabel}`,
    html: `${commonHtml(data)}<p><a href="${adminUrl}">Abrir en Conectoca</a></p>`,
    text: `${copy.centralPrefix} ${data.caseNumber} — ${data.originLabel}\n\nCorreo: ${data.customerEmail}\nNombre: ${valueOrFallback(data.customerName, 'No indicado')}\nTeléfono: ${valueOrFallback(data.customerPhone, 'No indicado')}\nDescripción: ${data.description}\nEvidencias: ${data.attachmentCount}\n\nAbrir: ${data.adminUrl}`,
  };
```

En `supabase/functions/complaints/adminService.test.ts`, agregar `kind: 'complaint',` como primer campo de `complaintEmailFixture`.

- [ ] **Step 8: Verificar**

Run: `node --test supabase/functions/complaints/*.test.ts`
Expected: PASS (todos).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/complaints/domain.ts supabase/functions/complaints/domain.test.ts supabase/functions/complaints/emailTemplates.ts supabase/functions/complaints/emailTemplates.test.ts supabase/functions/complaints/adminService.test.ts
git commit -m "feat: tipo de mensaje y textos por tipo en el dominio de reclamos"
```

---

### Task 2: Persistencia, API administrativa y migración

**Files:**
- Create: `supabase/migrations/20261006_a_complaint_kind.sql`
- Modify: `supabase/functions/complaints/repository.ts`
- Modify: `supabase/functions/complaints/adminService.ts`
- Modify: `supabase/functions/complaints/publicService.ts`
- Modify: `supabase/functions/complaints/index.ts`
- Test: `supabase/functions/complaints/publicService.test.ts`
- Test: `supabase/functions/complaints/adminService.test.ts`

**Interfaces:**
- Consumes: `ComplaintKind`, `COMPLAINT_KINDS`, `ValidComplaintFields.kind` (Task 1); `ComplaintEmailData.kind` (Task 1).
- Produces:
  - `NewComplaintRecord.kind: ComplaintKind`, `StoredComplaint.kind: ComplaintKind`
  - `ComplaintSummary.kind: ComplaintKind` (y por herencia `ComplaintDetail.kind`) en las respuestas JSON del panel.
  - `ComplaintListQuery.kind?: ComplaintKind`; query string `kind=<complaint|suggestion|compliment>`.
  - RPC `insert_complaint_with_attachments(..., p_kind text, ...)` que devuelve `kind` en el JSON.
  - Campo multipart `kind` en `POST /public/complaints`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20261006_a_complaint_kind.sql`:

```sql
-- Tipos de mensaje: reclamo, sugerencia o felicitación.
-- La versión anterior de insert_complaint_with_attachments (sin p_kind) se
-- mantiene hasta que la Edge Function nueva esté desplegada; se elimina en
-- 20261006_b_drop_complaint_insert_without_kind.sql.

ALTER TABLE public.complaints
  ADD COLUMN kind text NOT NULL DEFAULT 'complaint'
  CHECK (kind IN ('complaint', 'suggestion', 'compliment'));

ALTER TABLE public.complaints DROP CONSTRAINT complaints_description_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_description_check
  CHECK (char_length(description) BETWEEN 10 AND 5000);

CREATE INDEX complaints_business_kind_created_at_idx
  ON public.complaints (business_id, kind, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_complaint_case_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.case_number := format(
    '%s-%s-%s',
    CASE NEW.kind
      WHEN 'suggestion' THEN 'SUG'
      WHEN 'compliment' THEN 'FEL'
      ELSE 'REC'
    END,
    to_char(current_date, 'YYYY'),
    lpad(NEW.case_serial::text, 6, '0')
  );
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.insert_complaint_with_attachments(
  p_id uuid,
  p_business_id uuid,
  p_kind text,
  p_origin_type text,
  p_branch_profile_id uuid,
  p_branch_name_snapshot text,
  p_customer_email text,
  p_customer_name text,
  p_customer_phone text,
  p_description text,
  p_attachments jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_complaint public.complaints%ROWTYPE;
  v_attachment jsonb;
  v_attachments jsonb := COALESCE(p_attachments, '[]'::jsonb);
BEGIN
  IF jsonb_typeof(v_attachments) <> 'array' THEN
    RAISE EXCEPTION 'p_attachments must be a JSON array';
  END IF;

  INSERT INTO public.complaints (
    id, business_id, kind, origin_type, branch_profile_id, branch_name_snapshot,
    customer_email, customer_name, customer_phone, description
  ) VALUES (
    p_id, p_business_id, p_kind, p_origin_type, p_branch_profile_id, p_branch_name_snapshot,
    p_customer_email, p_customer_name, p_customer_phone, p_description
  ) RETURNING * INTO v_complaint;

  FOR v_attachment IN SELECT value FROM jsonb_array_elements(v_attachments)
  LOOP
    INSERT INTO public.complaint_attachments (
      id, complaint_id, storage_path, original_name, mime_type, size_bytes
    ) VALUES (
      (v_attachment ->> 'id')::uuid,
      p_id,
      v_attachment ->> 'storage_path',
      v_attachment ->> 'original_name',
      v_attachment ->> 'mime_type',
      (v_attachment ->> 'size_bytes')::bigint
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_complaint.id,
    'kind', v_complaint.kind,
    'case_number', v_complaint.case_number,
    'created_at', v_complaint.created_at,
    'origin_type', v_complaint.origin_type,
    'branch_name_snapshot', v_complaint.branch_name_snapshot,
    'customer_email', v_complaint.customer_email,
    'customer_name', v_complaint.customer_name,
    'customer_phone', v_complaint.customer_phone,
    'description', v_complaint.description,
    'attachment_count', jsonb_array_length(v_attachments)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_complaint_with_attachments(
  uuid, uuid, text, text, uuid, text, text, text, text, text, jsonb
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_complaint_with_attachments(
  uuid, uuid, text, text, uuid, text, text, text, text, text, jsonb
) TO service_role;
```

No se aplica aquí: se aplica en la Task 7.

- [ ] **Step 2: Tests que fallan**

En `supabase/functions/complaints/publicService.test.ts`:

1. En `storedComplaint` agregar `kind: 'complaint',` después de `id`.
2. En `submissionForTest`, dentro de `fields`, agregar `kind: 'complaint',` antes de `originType`.
3. En el test `'repositorio persiste caso y adjuntos con una sola RPC transaccional'`: en el `data` devuelto por el `rpc` falso agregar `kind: 'suggestion',`; en el objeto pasado a `repository.insertComplaint` agregar `kind: 'suggestion',`; y al final del test agregar:

```ts
  assert.equal(calls[0]?.parameters.p_kind, 'suggestion');
  assert.equal(result.kind, 'suggestion');
```

4. Agregar al final del archivo:

```ts
test('guarda el tipo validado y lo pasa a los correos', async () => {
  let insertedKind = '';
  const subjects: string[] = [];
  const repository = baseRepository({
    insertComplaint: async input => {
      insertedKind = input.kind;
      return { ...storedComplaint, kind: input.kind };
    },
  });
  const service = publicServiceForTest({
    repository,
    mailer: { send: async input => { subjects.push(input.subject); } },
  });

  await service.submit(submissionForTest({ kind: 'compliment' }));

  assert.equal(insertedKind, 'compliment');
  assert.ok(subjects.some(subject => subject.startsWith('¡Gracias por felicitarnos!')));
  assert.ok(subjects.some(subject => subject.startsWith('Nueva felicitación')));
});
```

En `supabase/functions/complaints/adminService.test.ts`: agregar `kind: 'complaint',` a `complaintDetail` y, al final:

```ts
test('el listado acepta filtrar por tipo y rechaza tipos desconocidos', () => {
  assert.equal(parseComplaintListQuery(new URLSearchParams('kind=suggestion')).kind, 'suggestion');
  assert.throws(() => parseComplaintListQuery(new URLSearchParams('kind=queja')), /tipo/i);
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `node --test supabase/functions/complaints/*.test.ts`
Expected: FAIL en los tres tests tocados (`p_kind` undefined, `insertedKind` vacío, `kind` del query undefined).

- [ ] **Step 4: Implementar `repository.ts`**

1. Importación: `import type { ComplaintKind, ComplaintOrigin } from './domain.ts';`
2. Agregar `kind: ComplaintKind;` en `NewComplaintRecord` (después de `businessId`), en `StoredComplaint` (después de `id`), en `ComplaintRow` (después de `id`) y en `AdminComplaintRow` (después de `business_id`).
3. `toStoredComplaint`: agregar `kind: row.kind,` después de `id`.
4. `toComplaintSummary`: agregar `kind: row.kind,` después de `id`.
5. `ADMIN_SUMMARY_SELECT`: agregar `'kind',` después de `'business_id',`.
6. `insertComplaint`: agregar `p_kind: input.kind,` después de `p_business_id`.
7. `list`: después de la línea del filtro `status` agregar
   `if (query.kind) request = request.eq('kind', query.kind);`
8. `getEmailData`: agregar `kind: row.kind,` como primer campo del objeto retornado.

- [ ] **Step 5: Implementar `adminService.ts`**

1. Importación: `import { COMPLAINT_KINDS, type ComplaintKind, type ComplaintOrigin } from './domain.ts';`
2. `ComplaintListQuery`: agregar `kind?: ComplaintKind;` después de `status`.
3. `ComplaintSummary`: agregar `kind: ComplaintKind;` después de `id`.
4. En `parseComplaintListQuery`, justo después del bloque de `status`:

```ts
  const kind = params.get('kind');
  if (kind) {
    if (!COMPLAINT_KINDS.includes(kind as ComplaintKind)) {
      validationError('El tipo no es válido.');
    }
    query.kind = kind as ComplaintKind;
  }
```

- [ ] **Step 6: Implementar `publicService.ts` e `index.ts`**

En `publicService.ts`, dentro de `options.repository.insertComplaint({ ... })`, agregar `kind: fields.kind,` después de `businessId`. En el objeto `data` usado para las plantillas agregar `kind: complaint.kind,` como primer campo. Cambiar el mensaje de `RATE_LIMITED` a `'No pudimos recibir otro mensaje en este momento.'` y el fallback de validación a `'Los datos del mensaje no son válidos.'`.

En `index.ts`, dentro de `fields: { ... }` del `POST /complaints/public/complaints`, agregar como primera línea:

```ts
      kind: String(form.get('kind') || ''),
```

- [ ] **Step 7: Verificar**

Run: `node --test supabase/functions/complaints/*.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS (todos los tests del repo).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261006_a_complaint_kind.sql supabase/functions/complaints
git commit -m "feat: guardar, filtrar y devolver el tipo de mensaje en la API de reclamos"
```

---

### Task 3: Contrato y utilidades del frontend

**Files:**
- Create: `src/features/complaints/complaintKinds.ts`
- Create: `src/features/complaints/complaintKinds.test.ts`
- Modify: `src/features/complaints/types.ts`
- Modify: `src/features/complaints/validation.ts`
- Modify: `src/features/complaints/api.ts`
- Modify: `src/features/complaints/publicRoute.ts`
- Modify: `src/features/complaints/mailto.ts`
- Modify: `src/features/complaints/complaintQr.ts`
- Modify: `src/features/complaints/formAccessibility.ts`
- Modify: `src/features/complaints/adminPanelState.ts`
- Test: `validation.test.ts`, `publicRoute.test.ts`, `mailto.test.ts`, `complaintQr.test.ts`, `formAccessibility.test.ts`, `adminPanelState.test.ts` (todos en `src/features/complaints/`)

**Interfaces:**
- Produces (`types.ts`):
  - `export type ComplaintKind = 'complaint' | 'suggestion' | 'compliment';`
  - `ComplaintDraft.kind: ComplaintKind | ''`
  - `ComplaintValidationErrors.kind?: string`
  - `ComplaintSummary.kind: ComplaintKind`
  - `ComplaintFilters.kind: ComplaintKind | ''`
- Produces (`complaintKinds.ts`):
  - `COMPLAINT_KIND_OPTIONS: ReadonlyArray<{ value: ComplaintKind; label: string; hint: string }>`
  - `complaintKindLabel(kind: ComplaintKind): string` → "Reclamo" | "Sugerencia" | "Felicitación"
  - `complaintKindNoun(kind: ComplaintKind): string` → "reclamo" | "sugerencia" | "felicitación"
  - `complaintKindSuccess(kind: ComplaintKind): { title: string; message: string }`
  - `complaintDescriptionPlaceholder(kind: ComplaintKind | ''): string`
  - `COMPLAINT_KIND_BADGE_CLASSES: Record<ComplaintKind, string>`
- Produces (`mailto.ts`): `ComplaintMailtoInput.kind: ComplaintKind`.
- Produces: `isPublicComplaintPath` acepta `/opina` y `/reclamos`; `complaintQrUrl` devuelve `<origen>/opina`; `firstInvalidComplaintField` devuelve `'complaint-kind-complaint'` para `kind`.

- [ ] **Step 1: Tests que fallan**

Crear `src/features/complaints/complaintKinds.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPLAINT_KIND_OPTIONS,
  complaintDescriptionPlaceholder,
  complaintKindLabel,
  complaintKindNoun,
  complaintKindSuccess,
} from './complaintKinds.ts';

test('ofrece los tres tipos en orden', () => {
  assert.deepEqual(COMPLAINT_KIND_OPTIONS.map(option => option.value), ['complaint', 'suggestion', 'compliment']);
  assert.deepEqual(COMPLAINT_KIND_OPTIONS.map(option => option.label), ['Reclamo', 'Sugerencia', 'Felicitación']);
});

test('nombres por tipo', () => {
  assert.equal(complaintKindLabel('compliment'), 'Felicitación');
  assert.equal(complaintKindNoun('suggestion'), 'sugerencia');
});

test('mensaje de cierre por tipo', () => {
  assert.deepEqual(complaintKindSuccess('complaint'), {
    title: 'Recibimos tu reclamo',
    message: 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.',
  });
  assert.deepEqual(complaintKindSuccess('suggestion'), {
    title: 'Gracias por tu sugerencia',
    message: 'Ya la estamos revisando con el equipo para seguir mejorando.',
  });
  assert.deepEqual(complaintKindSuccess('compliment'), {
    title: '¡Gracias por felicitarnos!',
    message: 'Le haremos llegar tus palabras al equipo.',
  });
});

test('placeholder neutro sin tipo y específico con tipo', () => {
  assert.match(complaintDescriptionPlaceholder(''), /Cuéntanos/);
  assert.notEqual(complaintDescriptionPlaceholder('compliment'), complaintDescriptionPlaceholder('complaint'));
});
```

En `validation.test.ts`: agregar `kind: 'complaint',` a `validDraft` y al final:

```ts
test('exige elegir el tipo de mensaje', () => {
  assert.equal(validateComplaintDraft({ ...validDraft, kind: '' }).kind, 'Elige qué quieres contarnos');
  assert.equal(validateComplaintDraft({ ...validDraft, kind: 'compliment' }).kind, undefined);
});

test('la descripción admite desde 10 caracteres', () => {
  assert.equal(validateComplaintDraft({ ...validDraft, description: 'Excelente!' }).description, undefined);
  assert.equal(validateComplaintDraft({ ...validDraft, description: 'Muy bien' }).description, 'La descripción debe tener entre 10 y 5.000 caracteres');
});
```

Si algún test existente de `validation.test.ts` espera el texto `'entre 20 y 5.000'`, cambiarlo a `'entre 10 y 5.000'` y usar una descripción de menos de 10 caracteres.

En `publicRoute.test.ts` agregar:

```ts
test('isPublicComplaintPath acepta la ruta nueva /opina', () => {
  assert.equal(isPublicComplaintPath('/opina'), true);
  assert.equal(isPublicComplaintPath('/opina/'), true);
  assert.equal(isPublicComplaintPath('/opina/otro'), false);
});
```

En `mailto.test.ts`: agregar `kind: 'complaint',` a los dos objetos existentes y al final:

```ts
test('mailto usa el tipo en asunto y cuerpo', () => {
  const url = buildComplaintMailto({
    kind: 'compliment',
    email: 'cliente@example.com',
    caseNumber: 'FEL-2026-000007',
    customerName: null,
  });
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('subject'), 'Respuesta a tu felicitación FEL-2026-000007');
  assert.match(params.get('body') ?? '', /en respuesta a tu felicitación FEL-2026-000007/);
});
```

En `complaintQr.test.ts` reemplazar cada `'/reclamos'` esperado por `'/opina'` (por ejemplo `'https://app.conectoca.cl/opina'` y `'http://localhost:5173/opina'`).

En `formAccessibility.test.ts` agregar:

```ts
test('el tipo es el primer campo a enfocar', () => {
  assert.equal(
    firstInvalidComplaintField({ kind: 'x', email: 'y' }),
    'complaint-kind-complaint',
  );
});
```

(usar los mismos imports que ya tiene el archivo).

En `adminPanelState.test.ts`: agregar `kind: '',` al objeto `filters` y, al final:

```ts
test('el tipo cuenta como filtro activo y los conteos lo ignoran', () => {
  assert.equal(getComplaintEmptyMessage({ ...filters, kind: 'suggestion' }), 'Ningún mensaje coincide con los filtros.');
  assert.equal(getComplaintEmptyMessage({ ...filters, page: 1 }), 'Todavía no hay mensajes recibidos.');
  assert.equal(complaintStatusCountFilters('pending').kind, '');
});
```

y agregar `complaintStatusCountFilters` al import si no está. Si un test existente compara con `'Ningún reclamo coincide con los filtros.'` o `'Todavía no hay reclamos recibidos.'`, actualizarlo a los textos nuevos. Si `adminPanelState.test.ts` compara `complaintStatusCountFilters('pending')` con un objeto literal, agregar `kind: ''` a ese objeto.

- [ ] **Step 2: Verificar que fallan**

Run: `node --test src/features/complaints/*.test.ts`
Expected: FAIL (módulo `complaintKinds.ts` inexistente y aserciones nuevas).

- [ ] **Step 3: Implementar `types.ts`**

Agregar arriba:

```ts
export type ComplaintKind = 'complaint' | 'suggestion' | 'compliment';
```

y agregar los campos: `kind: ComplaintKind | '';` como primer campo de `ComplaintDraft`; `kind?: string;` como primer campo de `ComplaintValidationErrors`; `kind: ComplaintKind;` después de `id` en `ComplaintSummary`; `kind: ComplaintKind | '';` después de `search` en `ComplaintFilters`.

- [ ] **Step 4: Crear `complaintKinds.ts`**

```ts
import type { ComplaintKind } from './types';

export const COMPLAINT_KIND_OPTIONS: ReadonlyArray<{ value: ComplaintKind; label: string; hint: string }> = [
  { value: 'complaint', label: 'Reclamo', hint: 'Algo no salió como esperabas' },
  { value: 'suggestion', label: 'Sugerencia', hint: 'Una idea para mejorar' },
  { value: 'compliment', label: 'Felicitación', hint: 'Algo que te gustó' },
];

const NOUNS: Record<ComplaintKind, string> = {
  complaint: 'reclamo',
  suggestion: 'sugerencia',
  compliment: 'felicitación',
};

const SUCCESS: Record<ComplaintKind, { title: string; message: string }> = {
  complaint: {
    title: 'Recibimos tu reclamo',
    message: 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.',
  },
  suggestion: {
    title: 'Gracias por tu sugerencia',
    message: 'Ya la estamos revisando con el equipo para seguir mejorando.',
  },
  compliment: {
    title: '¡Gracias por felicitarnos!',
    message: 'Le haremos llegar tus palabras al equipo.',
  },
};

const PLACEHOLDERS: Record<ComplaintKind | '', string> = {
  '': 'Cuéntanos qué pasó, cuándo y cualquier detalle que nos ayude a entenderlo.',
  complaint: 'Cuéntanos qué pasó, cuándo ocurrió y cualquier detalle que nos ayude a entenderlo.',
  suggestion: 'Cuéntanos tu idea y cómo crees que podríamos mejorar.',
  compliment: 'Cuéntanos qué te gustó y, si quieres, quién te atendió.',
};

export const COMPLAINT_KIND_BADGE_CLASSES: Record<ComplaintKind, string> = {
  complaint: 'bg-red-100 text-red-800',
  suggestion: 'bg-blue-100 text-blue-800',
  compliment: 'bg-green-100 text-green-800',
};

export function complaintKindLabel(kind: ComplaintKind): string {
  return COMPLAINT_KIND_OPTIONS.find(option => option.value === kind)?.label ?? 'Reclamo';
}

export function complaintKindNoun(kind: ComplaintKind): string {
  return NOUNS[kind] ?? 'reclamo';
}

export function complaintKindSuccess(kind: ComplaintKind): { title: string; message: string } {
  return SUCCESS[kind] ?? SUCCESS.complaint;
}

export function complaintDescriptionPlaceholder(kind: ComplaintKind | ''): string {
  return PLACEHOLDERS[kind] ?? PLACEHOLDERS[''];
}
```

- [ ] **Step 5: Implementar el resto de utilidades**

`validation.ts`, al inicio de `validateComplaintDraft` (después de `const errors = {}`):

```ts
  if (draft.kind !== 'complaint' && draft.kind !== 'suggestion' && draft.kind !== 'compliment') {
    errors.kind = 'Elige qué quieres contarnos';
  }
```

y cambiar el chequeo de descripción a `description.length < 10 || description.length > 5_000` con el mensaje `'La descripción debe tener entre 10 y 5.000 caracteres'`.

`api.ts`: en `publicComplaintForm`, agregar `form.append('kind', input.kind);` como primera línea después de `new FormData()`. En `complaintQuery`, después de la línea de `status`: `if (filters.kind) params.set('kind', filters.kind);`.

`publicRoute.ts`:

```ts
const PUBLIC_PATHS = new Set(['/opina', '/reclamos']);

export function isPublicComplaintPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname.replace(/\/+$/, ''));
}
```

`mailto.ts`:

```ts
// Con extensión .ts: los tests corren con `node --test`, que no resuelve
// imports de valores sin extensión (tsconfig tiene allowImportingTsExtensions).
import { complaintKindNoun } from './complaintKinds.ts';
import type { ComplaintKind } from './types';

export interface ComplaintMailtoInput {
  kind: ComplaintKind;
  email: string;
  caseNumber: string;
  customerName: string | null;
}

export function buildComplaintMailto(input: ComplaintMailtoInput): string {
  const noun = complaintKindNoun(input.kind);
  const greeting = input.customerName?.trim() ? `Hola ${input.customerName.trim()},` : 'Hola,';
  const subject = `Respuesta a tu ${noun} ${input.caseNumber}`;
  const body = `${greeting}\n\nTe escribimos en respuesta a tu ${noun} ${input.caseNumber}.\n\nSaludos,`;
  return `mailto:${encodeURIComponent(input.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

`complaintQr.ts`: en `complaintQrUrl` cambiar `'/reclamos'` por `'/opina'`.

`formAccessibility.ts`: agregar `['kind', 'complaint-kind-complaint'],` como primer elemento de `FIELD_IDS`.

`adminPanelState.ts`:
- `DEFAULT_COMPLAINT_FILTERS`: agregar `kind: '',` después de `search`.
- `hasActiveComplaintFilters`: agregar `|| filters.kind` a la condición.
- `getComplaintEmptyMessage`: textos `'Ningún mensaje coincide con los filtros.'` y `'Todavía no hay mensajes recibidos.'`.

- [ ] **Step 6: Verificar**

Run: `node --test src/features/complaints/*.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/complaints
git commit -m "feat: contrato y utilidades de tipos de mensaje en el frontend"
```

---

### Task 4: Formulario público

**Files:**
- Modify: `src/features/complaints/PublicComplaintForm.tsx`

**Interfaces:**
- Consumes: `COMPLAINT_KIND_OPTIONS`, `complaintKindSuccess`, `complaintDescriptionPlaceholder` (Task 3); `ComplaintKind`, `ComplaintDraft.kind`, `ComplaintValidationErrors.kind` (Task 3).
- Produces: botones con ids `complaint-kind-complaint`, `complaint-kind-suggestion`, `complaint-kind-compliment` (el primero lo usa `firstInvalidComplaintField`).

- [ ] **Step 1: Estado y textos**

1. Imports: agregar `Heart, Lightbulb, MessageSquareWarning` a la importación de `lucide-react`, y:

```ts
import {
  COMPLAINT_KIND_OPTIONS,
  complaintDescriptionPlaceholder,
  complaintKindSuccess,
} from './complaintKinds';
```

y `ComplaintKind` al import de tipos.

2. `EMPTY_COMPLAINT_DRAFT`: agregar `kind: '',` como primer campo.

3. Estado del resultado: cambiar el tipo de `result` a `{ caseNumber: string; receivedAt: string; kind: ComplaintKind } | null` y, en `handleSubmit`, reemplazar `setResult(nextResult);` por `setResult({ ...nextResult, kind: draft.kind as ComplaintKind });`.

4. Textos de error de envío: en `handleSubmit` cambiar `'No podemos recibir más reclamos desde esta conexión por ahora...'` por `'No podemos recibir más mensajes desde esta conexión por ahora. Espera una hora e inténtalo nuevamente.'`, `'No pudimos enviar el reclamo. Tus datos y archivos se conservaron; inténtalo nuevamente.'` por `'No pudimos enviar tu mensaje. Tus datos y archivos se conservaron; inténtalo nuevamente.'` y el `toast.error` por `'No pudimos enviar tu mensaje. Inténtalo nuevamente.'`.

- [ ] **Step 2: Pantalla final por tipo**

Reemplazar `ComplaintSuccess` por:

```tsx
function ComplaintSuccess({ result }: { result: { caseNumber: string; receivedAt: string; kind: ComplaintKind } }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = complaintKindSuccess(result.kind);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #0059FF 0%, #0c3c84 100%)' }}>
      <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl" role="status" aria-live="polite" aria-atomic="true">
        <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-700">
          <CheckCircle2 className="h-11 w-11" aria-hidden="true" />
        </span>
        <h1 ref={headingRef} tabIndex={-1} className="mt-6 text-3xl font-bold text-gray-900">{copy.title}</h1>
        <p className="mt-4 text-gray-600" style={{ lineHeight: 1.7 }}>{copy.message}</p>
        <p className="mt-6 text-sm text-gray-500">Tu número de caso es</p>
        <p className="mt-1 text-3xl font-black tracking-tight text-blue-900" style={{ overflowWrap: 'anywhere' }}>{result.caseNumber}</p>
      </section>
    </main>
  );
}
```

(Se quita la línea "Envío confirmado" y el texto fijo "Guarda este número...": el mensaje del tipo lo reemplaza.)

- [ ] **Step 3: Encabezado y paso de tipo**

1. Encabezado: el `<h1>` pasa a `Cuéntanos tu experiencia` y el párrafo a `Reclamos, sugerencias o felicitaciones: todo nos ayuda a mejorar.`

2. Insertar, como primera `<section>` dentro del `<form>` (después de los bloques de `errors` y `submissionMessage`, antes de la sección "¿Dónde se originó?"):

```tsx
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
                <MessageSquareText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Paso 1</p>
                <h2 id="complaint-kind-title" className="text-xl font-bold text-gray-900">¿Qué quieres contarnos?</h2>
              </div>
            </div>

            <div
              role="radiogroup"
              aria-labelledby="complaint-kind-title"
              aria-describedby={errors.kind ? 'complaint-kind-error' : undefined}
              className="flex flex-col gap-2"
            >
              {COMPLAINT_KIND_OPTIONS.map(option => {
                const selected = draft.kind === option.value;
                const Icon = option.value === 'complaint'
                  ? MessageSquareWarning
                  : option.value === 'suggestion' ? Lightbulb : Heart;
                return (
                  <button
                    key={option.value}
                    id={`complaint-kind-${option.value}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={isSubmitting}
                    onClick={() => update({ kind: option.value }, ['kind'])}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-blue-600 bg-blue-50' : errors.kind ? 'border-red-500 bg-white' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                  >
                    <Icon className={`h-6 w-6 shrink-0 ${selected ? 'text-blue-700' : 'text-gray-500'}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-gray-900">{option.label}</span>
                      <span className="block text-sm text-gray-500">{option.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <FieldError id="complaint-kind-error" message={errors.kind} />
          </section>
```

3. Renumerar los rótulos existentes: "Paso 1" → "Paso 2" (¿Dónde se originó?), "Paso 2" → "Paso 3", "Paso 3" → "Paso 4", "Paso 4" → "Paso 5". La sección del Paso 1 nuevo usa `shadow-xl`; la de "¿Dónde se originó?" pasa de `shadow-xl` a `shadow-lg` para que todas las siguientes sean iguales.

4. En la sección de descripción: el `<h2>` pasa a `Cuéntanos más`, el `<label>` a `Detalle <span className="text-red-600">*</span>`, y el `placeholder` del `<textarea>` a `{complaintDescriptionPlaceholder(draft.kind)}`. Cambiar `minLength={20}` por `minLength={10}`.

- [ ] **Step 4: Verificar clases y build**

Run: `python3 /tmp/checkcls.py src/features/complaints/PublicComplaintForm.tsx`
Expected: solo líneas ignorables (ver Global Constraints).

Run: `npm test && npm run build`
Expected: PASS y build sin errores.

- [ ] **Step 5: Revisión en navegador (preview, ancho móvil)**

Levantar el dev server del worktree (ver `.claude/launch.json` del repo principal; agregar una configuración con `runtimeArgs: ["run","dev","--prefix",".worktrees/opina-tipos"]` si no existe) y abrir `/opina` en 375×812:
- Se ven los tres botones, ninguno marcado.
- Enviar vacío muestra "Elige qué quieres contarnos" en el resumen y en el paso 1, y enfoca el botón "Reclamo".
- Al elegir un tipo, el botón queda resaltado y el placeholder de la descripción cambia.
- `/reclamos` muestra el mismo formulario.

No enviar el formulario contra la API real en esta tarea.

- [ ] **Step 6: Commit**

```bash
git add src/features/complaints/PublicComplaintForm.tsx
git commit -m "feat: elegir tipo de mensaje y cierre por tipo en el formulario público"
```

---

### Task 5: Panel de administración

**Files:**
- Create: `src/features/complaints/ComplaintKindBadge.tsx`
- Modify: `src/features/complaints/ComplaintsPanel.tsx`
- Modify: `src/features/complaints/ComplaintDetail.tsx`
- Modify: `src/features/complaints/ComplaintFilters.tsx`
- Modify: `src/components/UserProfile.tsx`

**Interfaces:**
- Consumes: `COMPLAINT_KIND_OPTIONS`, `COMPLAINT_KIND_BADGE_CLASSES`, `complaintKindLabel`, `complaintKindNoun` (Task 3); `ComplaintSummary.kind`, `ComplaintFilters.kind` (Task 3); `buildComplaintMailto({ kind, ... })` (Task 3).
- Produces: `ComplaintKindBadge({ kind }: { kind: ComplaintKind })`.

- [ ] **Step 1: Crear `ComplaintKindBadge.tsx`**

```tsx
import { Badge } from '../../components/ui/badge';
import { COMPLAINT_KIND_BADGE_CLASSES, complaintKindLabel } from './complaintKinds';
import type { ComplaintKind } from './types';

export function ComplaintKindBadge({ kind }: { kind: ComplaintKind }) {
  return <Badge className={COMPLAINT_KIND_BADGE_CLASSES[kind]}>{complaintKindLabel(kind)}</Badge>;
}
```

- [ ] **Step 2: Bandeja (`ComplaintsPanel.tsx`)**

1. `import { ComplaintKindBadge } from './ComplaintKindBadge';`
2. Encabezado: `<h1>` → `Reclamos y sugerencias`; subtítulo → `Mensajes recibidos desde el QR`.
3. En cada fila, reemplazar el párrafo de origen y fecha por:

```tsx
                        <div className="mt-0.5 flex min-w-0 items-center gap-2">
                          <ComplaintKindBadge kind={complaint.kind} />
                          <p className="truncate text-xs text-gray-500">
                            {originLabel(complaint.originType, complaint.branchName)} · {formatDate(complaint.createdAt)}
                          </p>
                        </div>
```

4. Textos: `'No pudimos cargar los reclamos...'` → `'No pudimos cargar los mensajes. Revisa tu conexión e inténtalo nuevamente.'`; `'No pudimos cargar este reclamo...'` → `'No pudimos cargar este mensaje. Inténtalo nuevamente.'`; `aria-label="Cargando reclamos"` → `"Cargando mensajes"`; `Cargando reclamos…` → `Cargando mensajes…`; `Detalle del reclamo` → `Detalle del mensaje`; `...acciones del reclamo seleccionado.` → `...acciones del mensaje seleccionado.`; los avisos `'Reclamo marcado como atendido.'` → `'Marcado como atendido.'` y `'Reclamo reabierto como pendiente.'` → `'Reabierto como pendiente.'`.

- [ ] **Step 3: Detalle (`ComplaintDetail.tsx`)**

1. `import { ComplaintKindBadge } from './ComplaintKindBadge';` y `import { complaintKindNoun } from './complaintKinds';`
2. En el `<header>`, reemplazar `<p className="text-sm text-gray-600">{originLabel(complaint)}</p>` por:

```tsx
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
            <ComplaintKindBadge kind={complaint.kind} />
            <span className="text-sm text-gray-600">{originLabel(complaint)}</span>
          </div>
```

3. La sección `Reclamo` (título de la tarjeta de descripción) pasa a `Mensaje`.
4. `buildComplaintMailto({ ... })`: agregar `kind: complaint.kind,`.
5. `confirmStatusChange`: textos `` `¿Marcar este ${complaintKindNoun(complaint.kind)} como atendido? Este cambio no envía ningún correo al cliente.` `` y `` `¿Reabrir este ${complaintKindNoun(complaint.kind)}? Volverá a aparecer como pendiente.` ``.

- [ ] **Step 4: Filtros (`ComplaintFilters.tsx`)**

1. `import { COMPLAINT_KIND_OPTIONS } from './complaintKinds';`
2. `aria-label="Buscar y filtrar reclamos"` → `"Buscar y filtrar mensajes"`.
3. `clearFilters`: agregar `kind: '',` al objeto de `applyComplaintFilter`.
4. Reemplazar el bloque `<div className="grid grid-cols-2 gap-3">` que contiene Estado y Origen por:

```tsx
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="complaints-kind" className="sr-only">Tipo</Label>
          <select
            id="complaints-kind"
            value={value.kind}
            onChange={event => updateFilter({ kind: event.target.value as ComplaintFiltersValue['kind'] })}
            className={selectClassName}
          >
            <option value="">Tipo: todos</option>
            {COMPLAINT_KIND_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="complaints-status" className="sr-only">Estado</Label>
          <select
            id="complaints-status"
            value={value.status}
            onChange={event => updateFilter({ status: event.target.value as ComplaintFiltersValue['status'] })}
            className={selectClassName}
          >
            <option value="">Estado: todos</option>
            <option value="pending">Pendientes</option>
            <option value="attended">Atendidos</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="complaints-origin" className="sr-only">Origen o sucursal</Label>
        <select
          id="complaints-origin"
          value={originValue}
          onChange={event => onChange(applyComplaintOriginFilter(value, event.target.value))}
          className={selectClassName}
        >
          <option value="">Origen: todos</option>
          {branches.length > 0 && (
            <optgroup label="Sucursales">
              {branches.map(branch => <option key={branch.id} value={`branch:${branch.id}`}>{branch.name.trim()}</option>)}
            </optgroup>
          )}
          {originValue === 'branch' && <option value="branch">Cualquier sucursal</option>}
          <option value="production">Producción / producto</option>
          <option value="other">Otro / no sabe</option>
        </select>
      </div>
```

- [ ] **Step 5: Perfil (`UserProfile.tsx`)**

Cambiar el texto `Panel de Reclamos` por `Reclamos y sugerencias`.

- [ ] **Step 6: Verificar clases, tests y build**

Run: `python3 /tmp/checkcls.py src/features/complaints/*.tsx src/components/UserProfile.tsx`
Expected: solo líneas ignorables, más las ya existentes de `UserProfile.tsx` (`border-pink-200`, `from-pink-50`, `text-pink-700`, `to-fuchsia-50`, `-999999px` y los ids `*-notifications`, `order-updates`), que no son de esta tarea.

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 7: Revisión en navegador**

En el preview, interceptar `fetch` solo en la pestaña (como en la revisión del panel original) para devolver tres filas con `kind` distinto y comprobar: etiqueta de color en cada fila y en el detalle; el selector "Tipo" filtra (la URL de la consulta incluye `kind=`); `Responder por correo` arma el asunto con el tipo. Ancho móvil 375 px sin textos cortados en los selectores.

- [ ] **Step 8: Commit**

```bash
git add src/features/complaints src/components/UserProfile.tsx
git commit -m "feat: etiqueta y filtro de tipo en el panel de reclamos y sugerencias"
```

---

### Task 6: Guía de operación

**Files:**
- Modify: `docs/reclamos-operacion.md`

- [ ] **Step 1: Actualizar la guía**

- Título y primer párrafo: "Reclamos, sugerencias y felicitaciones".
- Donde se menciona `/reclamos` como URL del QR, cambiar a `/opina` y aclarar que `/reclamos` sigue funcionando.
- Agregar una sección "Tipos de mensaje" con la tabla:

| Tipo | Prefijo | Mensaje al cliente |
|---|---|---|
| Reclamo | `REC-` | Recibimos tu reclamo — Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo. |
| Sugerencia | `SUG-` | Gracias por tu sugerencia — Ya la estamos revisando con el equipo para seguir mejorando. |
| Felicitación | `FEL-` | ¡Gracias por felicitarnos! — Le haremos llegar tus palabras al equipo. |

- En "Piezas", listar también `supabase/migrations/20261006_a_complaint_kind.sql` y `20261006_b_drop_complaint_insert_without_kind.sql`.
- En "Recorrido completo", el paso 1 dice `/opina`, y agregar un paso: "Enviar una sugerencia y una felicitación: la pantalla final muestra su mensaje propio y el panel las etiqueta en azul y verde, con números `SUG-` y `FEL-`."

- [ ] **Step 2: Commit**

```bash
git add docs/reclamos-operacion.md
git commit -m "docs: guía de operación con tipos de mensaje y ruta /opina"
```

---

### Task 7: Despliegue en conectocadev (fase de transición)

Esta tarea modifica el entorno que usan los locales. **Confirmar con el usuario antes del Step 5 (merge y push).**

- [ ] **Step 1: Aplicar la migración**

Con la herramienta MCP `apply_migration` (project `xxmiujtywnnlqmekakzq`, name `20261006_a_complaint_kind`) y el contenido exacto de `supabase/migrations/20261006_a_complaint_kind.sql`.

- [ ] **Step 2: Verificar la base de datos**

Con `execute_sql`:

```sql
select case_number, kind from complaints order by created_at;
select p.oid::regprocedure from pg_proc p where p.proname = 'insert_complaint_with_attachments';
select pg_get_constraintdef(oid) from pg_constraint where conname = 'complaints_description_check';
```

Expected: los casos existentes con `kind = complaint` y su número intacto; **dos** versiones de la función (con y sin `p_kind`); el check con `>= 10`.

- [ ] **Step 3: Desplegar la Edge Function**

Run: `npx supabase functions deploy complaints --no-verify-jwt --project-ref xxmiujtywnnlqmekakzq`

Si devuelve un error 500 interno de Supabase, verificar igualmente el Step 4 antes de reintentar: ya ocurrió que el deploy quedó publicado pese al error.

- [ ] **Step 4: Verificar la función**

Run:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://xxmiujtywnnlqmekakzq.supabase.co/functions/v1/complaints/public/branches
curl -s -o /dev/null -w '%{http_code}\n' "https://xxmiujtywnnlqmekakzq.supabase.co/functions/v1/complaints/admin/complaints?kind=queja"
```

Expected: `200` y `401` (sin token la ruta admin rechaza antes de validar filtros).

- [ ] **Step 5: Merge y push (con confirmación del usuario)**

En el checkout principal (que puede tener cambios sin commit ajenos; no tocarlos):

```bash
git fetch origin
git merge --no-ff feat/opina-tipos -m "Merge feat/opina-tipos: reclamos, sugerencias y felicitaciones"
npm test
npm run build
git push origin main
```

- [ ] **Step 6: Verificar Netlify**

Esperar a que `https://conectocadev.netlify.app/opina` sirva un bundle que contenga `¿Qué quieres contarnos?`:

```bash
js=$(curl -s https://conectocadev.netlify.app/opina | grep -oE '/assets/index-[^"]+\.js' | head -1)
curl -s "https://conectocadev.netlify.app$js" | grep -c "Qué quieres contarnos"
```

Expected: `1` o más.

---

### Task 8: Fin de la transición

Ejecutar solo después de que la Task 7 Step 6 confirme que Netlify publicó el formulario nuevo.

**Files:**
- Modify: `supabase/functions/complaints/domain.ts`
- Modify: `supabase/functions/complaints/domain.test.ts`
- Create: `supabase/migrations/20261006_b_drop_complaint_insert_without_kind.sql`

- [ ] **Step 1: Test que falla**

En `domain.test.ts`, reemplazar el test `'TRANSICIÓN: sin tipo se trata como reclamo'` por:

```ts
test('el tipo es obligatorio', () => {
  assert.throws(() => validateComplaintFields({ ...baseFields }), /tipo/i);
});
```

Run: `node --test supabase/functions/complaints/domain.test.ts`
Expected: FAIL.

- [ ] **Step 2: Quitar la tolerancia**

En `domain.ts`, reemplazar el bloque marcado `TRANSICIÓN` por:

```ts
  const kind = requireText(raw.kind, 'El tipo') as ComplaintKind;
  if (!COMPLAINT_KINDS.includes(kind)) {
    throw new Error('Tipo de mensaje inválido');
  }
```

y en `RawComplaintFields` cambiar `kind?: string;` por `kind: string;`.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Migración de limpieza**

Crear `supabase/migrations/20261006_b_drop_complaint_insert_without_kind.sql`:

```sql
-- La Edge Function ya envía p_kind; se elimina la versión sin tipo.
DROP FUNCTION public.insert_complaint_with_attachments(
  uuid, uuid, text, uuid, text, text, text, text, text, jsonb
);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/complaints/domain.ts supabase/functions/complaints/domain.test.ts supabase/migrations/20261006_b_drop_complaint_insert_without_kind.sql
git commit -m "fix: exigir el tipo de mensaje y eliminar la inserción sin tipo"
```

- [ ] **Step 5: Desplegar en orden**

1. `npx supabase functions deploy complaints --no-verify-jwt --project-ref xxmiujtywnnlqmekakzq` y repetir el Step 4 de la Task 7.
2. Aplicar `20261006_b_drop_complaint_insert_without_kind` con `apply_migration`. (Primero la función, después la migración: la función nueva ya no usa la versión sin tipo.)
3. Verificar con `execute_sql` que solo queda una versión de `insert_complaint_with_attachments`.
4. Merge y push a `main` (confirmar con el usuario), como en la Task 7 Step 5.

- [ ] **Step 6: Recorrido de aceptación**

Pedir al usuario que envíe desde el teléfono una sugerencia y una felicitación por `/opina` y confirmar en la base de datos los prefijos `SUG-` y `FEL-`, y en el panel las etiquetas azul y verde.
