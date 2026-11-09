# Export de Analíticas por categoría — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Excel de Analíticas muestre las unidades y los montos agrupados por categoría (Distribuidora, Panadería, Pastelería…) y permita cuadrar pedido por pedido contra las planillas manuales de administración.

**Architecture:** Toda la lógica de armado de planillas se va a un módulo nuevo de funciones puras, `src/utils/reporteAnaliticas.ts`, con tests de `node:test`. `Analytics.tsx` queda como consumidor: carga el catálogo (productos + categorías) y llama al módulo desde sus dos handlers de export, que hoy tienen el código duplicado.

**Tech Stack:** React + TypeScript + Vite, `xlsx` (importado dinámicamente), `node:test` + `node:assert/strict` para los tests, Tailwind precompilado para la UI (no aplica acá).

**Spec:** [`docs/superpowers/specs/2026-11-09-export-analiticas-por-categoria-design.md`](../specs/2026-11-09-export-analiticas-por-categoria-design.md)

## Global Constraints

- La jerarquía de categorías es de **un solo nivel**: una raíz puede tener subcategorías, una subcategoría no.
- El literal de categoría ausente es exactamente `'Sin categoría'` — el mismo que devuelve `nombreCategoriaRaiz` en [`src/utils/categoryTree.ts`](../../../src/utils/categoryTree.ts). No inventar otro.
- `src/utils/reporteAnaliticas.ts` **no importa nada de `src/App.tsx` ni de ningún componente**. Define su propio tipo estructural `PedidoParaReporte`, que `Order` satisface sin cambios.
- Los nombres de columna y de fila van en español con tildes, exactamente como figuran en este plan: `'Categoría'`, `'Subcategoría'`, `'Producto'`, `'Total Unidades'`, `'Venta Total (ítems)'`, `'Venta Total (del pedido)'`, `'Total Ítems ($)'`, `'Diferencia ($)'`. Son las que va a leer el jefe de administración; un typo acá es un bug.
- Las columnas existentes de la hoja "Detalle Ventas" conservan su nombre y su orden. Lo nuevo se agrega **al final**.
- `npm test` corre `node --test src/utils/*.test.ts ...`, así que un archivo nuevo en `src/utils/` se levanta solo. No hay que tocar configuración.
- Commits en español, en imperativo, con el prefijo que ya usa el repo (`feat:`, `fix:`, `refactor:`, `test:`).

---

### Task 1: Módulo de reporte — tipos e `indexarCategorias`

Resuelve, para cada producto del catálogo, su categoría raíz y su subcategoría. Es el único lugar del módulo que conoce `Product` y `Category`; las otras dos funciones reciben el mapa ya resuelto.

**Files:**
- Create: `src/utils/reporteAnaliticas.ts`
- Test: `src/utils/reporteAnaliticas.test.ts`

**Interfaces:**
- Consumes: `nombreCategoriaRaiz(categories: Category[], categoryId: string | undefined): string` de `./categoryTree`; los tipos `Product` y `Category` de `./api`.
- Produces:
  - `SIN_CATEGORIA: string` (valor `'Sin categoría'`)
  - `interface CategoriaDeProducto { raiz: string; sub: string; nombre: string }`
  - `type MapaCategorias = Map<string, CategoriaDeProducto>` (clave: `product.id`)
  - `indexarCategorias(productos: Product[], categorias: Category[]): MapaCategorias`
  - `interface PedidoParaReporte` (definido acá, usado por las Tasks 2 y 3)

- [ ] **Step 1: Write the failing test**

Crear `src/utils/reporteAnaliticas.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexarCategorias, SIN_CATEGORIA } from './reporteAnaliticas.ts';
import type { Product, Category } from './api';

const categorias: Category[] = [
  { id: 'distri', name: 'Distribuidora', createdAt: '' },
  { id: 'bebidas', name: 'Bebidas', parentId: 'distri', createdAt: '' },
  { id: 'pan', name: 'Panadería', createdAt: '' },
  { id: 'huerfana', name: 'Huérfana', parentId: 'no-existe', createdAt: '' },
];

function producto(overrides: Partial<Product>): Product {
  return { id: 'p1', name: 'Test', description: '', price: 100, stock: 1, ...overrides } as Product;
}

test('un producto en una categoría raíz queda con esa raíz y sin subcategoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p1', name: 'Fideos', categoryId: 'distri' })], categorias);
  assert.deepEqual(mapa.get('p1'), { raiz: 'Distribuidora', sub: '', nombre: 'Fideos' });
});

test('un producto en una subcategoría queda con la raíz del padre y el nombre de la subcategoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p2', name: 'Coca 500ml', categoryId: 'bebidas' })], categorias);
  assert.deepEqual(mapa.get('p2'), { raiz: 'Distribuidora', sub: 'Bebidas', nombre: 'Coca 500ml' });
});

test('un producto sin categoryId cae en Sin categoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p3', name: 'Suelto' })], categorias);
  assert.deepEqual(mapa.get('p3'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Suelto' });
});

test('un producto con una categoría que ya no existe cae en Sin categoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p4', name: 'Borrada', categoryId: 'se-borro' })], categorias);
  assert.deepEqual(mapa.get('p4'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Borrada' });
});

test('una subcategoría cuyo padre no está en la lista se trata como raíz, sin duplicar el nombre', () => {
  const mapa = indexarCategorias([producto({ id: 'p5', name: 'Rara', categoryId: 'huerfana' })], categorias);
  assert.deepEqual(mapa.get('p5'), { raiz: 'Huérfana', sub: '', nombre: 'Rara' });
});

test('sin categorías cargadas, todo cae en Sin categoría pero el nombre se conserva', () => {
  const mapa = indexarCategorias([producto({ id: 'p6', name: 'Pan', categoryId: 'pan' })], []);
  assert.deepEqual(mapa.get('p6'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Pan' });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test src/utils/reporteAnaliticas.test.ts
```

