# Conexión con Oca Pricing — lado Conectoca (plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Conectoca exponga un punto de integración para Oca Pricing (productos, reposición, recibir precios) y que «Para comprar» muestre dónde comprar, con rotación más sensible a la demanda.

**Architecture:** Lógica pura en módulos junto a `authz.ts` (`replenishment.ts` ampliado, `integracion.ts` nuevo), probada con `node --test`. La Edge Function `make-server-6d979413` agrega tres rutas de integración protegidas con clave y reutiliza un cálculo común de reposición. Los precios recibidos se guardan en `precios_compra` mediante una RPC sin permisos públicos. La pestaña de la app los muestra.

**Tech Stack:** Supabase (Postgres + Edge Function Deno/Hono), React 18 + Vite + Capacitor, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-conexion-oca-pricing-design.md` (y parte 1: `2026-11-15-para-comprar-reposicion-design.md`). Plan B (lado Oca Pricing) vive en el repositorio de Oca Pricing.

## Global Constraints

- Rotación diaria = máx(salidas netas 7 días ÷ ventana7, salidas netas 28 días ÷ ventana28); ventana7 = mín(7, días de vida), ventana28 = mín(28, días de vida), ambas con mínimo 1.
- «Sube» la demanda cuando rotación7 > rotación28 × 1,2.
- Integración: header `X-Integracion-Clave`; variables `OCA_PRICING_CLAVE` (≥ 32 caracteres) y `OCA_PRICING_BUSINESS_ID`. Clave o negocio sin configurar → 503; clave incorrecta → 401. Comparación en tiempo constante. El negocio nunca viene en la petición.
- Integración solo lee productos y reposición de Distribuidora y solo escribe `precios_compra`. Límite 2000 precios por envío.
- Distribuidora = categorías cuyo nombre contiene «distribuidora» (sin distinguir mayúsculas) y todas sus subcategorías.
- `comprarRedondeado = ceil(comprar ÷ formatoUnidades) × formatoUnidades` (igual a `comprar` si `formatoUnidades` es null); `costoEstimado = round(comprarRedondeado × precioUnidad)`; precio «antiguo» si tiene más de 7 días.
- Un error nunca se devuelve como lista vacía (500 con mensaje).
- Rama `feat/para-comprar` en `/Users/matiasvladilo/Desktop/MASTER/ConectocaClone-para-comprar`. Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nada se aplica ni despliega en producción en este plan.
- Pruebas: `npm test`. Imports con extensión `.ts`.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/make-server-6d979413/replenishment.ts` (+test) | Rotación 7/28 |
| `supabase/functions/make-server-6d979413/integracion.ts` (+test, nuevos) | Clave, validación de precios, compra sugerida |
| `supabase/migrations/20261115_b_precios_compra.sql` (nuevo) | Tabla + RPC |
| `supabase/functions/make-server-6d979413/index.ts` | Cálculo común, rutas de integración, `compra` en la reposición |
| `src/utils/api.tsx`, `src/utils/listaCompra.ts` (+test), `src/components/ParaComprar.tsx` | Tipos y pantalla |

---

### Task 1: Rotación sensible a la demanda

**Files:**
- Modify: `supabase/functions/make-server-6d979413/replenishment.ts`
- Test: `supabase/functions/make-server-6d979413/replenishment.test.ts`

**Interfaces:**
- Produces: `SalidasProducto` gana `despachos7?: number; devoluciones7?: number`. `sumarSalidas(eventos: { product_id: string; type: string; quantity: number | string; created_at?: string }[], ahora?: Date)`. `FilaReposicion` gana `rotacion7: number; rotacion28: number` (rotacionDiaria = el mayor). `export const VENTANA_CORTA_DIAS = 7`.

- [ ] **Step 1: Pruebas que fallan** — agregar al final de `replenishment.test.ts`:

```ts
test('si la última semana sale más rápido, manda el ritmo de 7 días', () => {
  // 28 días: 28 → 1/día; 7 días: 21 → 3/día. Stock 6 → 2 días (< 3)
  const s = new Map([['a', { despachos: 28, devoluciones: 0, despachos7: 21, devoluciones7: 0 }]]);
  const [fila] = calcularReposicion([producto('a', 6)], s, AJUSTES_POR_DEFECTO, AHORA);
  assert.equal(fila.rotacion7, 3);
  assert.equal(fila.rotacion28, 1);
  assert.equal(fila.rotacionDiaria, 3);
  assert.equal(fila.comprar, 15); // 3 × 7 − 6
});

test('si la última semana sale menos, se mantiene el promedio del mes', () => {
  // 28 días: 56 → 2/día; 7 días: 0. Stock 4 → 2 días
  const s = new Map([['a', { despachos: 56, devoluciones: 0, despachos7: 0, devoluciones7: 0 }]]);
  const [fila] = calcularReposicion([producto('a', 4)], s, AJUSTES_POR_DEFECTO, AHORA);
  assert.equal(fila.rotacionDiaria, 2);
  assert.equal(fila.rotacion7, 0);
});

test('producto de 3 días: ambas ventanas son de 3 días', () => {
  const nuevo = producto('n', 3, { createdAt: '2026-11-12T12:00:00Z' });
  const s = new Map([['n', { despachos: 9, devoluciones: 0, despachos7: 9, devoluciones7: 0 }]]);
  const [fila] = calcularReposicion([nuevo], s, AJUSTES_POR_DEFECTO, AHORA);
  assert.equal(fila.rotacion7, 3);
  assert.equal(fila.rotacion28, 3);
});

test('sumarSalidas separa la última semana cuando recibe la fecha', () => {
  const m = sumarSalidas([
    { product_id: 'a', type: 'despacho', quantity: 5, created_at: '2026-11-14T10:00:00Z' }, // dentro de 7 días
    { product_id: 'a', type: 'despacho', quantity: 4, created_at: '2026-11-01T10:00:00Z' }, // fuera
    { product_id: 'a', type: 'devolucion', quantity: 1, created_at: '2026-11-13T10:00:00Z' },
  ], AHORA);
  assert.deepEqual(m.get('a'), { despachos: 9, devoluciones: 1, despachos7: 5, devoluciones7: 1 });
});
```

