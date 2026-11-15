# «Para comprar» (reposición según rotación) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la administración vea en el panel de Distribuidora qué productos se están por agotar según su rotación real y cuánto comprar de cada uno.

**Architecture:** Un módulo puro (`replenishment.ts`, junto a `authz.ts`) hace todo el cálculo y se prueba con `node --test`. La Edge Function `make-server-6d979413` expone `GET /distribution/replenishment` (lee productos, despachos de 28 días y ajustes, y llama al módulo) y `PUT /distribution/replenishment/settings`. Los ajustes viven en la tabla nueva `business_replenishment_settings`. El panel muestra una píldora «Para comprar» que abre un componente nuevo `ParaComprar.tsx`.

**Tech Stack:** Supabase (Postgres + Edge Function Deno con Hono), React 18 + Vite, Capacitor 7, `node --test` para las pruebas (no hay Deno local).

**Spec:** `docs/superpowers/specs/2026-11-15-para-comprar-reposicion-design.md`

## Global Constraints

- Ventana de rotación: **28 días**. Ajustes por defecto: **cobertura 7 días**, **aviso 3 días**. Rangos: cobertura 1–60, aviso 1–30, aviso ≤ cobertura, ambos enteros.
- Solo rol **`admin`** (permiso `distribucion.reposicion`), en el endpoint y en la pestaña.
- Salidas netas = `despacho` − `devolucion` (piso 0). `merma`, `ajuste` y `reposicion` no cuentan.
- Se excluyen `unlimited_stock = true`, `stock = -1`, `track_stock = false` y productos archivados (`archived_at` no nulo).
- El 10 por defecto (`MIN_STOCK_POR_DEFECTO`) **no** se usa en este cálculo: solo el `min_stock` cargado.
- Un error de consulta nunca se devuelve como lista vacía: 500 en el servidor y mensaje con «Reintentar» en el panel.
- Textos de la interfaz en español de Chile, mismo estilo iOS inline del panel (Tailwind está precompilado: estilos inline).
- Pruebas: `npm test` (glob ya incluye `supabase/functions/make-server-6d979413/*.test.ts` y `src/utils/*.test.ts`). Los `.ts` se importan con extensión (`./authz.ts`).
- Commits en la rama `feat/para-comprar` (worktree `../ConectocaClone-para-comprar`), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Ajuste al spec (decidido al planificar):** la ventana de un producto nuevo empieza en `products.created_at` y no en su primer evento de `stock_events`. Sacar el primer evento por producto exige leer todo el historial (PostgREST no agrupa); `created_at` da el mismo resultado para los productos creados después del 19-08 (inicio del kardex) y para los anteriores la ventana es siempre de 28 días. La Tarea 1 actualiza el spec.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/make-server-6d979413/authz.ts` (modificar) | Permiso `distribucion.reposicion` |
| `supabase/functions/make-server-6d979413/replenishment.ts` (crear) | Cálculo puro + validación de ajustes |
| `supabase/functions/make-server-6d979413/replenishment.test.ts` (crear) | Pruebas del cálculo |
| `supabase/migrations/20261115_a_business_replenishment_settings.sql` (crear) | Tabla de ajustes |
| `supabase/functions/make-server-6d979413/index.ts` (modificar) | Rutas GET y PUT |
| `src/utils/api.tsx` (modificar) | Tipos y `replenishmentAPI` |
| `src/utils/listaCompra.ts` + `.test.ts` (crear) | Texto para compartir y filtro por categoría/búsqueda |
| `src/utils/descargarArchivo.ts` (modificar) | `compartirTexto` (nativo / web / portapapeles) |
| `src/components/ParaComprar.tsx` (crear) | Lista, ajustes, compartir y Excel |
| `src/components/DistributionPanel.tsx` (modificar) | Píldora y carga de la reposición |
| `src/App.tsx` (modificar) | Pasar `puedeVerReposicion` al panel |

---

### Task 1: Permiso `distribucion.reposicion` (y ajuste del spec)

**Files:**
- Modify: `supabase/functions/make-server-6d979413/authz.ts` (tipo `Permiso` y `MATRIZ`)
- Test: `supabase/functions/make-server-6d979413/authz.test.ts`
- Modify: `docs/superpowers/specs/2026-11-15-para-comprar-reposicion-design.md`

**Interfaces:**
- Produces: permiso `'distribucion.reposicion'` usable con `tienePermiso(profile, 'distribucion.reposicion')`.

- [ ] **Step 1: Escribir la prueba que falla**

En `authz.test.ts`, agregar `'distribucion.reposicion'` a la lista `permisosConocidos` del test «admin tiene todos los permisos de la matriz», y al final del archivo:

```ts
test('para comprar: solo admin ve la reposición sugerida', () => {
  assert.equal(tienePermiso(admin, 'distribucion.reposicion'), true);
  for (const perfil of [production, dispatch, local, worker, { role: 'pastry', businessId: NEGOCIO_A }, { role: 'user', businessId: NEGOCIO_A }]) {
    assert.equal(tienePermiso(perfil, 'distribucion.reposicion'), false, `${perfil.role} no debería verla`);
  }
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test supabase/functions/make-server-6d979413/authz.test.ts`
Expected: FAIL (el permiso no existe en la matriz: `admin debería tener distribucion.reposicion`).

- [ ] **Step 3: Implementar**

En `authz.ts`, en el tipo `Permiso`, debajo de `| 'productos.kardex'`:

```ts
  | 'distribucion.reposicion'
```

En `MATRIZ`, debajo de `'productos.kardex': ['admin', 'production'],`:

```ts
  // «Para comprar»: rotación y cantidades sugeridas de la Distribuidora. Es una
  // decisión de compra (plata del negocio): solo administración.
  'distribucion.reposicion': ['admin'],
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test supabase/functions/make-server-6d979413/authz.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Ajustar el spec**

En el spec, en la tabla «Cálculo», reemplazar la fila «Ventana» por:

```
| Ventana | 28 días hasta ahora. Si el producto se creó hace menos (`products.created_at`), la ventana empieza en su creación (mínimo 1 día). |
```

Y en «Edge Function», paso 3, reemplazar «; y otra que trae el primer `created_at` por producto (para la ventana de productos nuevos)» por «(la ventana de los productos nuevos usa `products.created_at`, que ya viene con los productos)». En la firma de `calcularReposicion`, quitar el parámetro `primerEvento` y agregar `createdAt: string` a `ProductoStock`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/make-server-6d979413/authz.ts supabase/functions/make-server-6d979413/authz.test.ts docs/superpowers/specs/2026-11-15-para-comprar-reposicion-design.md
git commit -m "feat(authz): permiso distribucion.reposicion (solo admin)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cálculo puro de la reposición

**Files:**
- Create: `supabase/functions/make-server-6d979413/replenishment.ts`
- Test: `supabase/functions/make-server-6d979413/replenishment.test.ts`

**Interfaces:**
- Produces (usadas por las Tareas 4 y 5):

```ts
export const VENTANA_DIAS = 28;
export const AJUSTES_POR_DEFECTO: AjustesReposicion; // { coverageDays: 7, alertDays: 3 }
export interface ProductoStock { id: string; name: string; categoryId: string | null; stock: number; minStock: number | null; unlimitedStock: boolean | null; trackStock: boolean | null; createdAt: string }
export interface SalidasProducto { despachos: number; devoluciones: number }
export interface AjustesReposicion { coverageDays: number; alertDays: number }
export type MotivoReposicion = 'agotado' | 'pocos_dias' | 'bajo_minimo' | 'sin_ventas_recientes';
export interface FilaReposicion { productId: string; name: string; categoryId: string | null; stock: number; minStock: number | null; rotacionDiaria: number; diasQueAlcanza: number | null; comprar: number; motivo: MotivoReposicion }
export function calcularReposicion(productos: ProductoStock[], salidas: Map<string, SalidasProducto>, ajustes: AjustesReposicion, ahora: Date): FilaReposicion[];
export function sumarSalidas(eventos: { product_id: string; type: string; quantity: number | string }[]): Map<string, SalidasProducto>;
export function validarAjustes(body: unknown): { ok: true; ajustes: AjustesReposicion } | { ok: false; error: string };
```

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `replenishment.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AJUSTES_POR_DEFECTO,
  calcularReposicion,
  sumarSalidas,
  validarAjustes,
  type ProductoStock,
  type SalidasProducto,
} from './replenishment.ts';

const AHORA = new Date('2026-11-15T12:00:00Z');
const HACE_UN_ANO = '2025-11-15T12:00:00Z';

function producto(id: string, stock: number, extra: Partial<ProductoStock> = {}): ProductoStock {
  return { id, name: `Producto ${id}`, categoryId: 'cat', stock, minStock: null, unlimitedStock: false, trackStock: true, createdAt: HACE_UN_ANO, ...extra };
}
function salidas(entries: [string, number, number?][]): Map<string, SalidasProducto> {
  return new Map(entries.map(([id, despachos, devoluciones = 0]) => [id, { despachos, devoluciones }]));
}
const calcular = (ps: ProductoStock[], s: Map<string, SalidasProducto>, ajustes = AJUSTES_POR_DEFECTO) =>
  calcularReposicion(ps, s, ajustes, AHORA);

test('rotación = (despachos − devoluciones) ÷ 28 y días que alcanza = stock ÷ rotación', () => {
  // 280 − 28 = 252 en 28 días → 9/día; stock 18 → 2 días (< 3) → entra
  const [fila] = calcular([producto('a', 18)], salidas([['a', 280, 28]]));
  assert.equal(fila.rotacionDiaria, 9);
  assert.equal(fila.diasQueAlcanza, 2);
  assert.equal(fila.motivo, 'pocos_dias');
  // 9 × 7 − 18 = 45
  assert.equal(fila.comprar, 45);
});

test('devoluciones mayores que despachos → salidas 0, sin rotación', () => {
  const filas = calcular([producto('a', 5)], salidas([['a', 2, 10]]));
  assert.equal(filas.length, 0); // sin rotación y sin mínimo: no aparece
});

test('producto creado hace 7 días: la ventana es de 7 días, no de 28', () => {
  const nuevo = producto('n', 10, { createdAt: '2026-11-08T12:00:00Z' });
  const [fila] = calcular([nuevo], salidas([['n', 70]])); // 70 ÷ 7 = 10/día → 1 día
  assert.equal(fila.rotacionDiaria, 10);
  assert.equal(fila.diasQueAlcanza, 1);
});

test('producto creado hace minutos: la ventana mínima es 1 día', () => {
  const recien = producto('r', 0, { createdAt: '2026-11-15T11:00:00Z' });
  const [fila] = calcular([recien], salidas([['r', 6]]));
  assert.equal(fila.rotacionDiaria, 6);
});

test('no aparece si el stock cubre el umbral de aviso', () => {
  // 56 en 28 días = 2/día; stock 10 → 5 días ≥ 3
  assert.equal(calcular([producto('a', 10)], salidas([['a', 56]])).length, 0);
});

test('entra por mínimo manual aunque le queden muchos días', () => {
  // 1/día, stock 20 → 20 días; mínimo 24 → entra
  const [fila] = calcular([producto('a', 20, { minStock: 24 })], salidas([['a', 28]]));
  assert.equal(fila.motivo, 'bajo_minimo');
  // por rotación: 1 × 7 − 20 = −13; por mínimo: 24 − 20 = 4 → 4
  assert.equal(fila.comprar, 4);
});

test('sin ventas recientes: entra solo por mínimo y se marca', () => {
  const [fila] = calcular([producto('a', 2, { minStock: 5 })], new Map());
  assert.equal(fila.motivo, 'sin_ventas_recientes');
  assert.equal(fila.rotacionDiaria, 0);
  assert.equal(fila.diasQueAlcanza, null);
  assert.equal(fila.comprar, 3);
});

test('sin ventas y sin mínimo manual: no aparece (el 10 por defecto no se usa)', () => {
  assert.equal(calcular([producto('a', 1)], new Map()).length, 0);
});

test('agotado con rotación', () => {
  const [fila] = calcular([producto('a', 0)], salidas([['a', 28]]));
  assert.equal(fila.motivo, 'agotado');
  assert.equal(fila.diasQueAlcanza, 0);
  assert.equal(fila.comprar, 7);
});

test('cantidad: redondea hacia arriba y nunca es menor que 1', () => {
  // 0,5/día → stock 1 = 2 días; 0,5 × 7 − 1 = 2,5 → 3
  assert.equal(calcular([producto('a', 1)], salidas([['a', 14]]))[0].comprar, 3);
  // aviso 3, cobertura 3: 1/día, stock 2,5 → 2,5 días; 1 × 3 − 2,5 = 0,5 → 1
  assert.equal(calcular([producto('b', 2.5)], salidas([['b', 28]]), { coverageDays: 3, alertDays: 3 })[0].comprar, 1);
});

test('stock negativo se trata como 0', () => {
  const [fila] = calcular([producto('a', -3)], salidas([['a', 28]]));
  assert.equal(fila.stock, 0);
  assert.equal(fila.motivo, 'agotado');
});

test('excluye productos sin control de stock', () => {
  const ps = [
    producto('ilimitado', 0, { unlimitedStock: true }),
    producto('menos-uno', -1),
    producto('sin-control', 0, { trackStock: false }),
  ];
  assert.equal(calcular(ps, salidas([['ilimitado', 99], ['menos-uno', 99], ['sin-control', 99]])).length, 0);
});

test('orden: agotados, luego por días que alcanza, al final sin ventas recientes', () => {
  const ps = [
    producto('sin-ventas', 1, { minStock: 3 }),
    producto('dos-dias', 2),
    producto('agotado', 0),
    producto('un-dia', 1),
  ];
  const s = salidas([['dos-dias', 28], ['agotado', 28], ['un-dia', 28]]);
  assert.deepEqual(calcular(ps, s).map(f => f.productId), ['agotado', 'un-dia', 'dos-dias', 'sin-ventas']);
});

test('sumarSalidas agrupa despachos y devoluciones e ignora el resto', () => {
  const m = sumarSalidas([
    { product_id: 'a', type: 'despacho', quantity: 5 },
    { product_id: 'a', type: 'despacho', quantity: '3' },
    { product_id: 'a', type: 'devolucion', quantity: 2 },
    { product_id: 'a', type: 'merma', quantity: 100 },
    { product_id: 'b', type: 'reposicion', quantity: 50 },
  ]);
  assert.deepEqual(m.get('a'), { despachos: 8, devoluciones: 2 });
  assert.equal(m.has('b'), false);
});

test('validarAjustes acepta enteros en rango y rechaza el resto', () => {
  assert.deepEqual(validarAjustes({ coverageDays: 14, alertDays: 4 }), { ok: true, ajustes: { coverageDays: 14, alertDays: 4 } });
  for (const malo of [
    null, {}, { coverageDays: 0, alertDays: 1 }, { coverageDays: 61, alertDays: 3 },
    { coverageDays: 7, alertDays: 0 }, { coverageDays: 7, alertDays: 31 },
    { coverageDays: 5, alertDays: 6 }, { coverageDays: 7.5, alertDays: 3 }, { coverageDays: '7', alertDays: 3 },
  ]) {
    assert.equal(validarAjustes(malo).ok, false, JSON.stringify(malo));
  }
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test supabase/functions/make-server-6d979413/replenishment.test.ts`
Expected: FAIL con `Cannot find module './replenishment.ts'`.

- [ ] **Step 3: Implementar**

Crear `replenishment.ts`:

```ts
/**
 * «Para comprar»: cuánto rota cada producto de la Distribuidora y cuánto reponer.
 * Módulo PURO (sin Supabase ni Hono), como authz.ts: se prueba con `node --test`.
 * Ver docs/superpowers/specs/2026-11-15-para-comprar-reposicion-design.md
 */

export const VENTANA_DIAS = 28;
const DIA_MS = 86_400_000;

export interface AjustesReposicion {
  /** Para cuántos días de venta debe alcanzar la compra. */
  coverageDays: number;
  /** Aparece en la lista cuando el stock alcanza para menos de estos días. */
  alertDays: number;
}

export const AJUSTES_POR_DEFECTO: AjustesReposicion = { coverageDays: 7, alertDays: 3 };

export interface ProductoStock {
  id: string;
  name: string;
  categoryId: string | null;
  stock: number;
  /** Solo el min_stock cargado; el 10 por defecto del panel NO se usa aquí. */
  minStock: number | null;
  unlimitedStock: boolean | null;
  trackStock: boolean | null;
  createdAt: string;
}

export interface SalidasProducto {
  despachos: number;
  devoluciones: number;
}

export type MotivoReposicion = 'agotado' | 'pocos_dias' | 'bajo_minimo' | 'sin_ventas_recientes';

export interface FilaReposicion {
  productId: string;
  name: string;
  categoryId: string | null;
  stock: number;
  minStock: number | null;
  rotacionDiaria: number;
  diasQueAlcanza: number | null;
  comprar: number;
  motivo: MotivoReposicion;
}

/** Suma por producto los despachos y devoluciones (las demás salidas no son demanda). */
export function sumarSalidas(
  eventos: { product_id: string; type: string; quantity: number | string }[],
): Map<string, SalidasProducto> {
  const out = new Map<string, SalidasProducto>();
  for (const e of eventos) {
    if (e.type !== 'despacho' && e.type !== 'devolucion') continue;
    const s = out.get(e.product_id) ?? { despachos: 0, devoluciones: 0 };
    if (e.type === 'despacho') s.despachos += Number(e.quantity);
    else s.devoluciones += Number(e.quantity);
    out.set(e.product_id, s);
  }
  return out;
}

export function calcularReposicion(
  productos: ProductoStock[],
  salidas: Map<string, SalidasProducto>,
  ajustes: AjustesReposicion,
  ahora: Date,
): FilaReposicion[] {
  const filas: FilaReposicion[] = [];
  for (const p of productos) {
    if (p.unlimitedStock === true || p.stock === -1 || p.trackStock === false) continue;

    const s = salidas.get(p.id);
    const netas = Math.max(0, (s?.despachos ?? 0) - (s?.devoluciones ?? 0));
    const diasDeVida = (ahora.getTime() - new Date(p.createdAt).getTime()) / DIA_MS;
    const ventana = Math.min(VENTANA_DIAS, Math.max(1, Number.isFinite(diasDeVida) ? diasDeVida : VENTANA_DIAS));
    const rotacion = netas / ventana;
    const stock = Math.max(0, p.stock);
    const dias = rotacion > 0 ? stock / rotacion : null;
    const minimo = p.minStock;

    const porDias = dias !== null && dias < ajustes.alertDays;
    const porMinimo = minimo !== null && stock <= minimo;
    if (!porDias && !porMinimo) continue;

    const porRotacion = rotacion * ajustes.coverageDays - stock;
    const faltaMinimo = minimo !== null ? minimo - stock : 0;
    // −1e-9: que 3,0000000001 por error de coma flotante no se vuelva 4
    const comprar = Math.max(1, Math.ceil(Math.max(porRotacion, faltaMinimo) - 1e-9));

    const motivo: MotivoReposicion =
      rotacion === 0 ? 'sin_ventas_recientes' : stock <= 0 ? 'agotado' : porDias ? 'pocos_dias' : 'bajo_minimo';

    filas.push({
      productId: p.id,
      name: p.name,
      categoryId: p.categoryId,
      stock,
      minStock: minimo,
      rotacionDiaria: redondear(rotacion),
      diasQueAlcanza: dias === null ? null : redondear(dias),
      comprar,
      motivo,
    });
  }

  const grupo = (f: FilaReposicion) => (f.motivo === 'agotado' ? 0 : f.motivo === 'sin_ventas_recientes' ? 2 : 1);
  return filas.sort((a, b) =>
    grupo(a) - grupo(b) ||
    (a.diasQueAlcanza ?? 0) - (b.diasQueAlcanza ?? 0) ||
    a.stock - b.stock ||
    a.name.localeCompare(b.name, 'es'),
  );
}

export function validarAjustes(body: unknown): { ok: true; ajustes: AjustesReposicion } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const { coverageDays, alertDays } = b;
  if (!Number.isInteger(coverageDays) || (coverageDays as number) < 1 || (coverageDays as number) > 60) {
    return { ok: false, error: 'Los días de cobertura deben ser un número entero entre 1 y 60' };
  }
  if (!Number.isInteger(alertDays) || (alertDays as number) < 1 || (alertDays as number) > 30) {
    return { ok: false, error: 'El aviso debe ser un número entero de días entre 1 y 30' };
  }
  if ((alertDays as number) > (coverageDays as number)) {
    return { ok: false, error: 'El aviso no puede ser mayor que los días de cobertura' };
  }
  return { ok: true, ajustes: { coverageDays: coverageDays as number, alertDays: alertDays as number } };
}

const redondear = (n: number) => Math.round(n * 100) / 100;
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test supabase/functions/make-server-6d979413/replenishment.test.ts`
Expected: PASS (15 pruebas). Si «orden» falla, revisar que `un-dia` (1 ÷ 1 = 1 día) quede antes que `dos-dias` (2 días).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/make-server-6d979413/replenishment.ts supabase/functions/make-server-6d979413/replenishment.test.ts
git commit -m "feat(reposicion): cálculo puro de rotación y cantidad a comprar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tabla de ajustes

**Files:**
- Create: `supabase/migrations/20261115_a_business_replenishment_settings.sql`

**Interfaces:**
- Produces: tabla `public.business_replenishment_settings(business_id, coverage_days, alert_days, updated_at, updated_by)`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20261115_a_business_replenishment_settings.sql
-- «Para comprar»: días de cobertura y de aviso de la reposición, por negocio.
-- Mismo patrón que business_label_settings. Sin fila = valores por defecto (7 y 3),
-- definidos también en replenishment.ts (AJUSTES_POR_DEFECTO).

CREATE TABLE IF NOT EXISTS public.business_replenishment_settings (
  business_id   uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  coverage_days integer NOT NULL DEFAULT 7 CHECK (coverage_days BETWEEN 1 AND 60),
  alert_days    integer NOT NULL DEFAULT 3 CHECK (alert_days BETWEEN 1 AND 30),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  CHECK (alert_days <= coverage_days)
);

-- RLS activo sin políticas: nadie la toca con la anon key; solo el Edge Function
-- (service_role), igual que stock_events y product_lots.
ALTER TABLE public.business_replenishment_settings ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Verificar la sintaxis contra una base local**

Run: `node -e "import('@electric-sql/pglite').then(async ({PGlite})=>{const db=new PGlite();await db.exec('create table public.businesses(id uuid primary key);');await db.exec(require('fs').readFileSync('supabase/migrations/20261115_a_business_replenishment_settings.sql','utf8'));console.log('OK')})"`
Expected: `OK`. Si PGlite no está instalado en este repo, saltar este paso y anotarlo: la migración se valida al aplicarla en la Tarea 7.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261115_a_business_replenishment_settings.sql
git commit -m "feat(db): tabla business_replenishment_settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rutas en la Edge Function

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts` (import junto al de `./authz.ts`, ~línea 17; rutas nuevas justo después de `app.get('/make-server-6d979413/products/:id/stock-events', …)`, ~línea 1782)

**Interfaces:**
- Consumes: `calcularReposicion`, `sumarSalidas`, `validarAjustes`, `AJUSTES_POR_DEFECTO`, `VENTANA_DIAS`, tipo `ProductoStock` (Tarea 2); permiso `'distribucion.reposicion'` (Tarea 1); tabla de la Tarea 3.
- Produces:
  - `GET /make-server-6d979413/distribution/replenishment` → `{ data: { filas: FilaReposicion[]; ajustes: AjustesReposicion; calculadoEn: string } }`
  - `PUT /make-server-6d979413/distribution/replenishment/settings` body `{ coverageDays, alertDays }` → `{ data: AjustesReposicion }`; 400 con `{ error }` si es inválido.

- [ ] **Step 1: Agregar el import**

Debajo del bloque `import { … } from "./authz.ts";`:

```ts
import {
  AJUSTES_POR_DEFECTO,
  VENTANA_DIAS,
  calcularReposicion,
  sumarSalidas,
  validarAjustes,
  type ProductoStock,
} from "./replenishment.ts";
```

- [ ] **Step 2: Agregar las rutas**

Después del cierre de la ruta `GET /products/:id/stock-events`:

```ts
// ─── «Para comprar»: reposición según rotación (solo admin) ─────────────────
// Spec: docs/superpowers/specs/2026-11-15-para-comprar-reposicion-design.md

async function leerAjustesReposicion(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from('business_replenishment_settings')
    .select('coverage_days, alert_days')
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw error;
  return data ? { coverageDays: data.coverage_days, alertDays: data.alert_days } : AJUSTES_POR_DEFECTO;
}

app.get('/make-server-6d979413/distribution/replenishment', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);
    if (!tienePermiso(profile, 'distribucion.reposicion')) return c.json({ error: 'No autorizado' }, 403);

    const ahora = new Date();
    const desde = new Date(ahora.getTime() - VENTANA_DIAS * 86_400_000).toISOString();

    const { data: productos, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id, name, category_id, stock, min_stock, unlimited_stock, track_stock, created_at')
      .eq('business_id', profile.businessId)
      .is('archived_at', null);
    if (prodErr) throw prodErr;

    // PostgREST corta en 1000 filas: se pagina para no subestimar la rotación
    // de un mes con muchos despachos.
    const eventos: { product_id: string; type: string; quantity: number }[] = [];
    for (let desdeFila = 0; ; desdeFila += 1000) {
      const { data: pagina, error: evErr } = await supabaseAdmin
        .from('stock_events')
        .select('product_id, type, quantity')
        .eq('business_id', profile.businessId)
        .in('type', ['despacho', 'devolucion'])
        .gte('created_at', desde)
        .order('created_at', { ascending: true })
        .range(desdeFila, desdeFila + 999);
      if (evErr) throw evErr;
      eventos.push(...(pagina || []));
      if (!pagina || pagina.length < 1000) break;
    }

    const ajustes = await leerAjustesReposicion(profile.businessId);
    const filas = calcularReposicion(
      (productos || []).map((p: any): ProductoStock => ({
        id: p.id,
        name: p.name,
        categoryId: p.category_id ?? null,
        stock: Number(p.stock),
        minStock: p.min_stock != null ? Number(p.min_stock) : null,
        unlimitedStock: p.unlimited_stock,
        trackStock: p.track_stock,
        createdAt: p.created_at,
      })),
      sumarSalidas(eventos),
      ajustes,
      ahora,
    );

    return c.json({ data: { filas, ajustes, calculadoEn: ahora.toISOString() } });
  } catch (err: any) {
    // Nunca [] ante un error: "nada que comprar" es la conclusión opuesta a la real.
    console.error('Error calculando la reposición:', err);
    return c.json({ error: 'No se pudo calcular la reposición' }, 500);
  }
});