Expected: FAIL — `Cannot find module './reporteAnaliticas.ts'`.

- [ ] **Step 3: Write minimal implementation**

Crear `src/utils/reporteAnaliticas.ts`:

```ts
import type { Category, Product } from './api';
import { nombreCategoriaRaiz } from './categoryTree';

/**
 * Armado de las planillas del export de Analíticas. Funciones puras: reciben
 * pedidos y catálogo ya cargados y devuelven matrices/filas listas para xlsx.
 * No importa nada de componentes a propósito, así se testea sin React.
 */

/** Mismo literal que devuelve nombreCategoriaRaiz: los dos lados tienen que coincidir. */
export const SIN_CATEGORIA = 'Sin categoría';

export interface CategoriaDeProducto {
  /** Categoría raíz: si el producto está en una subcategoría, el nombre del padre. */
  raiz: string;
  /** Nombre de la subcategoría, o '' si el producto está directo en la raíz. */
  sub: string;
  /** Nombre del catálogo. Gana sobre el nombre guardado en el pedido (puede estar renombrado). */
  nombre: string;
}

export type MapaCategorias = Map<string, CategoriaDeProducto>;

/**
 * Forma mínima de pedido que necesitan los reportes. `Order` (src/App.tsx) la
 * satisface estructuralmente; se define acá para que utils no dependa de un
 * componente.
 */
export interface PedidoParaReporte {
  id: string;
  customerName?: string;
  status?: string;
  total?: number;
  createdAt?: string;
  date?: string;
  deadline?: string;
  notes?: string;
  products?: Array<{ productId?: string; name: string; quantity: number; price: number }>;
}

export function indexarCategorias(productos: Product[], categorias: Category[]): MapaCategorias {
  const mapa: MapaCategorias = new Map();

  for (const p of productos) {
    const cat = p.categoryId ? categorias.find(c => c.id === p.categoryId) : undefined;
    // Solo es subcategoría si el padre existe de verdad. Si el padre no está en
    // la lista, nombreCategoriaRaiz devuelve el nombre de la hija como raíz, así
    // que ponerla también en `sub` la mostraría duplicada en la planilla.
    const tienePadreReal = !!cat?.parentId && categorias.some(c => c.id === cat.parentId);

    mapa.set(p.id, {
      raiz: nombreCategoriaRaiz(categorias, p.categoryId),
      sub: tienePadreReal ? cat!.name : '',
      nombre: p.name,
    });
  }

  return mapa;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test src/utils/reporteAnaliticas.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/reporteAnaliticas.ts src/utils/reporteAnaliticas.test.ts
git commit -m "feat(reportes): indexar categoría raíz y subcategoría por producto"
```

---

### Task 2: `construirMatrizPorLocal`

Arma la hoja "Por Local" agrupada por categoría, con subtotales de unidades y monto por categoría y los totales globales.

**Files:**
- Modify: `src/utils/reporteAnaliticas.ts`
- Test: `src/utils/reporteAnaliticas.test.ts`

**Interfaces:**
- Consumes: `MapaCategorias`, `PedidoParaReporte`, `SIN_CATEGORIA` de la Task 1.
- Produces: `construirMatrizPorLocal(orders: PedidoParaReporte[], mapa: MapaCategorias): unknown[][]` — matriz lista para `XLSX.utils.aoa_to_sheet`.

**Estructura de la matriz devuelta:**

```
fila 0        : ['Categoría', 'Subcategoría', 'Producto', ...locales, 'Total Unidades']
por producto  : [raíz, sub, nombre, ...unidades por local ('' si 0), total unidades]
por categoría : ['>> <Cat> — unidades', '', '', ...unidades, total]
                ['>> <Cat> — monto $',  '', '', ...montos,   total]
                []                                    <- fila vacía entre bloques
al final      : ['Total Unidades',            '', '', ...]
                ['Venta Total (ítems)',       '', '', ...]
                ['Venta Total (del pedido)',  '', '', ...]
```

- [ ] **Step 1: Write the failing test**

Agregar al final de `src/utils/reporteAnaliticas.test.ts`:

```ts
import { construirMatrizPorLocal, type MapaCategorias, type PedidoParaReporte } from './reporteAnaliticas.ts';

const mapa: MapaCategorias = new Map([
  ['fideos', { raiz: 'Distribuidora', sub: '', nombre: 'Fideos 500g' }],
  ['coca', { raiz: 'Distribuidora', sub: 'Bebidas', nombre: 'Coca 500ml' }],
  ['pan', { raiz: 'Panadería', sub: '', nombre: 'Pan francés' }],
]);

// LA OCA PV: 5 fideos ($500) + 24 cocas ($24.000) + 100 panes ($50.000).
// El total del pedido (75.200) es 700 más que la suma de ítems (74.500): lotes FIFO.
// Pedro Torres: 50 panes ($25.000), total del pedido coincide.
const pedidos: PedidoParaReporte[] = [
  {
    id: 'a1b2c3d4ef', customerName: 'LA OCA PV', total: 75200,
    products: [
      { productId: 'fideos', name: 'Fideos 500g', quantity: 5, price: 100 },
      { productId: 'coca', name: 'Coca 500ml', quantity: 24, price: 1000 },
      { productId: 'pan', name: 'Pan francés', quantity: 100, price: 500 },
    ],
  },
  {
    id: 'e5f6g7h8ij', customerName: 'Pedro Torres', total: 25000,
    products: [{ productId: 'pan', name: 'Pan francés', quantity: 50, price: 500 }],
  },
];

/** Busca la fila cuya primera celda es `etiqueta`. Falla el test si no existe. */
function fila(matriz: unknown[][], etiqueta: string): unknown[] {
  const encontrada = matriz.find(f => f[0] === etiqueta);
  assert.ok(encontrada, `no se encontró la fila "${etiqueta}"`);
  return encontrada;
}

test('el encabezado trae Categoría, Subcategoría, Producto, los locales y el total', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  assert.deepEqual(matriz[0], [
    'Categoría', 'Subcategoría', 'Producto', 'LA OCA PV', 'Pedro Torres', 'Total Unidades',
  ]);
});

test('una subcategoría muestra su nombre y suma al subtotal de su categoría padre', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  assert.deepEqual(fila(matriz, 'Distribuidora').slice(0, 3), ['Distribuidora', '', 'Fideos 500g']);
  const coca = matriz.find(f => f[2] === 'Coca 500ml')!;
  assert.deepEqual(coca.slice(0, 3), ['Distribuidora', 'Bebidas', 'Coca 500ml']);
  // Distribuidora = 5 fideos + 24 cocas = 29 unidades en LA OCA PV.
  assert.deepEqual(fila(matriz, '>> Distribuidora — unidades'), [
    '>> Distribuidora — unidades', '', '', 29, 0, 29,
  ]);
});

test('los productos sin subcategoría van antes que los que tienen', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  const indiceFideos = matriz.findIndex(f => f[2] === 'Fideos 500g');
  const indiceCoca = matriz.findIndex(f => f[2] === 'Coca 500ml');
  assert.ok(indiceFideos < indiceCoca);
});

test('el subtotal de monto por categoría suma precio por cantidad', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  // Distribuidora en LA OCA PV: 5*100 + 24*1000 = 24.500. En Pedro Torres: 0.
  assert.deepEqual(fila(matriz, '>> Distribuidora — monto $'), [
    '>> Distribuidora — monto $', '', '', 24500, 0, 24500,
  ]);
  // Panadería: 100*500 = 50.000 y 50*500 = 25.000.
  assert.deepEqual(fila(matriz, '>> Panadería — monto $'), [
    '>> Panadería — monto $', '', '', 50000, 25000, 75000,
  ]);
});

test('un local que no compró un producto deja la celda vacía, no 0', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  const fideos = matriz.find(f => f[2] === 'Fideos 500g')!;
  assert.equal(fideos[3], 5);
  assert.equal(fideos[4], '');
});

test('Venta Total (del pedido) usa order.total y difiere de la suma de ítems cuando hubo lotes', () => {
  const matriz = construirMatrizPorLocal(pedidos, mapa);
  assert.deepEqual(fila(matriz, 'Total Unidades'), ['Total Unidades', '', '', 129, 50, 179]);
  assert.deepEqual(fila(matriz, 'Venta Total (ítems)'), ['Venta Total (ítems)', '', '', 74500, 25000, 99500]);
  assert.deepEqual(fila(matriz, 'Venta Total (del pedido)'), ['Venta Total (del pedido)', '', '', 75200, 25000, 100200]);
});

test('un producto fuera del catálogo cae en Sin categoría y su bloque va al final', () => {
  const conFantasma: PedidoParaReporte[] = [{
    id: 'x1', customerName: 'LA OCA PV', total: 1000,
    products: [
      { productId: 'pan', name: 'Pan francés', quantity: 1, price: 500 },
      { productId: 'borrado', name: 'Producto borrado', quantity: 1, price: 500 },
    ],
  }];
  const matriz = construirMatrizPorLocal(conFantasma, mapa);
  const fantasma = matriz.find(f => f[2] === 'Producto borrado')!;
  assert.equal(fantasma[0], SIN_CATEGORIA);
  const indiceSinCategoria = matriz.findIndex(f => f[0] === `>> ${SIN_CATEGORIA} — unidades`);
  const indicePanaderia = matriz.findIndex(f => f[0] === '>> Panadería — unidades');
  assert.ok(indicePanaderia < indiceSinCategoria, 'Sin categoría tiene que ir al final');
});

test('un ítem sin productId no rompe: entra como Sin categoría con el nombre del pedido', () => {
  const sinId: PedidoParaReporte[] = [{
    id: 'x2', customerName: 'LA OCA PV', total: 300,
    products: [{ name: 'Viejo sin id', quantity: 3, price: 100 }],
  }];
  const matriz = construirMatrizPorLocal(sinId, mapa);
  const viejo = matriz.find(f => f[2] === 'Viejo sin id')!;
  assert.deepEqual(viejo.slice(0, 3), [SIN_CATEGORIA, '', 'Viejo sin id']);
});

test('un pedido sin ítems no aporta filas de producto pero sí su total', () => {
  const vacio: PedidoParaReporte[] = [{ id: 'x3', customerName: 'LA OCA PV', total: 9999, products: [] }];
  const matriz = construirMatrizPorLocal(vacio, mapa);
  assert.deepEqual(fila(matriz, 'Total Unidades'), ['Total Unidades', '', '', 0, 0]);
  assert.deepEqual(fila(matriz, 'Venta Total (del pedido)'), ['Venta Total (del pedido)', '', '', 9999, 9999]);
});

test('un pedido sin customerName se agrupa bajo Desconocido', () => {
  const anonimo: PedidoParaReporte[] = [{
    id: 'x4', total: 500,
    products: [{ productId: 'pan', name: 'Pan francés', quantity: 1, price: 500 }],
  }];
  const matriz = construirMatrizPorLocal(anonimo, mapa);
  assert.deepEqual(matriz[0], ['Categoría', 'Subcategoría', 'Producto', 'Desconocido', 'Total Unidades']);
});
```