- [ ] **Step 2:** Run `node --test supabase/functions/make-server-6d979413/replenishment.test.ts` → FAIL (`rotacion7` undefined).

- [ ] **Step 3: Implementar.** En `replenishment.ts`:

```ts
export const VENTANA_CORTA_DIAS = 7;

export interface SalidasProducto {
  despachos: number;
  devoluciones: number;
  /** Solo los últimos 7 días (si se calculó con fecha). */
  despachos7?: number;
  devoluciones7?: number;
}
```

En `FilaReposicion` agregar, debajo de `rotacionDiaria: number;`:

```ts
  /** Ritmo de los últimos 7 días y de los últimos 28 (rotacionDiaria es el mayor). */
  rotacion7: number;
  rotacion28: number;
```

Reemplazar `sumarSalidas` por:

```ts
/**
 * Suma por producto los despachos y devoluciones (las demás salidas no son demanda).
 * Con `ahora`, además separa los de los últimos 7 días (eventos con `created_at`).
 */
export function sumarSalidas(
  eventos: { product_id: string; type: string; quantity: number | string; created_at?: string }[],
  ahora?: Date,
): Map<string, SalidasProducto> {
  const desde7 = ahora ? ahora.getTime() - VENTANA_CORTA_DIAS * DIA_MS : null;
  const out = new Map<string, SalidasProducto>();
  for (const e of eventos) {
    if (e.type !== 'despacho' && e.type !== 'devolucion') continue;
    const s = out.get(e.product_id) ?? (desde7 === null
      ? { despachos: 0, devoluciones: 0 }
      : { despachos: 0, devoluciones: 0, despachos7: 0, devoluciones7: 0 });
    const q = Number(e.quantity);
    const reciente = desde7 !== null && !!e.created_at && new Date(e.created_at).getTime() >= desde7;
    if (e.type === 'despacho') {
      s.despachos += q;
      if (reciente) s.despachos7! += q;
    } else {
      s.devoluciones += q;
      if (reciente) s.devoluciones7! += q;
    }
    out.set(e.product_id, s);
  }
  return out;
}
```

En `calcularReposicion`, reemplazar las líneas desde `const netas = …` hasta `const rotacion = netas / ventana;` por:

```ts
    const netas = Math.max(0, (s?.despachos ?? 0) - (s?.devoluciones ?? 0));
    const netas7 = Math.max(0, (s?.despachos7 ?? 0) - (s?.devoluciones7 ?? 0));
    const diasDeVida = (ahora.getTime() - new Date(p.createdAt).getTime()) / DIA_MS;
    const vida = Number.isFinite(diasDeVida) ? diasDeVida : VENTANA_DIAS;
    const ventana28 = Math.min(VENTANA_DIAS, Math.max(1, vida));
    const ventana7 = Math.min(VENTANA_CORTA_DIAS, Math.max(1, vida));
    const rotacion28 = netas / ventana28;
    const rotacion7 = netas7 / ventana7;
    // Si la demanda sube, manda la última semana (avisa antes); si baja, el promedio del mes.
    const rotacion = Math.max(rotacion7, rotacion28);
```

Y en el `filas.push({...})`, después de `rotacionDiaria: redondear(rotacion),`:

```ts
      rotacion7: redondear(rotacion7),
      rotacion28: redondear(rotacion28),
```

- [ ] **Step 4:** Run `node --test supabase/functions/make-server-6d979413/replenishment.test.ts` → PASS (19 pruebas: las 15 previas siguen pasando porque sin `despachos7` la rotación de 7 días es 0).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/make-server-6d979413/replenishment.ts supabase/functions/make-server-6d979413/replenishment.test.ts
git commit -m "feat(reposicion): rotación = máx(7 días, 28 días) para avisar antes si sube la demanda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Módulo puro de integración

**Files:**
- Create: `supabase/functions/make-server-6d979413/integracion.ts`
- Test: `supabase/functions/make-server-6d979413/integracion.test.ts`

**Interfaces:**
- Produces:

```ts
export const MAX_PRECIOS = 2000;
export const DIAS_PRECIO_ANTIGUO = 7;
export function verificarIntegracion(recibida: string | null | undefined, clave: string | undefined, businessId: string | undefined):
  { ok: true; businessId: string } | { ok: false; status: 401 | 503; error: string };
export interface PrecioCompra { productId: string; proveedor: string; proveedorNombre: string; precioUnidad: number; formatoUnidades: number | null; formato: string; observadoEn: string; url: string }
export function validarPrecios(body: unknown, idsDelNegocio: Set<string>): { ok: true; precios: PrecioCompra[] } | { ok: false; error: string };
export interface CompraSugerida extends Omit<PrecioCompra, 'productId'> { comprarRedondeado: number; costoEstimado: number; antiguo: boolean }
export function agregarCompra<T extends { productId: string; comprar: number }>(filas: T[], precios: Map<string, PrecioCompra>, ahora: Date): (T & { compra: CompraSugerida | null })[];
export function idsDistribuidora(categorias: { id: string; name: string; parent_id: string | null }[]): Set<string>;
```