app.put('/make-server-6d979413/distribution/replenishment/settings', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);
    if (!tienePermiso(profile, 'distribucion.reposicion')) return c.json({ error: 'No autorizado' }, 403);

    const validacion = validarAjustes(await c.req.json().catch(() => null));
    if (!validacion.ok) return c.json({ error: validacion.error }, 400);

    const { data, error: upsertErr } = await supabaseAdmin
      .from('business_replenishment_settings')
      .upsert({
        business_id: profile.businessId,
        coverage_days: validacion.ajustes.coverageDays,
        alert_days: validacion.ajustes.alertDays,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }, { onConflict: 'business_id' })
      .select('coverage_days, alert_days')
      .single();
    if (upsertErr) {
      console.error('Error guardando ajustes de reposición:', upsertErr);
      return c.json({ error: 'Error al guardar los ajustes' }, 500);
    }

    return c.json({ data: { coverageDays: data.coverage_days, alertDays: data.alert_days } });
  } catch (err: any) {
    console.error('Error actualizando ajustes de reposición:', err);
    return c.json({ error: 'Error al guardar los ajustes' }, 500);
  }
});
```

- [ ] **Step 3: Verificar que el archivo sigue compilando**

No hay Deno local. Run: `npx tsc --noEmit --allowImportingTsExtensions --skipLibCheck --target es2022 --module esnext --moduleResolution bundler supabase/functions/make-server-6d979413/replenishment.ts`
Expected: sin errores. Para `index.ts` (que importa `npm:`/`jsr:`), revisar a ojo que las llaves y paréntesis cierren y correr `npm test` completo:

Run: `npm test`
Expected: PASS (incluye authz y replenishment).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "feat(api): GET reposición y PUT de ajustes (solo admin)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cliente, texto para compartir y compartir texto

**Files:**
- Modify: `src/utils/api.tsx` (debajo de `stockEventsAPI`, ~línea 1213)
- Create: `src/utils/listaCompra.ts`
- Test: `src/utils/listaCompra.test.ts`
- Modify: `src/utils/descargarArchivo.ts` (función nueva al final)

**Interfaces:**
- Consumes: forma de respuesta de la Tarea 4.
- Produces:

```ts
// api.tsx
export type MotivoReposicion = 'agotado' | 'pocos_dias' | 'bajo_minimo' | 'sin_ventas_recientes';
export interface FilaReposicion { productId: string; name: string; categoryId: string | null; stock: number; minStock: number | null; rotacionDiaria: number; diasQueAlcanza: number | null; comprar: number; motivo: MotivoReposicion }
export interface AjustesReposicion { coverageDays: number; alertDays: number }
export interface Reposicion { filas: FilaReposicion[]; ajustes: AjustesReposicion; calculadoEn: string }
export const replenishmentAPI: { get(token: string): Promise<Reposicion>; guardarAjustes(token: string, a: AjustesReposicion): Promise<AjustesReposicion> };
// listaCompra.ts
export function filtrarReposicion(filas: FilaReposicion[], idsCategoria: Set<string> | null, busqueda: string): FilaReposicion[];
export function textoListaCompra(filas: FilaReposicion[], fecha: Date): string;
export function etiquetaMotivo(f: FilaReposicion): string;
// descargarArchivo.ts
export async function compartirTexto(texto: string, titulo: string): Promise<'compartido' | 'copiado'>;
```

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/utils/listaCompra.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaMotivo, filtrarReposicion, textoListaCompra } from './listaCompra.ts';
import type { FilaReposicion } from './api.tsx';

const fila = (productId: string, extra: Partial<FilaReposicion> = {}): FilaReposicion => ({
  productId, name: `Producto ${productId}`, categoryId: 'bebidas', stock: 4, minStock: null,
  rotacionDiaria: 2, diasQueAlcanza: 2, comprar: 10, motivo: 'pocos_dias', ...extra,
});

test('filtra por categoría (con subcategorías ya resueltas) y por búsqueda', () => {
  const filas = [fila('a', { name: 'Coca-Cola 591' }), fila('b', { name: 'Fanta 591', categoryId: 'otra' }), fila('c', { name: 'Agua', categoryId: null })];
  assert.deepEqual(filtrarReposicion(filas, new Set(['bebidas']), '').map(f => f.productId), ['a']);
  assert.deepEqual(filtrarReposicion(filas, null, 'fanta').map(f => f.productId), ['b']);
  assert.deepEqual(filtrarReposicion(filas, null, '').length, 3);
});

test('texto para WhatsApp: título con fecha y una línea por producto', () => {
  const texto = textoListaCompra([fila('a', { name: 'Coca-Cola 591', comprar: 48 }), fila('b', { name: 'Fanta 591', comprar: 1.5 })], new Date('2026-11-15T12:00:00'));
  assert.equal(texto, 'Para comprar — 15-11-2026\n• Coca-Cola 591: 48\n• Fanta 591: 1,5');
});

test('etiqueta del motivo', () => {
  assert.equal(etiquetaMotivo(fila('a', { motivo: 'agotado' })), 'Agotado');
  assert.equal(etiquetaMotivo(fila('a', { diasQueAlcanza: 1.5 })), 'Alcanza 1,5 días');
  assert.equal(etiquetaMotivo(fila('a', { diasQueAlcanza: 1 })), 'Alcanza 1 día');
  assert.equal(etiquetaMotivo(fila('a', { motivo: 'bajo_minimo', minStock: 24 })), 'Bajo el mínimo (24)');
  assert.equal(etiquetaMotivo(fila('a', { motivo: 'sin_ventas_recientes', minStock: 5 })), 'Sin ventas recientes · mín. 5');
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test src/utils/listaCompra.test.ts`
Expected: FAIL con `Cannot find module './listaCompra.ts'`.