> Nota sobre el test del pedido sin ítems: con un solo local la matriz tiene
> 3 columnas fijas + 1 local + 1 total, por eso las filas de total quedan con
> `['etiqueta', '', '', <local>, <total>]`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test src/utils/reporteAnaliticas.test.ts
```

Expected: FAIL — `construirMatrizPorLocal is not a function` (los 6 tests de la Task 1 siguen pasando).

- [ ] **Step 3: Write minimal implementation**

Agregar a `src/utils/reporteAnaliticas.ts`:

```ts
const LOCAL_SIN_NOMBRE = 'Desconocido';

/** Clave de agrupación de un ítem: el productId, o el nombre si el pedido es viejo y no lo tiene. */
function claveProducto(item: { productId?: string; name: string }): string {
  return item.productId || `nombre:${item.name}`;
}

/**
 * Categoría de un ítem. Un producto que ya no está en el catálogo (borrado) o un
 * ítem sin productId caen en Sin categoría: se muestran igual, porque omitirlos
 * haría que los subtotales no sumen el total y la planilla mentiría.
 */
function datosDeProducto(mapa: MapaCategorias, item: { productId?: string; name: string }): CategoriaDeProducto {
  const encontrado = item.productId ? mapa.get(item.productId) : undefined;
  return encontrado ?? { raiz: SIN_CATEGORIA, sub: '', nombre: item.name };
}

/** Categorías raíz alfabéticas, con Sin categoría siempre al final. */
function compararCategorias(a: string, b: string): number {
  if (a === b) return 0;
  if (a === SIN_CATEGORIA) return 1;
  if (b === SIN_CATEGORIA) return -1;
  return a.localeCompare(b, 'es');
}

interface FilaProducto {
  raiz: string;
  sub: string;
  nombre: string;
  unidades: Map<string, number>;
  monto: Map<string, number>;
}