- [ ] **Step 1: Pruebas que fallan** — crear `integracion.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarCompra, idsDistribuidora, MAX_PRECIOS, validarPrecios, verificarIntegracion, type PrecioCompra } from './integracion.ts';

const CLAVE = 'k'.repeat(40);
const NEGOCIO = 'aaaaaaaa-0000-0000-0000-000000000000';

test('verificarIntegracion: clave correcta devuelve el negocio configurado', () => {
  assert.deepEqual(verificarIntegracion(CLAVE, CLAVE, NEGOCIO), { ok: true, businessId: NEGOCIO });
});

test('verificarIntegracion: clave incorrecta o ausente → 401', () => {
  for (const r of ['x'.repeat(40), CLAVE.slice(1), '', null, undefined]) {
    const v = verificarIntegracion(r, CLAVE, NEGOCIO);
    assert.equal(v.ok, false);
    assert.equal(!v.ok && v.status, 401);
  }
});

test('verificarIntegracion: sin configurar o clave corta → 503 (apagada)', () => {
  assert.equal((verificarIntegracion(CLAVE, undefined, NEGOCIO) as any).status, 503);
  assert.equal((verificarIntegracion(CLAVE, CLAVE, undefined) as any).status, 503);
  assert.equal((verificarIntegracion('corta', 'corta', NEGOCIO) as any).status, 503);
});

const precio = (productId: string, extra: Partial<PrecioCompra> = {}): PrecioCompra => ({
  productId, proveedor: 'alvi', proveedorNombre: 'Alvi', precioUnidad: 870, formatoUnidades: 12,
  formato: 'Caja 12 un.', observadoEn: '2026-11-15T07:00:00Z', url: 'https://www.alvi.cl/x', ...extra,
});

test('validarPrecios acepta un envío correcto', () => {
  const r = validarPrecios({ generadoEn: '2026-11-15T07:10:00Z', precios: [precio('p1'), precio('p2', { formatoUnidades: null, url: '' })] }, new Set(['p1', 'p2']));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.precios.length, 2);
});

test('validarPrecios rechaza productos de otro negocio, duplicados y datos inválidos', () => {
  const ids = new Set(['p1']);
  for (const malo of [
    null, {}, { precios: 'x' },
    { precios: [precio('otro')] },
    { precios: [precio('p1'), precio('p1')] },
    { precios: [precio('p1', { precioUnidad: 0 })] },
    { precios: [precio('p1', { precioUnidad: Number.NaN })] },
    { precios: [precio('p1', { formatoUnidades: 0 })] },
    { precios: [precio('p1', { formatoUnidades: 1.5 })] },
    { precios: [precio('p1', { proveedor: '' })] },
    { precios: [precio('p1', { observadoEn: 'ayer' })] },
    { precios: [precio('p1', { url: 'javascript:alert(1)' })] },
  ]) {
    assert.equal(validarPrecios(malo, ids).ok, false, JSON.stringify(malo));
  }
});

test('validarPrecios rechaza más de MAX_PRECIOS filas', () => {
  const ids = new Set(Array.from({ length: MAX_PRECIOS + 1 }, (_, i) => `p${i}`));
  assert.equal(validarPrecios({ precios: [...ids].map(id => precio(id)) }, ids).ok, false);
});

test('agregarCompra redondea al formato y calcula el costo', () => {
  const ahora = new Date('2026-11-15T12:00:00Z');
  const filas = agregarCompra([{ productId: 'p1', comprar: 30 }, { productId: 'p2', comprar: 5 }, { productId: 'p3', comprar: 4 }],
    new Map([['p1', precio('p1')], ['p2', precio('p2', { formatoUnidades: null, precioUnidad: 1000 })]]), ahora);
  assert.equal(filas[0].compra?.comprarRedondeado, 36); // 3 cajas de 12
  assert.equal(filas[0].compra?.costoEstimado, 31320); // 36 × 870
  assert.equal(filas[0].compra?.antiguo, false);
  assert.equal(filas[1].compra?.comprarRedondeado, 5); // sin formato: no se redondea
  assert.equal(filas[1].compra?.costoEstimado, 5000);
  assert.equal(filas[2].compra, null);
});

test('agregarCompra marca como antiguo un precio de más de 7 días', () => {
  const [f] = agregarCompra([{ productId: 'p1', comprar: 12 }], new Map([['p1', precio('p1', { observadoEn: '2026-11-01T00:00:00Z' })]]), new Date('2026-11-15T12:00:00Z'));
  assert.equal(f.compra?.antiguo, true);
  assert.equal(f.compra?.comprarRedondeado, 12); // múltiplo exacto: no sube
});

test('idsDistribuidora incluye subcategorías a cualquier profundidad', () => {
  const ids = idsDistribuidora([
    { id: 'd', name: 'Distribuidora', parent_id: null },
    { id: 'b', name: 'Bebidas', parent_id: 'd' },
    { id: 'g', name: 'Gaseosas', parent_id: 'b' },
    { id: 'p', name: 'Panadería', parent_id: null },
  ]);
  assert.deepEqual([...ids].sort(), ['b', 'd', 'g']);
});
```