- [ ] **Step 3: Implementar el cliente**

En `src/utils/api.tsx`, debajo de `stockEventsAPI`:

```ts
// «Para comprar» (solo admin). Ver docs/superpowers/specs/2026-11-15-para-comprar-reposicion-design.md
export type MotivoReposicion = 'agotado' | 'pocos_dias' | 'bajo_minimo' | 'sin_ventas_recientes';

export interface FilaReposicion {
  productId: string;
  name: string;
  categoryId: string | null;
  stock: number;
  minStock: number | null;
  rotacionDiaria: number;
  diasQueAlcanza: number | null;
  comprar: number;
  motivo: MotivoReposicion;
}

export interface AjustesReposicion {
  coverageDays: number;
  alertDays: number;
}

export interface Reposicion {
  filas: FilaReposicion[];
  ajustes: AjustesReposicion;
  calculadoEn: string;
}

export const replenishmentAPI = {
  get: async (token: string): Promise<Reposicion> => {
    const response = await fetchAPI('/distribution/replenishment', {}, token);
    return response.data;
  },
  guardarAjustes: async (token: string, ajustes: AjustesReposicion): Promise<AjustesReposicion> => {
    const response = await fetchAPI('/distribution/replenishment/settings', {
      method: 'PUT',
      body: JSON.stringify(ajustes),
    }, token);
    return response.data;
  },
};
```