export function construirMatrizPorLocal(orders: PedidoParaReporte[], mapa: MapaCategorias): unknown[][] {
  const locales = Array.from(
    new Set(orders.map(o => o.customerName || LOCAL_SIN_NOMBRE))
  ).sort((a, b) => a.localeCompare(b, 'es'));

  const filas = new Map<string, FilaProducto>();

  for (const order of orders) {
    const local = order.customerName || LOCAL_SIN_NOMBRE;
    for (const item of order.products ?? []) {
      const clave = claveProducto(item);
      let fila = filas.get(clave);
      if (!fila) {
        const datos = datosDeProducto(mapa, item);
        fila = { ...datos, unidades: new Map(), monto: new Map() };
        filas.set(clave, fila);
      }
      fila.unidades.set(local, (fila.unidades.get(local) || 0) + item.quantity);
      fila.monto.set(local, (fila.monto.get(local) || 0) + item.price * item.quantity);
    }
  }

  // Orden: categoría raíz, después subcategoría ('' primero) y después producto.
  const ordenadas = Array.from(filas.values()).sort((a, b) => {
    const porRaiz = compararCategorias(a.raiz, b.raiz);
    if (porRaiz !== 0) return porRaiz;
    if (a.sub !== b.sub) return a.sub.localeCompare(b.sub, 'es');
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  // Map conserva el orden de inserción, así que los bloques salen ya ordenados.
  const porCategoria = new Map<string, FilaProducto[]>();
  for (const f of ordenadas) {
    const lista = porCategoria.get(f.raiz) ?? [];
    lista.push(f);
    porCategoria.set(f.raiz, lista);
  }

  const matriz: unknown[][] = [['Categoría', 'Subcategoría', 'Producto', ...locales, 'Total Unidades']];

  const totalUnidadesPorLocal = new Map<string, number>();
  const totalItemsPorLocal = new Map<string, number>();

  for (const [raiz, filasCat] of porCategoria) {
    for (const f of filasCat) {
      const row: unknown[] = [raiz, f.sub, f.nombre];
      let totalFila = 0;
      for (const local of locales) {
        const qty = f.unidades.get(local) || 0;
        // Celda vacía y no 0: un 0 sugiere "se pidió y salió cero".
        row.push(qty > 0 ? qty : '');
        totalFila += qty;
      }
      row.push(totalFila);
      matriz.push(row);
    }

    const filaUnidades: unknown[] = [`>> ${raiz} — unidades`, '', ''];
    const filaMonto: unknown[] = [`>> ${raiz} — monto $`, '', ''];
    let totalUnidadesCat = 0;
    let totalMontoCat = 0;

    for (const local of locales) {
      const unidades = filasCat.reduce((s, f) => s + (f.unidades.get(local) || 0), 0);
      const monto = filasCat.reduce((s, f) => s + (f.monto.get(local) || 0), 0);
      filaUnidades.push(unidades);
      filaMonto.push(monto);
      totalUnidadesCat += unidades;
      totalMontoCat += monto;
      totalUnidadesPorLocal.set(local, (totalUnidadesPorLocal.get(local) || 0) + unidades);
      totalItemsPorLocal.set(local, (totalItemsPorLocal.get(local) || 0) + monto);
    }

    filaUnidades.push(totalUnidadesCat);
    filaMonto.push(totalMontoCat);
    matriz.push(filaUnidades, filaMonto, []);
  }

  const totalUnidades: unknown[] = ['Total Unidades', '', ''];
  const ventaItems: unknown[] = ['Venta Total (ítems)', '', ''];
  const ventaPedido: unknown[] = ['Venta Total (del pedido)', '', ''];
  let globalUnidades = 0;
  let globalItems = 0;
  let globalPedido = 0;

  for (const local of locales) {
    const unidades = totalUnidadesPorLocal.get(local) || 0;
    const items = totalItemsPorLocal.get(local) || 0;
    const pedido = orders
      .filter(o => (o.customerName || LOCAL_SIN_NOMBRE) === local)
      .reduce((s, o) => s + (o.total || 0), 0);

    totalUnidades.push(unidades);
    ventaItems.push(items);
    ventaPedido.push(pedido);
    globalUnidades += unidades;
    globalItems += items;
    globalPedido += pedido;
  }

  totalUnidades.push(globalUnidades);
  ventaItems.push(globalItems);
  ventaPedido.push(globalPedido);
  matriz.push(totalUnidades, ventaItems, ventaPedido);

  return matriz;
}
```

> Si no hubo ninguna categoría (matriz sin bloques), no se empuja la fila vacía
> previa a los totales. No hace falta agregarla: una planilla sin ventas no se
> lee, se mira el `0`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test src/utils/reporteAnaliticas.test.ts
```

Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/reporteAnaliticas.ts src/utils/reporteAnaliticas.test.ts
git commit -m "feat(reportes): hoja Por Local agrupada por categoría con subtotales"
```

---

### Task 3: `construirDetalleVentas`

Arma la hoja "Detalle Ventas": una fila por pedido, con las columnas actuales más una columna de monto por categoría, `Total Ítems ($)` y `Diferencia ($)`.

**Files:**
- Modify: `src/utils/reporteAnaliticas.ts`
- Test: `src/utils/reporteAnaliticas.test.ts`

**Interfaces:**
- Consumes: `MapaCategorias`, `PedidoParaReporte`, `SIN_CATEGORIA`, `datosDeProducto`, `compararCategorias` (internas de las Tasks 1 y 2).
- Produces: `construirDetalleVentas(orders: PedidoParaReporte[], mapa: MapaCategorias): Record<string, unknown>[]` — filas listas para `XLSX.utils.json_to_sheet`.

- [ ] **Step 1: Write the failing test**

Agregar al final de `src/utils/reporteAnaliticas.test.ts` (reusa `mapa` y `pedidos` de la Task 2):

```ts
import { construirDetalleVentas } from './reporteAnaliticas.ts';

test('conserva las columnas actuales, en el mismo orden, y agrega las nuevas al final', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.deepEqual(Object.keys(filas[0]), [
    'Fecha Creación', 'Hora Creación', 'Fecha Entrega (Deadline)', 'ID Pedido',
    'Cliente/Local', 'Estado', 'Total ($)', 'Productos', 'Notas',
    'Distribuidora', 'Panadería', 'Total Ítems ($)', 'Diferencia ($)',
  ]);
});

test('reparte el monto del pedido entre las columnas de categoría', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.equal(filas[0]['Distribuidora'], 24500);
  assert.equal(filas[0]['Panadería'], 50000);
  assert.equal(filas[0]['Total Ítems ($)'], 74500);
});

test('las columnas de categoría de una fila suman su Total Ítems', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  for (const f of filas) {
    const suma = (f['Distribuidora'] as number) + (f['Panadería'] as number);
    assert.equal(suma, f['Total Ítems ($)']);
  }
});

test('Diferencia es el total del pedido menos la suma de ítems, y 0 cuando coinciden', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.equal(filas[0]['Total ($)'], 75200);
  assert.equal(filas[0]['Diferencia ($)'], 700);
  assert.equal(filas[1]['Diferencia ($)'], 0);
});