- [ ] **Step 2:** Run `node --test supabase/functions/make-server-6d979413/integracion.test.ts` → FAIL (`Cannot find module './integracion.ts'`).

- [ ] **Step 3: Implementar** — crear `integracion.ts`:

```ts
/**
 * Integración con Oca Pricing: verificación de la clave, validación de los precios que envía
 * y cálculo de la compra sugerida. Módulo PURO (como authz.ts), probado con `node --test`.
 * Spec: docs/superpowers/specs/2026-11-15-conexion-oca-pricing-design.md
 */

export const MAX_PRECIOS = 2000;
export const DIAS_PRECIO_ANTIGUO = 7;
const DIA_MS = 86_400_000;

/** Clave compartida (`OCA_PRICING_CLAVE`) y negocio fijo (`OCA_PRICING_BUSINESS_ID`), nunca desde la petición. */
export function verificarIntegracion(
  recibida: string | null | undefined,
  clave: string | undefined,
  businessId: string | undefined,
): { ok: true; businessId: string } | { ok: false; status: 401 | 503; error: string } {
  if (!clave || clave.length < 32 || !businessId) return { ok: false, status: 503, error: 'Integración con Oca Pricing apagada' };
  if (!recibida || !igualesEnTiempoConstante(recibida, clave)) return { ok: false, status: 401, error: 'No autorizado' };
  return { ok: true, businessId };
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const largo = Math.max(a.length, b.length);
  let diferencia = a.length ^ b.length;
  for (let i = 0; i < largo; i++) diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diferencia === 0;
}

export interface PrecioCompra {
  productId: string;
  proveedor: string;
  proveedorNombre: string;
  /** Por unidad de Conectoca (Oca Pricing ya convirtió packs), CLP. */
  precioUnidad: number;
  /** Unidades de Conectoca por formato de compra, o null si no se puede convertir. */
  formatoUnidades: number | null;
  formato: string;
  observadoEn: string;
  url: string;
}

export function validarPrecios(body: unknown, idsDelNegocio: Set<string>): { ok: true; precios: PrecioCompra[] } | { ok: false; error: string } {
  const lista = (body as { precios?: unknown } | null)?.precios;
  if (!Array.isArray(lista)) return { ok: false, error: 'Falta la lista de precios' };
  if (lista.length > MAX_PRECIOS) return { ok: false, error: `Máximo ${MAX_PRECIOS} precios por envío` };
  const vistos = new Set<string>();
  const precios: PrecioCompra[] = [];
  for (const [i, x] of lista.entries()) {
    const p = (x ?? {}) as Record<string, unknown>;
    const malo = (motivo: string) => ({ ok: false as const, error: `Precio ${i + 1}: ${motivo}` });
    if (typeof p.productId !== 'string' || !idsDelNegocio.has(p.productId)) return malo('producto desconocido');
    if (vistos.has(p.productId)) return malo('producto repetido');
    if (!texto(p.proveedor, 64) || !texto(p.proveedorNombre, 100)) return malo('proveedor inválido');
    if (typeof p.precioUnidad !== 'number' || !Number.isFinite(p.precioUnidad) || p.precioUnidad <= 0 || p.precioUnidad >= 10_000_000) return malo('precio inválido');
    if (p.formatoUnidades !== null && (!Number.isInteger(p.formatoUnidades) || (p.formatoUnidades as number) < 1 || (p.formatoUnidades as number) > 10_000)) return malo('formato inválido');
    if (typeof p.formato !== 'string' || p.formato.length > 100) return malo('formato inválido');
    if (typeof p.observadoEn !== 'string' || Number.isNaN(Date.parse(p.observadoEn))) return malo('fecha inválida');
    if (typeof p.url !== 'string' || p.url.length > 500 || (p.url !== '' && !/^https?:\/\//.test(p.url))) return malo('enlace inválido');
    vistos.add(p.productId);
    precios.push({
      productId: p.productId, proveedor: p.proveedor as string, proveedorNombre: p.proveedorNombre as string,
      precioUnidad: p.precioUnidad, formatoUnidades: p.formatoUnidades as number | null, formato: p.formato,
      observadoEn: p.observadoEn, url: p.url,
    });
  }
  return { ok: true, precios };
}

const texto = (v: unknown, max: number) => typeof v === 'string' && v.trim() !== '' && v.length <= max;

export interface CompraSugerida extends Omit<PrecioCompra, 'productId'> {
  comprarRedondeado: number;
  costoEstimado: number;
  antiguo: boolean;
}

export function agregarCompra<T extends { productId: string; comprar: number }>(
  filas: T[],
  precios: Map<string, PrecioCompra>,
  ahora: Date,
): (T & { compra: CompraSugerida | null })[] {
  return filas.map((f) => {
    const p = precios.get(f.productId);
    if (!p) return { ...f, compra: null };
    const { productId: _, ...resto } = p;
    const comprarRedondeado = p.formatoUnidades ? Math.ceil(f.comprar / p.formatoUnidades - 1e-9) * p.formatoUnidades : f.comprar;
    return {
      ...f,
      compra: {
        ...resto,
        comprarRedondeado,
        costoEstimado: Math.round(comprarRedondeado * p.precioUnidad),
        antiguo: ahora.getTime() - new Date(p.observadoEn).getTime() > DIAS_PRECIO_ANTIGUO * DIA_MS,
      },
    };
  });
}

/** Categorías cuyo nombre contiene «distribuidora» y todas sus subcategorías. */
export function idsDistribuidora(categorias: { id: string; name: string; parent_id: string | null }[]): Set<string> {
  const ids = new Set(categorias.filter((c) => c.name.toLowerCase().includes('distribuidora')).map((c) => c.id));
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const c of categorias) {
      if (c.parent_id && ids.has(c.parent_id) && !ids.has(c.id)) {
        ids.add(c.id);
        cambio = true;
      }
    }
  }
  return ids;
}
```