- [ ] **Step 4: Implementar `listaCompra.ts`**

```ts
import type { FilaReposicion } from './api.tsx';

const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Mismo ámbito que el resto del panel: categoría elegida (con subcategorías) y búsqueda por nombre. */
export function filtrarReposicion(filas: FilaReposicion[], idsCategoria: Set<string> | null, busqueda: string): FilaReposicion[] {
  const q = busqueda.trim().toLowerCase();
  return filas
    .filter(f => idsCategoria === null || (!!f.categoryId && idsCategoria.has(f.categoryId)))
    .filter(f => !q || f.name.toLowerCase().includes(q));
}

/** Texto plano para mandar por WhatsApp o copiar. */
export function textoListaCompra(filas: FilaReposicion[], fecha: Date): string {
  const dia = `${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`;
  return [`Para comprar — ${dia}`, ...filas.map(f => `• ${f.name}: ${fmt(f.comprar)}`)].join('\n');
}

export function etiquetaMotivo(f: FilaReposicion): string {
  switch (f.motivo) {
    case 'agotado':
      return 'Agotado';
    case 'pocos_dias':
      return `Alcanza ${fmt(f.diasQueAlcanza ?? 0)} ${f.diasQueAlcanza === 1 ? 'día' : 'días'}`;
    case 'bajo_minimo':
      return `Bajo el mínimo (${fmt(f.minStock ?? 0)})`;
    case 'sin_ventas_recientes':
      return `Sin ventas recientes · mín. ${fmt(f.minStock ?? 0)}`;
  }
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `node --test src/utils/listaCompra.test.ts`
Expected: PASS (3 pruebas).

- [ ] **Step 6: Agregar `compartirTexto`**

Al final de `src/utils/descargarArchivo.ts`:

```ts
/**
 * Comparte un texto (p. ej. la lista «Para comprar» por WhatsApp).
 * Nativo → hoja de compartir del sistema; web → navigator.share si existe; si no,
 * portapapeles. Cancelar la hoja de compartir no es un error.
 */
export async function compartirTexto(texto: string, titulo: string): Promise<'compartido' | 'copiado'> {
  try {
    if (isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: titulo, text: texto, dialogTitle: titulo });
      return 'compartido';
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: titulo, text: texto });
      return 'compartido';
    }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    if (/cancel|abort/i.test(mensaje)) return 'compartido';
    throw err;
  }
  await navigator.clipboard.writeText(texto);
  return 'copiado';
}
```

- [ ] **Step 7: Commit**

```bash
git add src/utils/api.tsx src/utils/listaCompra.ts src/utils/listaCompra.test.ts src/utils/descargarArchivo.ts
git commit -m "feat(reposicion): cliente, texto de la lista y compartir texto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pantalla «Para comprar» en el panel