test('toda fila trae todas las columnas de categoría, con 0 donde no aplica', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  // El segundo pedido solo tiene panadería: Distribuidora tiene que existir en 0.
  assert.equal(filas[1]['Distribuidora'], 0);
  assert.deepEqual(Object.keys(filas[0]), Object.keys(filas[1]));
});

test('un pedido sin ítems deja las categorías en 0 y Diferencia igual al total del pedido', () => {
  const vacio: PedidoParaReporte[] = [{ id: 'x3', customerName: 'LA OCA PV', total: 9999 }];
  const filas = construirDetalleVentas(vacio, mapa);
  assert.equal(filas[0]['Total Ítems ($)'], 0);
  assert.equal(filas[0]['Diferencia ($)'], 9999);
  assert.equal(filas[0]['Productos'], '');
});

test('una categoría que choca con una columna existente se renombra en vez de sobreescribirla', () => {
  const mapaChocado: MapaCategorias = new Map([
    ['raro', { raiz: 'Notas', sub: '', nombre: 'Producto raro' }],
  ]);
  const unPedido: PedidoParaReporte[] = [{
    id: 'x5', customerName: 'LA OCA PV', total: 100, notes: 'la nota original',
    products: [{ productId: 'raro', name: 'Producto raro', quantity: 1, price: 100 }],
  }];
  const filas = construirDetalleVentas(unPedido, mapaChocado);
  assert.equal(filas[0]['Notas'], 'la nota original');
  assert.equal(filas[0]['Notas (categoría)'], 100);
});