- [ ] **Step 4:** Run `node --test supabase/functions/make-server-6d979413/integracion.test.ts` → PASS (9 pruebas). Then `npm test` → todo pasa.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/make-server-6d979413/integracion.ts supabase/functions/make-server-6d979413/integracion.test.ts
git commit -m "feat(integracion): clave, validación de precios y compra sugerida (módulo puro)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Tabla `precios_compra` y RPC de reemplazo

**Files:**
- Create: `supabase/migrations/20261115_b_precios_compra.sql`

**Interfaces:**
- Produces: tabla `public.precios_compra` (columnas snake_case de `PrecioCompra` + `business_id`, `recibido_en`), función `public.reemplazar_precios_compra(p_business_id uuid, p_precios jsonb) returns integer` (solo `service_role`).

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20261115_b_precios_compra.sql
-- Conexión con Oca Pricing: el mejor precio de compra de cada producto, enviado cada madrugada.
-- Spec: docs/superpowers/specs/2026-11-15-conexion-oca-pricing-design.md

CREATE TABLE IF NOT EXISTS public.precios_compra (
  business_id      uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  proveedor        text NOT NULL,
  proveedor_nombre text NOT NULL,
  precio_unidad    numeric NOT NULL CHECK (precio_unidad > 0),
  formato_unidades integer CHECK (formato_unidades >= 1),
  formato          text NOT NULL DEFAULT '',
  observado_en     timestamptz NOT NULL,
  url              text NOT NULL DEFAULT '',
  recibido_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, product_id)
);

-- RLS activo sin políticas: solo la Edge Function (service_role), como stock_events.
ALTER TABLE public.precios_compra ENABLE ROW LEVEL SECURITY;