**Files:**
- Create: `src/components/ParaComprar.tsx`
- Modify: `src/components/DistributionPanel.tsx` (props, estado, `cargar`, píldoras, sección de lista y nota al pie ~líneas 36–40, 82–140, 395–468)
- Modify: `src/App.tsx:1864-1867`

**Interfaces:**
- Consumes: `replenishmentAPI`, tipos `Reposicion`, `FilaReposicion`, `AjustesReposicion` (Tarea 5); `filtrarReposicion`, `textoListaCompra`, `etiquetaMotivo` (Tarea 5); `compartirTexto`, `exportarLibroExcel` (`src/utils/descargarArchivo.ts`); `idsDeCategoriaConHijas` (ya importado en el panel).
- Produces: prop nueva `puedeVerReposicion: boolean` en `DistributionPanel`.

- [ ] **Step 1: Crear `ParaComprar.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Loader2, MessageCircle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import type { AjustesReposicion, FilaReposicion } from '../utils/api';
import { etiquetaMotivo, textoListaCompra } from '../utils/listaCompra';
import { compartirTexto, exportarLibroExcel } from '../utils/descargarArchivo';

/**
 * Lista «Para comprar» del panel de Distribuidora (solo admin). Recibe las filas ya
 * filtradas por la categoría y la búsqueda del panel. Mismo estilo iOS inline.
 */

const IOS = { tarjeta: '#FFFFFF', texto: '#000000', secundario: '#8E8E93', separador: 'rgba(60, 60, 67, 0.18)', azul: '#007AFF', rojo: '#FF3B30', naranja: '#FF9500' };
const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

interface Props {
  filas: FilaReposicion[];
  ajustes: AjustesReposicion | null;
  cargando: boolean;
  error: boolean;
  onReintentar: () => void;
  onGuardarAjustes: (a: AjustesReposicion) => Promise<void>;
}

export function ParaComprar({ filas, ajustes, cargando, error, onReintentar, onGuardarAjustes }: Props) {
  const [cobertura, setCobertura] = useState(String(ajustes?.coverageDays ?? 7));
  const [aviso, setAviso] = useState(String(ajustes?.alertDays ?? 3));
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (ajustes) {
      setCobertura(String(ajustes.coverageDays));
      setAviso(String(ajustes.alertDays));
    }
  }, [ajustes]);

  const guardar = async () => {
    const nuevo = { coverageDays: Number(cobertura), alertDays: Number(aviso) };
    if (ajustes && nuevo.coverageDays === ajustes.coverageDays && nuevo.alertDays === ajustes.alertDays) return;
    setGuardando(true);
    try {
      await onGuardarAjustes(nuevo);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron guardar los ajustes');
      if (ajustes) {
        setCobertura(String(ajustes.coverageDays));
        setAviso(String(ajustes.alertDays));
      }
    } finally {
      setGuardando(false);
    }
  };

  const compartir = async () => {
    if (filas.length === 0) return;
    try {
      const r = await compartirTexto(textoListaCompra(filas, new Date()), 'Para comprar');
      if (r === 'copiado') toast.success('Lista copiada: pégala en WhatsApp');
    } catch {
      toast.error('No se pudo compartir la lista');
    }
  };

  const exportar = async () => {
    if (filas.length === 0) return;
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const hoja = XLSX.utils.json_to_sheet(filas.map(f => ({
        'Producto': f.name,
        'Stock': f.stock,
        'Sale por día': f.rotacionDiaria,
        'Alcanza (días)': f.diasQueAlcanza ?? '',
        'Comprar': f.comprar,
        'Motivo': etiquetaMotivo(f),
      })));
      hoja['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 30 }];
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Para comprar');
      await exportarLibroExcel(libro, `Para_comprar_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch {
      toast.error('No se pudo generar el Excel');
    } finally {
      setExportando(false);
    }
  };

  const inputDias: React.CSSProperties = { width: 56, height: 32, borderRadius: 8, border: `0.5px solid ${IOS.separador}`, textAlign: 'center', fontSize: 16, fontVariantNumeric: 'tabular-nums' };

  return (
    <section>
      <div style={{ ...tarjeta, marginBottom: 12, padding: '10px 16px', display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          Comprar para
          <input type="number" inputMode="numeric" min={1} max={60} value={cobertura} onChange={e => setCobertura(e.target.value)} onBlur={guardar} disabled={guardando} style={inputDias} aria-label="Días de cobertura" />
          días
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          Avisar con menos de
          <input type="number" inputMode="numeric" min={1} max={30} value={aviso} onChange={e => setAviso(e.target.value)} onBlur={guardar} disabled={guardando} style={inputDias} aria-label="Días de aviso" />
          días
        </label>
        {guardando && <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: IOS.secundario }} />}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 6px' }}>
        <h3 style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', fontWeight: 400 }}>
          {cargando || error ? 'Para comprar' : `${filas.length} productos · lo más urgente primero`}
        </h3>
        <span style={{ display: 'flex', gap: 14 }}>
          <button type="button" onClick={compartir} disabled={filas.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 4, color: IOS.azul, fontSize: 15, background: 'none', border: 'none', opacity: filas.length ? 1 : 0.4 }}>
            <MessageCircle style={{ width: 16, height: 16 }} /> Compartir
          </button>
          <button type="button" onClick={exportar} disabled={filas.length === 0 || exportando} style={{ display: 'flex', alignItems: 'center', gap: 4, color: IOS.azul, fontSize: 15, background: 'none', border: 'none', opacity: filas.length ? 1 : 0.4 }}>
            <FileSpreadsheet style={{ width: 16, height: 16 }} /> Excel
          </button>
        </span>
      </div>

      <div style={tarjeta}>
        {cargando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: IOS.secundario }} />
          </div>
        ) : error ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: IOS.rojo }}>No se pudo calcular la reposición.</p>
            <p style={{ fontSize: 13, color: IOS.secundario, marginTop: 4 }}>La lista está vacía porque falló el cálculo, no porque no haya nada que comprar.</p>
            <button type="button" onClick={onReintentar} style={{ marginTop: 10, color: IOS.azul, fontSize: 16, background: 'none', border: 'none' }}>Reintentar</button>
          </div>
        ) : filas.length === 0 ? (
          <p style={{ padding: '28px 16px', textAlign: 'center', fontSize: 15, color: IOS.secundario }}>
            Nada por comprar: todo alcanza para más de {ajustes?.alertDays ?? 3} días.
          </p>
        ) : (
          filas.map((f, i) => {
            const color = f.motivo === 'agotado' ? IOS.rojo : f.motivo === 'sin_ventas_recientes' ? IOS.secundario : IOS.naranja;
            return (
              <div key={f.productId}>
                {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 34 }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 60, padding: '8px 16px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="truncate" style={{ display: 'block', fontSize: 15, color: IOS.texto }}>{f.name}</span>
                    <span style={{ display: 'block', fontSize: 12, color: IOS.secundario }}>
                      Stock {fmt(f.stock)}{f.rotacionDiaria > 0 ? ` · sale ${fmt(f.rotacionDiaria)}/día` : ''} · {etiquetaMotivo(f)}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: 12, color: IOS.secundario }}>Comprar</span>
                    <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>{fmt(f.comprar)}</span>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <p style={{ fontSize: 13, color: IOS.secundario, padding: '8px 16px 0', lineHeight: 1.35 }}>
        Calculado con los despachos de las últimas 4 semanas. Si un producto estuvo agotado parte del mes, la sugerencia puede quedar corta.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Integrar en `DistributionPanel.tsx`**

a) Imports: agregar `replenishmentAPI` y los tipos `Reposicion`, `AjustesReposicion` al import de `'../utils/api'`; agregar:

```tsx
import { ParaComprar } from './ParaComprar';
import { filtrarReposicion } from '../utils/listaCompra';
```

b) Props:

```tsx
interface DistributionPanelProps {
  onBack: () => void;
  accessToken: string;
  /** Solo admin: muestra la píldora «Para comprar». El servidor vuelve a chequearlo. */
  puedeVerReposicion?: boolean;
}

export function DistributionPanel({ onBack, accessToken, puedeVerReposicion = false }: DistributionPanelProps) {
```

c) Estado (junto a `filtroEstado`), cambiando su tipo:

```tsx
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoStock | 'comprar'>('todos');
  const [reposicion, setReposicion] = useState<Reposicion | null>(null);
  const [cargandoReposicion, setCargandoReposicion] = useState(false);
  const [errorReposicion, setErrorReposicion] = useState(false);
```

d) Función de carga (después de `cargar`); su fallo no tumba el resto del panel:

```tsx
  const cargarReposicion = useCallback(async () => {
    if (!puedeVerReposicion) return;
    setCargandoReposicion(true);
    setErrorReposicion(false);
    try {
      setReposicion(await replenishmentAPI.get(accessToken));
    } catch (error) {
      console.error('Error calculando la reposición:', error);
      setErrorReposicion(true);
    } finally {
      setCargandoReposicion(false);
    }
  }, [accessToken, puedeVerReposicion]);

  useEffect(() => { cargarReposicion(); }, [cargarReposicion]);

  const guardarAjustesReposicion = async (ajustes: AjustesReposicion) => {
    await replenishmentAPI.guardarAjustes(accessToken, ajustes);
    await cargarReposicion();
  };
```