test('el ID del pedido se corta a 8 caracteres, como hoy', () => {
  const filas = construirDetalleVentas(pedidos, mapa);
  assert.equal(filas[0]['ID Pedido'], 'a1b2c3d4');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test src/utils/reporteAnaliticas.test.ts
```

Expected: FAIL — `construirDetalleVentas is not a function`.

- [ ] **Step 3: Write minimal implementation**

Agregar a `src/utils/reporteAnaliticas.ts`:

```ts
/** Etiquetas de estado tal como las muestra hoy la planilla. */
function etiquetaEstado(status: string | undefined): string {
  if (status === 'pending') return 'Pendiente';
  if (status === 'in_progress') return 'En Preparación';
  if (status === 'completed') return 'Completado';
  return 'Despachado';
}

/** Todas las categorías que aparecen en el período, para que todas las filas tengan las mismas columnas. */
function categoriasPresentes(orders: PedidoParaReporte[], mapa: MapaCategorias): string[] {
  const vistas = new Set<string>();
  for (const order of orders) {
    for (const item of order.products ?? []) {
      vistas.add(datosDeProducto(mapa, item).raiz);
    }
  }
  return Array.from(vistas).sort(compararCategorias);
}

export function construirDetalleVentas(
  orders: PedidoParaReporte[],
  mapa: MapaCategorias
): Record<string, unknown>[] {
  const categorias = categoriasPresentes(orders, mapa);

  return orders.map(order => {
    const createDate = new Date(order.createdAt || order.date || order.deadline || new Date());
    const deadlineDate = order.deadline ? new Date(`${order.deadline}T12:00:00`) : createDate;

    const montoPorCategoria = new Map<string, number>();
    let totalItems = 0;
    for (const item of order.products ?? []) {
      const { raiz } = datosDeProducto(mapa, item);
      const monto = item.price * item.quantity;
      montoPorCategoria.set(raiz, (montoPorCategoria.get(raiz) || 0) + monto);
      totalItems += monto;
    }

    const fila: Record<string, unknown> = {
      'Fecha Creación': createDate.toLocaleDateString('es-CL'),
      'Hora Creación': createDate.toLocaleTimeString('es-CL'),
      'Fecha Entrega (Deadline)': deadlineDate.toLocaleDateString('es-CL'),
      'ID Pedido': order.id.slice(0, 8),
      'Cliente/Local': order.customerName || 'N/A',
      'Estado': etiquetaEstado(order.status),
      'Total ($)': order.total || 0,
      'Productos': order.products?.map(p => `${p.name} (x${p.quantity})`).join('; ') || '',
      'Notas': order.notes || '',
    };

    // Todas las filas llevan todas las categorías, con 0 donde no aplica: si una
    // fila omitiera una clave, json_to_sheet desalinearía las columnas y la
    // planilla quedaría corrida sin ningún aviso.
    for (const cat of categorias) {
      // Una categoría que se llame igual que una columna fija (p. ej. "Notas")
      // la sobreescribiría. Se renombra la columna de categoría, no la original.
      const clave = cat in fila ? `${cat} (categoría)` : cat;
      fila[clave] = montoPorCategoria.get(cat) || 0;
    }

    fila['Total Ítems ($)'] = totalItems;
    fila['Diferencia ($)'] = (order.total || 0) - totalItems;

    return fila;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test src/utils/reporteAnaliticas.test.ts
```

Expected: PASS, 24 tests.

- [ ] **Step 5: Run the whole suite and commit**

```bash
npm test
```

Expected: PASS, sin regresiones en el resto de `src/utils`.

```bash
git add src/utils/reporteAnaliticas.ts src/utils/reporteAnaliticas.test.ts
git commit -m "feat(reportes): columnas por categoría, Total Ítems y Diferencia en Detalle Ventas"
```

---

### Task 4: Integrar el módulo en `Analytics.tsx`

Cargar el catálogo (productos + categorías) y reemplazar los cuatro bloques duplicados de los dos handlers de export por llamadas al módulo.

**Files:**
- Modify: `src/components/Analytics.tsx`

**Interfaces:**
- Consumes: `indexarCategorias`, `construirMatrizPorLocal`, `construirDetalleVentas` de `../utils/reporteAnaliticas`; `categoriesAPI`, `type Category` de `../utils/api`.
- Produces: nada para tasks posteriores.

**Por qué un `useEffect` nuevo y no reusar `products`:** el estado `products` que ya existe se llena dentro de `loadProductionData` ([`Analytics.tsx:378`](../../../src/components/Analytics.tsx)), **después** de pedir ingredientes y órdenes de producción. Si cualquiera de esas dos llamadas falla, `products` queda vacío y la planilla saldría entera como `Sin categoría` sin avisar. El catálogo del export se carga aparte para que no dependa de eso. El costo es un `GET /products` extra al abrir Analíticas; vale la aislación.

- [ ] **Step 1: Agregar el import y el estado del catálogo**

En los imports, cambiar:

```ts
import { productsAPI, type Product } from '../utils/api';
```

por:

```ts
import { productsAPI, categoriesAPI, type Product, type Category } from '../utils/api';
import { indexarCategorias, construirMatrizPorLocal, construirDetalleVentas } from '../utils/reporteAnaliticas';
```

Después de `const [allOrders, setAllOrders] = useState<Order[]>(orders);` agregar:

```ts
  // Catálogo propio del export, independiente de loadProductionData: si la carga
  // de producción falla, la planilla igual sale categorizada.
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<Category[]>([]);
```

- [ ] **Step 2: Agregar el `useEffect` que carga el catálogo**

Inmediatamente después del `useEffect` que trae los pedidos (el que termina en `}, [accessToken]);`, línea ~129):

```ts
  // Catálogo para agrupar la planilla por categoría. Si falla, el export sigue
  // funcionando: indexarCategorias con listas vacías manda todo a "Sin categoría".
  useEffect(() => {
    const fetchCatalogo = async () => {
      if (!accessToken) return;
      try {
        const [productos, categorias] = await Promise.all([
          productsAPI.getAll(accessToken),
          categoriesAPI.getAll(accessToken),
        ]);
        setCatalogProducts(productos);
        setCatalogCategories(categorias);
      } catch (error) {
        console.error('Error cargando catálogo para categorizar el reporte:', error);
      }
    };

    fetchCatalogo();
  }, [accessToken]);
```

- [ ] **Step 3: Agregar el mapa memoizado**

Después del `useMemo` de `filteredOrders` (termina en `}, [allOrders, ...]);`):

```ts
  const mapaCategorias = useMemo(
    () => indexarCategorias(catalogProducts, catalogCategories),
    [catalogProducts, catalogCategories]
  );
```

- [ ] **Step 4: Reemplazar los bloques en `handleExportDrive`**

Se empieza por `handleExportDrive` (el de más abajo en el archivo) para que los números de línea de `handleExport` no se muevan mientras se edita.

Reemplazar el bloque que empieza en `// 2. Sheet: Detalle Ventas (Con fecha de entrega vs creación para aclarar filtrado)` y termina en `const wsVentas = XLSX.utils.json_to_sheet(ventasData);` por:

```ts
      // 2. Sheet: Detalle Ventas
      const wsVentas = XLSX.utils.json_to_sheet(construirDetalleVentas(filteredOrders, mapaCategorias));
```

Reemplazar el bloque que empieza en `// 4. Sheet: Por Local (Matrix)` y termina en `const wsLocales = XLSX.utils.aoa_to_sheet(matrizLocales);` por:

```ts
      // 4. Sheet: Por Local (agrupada por categoría)
      const wsLocales = XLSX.utils.aoa_to_sheet(construirMatrizPorLocal(filteredOrders, mapaCategorias));
```

- [ ] **Step 5: Reemplazar los mismos dos bloques en `handleExport`**

Reemplazar el bloque que empieza en `// 2. Sheet: Detalle Ventas` y termina en `const wsVentas = XLSX.utils.json_to_sheet(ventasData);` por:

```ts
      // 2. Sheet: Detalle Ventas
      const wsVentas = XLSX.utils.json_to_sheet(construirDetalleVentas(filteredOrders, mapaCategorias));
```

Reemplazar el bloque que empieza en `// 4. Sheet: Por Local (Matrix)` / `// Group products by Local` y termina en `const wsLocales = XLSX.utils.aoa_to_sheet(matrizLocales);` por:

```ts
      // 4. Sheet: Por Local (agrupada por categoría)
      const wsLocales = XLSX.utils.aoa_to_sheet(construirMatrizPorLocal(filteredOrders, mapaCategorias));
```

- [ ] **Step 6: Verificar que no quedó código muerto**

```bash
grep -n "localProductsMap\|matrizLocales\|ventasData\|gastoTotalRow\|totalUnitsRow\|sortedLocalNames" src/components/Analytics.tsx
```

Expected: sin resultados. Si queda alguno, es un resto de los bloques viejos — borrarlo.

- [ ] **Step 7: Verificar que compila**

```bash
npm run build
```

Expected: build exitoso, sin errores de TypeScript. Si TypeScript se queja de que `Order` no es asignable a `PedidoParaReporte`, el problema está en `PedidoParaReporte` (Task 1), no en el componente: no castear con `as any`, arreglar el tipo.

- [ ] **Step 8: Commit**

```bash
git add src/components/Analytics.tsx
git commit -m "refactor(analiticas): usar el módulo de reportes en los dos exports"
```

---

### Task 5: Etiquetas de estado correctas en la planilla (opcional)

**Hallazgo, no pedido.** `etiquetaEstado` (copiada del código actual) devuelve `'Despachado'` para todo lo que no es `pending`/`in_progress`/`completed`. O sea que un pedido **`cancelled`** aparece en la planilla como "Despachado", con su monto completo. En una hoja que se usa para cuadrar ingresos, eso invita a contar como venta algo que se anuló.

Esta task arregla solo la etiqueta. **No** toca los KPIs ni excluye los cancelados de los totales: eso cambiaría los números que hoy ve todo el mundo y merece su propia conversación.

**Files:**
- Modify: `src/utils/reporteAnaliticas.ts`
- Test: `src/utils/reporteAnaliticas.test.ts`

**Interfaces:**
- Consumes: `etiquetaEstado` (interna, Task 3).
- Produces: nada nuevo; cambia el valor de la columna `Estado`.

- [ ] **Step 1: Write the failing test**

```ts
test('cada estado tiene su etiqueta: un pedido anulado no dice Despachado', () => {
  const estados: PedidoParaReporte[] = [
    { id: 'p', status: 'pending', total: 0 },
    { id: 'i', status: 'in_progress', total: 0 },
    { id: 'c', status: 'completed', total: 0 },
    { id: 'd', status: 'dispatched', total: 0 },
    { id: 'e', status: 'delivered', total: 0 },
    { id: 'x', status: 'cancelled', total: 0 },
    { id: 'z', total: 0 },
  ];
  const filas = construirDetalleVentas(estados, mapa);
  assert.deepEqual(filas.map(f => f['Estado']), [
    'Pendiente', 'En Preparación', 'Completado', 'Despachado', 'Entregado', 'Anulado', 'Sin estado',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test src/utils/reporteAnaliticas.test.ts
```

Expected: FAIL — devuelve `'Despachado'` para `delivered`, `cancelled` y el pedido sin estado.

- [ ] **Step 3: Write minimal implementation**

Reemplazar `etiquetaEstado` por:

```ts
/**
 * Etiquetas de estado para la planilla. Antes todo lo que no fuera
 * pending/in_progress/completed caía en 'Despachado', así que un pedido anulado
 * se leía como despachado y su monto parecía una venta buena.
 */
const ETIQUETAS_ESTADO: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En Preparación',
  completed: 'Completado',
  dispatched: 'Despachado',
  delivered: 'Entregado',
  cancelled: 'Anulado',
};

function etiquetaEstado(status: string | undefined): string {
  if (!status) return 'Sin estado';
  return ETIQUETAS_ESTADO[status] ?? status;
}
```

- [ ] **Step 4: Run the whole suite**

```bash
npm test
```

Expected: PASS, 25 tests en `reporteAnaliticas.test.ts` y sin regresiones.

- [ ] **Step 5: Commit**

```bash
git add src/utils/reporteAnaliticas.ts src/utils/reporteAnaliticas.test.ts
git commit -m "fix(reportes): etiquetar Entregado y Anulado en vez de Despachado"
```

---

## Verificación manual (después de la Task 4)

El preview no sirve para esto: hay que abrir el archivo. Exportar un rango real desde **Perfil → Analíticas → Excel** y confirmar en la planilla:

- [ ] La hoja "Por Local" tiene un bloque por categoría, cada uno con sus dos filas `>> … — unidades` y `>> … — monto $`.
- [ ] Para un local, la suma de los subtotales de unidades de todas las categorías da la fila `Total Unidades` de ese local.
- [ ] Para un local, la suma de los subtotales de monto da `Venta Total (ítems)`.
- [ ] En "Detalle Ventas", la suma de las columnas de categoría de una fila da su `Total Ítems ($)`.
- [ ] Filtrar `Diferencia ($) ≠ 0` devuelve solo pedidos con productos de Distribuidora costeados por lotes.
- [ ] El botón **Google Drive** genera el mismo contenido que el botón **Excel** (solo cambia el nombre del archivo).

## Fuera de alcance

- El **selector de categoría en pantalla** (filtra KPIs, gráficos y export). Segunda iteración, spec propio.
- Que los KPIs y los totales **excluyan los pedidos anulados**. Hoy `kpis.totalRevenue` suma todos los pedidos del período, cancelados incluidos ([`Analytics.tsx:199`](../../../src/components/Analytics.tsx)). Es un hallazgo real, pero cambiarlo mueve números que ya se usan: va aparte.
- Las hojas **Resumen** y **Productos**, los gráficos y los nombres de archivo.