-- Reemplaza TODO el conjunto del negocio en una transacción (la función es atómica):
-- un envío parcial nunca deja mezclados precios viejos y nuevos.
CREATE OR REPLACE FUNCTION public.reemplazar_precios_compra(p_business_id uuid, p_precios jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.precios_compra WHERE business_id = p_business_id;
  INSERT INTO public.precios_compra
    (business_id, product_id, proveedor, proveedor_nombre, precio_unidad, formato_unidades, formato, observado_en, url)
  SELECT p_business_id,
         (x->>'productId')::uuid,
         x->>'proveedor',
         x->>'proveedorNombre',
         (x->>'precioUnidad')::numeric,
         NULLIF(x->>'formatoUnidades', '')::integer,
         COALESCE(x->>'formato', ''),
         (x->>'observadoEn')::timestamptz,
         COALESCE(x->>'url', '')
  FROM jsonb_array_elements(p_precios) AS x;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Igual que 20261004_i: revocar PUBLIC además de anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.reemplazar_precios_compra(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_precios_compra(uuid, jsonb) TO service_role;
```

- [ ] **Step 2: Validar en una base local (PGlite)** — `@electric-sql/pglite` no está en este repo; usar la copia de Oca Pricing con un script temporal fuera del repo (por ejemplo en `/tmp`), que importe `/Users/matiasvladilo/Desktop/MASTER/oca-pricing/node_modules/@electric-sql/pglite/dist/index.js`, cree los stubs y ejecute la migración:

```sql
create role anon; create role authenticated; create role service_role;
create table public.businesses(id uuid primary key);
create table public.products(id uuid primary key);
insert into public.businesses values ('aaaaaaaa-0000-0000-0000-000000000000');
insert into public.products values ('11111111-0000-0000-0000-000000000000');
```

Luego verificar: `select public.reemplazar_precios_compra('aaaaaaaa-0000-0000-0000-000000000000', '[{"productId":"11111111-0000-0000-0000-000000000000","proveedor":"alvi","proveedorNombre":"Alvi","precioUnidad":870,"formatoUnidades":12,"formato":"Caja","observadoEn":"2026-11-15T07:00:00Z","url":""}]')` devuelve 1; una segunda llamada con `'[]'` deja 0 filas; `formatoUnidades: null` se guarda como NULL. Si no es posible, anotarlo en el reporte.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261115_b_precios_compra.sql
git commit -m "feat(db): precios_compra y RPC reemplazar_precios_compra (solo service_role)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cálculo común y rutas de integración en la Edge Function

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts` (bloque «Para comprar» que empieza en `// ─── «Para comprar»` ~línea 1866; imports ~línea 17)

**Interfaces:**
- Consumes: Task 1 (`sumarSalidas(eventos, ahora)`), Task 2 (`verificarIntegracion`, `validarPrecios`, `agregarCompra`, `idsDistribuidora`, tipo `PrecioCompra`), Task 3 (tabla y RPC).
- Produces:
  - `GET /make-server-6d979413/distribution/replenishment` (admin) — igual que hoy, y cada fila trae `compra` (objeto `CompraSugerida` o `null`), `rotacion7`, `rotacion28`.
  - `GET /make-server-6d979413/integracion/oca-pricing/productos` → `{ data: [{ id, name, stock, unlimitedStock, trackStock }] }` (solo Distribuidora).
  - `GET /make-server-6d979413/integracion/oca-pricing/reposicion` → `{ data: { filas, ajustes, calculadoEn } }` (solo Distribuidora, con `compra`).
  - `PUT /make-server-6d979413/integracion/oca-pricing/precios` body `{ generadoEn, precios: PrecioCompra[] }` → `{ data: { guardados: number } }`.

- [ ] **Step 1: Imports.** Debajo del import de `./replenishment.ts`:

```ts
import {
  agregarCompra,
  idsDistribuidora,
  validarPrecios,
  verificarIntegracion,
  type PrecioCompra,
} from "./integracion.ts";
```

- [ ] **Step 2: Extraer el cálculo común.** Dentro del bloque «Para comprar», debajo de `leerAjustesReposicion`, agregar:

```ts
async function leerPreciosCompra(businessId: string): Promise<Map<string, PrecioCompra>> {
  const { data, error } = await supabaseAdmin
    .from('precios_compra')
    .select('product_id, proveedor, proveedor_nombre, precio_unidad, formato_unidades, formato, observado_en, url')
    .eq('business_id', businessId);
  if (error) throw error;
  return new Map((data || []).map((r: any) => [r.product_id, {
    productId: r.product_id,
    proveedor: r.proveedor,
    proveedorNombre: r.proveedor_nombre,
    precioUnidad: Number(r.precio_unidad),
    formatoUnidades: r.formato_unidades != null ? Number(r.formato_unidades) : null,
    formato: r.formato,
    observadoEn: r.observado_en,
    url: r.url,
  }]));
}

async function categoriasDistribuidora(businessId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('id, name, parent_id')
    .eq('business_id', businessId);
  if (error) throw error;
  return idsDistribuidora(data || []);
}

/**
 * Reposición de un negocio (la usan la pestaña de admin y la integración con Oca Pricing).
 * `soloCategorias`: si viene, deja solo esos productos (Distribuidora para la integración).
 */
async function calcularReposicionDeNegocio(businessId: string, soloCategorias?: Set<string>) {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 86_400_000).toISOString();

  const { data: productos, error: prodErr } = await supabaseAdmin
    .from('products')
    .select('id, name, category_id, stock, min_stock, unlimited_stock, track_stock, created_at')
    .eq('business_id', businessId)
    .is('archived_at', null);
  if (prodErr) throw prodErr;

  // PostgREST corta en 1000 filas: se pagina para no subestimar la rotación
  // de un mes con muchos despachos. El desempate por id evita que los eventos
  // de una misma orden (mismo created_at) se repitan u omitan entre páginas.
  const eventos: { product_id: string; type: string; quantity: number; created_at: string }[] = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data: pagina, error: evErr } = await supabaseAdmin
      .from('stock_events')
      .select('product_id, type, quantity, created_at')
      .eq('business_id', businessId)
      .in('type', ['despacho', 'devolucion'])
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desdeFila, desdeFila + 999);
    if (evErr) throw evErr;
    eventos.push(...(pagina || []));
    if (!pagina || pagina.length < 1000) break;
  }

  const [ajustes, precios] = await Promise.all([leerAjustesReposicion(businessId), leerPreciosCompra(businessId)]);
  const delAmbito = (productos || []).filter((p: any) => !soloCategorias || (p.category_id && soloCategorias.has(p.category_id)));
  const filas = calcularReposicion(
    delAmbito.map((p: any): ProductoStock => ({
      id: p.id,
      name: p.name,
      categoryId: p.category_id ?? null,
      stock: Number(p.stock),
      minStock: p.min_stock != null ? Number(p.min_stock) : null,
      unlimitedStock: p.unlimited_stock,
      trackStock: p.track_stock,
      createdAt: p.created_at,
    })),
    sumarSalidas(eventos, ahora),
    ajustes,
    ahora,
  );
  return { filas: agregarCompra(filas, precios, ahora), ajustes, calculadoEn: ahora.toISOString() };
}
```

- [ ] **Step 3: La ruta de admin usa el cálculo común.** En `app.get('/make-server-6d979413/distribution/replenishment', …)`, reemplazar todo desde `const ahora = new Date();` hasta `return c.json({ data: { filas, ajustes, calculadoEn: ahora.toISOString() } });` (inclusive) por:

```ts
    return c.json({ data: await calcularReposicionDeNegocio(profile.businessId) });
```

(El `try/catch` con el 500 «No se pudo calcular la reposición» se mantiene.)

- [ ] **Step 4: Rutas de integración.** Después de la ruta `PUT /distribution/replenishment/settings`:

```ts
// ─── Integración con Oca Pricing (servidor a servidor, clave compartida) ────
// Spec: docs/superpowers/specs/2026-11-15-conexion-oca-pricing-design.md
// Solo lee productos y reposición de Distribuidora y solo escribe precios_compra.

function integracionOcaPricing(c: any) {
  return verificarIntegracion(
    c.req.header('X-Integracion-Clave'),
    Deno.env.get('OCA_PRICING_CLAVE'),
    Deno.env.get('OCA_PRICING_BUSINESS_ID'),
  );
}

app.get('/make-server-6d979413/integracion/oca-pricing/productos', async (c) => {
  const acceso = integracionOcaPricing(c);
  if (!acceso.ok) return c.json({ error: acceso.error }, acceso.status);
  try {
    const categorias = await categoriasDistribuidora(acceso.businessId);
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('id, name, category_id, stock, unlimited_stock, track_stock')
      .eq('business_id', acceso.businessId)
      .is('archived_at', null);
    if (error) throw error;
    return c.json({
      data: (data || [])
        .filter((p: any) => p.category_id && categorias.has(p.category_id))
        .map((p: any) => ({ id: p.id, name: p.name, stock: Number(p.stock), unlimitedStock: p.unlimited_stock, trackStock: p.track_stock })),
    });
  } catch (err: any) {
    console.error('Integración Oca Pricing — productos:', err);
    return c.json({ error: 'No se pudieron leer los productos' }, 500);
  }
});

app.get('/make-server-6d979413/integracion/oca-pricing/reposicion', async (c) => {
  const acceso = integracionOcaPricing(c);
  if (!acceso.ok) return c.json({ error: acceso.error }, acceso.status);
  try {
    const categorias = await categoriasDistribuidora(acceso.businessId);
    return c.json({ data: await calcularReposicionDeNegocio(acceso.businessId, categorias) });
  } catch (err: any) {
    console.error('Integración Oca Pricing — reposición:', err);
    return c.json({ error: 'No se pudo calcular la reposición' }, 500);
  }
});

app.put('/make-server-6d979413/integracion/oca-pricing/precios', async (c) => {
  const acceso = integracionOcaPricing(c);
  if (!acceso.ok) return c.json({ error: acceso.error }, acceso.status);
  try {
    const { data: productos, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('business_id', acceso.businessId)
      .is('archived_at', null);
    if (prodErr) throw prodErr;
    const validacion = validarPrecios(await c.req.json().catch(() => null), new Set((productos || []).map((p: any) => p.id)));
    if (!validacion.ok) return c.json({ error: validacion.error }, 400);

    const { data: guardados, error: rpcErr } = await supabaseAdmin.rpc('reemplazar_precios_compra', {
      p_business_id: acceso.businessId,
      p_precios: validacion.precios,
    });
    if (rpcErr) throw rpcErr;
    return c.json({ data: { guardados } });
  } catch (err: any) {
    console.error('Integración Oca Pricing — precios:', err);
    return c.json({ error: 'No se pudieron guardar los precios' }, 500);
  }
});
```

- [ ] **Step 5: Verificar** (no hay Deno local):

Run: `node -e "const ts=require('typescript');const src=require('fs').readFileSync('supabase/functions/make-server-6d979413/index.ts','utf8');const r=ts.transpileModule(src,{reportDiagnostics:true,compilerOptions:{target:99,module:99}});console.log(r.diagnostics.length?r.diagnostics.map(d=>d.messageText).join('\n'):'syntax OK')"` → `syntax OK`.
Run: `npm test` → todo pasa.
Revisar a ojo que no quede ninguna referencia a variables borradas de la ruta de admin (`desde`, `productos`, `eventos`) fuera de `calcularReposicionDeNegocio`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "feat(api): integración con Oca Pricing (productos, reposición, precios) y compra en la reposición

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: «Para comprar» muestra dónde comprar (app)

**Files:**
- Modify: `src/utils/api.tsx` (tipos de reposición, ~línea 1214)
- Modify: `src/utils/listaCompra.ts`
- Test: `src/utils/listaCompra.test.ts`
- Modify: `src/components/ParaComprar.tsx`

**Interfaces:**
- Consumes: forma de respuesta de la Task 4.
- Produces: `FilaReposicion` (frontend) con `rotacion7`, `rotacion28`, `compra: CompraSugerida | null`; `subeDemanda(f): boolean`; `textoListaCompra` incluye proveedor y cantidad redondeada; `resumenCosto(filas): { total: number; conPrecio: number }`.

- [ ] **Step 1: Pruebas que fallan** — en `listaCompra.test.ts`, actualizar el helper `fila` para incluir los campos nuevos (`rotacion7: 2, rotacion28: 2, compra: null`) y agregar:

Agregar `resumenCosto` y `subeDemanda` al import existente de `./listaCompra.ts`, y luego:

```ts
const compra = { proveedor: 'alvi', proveedorNombre: 'Alvi', precioUnidad: 870, formatoUnidades: 12, formato: 'Caja 12 un.',
  observadoEn: '2026-11-15T07:00:00Z', url: '', comprarRedondeado: 36, costoEstimado: 31320, antiguo: false };

test('texto para WhatsApp: con precio usa la cantidad redondeada y el proveedor', () => {
  const texto = textoListaCompra([fila('a', { name: 'Coca-Cola 591', comprar: 30, compra }), fila('b', { name: 'Fanta 591', comprar: 4 })], new Date('2026-11-15T12:00:00'));
  assert.equal(texto, 'Para comprar — 15-11-2026\n• Coca-Cola 591: 36 — Alvi $870 c/u\n• Fanta 591: 4');
});

test('subeDemanda: última semana más de 20 % sobre el mes', () => {
  assert.equal(subeDemanda(fila('a', { rotacion7: 3, rotacion28: 2 })), true);
  assert.equal(subeDemanda(fila('a', { rotacion7: 2.4, rotacion28: 2 })), false);
  assert.equal(subeDemanda(fila('a', { rotacion7: 1, rotacion28: 0 })), true);
  assert.equal(subeDemanda(fila('a', { rotacion7: 0, rotacion28: 0 })), false);
});

test('resumenCosto suma solo las filas con precio', () => {
  assert.deepEqual(resumenCosto([fila('a', { compra }), fila('b'), fila('c', { compra: { ...compra, costoEstimado: 1000 } })]), { total: 32320, conPrecio: 2 });
});
```

(El test existente «texto para WhatsApp: título con fecha y una línea por producto» sigue igual: sin `compra`, las líneas no cambian.)

- [ ] **Step 2:** Run `node --test src/utils/listaCompra.test.ts` → FAIL.

- [ ] **Step 3: Tipos** — en `src/utils/api.tsx`, en `FilaReposicion` agregar después de `rotacionDiaria: number;`:

```ts
  rotacion7: number;
  rotacion28: number;
  /** Mejor precio enviado por Oca Pricing (null si no hay). */
  compra: CompraSugerida | null;
```

y antes de `export interface FilaReposicion`:

```ts
export interface CompraSugerida {
  proveedor: string;
  proveedorNombre: string;
  precioUnidad: number;
  formatoUnidades: number | null;
  formato: string;
  observadoEn: string;
  url: string;
  comprarRedondeado: number;
  costoEstimado: number;
  antiguo: boolean;
}
```

- [ ] **Step 4: `listaCompra.ts`** — reemplazar `textoListaCompra` y agregar las funciones nuevas:

```ts
const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Texto plano para mandar por WhatsApp o copiar. Con precio: cantidad redondeada al formato y proveedor. */
export function textoListaCompra(filas: FilaReposicion[], fecha: Date): string {
  const dia = `${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${fecha.getFullYear()}`;
  return [
    `Para comprar — ${dia}`,
    ...filas.map(f => f.compra
      ? `• ${f.name}: ${fmt(f.compra.comprarRedondeado)} — ${f.compra.proveedorNombre} ${clp(f.compra.precioUnidad)} c/u`
      : `• ${f.name}: ${fmt(f.comprar)}`),
  ].join('\n');
}

/** La última semana sale más de un 20 % más rápido que el promedio del mes. */
export function subeDemanda(f: FilaReposicion): boolean {
  return f.rotacion7 > 0 && f.rotacion7 > f.rotacion28 * 1.2;
}

export function resumenCosto(filas: FilaReposicion[]): { total: number; conPrecio: number } {
  const conCompra = filas.filter(f => f.compra);
  return { total: conCompra.reduce((s, f) => s + f.compra!.costoEstimado, 0), conPrecio: conCompra.length };
}
```

- [ ] **Step 5:** Run `node --test src/utils/listaCompra.test.ts` → PASS.

- [ ] **Step 6: Pantalla** — en `src/components/ParaComprar.tsx`:

a) Import: `import { etiquetaMotivo, resumenCosto, subeDemanda, textoListaCompra } from '../utils/listaCompra';`

b) En cada fila, debajo de la línea `Stock … · {etiquetaMotivo(f)}`, agregar:

```tsx
                    {subeDemanda(f) && (
                      <span style={{ display: 'block', fontSize: 12, color: IOS.naranja }}>↑ Sube: esta semana sale {fmt(f.rotacion7)}/día</span>
                    )}
                    {f.compra && (
                      <span style={{ display: 'block', fontSize: 12, color: IOS.secundario }}>
                        {f.compra.proveedorNombre} ${Math.round(f.compra.precioUnidad).toLocaleString('es-CL')} c/u
                        {f.compra.formatoUnidades && f.compra.formatoUnidades > 1 ? ` · ${f.compra.comprarRedondeado / f.compra.formatoUnidades} × ${f.compra.formato}` : ''}
                        {' · ≈ $'}{f.compra.costoEstimado.toLocaleString('es-CL')}
                        {f.compra.antiguo ? ` · precio del ${new Date(f.compra.observadoEn).toLocaleDateString('es-CL')}` : ''}
                      </span>
                    )}
```

c) El número grande «Comprar» muestra `fmt(f.compra?.comprarRedondeado ?? f.comprar)`.