En `handleRefrescarManual`, después de `await cargar(true);` agregar `await cargarReposicion();`.

e) Filas filtradas (junto a `filas`):

```tsx
  const filasReposicion = useMemo(() => {
    if (!reposicion) return [];
    const idsValidos = categoriaId === 'all' ? null : idsDeCategoriaConHijas(categories, categoriaId);
    return filtrarReposicion(reposicion.filas, idsValidos, busqueda);
  }, [reposicion, categories, categoriaId, busqueda]);
```

f) Píldora: justo después del `{ESTADOS_STOCK.map(...)}` y antes del cierre del `<div className="sin-scrollbar" …>`:

```tsx
          {puedeVerReposicion && (() => {
            const activo = filtroEstado === 'comprar';
            return (
              <button
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltroEstado('comprar')}
                style={{
                  flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: activo ? 600 : 500,
                  background: activo ? IOS.azul : IOS.tarjeta, color: activo ? '#fff' : IOS.texto,
                  boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
                }}
              >
                Para comprar
                <span style={{ fontSize: 12, fontWeight: 600, opacity: activo ? 0.9 : 0.5 }}>
                  {errorReposicion || cargandoReposicion || !reposicion ? '—' : filasReposicion.length}
                </span>
              </button>
            );
          })()}
```