d) Excel: agregar columnas `'Proveedor': f.compra?.proveedorNombre ?? ''`, `'Precio c/u': f.compra?.precioUnidad ?? ''`, `'Costo estimado': f.compra?.costoEstimado ?? ''`, y `'Comprar': f.compra?.comprarRedondeado ?? f.comprar`.

e) Debajo de la lista (antes del párrafo final «Calculado con los despachos…»), si `!cargando && !error && filas.length > 0`:

```tsx
        {(() => {
          const r = resumenCosto(filas);
          return r.conPrecio > 0 ? (
            <p style={{ fontSize: 15, fontWeight: 600, color: IOS.texto, padding: '10px 16px 0' }}>
              Costo estimado ≈ ${r.total.toLocaleString('es-CL')} <span style={{ fontWeight: 400, color: IOS.secundario }}>({r.conPrecio} de {filas.length} con precio de Oca Pricing)</span>
            </p>
          ) : null;
        })()}
```

- [ ] **Step 7: Verificar** — `npx tsc --noEmit -p tsconfig.json` (solo los 4 errores conocidos de `_redirects`), `npm test`, `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add src/utils/api.tsx src/utils/listaCompra.ts src/utils/listaCompra.test.ts src/components/ParaComprar.tsx
git commit -m "feat(para-comprar): proveedor, cantidad por formato, costo y aviso de demanda en alza

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