g) Lista: envolver la `<section>` existente de la lista (desde `{/* Lista */}` hasta su `</section>`) así:

```tsx
        {filtroEstado === 'comprar' ? (
          <ParaComprar
            filas={filasReposicion}
            ajustes={reposicion?.ajustes ?? null}
            cargando={cargandoReposicion && !reposicion}
            error={errorReposicion}
            onReintentar={() => { cargarReposicion(); }}
            onGuardarAjustes={guardarAjustesReposicion}
          />
        ) : (
          /* …la <section> de la lista existente, sin cambios… */
        )}
```

h) Dentro de esa sección existente, reemplazar el comentario y el párrafo final («Toca un producto para ver sus movimientos. La sugerencia de cuánto y cada cuánto reponer llegará cuando haya más historial.») por:

```tsx
          <p style={{ fontSize: 13, color: IOS.secundario, padding: '8px 16px 0', lineHeight: 1.35 }}>
            Toca un producto para ver sus movimientos.{puedeVerReposicion ? ' Lo que conviene reponer y cuánto está en «Para comprar».' : ''}
          </p>
```

i) `filas` filtra con `x.estado === filtroEstado`; con `'comprar'` no se usa (se muestra `ParaComprar`), pero TypeScript debe aceptar la comparación: si marca error, cambiar a `filtroEstado === 'todos' || filtroEstado === 'comprar' || x.estado === filtroEstado`. `handlePedirDescarga` (Excel del encabezado) queda igual.

- [ ] **Step 3: Pasar el permiso desde `App.tsx`**

```tsx
        <DistributionPanel
          onBack={() => setCurrentScreen("profile")}
          accessToken={accessToken}
          puedeVerReposicion={currentUser.role === "admin"}
        />
```

- [ ] **Step 4: Verificar tipos, pruebas y compilación**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos (comparar con `git stash; npx tsc --noEmit -p tsconfig.json; git stash pop` si hay errores previos).

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/ParaComprar.tsx src/components/DistributionPanel.tsx src/App.tsx
git commit -m "feat(distribuidora): pestaña «Para comprar» con ajustes, compartir y Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Aplicar, desplegar y verificar (requiere autorización del usuario)

**Files:** ninguno (operación). Cada paso que toca producción se confirma con el usuario antes.

**Orden de despliegue obligatorio:** 1) aplicar la migración, 2) desplegar la Edge Function, 3) publicar el frontend. Si la función se despliega antes que la tabla, GET/PUT de reposición responden 500 hasta que exista (falla cerrada, pero la función queda caída para los admins). Si el frontend se publica antes que la función, muestra un error (404), no una lista vacía.

- [ ] **Step 1: Aplicar la migración** en el proyecto Supabase de Conectoca (con permiso del usuario): `supabase db push` o la herramienta MCP `apply_migration` con el contenido de `20261115_a_business_replenishment_settings.sql`. Verificar: `select * from business_replenishment_settings;` devuelve 0 filas sin error.

- [ ] **Step 2: Desplegar la función** (con permiso del usuario): `supabase functions deploy make-server-6d979413`. Verificar en los logs que arranca sin `CRITICAL`.

- [ ] **Step 3: Verificar en el navegador** (dev server de Conectoca contra la función desplegada):
  1. Como admin: Perfil → Distribuidora → píldora «Para comprar» con contador; la lista coincide con un cálculo a mano de 2 productos (despachos de 28 días en el kardex ÷ 28).
  2. Cambiar «Comprar para» a 14: se guarda, se recalcula y las cantidades suben.
  3. Poner «Avisar» en 20 con cobertura 14: aparece el error «El aviso no puede ser mayor…» y el valor vuelve.
  4. «Compartir» en web: copia el texto; «Excel» descarga `Para_comprar_<fecha>.xlsx`.
  5. Como `production`: la píldora no aparece; `GET /distribution/replenishment` con su token devuelve 403.
  6. Celular (375 px): la fila de ajustes envuelve sin desbordar.

- [ ] **Step 4: Cerrar**: push de `feat/para-comprar` y PR contra `seguridad/endurecimiento-pre-stores` (la rama de donde salió), solo con autorización del usuario.
