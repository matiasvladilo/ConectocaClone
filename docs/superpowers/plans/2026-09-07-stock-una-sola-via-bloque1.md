# Stock: una sola vía — Bloque 1 (frontend) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que sea imposible perder un stock tipeado: el stock sale de los formularios de edición y queda una sola vía real de cambiarlo, con su botón de confirmar a la vista.

**Architecture:** Tocar una tarjeta de producto abre una ficha de solo lectura (`ProductDetailDialog`) con acciones explícitas, en vez del formulario de edición. El campo "Stock \*" deja de ser editable al editar (sigue editable al crear, que es stock inicial). La lógica del checkbox de stock ilimitado se extrae a una función pura para poder testearla con el harness que ya existe. Sin cambios de backend.

**Tech Stack:** React 19 + TypeScript, Vite 6, Radix UI (`./ui/*`), `motion/react`, `lucide-react`, `sonner` para toasts. Tests con `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-07-stock-una-sola-via-design.md` (Componentes 1, 2 y 3).

## Global Constraints

- **Runner de tests:** `npm test` → `node --test src/utils/*.test.ts`. **Sólo corren archivos en `src/utils/`.** Baseline antes de empezar: 57 tests en verde.
- **No hay librería de testing de componentes** (no vitest, no testing-library) y **no se agregan dependencias**. Todo lo que deba testearse automáticamente va como función pura en `src/utils/`. Los componentes se verifican en navegador.
- **El CSS de Tailwind está precompilado en `src/index.css`.** Una clase que no esté ahí **no hace nada y falla en silencio**. Antes de usar una clase nueva, verificarla: `grep -o "\.nombre-clase" src/index.css`. Las clases usadas en este plan ya fueron verificadas como presentes.
- **`z-50` es el máximo z-index compilado.** No existe `z-[60]` ni similares.
- **Idioma:** comentarios y textos de UI en español, como el resto del archivo.
- **Estilos inline** para lo que no exista como clase (el archivo ya lo hace: colores de marca `#0059FF`, fondos con `rgba`).

## Pre-requisito: el árbol de trabajo está sucio

`git status` muestra trabajo sin commitear que toca un archivo de este plan:

```
 M src/components/NewOrderForm.tsx     (45 inserciones, 13 borrados)
?? src/utils/cartStock.ts
?? src/utils/cartStock.test.ts
```

Es un arreglo no relacionado ("si queda 1 solo producto no deja pedirlo"). La Tarea 5 modifica `NewOrderForm.tsx`.

- [ ] **Paso 0: commitear o guardar ese trabajo antes de empezar**

```bash
git status --short
npm test
```

Si los tests pasan, commitear ese trabajo por separado. Si no se quiere commitear todavía: `git stash push src/components/NewOrderForm.tsx src/utils/cartStock.ts src/utils/cartStock.test.ts`. **No mezclar ese cambio con este plan.**

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/utils/stockForm.ts` **(nuevo)** | Funciones puras del formulario de producto relacionadas con stock. Hoy: alternar "stock ilimitado" sin destruir el valor. |
| `src/utils/stockForm.test.ts` **(nuevo)** | Tests de lo anterior. |
| `src/components/ProductDetailDialog.tsx` **(nuevo)** | Ficha de producto de solo lectura con acciones explícitas. No conoce la API: recibe callbacks. |
| `src/components/ProductManagement.tsx` | Deja de abrir el formulario al tocar una tarjeta; abre la ficha. Saca el input de stock del modo edición. |
| `src/utils/productPayload.ts` | Se simplifica: en edición el payload ya nunca lleva `stock`. |
| `src/utils/productPayload.test.ts` | Se ajustan los tests a la regla nueva. |
| `src/components/NewOrderForm.tsx` | Su editor rápido de producto también deja el stock en solo lectura. |

Orden: 1 → 2 → 3 → 4 → 5. La ficha (Tarea 2) va antes de sacar el input (Tarea 3) porque hasta que exista es la única forma de ver el stock al editar.

---

### Task 1: Función pura del checkbox de stock ilimitado

Arregla el trap: hoy marcar "∞ Stock Ilimitado" pone el campo en `'0'` y desmarcarlo lo deja en `'0'`, así que marcar+desmarcar+guardar escribe stock 0.

**Files:**
- Create: `src/utils/stockForm.ts`
- Create: `src/utils/stockForm.test.ts`
- Modify: `src/components/ProductManagement.tsx:1043-1047`

**Interfaces:**
- Consumes: `ProductFormData` de `src/utils/productPayload.ts`
- Produces: `alternarStockIlimitado(form: ProductFormData, ilimitado: boolean): ProductFormData`

- [ ] **Step 1: Write the failing test**

Create `src/utils/stockForm.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternarStockIlimitado } from './stockForm.ts';
import type { ProductFormData } from './productPayload.ts';

const form: ProductFormData = {
  name: 'Aceite Natura',
  description: '900ml',
  price: '2.750',
  stock: '50',
  minStock: '10',
  category: 'Abarrotes',
  categoryId: 'cat-1',
  sku: '',
  imageUrl: '',
  productionAreaId: '',
  unlimitedStock: false,
  allowDecimal: false,
};

test('marcar ilimitado NO destruye el stock cargado', () => {
  const r = alternarStockIlimitado(form, true);
  assert.equal(r.unlimitedStock, true);
  assert.equal(r.stock, '50');
});

test('marcar y desmarcar devuelve el stock original', () => {
  const r = alternarStockIlimitado(alternarStockIlimitado(form, true), false);
  assert.equal(r.unlimitedStock, false);
  assert.equal(r.stock, '50');
});

test('no toca ningun otro campo', () => {
  const r = alternarStockIlimitado(form, true);
  assert.equal(r.name, 'Aceite Natura');
  assert.equal(r.price, '2.750');
  assert.equal(r.minStock, '10');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './stockForm.ts'`

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/stockForm.ts`:

```ts
import type { ProductFormData } from './productPayload';

/**
 * Alterna "stock ilimitado" SIN tocar el valor del campo de stock.
 *
 * Antes, marcar la casilla ponía `stock` en '0' y desmarcarla lo dejaba en '0'
 * (porque ya valía '0'): marcar y desmarcar destruía el número del usuario y
 * guardaba el producto en cero, sin aviso.
 *
 * Blanquearlo nunca hizo falta. El input ya se deshabilita mientras la casilla
 * está marcada, y el 0 que corresponde mandar al servidor cuando el producto es
 * ilimitado se fuerza aparte: en construirPayloadProducto y otra vez en el
 * backend (index.ts, `if (unlimitedStock) updateData.stock = 0`).
 */
export function alternarStockIlimitado(
  form: ProductFormData,
  ilimitado: boolean
): ProductFormData {
  return { ...form, unlimitedStock: ilimitado };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 60 tests (57 previos + 3 nuevos)

- [ ] **Step 5: Usar la función en el componente**

En `src/components/ProductManagement.tsx`, agregar al bloque de imports de utils:

```ts
import { alternarStockIlimitado } from '../utils/stockForm';
```

Reemplazar el `onCheckedChange` del checkbox `id="unlimited-stock"` (líneas 1043-1047):

```jsx
                    onCheckedChange={(checked: boolean | "indeterminate") =>
                      setFormData(prev => alternarStockIlimitado(prev, checked === true))
                    }
```

- [ ] **Step 6: Verificar en navegador**

`npm run dev`. Ir a Gestión de Productos → crear un producto nuevo → escribir 50 en Stock → marcar "∞ Stock Ilimitado" → desmarcarlo. **El campo debe seguir diciendo 50**, no 0.

- [ ] **Step 7: Commit**

```bash
git add src/utils/stockForm.ts src/utils/stockForm.test.ts src/components/ProductManagement.tsx
git commit -m "fix: marcar y desmarcar stock ilimitado ya no borra el stock cargado"
```

---

### Task 2: Ficha de producto (`ProductDetailDialog`)

Tocar una tarjeta abre esto en vez del formulario de edición.

**Files:**
- Create: `src/components/ProductDetailDialog.tsx`
- Modify: `src/components/ProductManagement.tsx` (estado nuevo, handler de la tarjeta, montaje del diálogo)

**Interfaces:**
- Consumes: `Product` de `../utils/api`, `formatCLP` de `../utils/format`, `Dialog*` de `./ui/dialog`, `Button` de `./ui/button`.
- Produces: componente `ProductDetailDialog` con estas props exactas (`accessToken` se usa recién en la Tarea 2b, pero se declara ya para no cambiar la interfaz dos veces):

```ts
interface ProductDetailDialogProps {
  product: Product | null;
  accessToken: string;
  onOpenChange: (open: boolean) => void;
  onEditar: (product: Product) => void;
  onAjustarStock: (product: Product) => void;
  onReceta: (product: Product) => void;
  onEliminar: (product: Product) => void;
  esAdmin: boolean;
}
```

El diálogo está abierto cuando `product !== null`. No conoce la API para las acciones: sólo avisa qué quiso hacer el usuario.

**Estructura obligatoria:** el contenido va en un subcomponente `FichaContenido` que sólo se monta cuando hay producto. La Tarea 2b agrega `useState` ahí adentro, y si los hooks vivieran en `ProductDetailDialog` junto a un `if (!product) return null`, React fallaría con "rendered fewer hooks than expected". Se arma así desde el principio para no tener que reestructurar después.

- [ ] **Step 1: Crear el componente**

Create `src/components/ProductDetailDialog.tsx`:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Package, Edit, BoxIcon, Trash2, ChevronRight, ListChecks } from 'lucide-react';
import type { Product } from '../utils/api';
import { formatCLP } from '../utils/format';

interface ProductDetailDialogProps {
  product: Product | null;
  accessToken: string;
  onOpenChange: (open: boolean) => void;
  onEditar: (product: Product) => void;
  onAjustarStock: (product: Product) => void;
  onReceta: (product: Product) => void;
  onEliminar: (product: Product) => void;
  /** El endpoint de movimientos de stock es admin-only; la fila se oculta para el resto. */
  esAdmin: boolean;
}

type ContenidoProps = Omit<ProductDetailDialogProps, 'product' | 'onOpenChange'> & {
  product: Product;
};

/**
 * Ficha de producto: lo que se abre al tocar una tarjeta.
 *
 * Es de SOLO LECTURA a propósito. Antes, tocar una tarjeta abría el formulario
 * de edición con el nombre seleccionado, y ahí el stock era un input más de un
 * formulario largo cuyo botón de guardar queda debajo del scroll en teléfono:
 * quien tipeaba el stock y cerraba con la X, con Escape o tocando afuera perdía
 * el número sin que nada se lo dijera. Acá no hay nada que perder al cerrar, y
 * cambiar el stock exige pasar por el diálogo de ajuste, que tiene su Confirmar
 * a la vista.
 */
export function ProductDetailDialog({ product, onOpenChange, ...resto }: ProductDetailDialogProps) {
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0">
        {product && <FichaContenido product={product} {...resto} />}
      </DialogContent>
    </Dialog>
  );
}

const filaClase =
  'w-full flex items-center gap-3 px-4 py-3 text-left border-b hover:bg-gray-50';

function FichaContenido({
  product,
  onEditar,
  onAjustarStock,
  onReceta,
  onEliminar,
  esAdmin,
}: ContenidoProps) {
  const esIlimitado = product.unlimitedStock === true || product.stock === -1;
  const recetaCount = product.ingredients?.length ?? 0;

  return (
    <>
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">{product.name}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 px-4 py-3">
          <div
            className="w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center"
            style={{ background: 'rgba(243, 244, 246, 0.5)', flexShrink: 0 }}
          >
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <Package className="w-6 h-6 text-blue-300" />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <p className="text-sm text-gray-500">
              {product.description || 'Sin descripción'}
            </p>
            <p className="text-xs text-gray-500 mt-1">{product.category || 'General'}</p>
            <p className="text-lg text-gray-900 mt-1">{formatCLP(product.price)}</p>
          </div>
        </div>

        {/* El stock es lo que la gente viene a ver: va en su propio bloque, con
            un único botón. En productos ilimitados no se muestra: no hay nada
            que ajustar y ofrecerlo invita a un error. */}
        {!esIlimitado && (
          <div className="mx-4 mb-2 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
            <div>
              <p className="text-xs text-blue-700">Stock actual</p>
              <p className="text-2xl font-mono text-gray-900">{product.stock}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => onAjustarStock(product)}
              className="border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
            >
              <BoxIcon className="w-4 h-4 mr-1" />
              Ajustar
            </Button>
          </div>
        )}

        <div className="border-t">
          <button type="button" className={filaClase} onClick={() => onEditar(product)}>
            <Edit className="w-4 h-4 text-gray-500" />
            <span className="flex-1 text-sm">Editar producto</span>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>

          <button type="button" className={filaClase} onClick={() => onReceta(product)}>
            <ListChecks className="w-4 h-4 text-gray-500" />
            <span className="flex-1 text-sm">
              Receta <span className="text-gray-500">· {recetaCount} ingrediente{recetaCount !== 1 ? 's' : ''}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>

          {/* Acá va la fila "Movimientos de stock" (Tarea 2b). */}

          <button
            type="button"
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
            onClick={() => onEliminar(product)}
          >
            <Trash2 className="w-4 h-4 text-red-600" />
            <span className="flex-1 text-sm text-red-600">Eliminar</span>
          </button>
        </div>
    </>
  );
}
```

`esAdmin` y `accessToken` todavía no se usan en esta tarea; los consume la 2b. Si el typecheck marca parámetros sin usar, dejarlos igual — el linter de este proyecto no falla por eso y evita cambiar la firma dos veces.

- [ ] **Step 2: Cablearlo en ProductManagement**

Agregar el import junto a los otros de componentes:

```ts
import { ProductDetailDialog } from './ProductDetailDialog';
```

Agregar el estado, junto a `const [stockProduct, setStockProduct] = useState<Product | null>(null);` (~línea 89):

```ts
  // Producto cuya ficha está abierta. Es la puerta de entrada desde la grilla:
  // la tarjeta ya no abre el formulario de edición directamente.
  const [detalleProduct, setDetalleProduct] = useState<Product | null>(null);
```

Cambiar el handler de la tarjeta (línea 793 y el `onKeyDown` de 796-801) para que abran la ficha:

```jsx
                    onClick={() => setDetalleProduct(product)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetalleProduct(product);
                      }
                    }}
```

Montar el diálogo junto a `<StockAdjustDialog ... />` (~línea 1330):

```jsx
      <ProductDetailDialog
        product={detalleProduct}
        accessToken={accessToken}
        onOpenChange={(abierto) => { if (!abierto) setDetalleProduct(null); }}
        esAdmin={esAdmin}
        onEditar={(p) => { setDetalleProduct(null); handleOpenDialog(p); }}
        onAjustarStock={(p) => { setDetalleProduct(null); setStockProduct(p); }}
        onReceta={(p) => { setDetalleProduct(null); setRecetaDe(p); }}
        onEliminar={(p) => { setDetalleProduct(null); setIsDeleting(p); }}
      />
```

Cada acción cierra la ficha antes de abrir lo suyo: dos diálogos de Radix superpuestos se pelean el foco, y este archivo ya tiene comentarios sobre ese problema exacto.

- [ ] **Step 3: Obtener el rol para `esAdmin`**

`ProductManagement` hoy guarda `currentUserId` pero no el rol. En el `useEffect` de montaje (~línea 116) ya se llama `profileAPI.get`. Agregar estado y guardar el rol:

```ts
  const [esAdmin, setEsAdmin] = useState(false);
```

y en el `.then` existente:

```ts
    profileAPI.get(accessToken).then(profile => {
      setCurrentUserId(profile.id);
      setEsAdmin(profile.role === 'admin');
    }).catch(err => console.error("Error loading profile", err));
```

- [ ] **Step 4: Verificar en navegador**

`npm run dev`. En Gestión de Productos:
1. Tocar una tarjeta → se abre la **ficha**, no el formulario. Nada editable.
2. "Editar producto" → abre el formulario con los datos correctos.
3. "Ajustar" → abre el diálogo de stock del producto correcto.
4. "Receta" → abre la capa de receta.
5. "Eliminar" → abre la confirmación.
6. Un producto de stock ilimitado no muestra el bloque de stock ni el botón Ajustar.
7. Cerrar la ficha con Escape y tocando afuera: no pasa nada raro, no hay nada que perder.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductDetailDialog.tsx src/components/ProductManagement.tsx
git commit -m "feat: tocar un producto abre una ficha de solo lectura en vez del formulario"
```

---

### Task 2b: Fila de movimientos de stock en la ficha

**Files:**
- Create: `src/utils/stockEventDisplay.ts`
- Create: `src/utils/stockEventDisplay.test.ts`
- Modify: `src/components/DistributionPanel.tsx:55-88` (pasa a importar lo extraído)
- Modify: `src/components/ProductDetailDialog.tsx`

**Interfaces:**
- Consumes: `stockEventsAPI.getByProduct(token, productId, limit?): Promise<StockEvent[]>` de `../utils/api` (ya existe, en uso en `DistributionPanel.tsx:192`). Forma de `StockEvent`: `{ id, productId, productName, type, quantity, stockAfter?, orderId?, createdAt }`, con `type` en `'despacho' | 'reposicion' | 'merma' | 'ajuste' | 'devolucion'`.
- Produces: `ETIQUETA_MOVIMIENTO`, `SIGNO_MOVIMIENTO`, `COLOR_MOVIMIENTO` exportados desde `src/utils/stockEventDisplay.ts`.

- [ ] **Step 1: Extraer las constantes de presentación**

Hoy viven privadas en `DistributionPanel.tsx:55-88`. Como ahora las usan dos pantallas, se mueven a `src/utils/` — donde además quedan cubiertas por el runner de tests.

Create `src/utils/stockEventDisplay.ts` moviendo el bloque **tal cual está** (incluido su comentario sobre el signo de 'ajuste'), agregando `export` a cada una:

```ts
import type { StockEvent } from './api';

export const ETIQUETA_MOVIMIENTO: Record<StockEvent['type'], string> = {
  despacho: 'Despacho a local',
  reposicion: 'Llegó mercadería',
  merma: 'Merma',
  ajuste: 'Corrección de conteo',
  devolucion: 'Devolución por pedido borrado',
};

/**
 * Cómo se dibuja cada tipo de movimiento.
 *
 * 'ajuste' es el caso raro: `quantity` en la base es siempre positiva y el signo
 * lo da el tipo, pero una corrección de conteo puede haber sido para arriba o
 * para abajo — y ese dato NO existe en la tabla. Antes se mostraba el número sin
 * signo, que se lee como si fuera un alta. La salida honesta es no fingir un
 * signo y decir explícitamente que el número es la magnitud de la corrección,
 * apoyándose en el stock resultante (que sí es un dato real).
 */
export const SIGNO_MOVIMIENTO: Record<StockEvent['type'], '+' | '−' | ''> = {
  despacho: '−',
  merma: '−',
  reposicion: '+',
  devolucion: '+',
  ajuste: '',
};

export const COLOR_MOVIMIENTO: Record<StockEvent['type'], string> = {
  despacho: 'text-red-600',
  merma: 'text-red-600',
  reposicion: 'text-green-600',
  devolucion: 'text-green-600',
  ajuste: 'text-gray-600',
};
```

Borrar las tres constantes de `DistributionPanel.tsx` y agregar el import:

```ts
import { ETIQUETA_MOVIMIENTO, SIGNO_MOVIMIENTO, COLOR_MOVIMIENTO } from '../utils/stockEventDisplay';
```

- [ ] **Step 2: Test de que los tres mapas cubren todos los tipos**

Create `src/utils/stockEventDisplay.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ETIQUETA_MOVIMIENTO, SIGNO_MOVIMIENTO, COLOR_MOVIMIENTO } from './stockEventDisplay.ts';

const TIPOS = ['despacho', 'reposicion', 'merma', 'ajuste', 'devolucion'] as const;

test('los tres mapas cubren todos los tipos de movimiento', () => {
  for (const t of TIPOS) {
    assert.ok(ETIQUETA_MOVIMIENTO[t], `falta etiqueta para ${t}`);
    assert.ok(COLOR_MOVIMIENTO[t], `falta color para ${t}`);
    assert.ok(t in SIGNO_MOVIMIENTO, `falta signo para ${t}`);
  }
});

test('ajuste no finge un signo', () => {
  assert.equal(SIGNO_MOVIMIENTO.ajuste, '');
});

test('lo que suma y lo que resta tiene el signo correcto', () => {
  assert.equal(SIGNO_MOVIMIENTO.reposicion, '+');
  assert.equal(SIGNO_MOVIMIENTO.devolucion, '+');
  assert.equal(SIGNO_MOVIMIENTO.despacho, '−');
  assert.equal(SIGNO_MOVIMIENTO.merma, '−');
});
```

Run: `npm test` → debe pasar (63 tests).

- [ ] **Step 3: Agregar la fila a la ficha**

En `ProductDetailDialog.tsx`, agregar imports:

```ts
import { useState } from 'react';
import { History } from 'lucide-react';
import { stockEventsAPI, type StockEvent } from '../utils/api';
import { formatDateCL } from '../utils/dateUtils';
import { ETIQUETA_MOVIMIENTO, SIGNO_MOVIMIENTO, COLOR_MOVIMIENTO } from '../utils/stockEventDisplay';
import { toast } from 'sonner';
```

Dentro de `FichaContenido` (los hooks son seguros acá: el subcomponente sólo se monta con producto):

```tsx
  const [movimientos, setMovimientos] = useState<StockEvent[] | null>(null);
  const [cargandoMov, setCargandoMov] = useState(false);

  const verMovimientos = async () => {
    // Segundo toque: colapsa. Evita que la ficha crezca sin forma de volver.
    if (movimientos) { setMovimientos(null); return; }
    try {
      setCargandoMov(true);
      setMovimientos(await stockEventsAPI.getByProduct(accessToken, product.id));
    } catch {
      // No se deja `movimientos` en [] ante un error: "todavía no hay
      // movimientos" es el peor mensaje posible acá, porque disfraza una
      // consulta rota de producto sin historial y nadie lo investiga.
      toast.error('No se pudieron cargar los movimientos. Es un error de consulta, no quiere decir que el producto no tenga historial.');
    } finally {
      setCargandoMov(false);
    }
  };
```

Y reemplazar el comentario `{/* Acá va la fila "Movimientos de stock" (Tarea 2b). */}` por:

```tsx
          {esAdmin && (
            <>
              <button type="button" className={filaClase} onClick={verMovimientos}>
                <History className="w-4 h-4 text-gray-500" />
                <span className="flex-1 text-sm">Movimientos de stock</span>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>

              {cargandoMov && (
                <p className="px-4 py-3 text-sm text-gray-500">Cargando…</p>
              )}

              {movimientos && movimientos.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500">
                  Todavía no hay movimientos registrados para este producto.
                </p>
              )}

              {movimientos && movimientos.map(m => (
                <div key={m.id} className="flex items-center justify-between border-b px-4 py-2">
                  <div>
                    <div className="text-sm text-gray-900">{ETIQUETA_MOVIMIENTO[m.type]}</div>
                    <div className="text-xs text-gray-500">{formatDateCL(m.createdAt)}</div>
                  </div>
                  {m.type === 'ajuste' ? (
                    <div className="text-right">
                      <div className="font-mono text-gray-900">
                        {m.stockAfter !== undefined ? `quedó en ${m.stockAfter}` : `corrección de ${m.quantity}`}
                      </div>
                      {m.stockAfter !== undefined && (
                        <div className="text-xs text-gray-500">corrección de {m.quantity}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className={`font-mono ${COLOR_MOVIMIENTO[m.type]}`}>
                        {SIGNO_MOVIMIENTO[m.type]}{m.quantity}
                      </div>
                      {m.stockAfter !== undefined && (
                        <div className="text-xs text-gray-500">queda {m.stockAfter}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
```

Es deliberadamente el mismo formato que `DistributionPanel`: la misma lista mostrada de dos maneras distintas confunde más de lo que ayuda.

- [ ] **Step 4: Pasar `accessToken` desde ProductManagement**

Agregar `accessToken={accessToken}` al montaje del `<ProductDetailDialog />`.

- [ ] **Step 4: Verificar en navegador**

1. Con usuario **admin**: la fila aparece y lista movimientos con tipo y fecha.
2. Con usuario **no admin** (ej. `local`): la fila **no aparece**.
3. Un producto sin movimientos muestra "Sin movimientos registrados." y no una lista vacía silenciosa.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProductDetailDialog.tsx src/components/ProductManagement.tsx
git commit -m "feat: ver los movimientos de stock desde la ficha del producto (solo admin)"
```

---

### Task 3: El stock deja de ser editable en el formulario de edición

Éste es el arreglo del problema principal.

**Files:**
- Modify: `src/components/ProductManagement.tsx:999-1015` (el campo), `1216-1245` (el pie del diálogo)

- [ ] **Step 1: Reemplazar el input por dato + botón**

En el bloque del campo Stock (líneas 999-1015), envolver: si `editingProduct` existe, mostrar el stock como dato; si no (producto nuevo), dejar el input tal cual.

```jsx
              <div>
                <Label htmlFor="stock">Stock {!editingProduct && '*'}</Label>
                {editingProduct ? (
                  // Al editar, el stock NO es un campo de este formulario. Era la
                  // causa del bug reportado: quien lo tipeaba y cerraba el diálogo
                  // sin llegar a "Guardar Cambios" (que queda debajo del scroll en
                  // teléfono) perdía el número sin ningún aviso. Ahora se muestra y
                  // se cambia por el diálogo de ajuste, que confirma en el acto.
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
                    <span className="text-lg font-mono text-gray-900">
                      {formData.unlimitedStock ? '∞' : formData.stock}
                    </span>
                    {!formData.unlimitedStock && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStockProduct(editingProduct)}
                        disabled={submitting}
                        className="border-[#0059FF] text-[#0059FF] hover:bg-blue-50"
                      >
                        <BoxIcon className="w-4 h-4 mr-1" />
                        Ajustar
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <BoxIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="stock"
                      type="number"
                      min="0"
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      placeholder="0"
                      className="pl-9"
                      required
                      disabled={formData.unlimitedStock}
                    />
                  </div>
                )}
              </div>
```

- [ ] **Step 2: Sacar el botón "Ajustar Stock" del pie**

Ya no hace falta: está arriba junto al stock, y en la ficha. Borrar el bloque de líneas 1221-1233 (el `{!(editingProduct.unlimitedStock || editingProduct.stock === -1) && (<Button ...>Ajustar Stock</Button>)}`). **Dejar el botón Eliminar como está.**

- [ ] **Step 3: Verificar en navegador**

1. Editar un producto → el stock se ve pero **no se puede tipear**. No hay input.
2. "Ajustar" abre el diálogo de stock; al confirmar, el número de arriba se actualiza.
3. Un producto ilimitado muestra ∞ y ningún botón Ajustar.
4. **Crear** un producto nuevo → el campo de stock **sí** es editable y el valor se guarda.
5. Editar un producto, cambiar sólo el nombre, guardar → el stock no cambia.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "fix: el stock deja de ser un campo editable del formulario de edición"
```

---

### Task 4: Simplificar `construirPayloadProducto`

Con el stock fuera del formulario de edición, `stockSeToco` ya no puede ser `true` por edición. La regla pasa a ser simple y explícita: **el payload lleva `stock` sólo al crear**.

**Files:**
- Modify: `src/utils/productPayload.ts:32-68`
- Modify: `src/utils/productPayload.test.ts`

**Interfaces:**
- Produces: `construirPayloadProducto` mantiene su firma; cambia sólo la regla de cuándo incluye `stock`.

- [ ] **Step 1: Ver los tests actuales y ajustarlos**

Run: `grep -n "test(" src/utils/productPayload.test.ts`

El test "pasar de stock ilimitado a limitado incluye stock" describe el comportamiento viejo. Reemplazarlo por estos dos:

```ts
test('al EDITAR, el payload nunca incluye stock', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, stock: '999', unlimitedStock: true },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal('stock' in payload, false);
});

test('al CREAR, el payload incluye stock', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, stock: '40' },
    editingProduct: null,
    priceValue: 2500,
  });
  assert.equal((payload as { stock: number }).stock, 40);
});

test('al CREAR un producto ilimitado, el stock viaja en 0', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, stock: '40', unlimitedStock: true },
    editingProduct: null,
    priceValue: 2500,
  });
  assert.equal((payload as { stock: number }).stock, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL en "al EDITAR, el payload nunca incluye stock" (hoy sí lo incluye cuando cambia `unlimitedStock`).

- [ ] **Step 3: Simplificar la implementación**

En `src/utils/productPayload.ts`, borrar `eraIlimitadoAntes` y `stockSeToco`, y reemplazar el spread condicional:

```ts
export function construirPayloadProducto({ formData, editingProduct, priceValue }: Params) {
  // El stock viaja SÓLO al crear, donde es el stock inicial y no hay nada que
  // pisar. Al editar nunca: el formulario de edición ya no tiene campo de stock
  // (se cambia por StockAdjustDialog, que confirma en el acto). Mandarlo desde
  // acá pisaría en silencio lo que haya cambiado por otro lado —un ajuste, un
  // pedido, otra sesión— mientras el diálogo estuvo abierto.
  return {
    name: formData.name.trim(),
    description: formData.description.trim(),
    price: priceValue,
    minStock: formData.minStock.trim() === '' ? null : (parseInt(formData.minStock) || 0),
    unlimitedStock: formData.unlimitedStock,
    trackStock: !formData.unlimitedStock,
    allowDecimal: formData.allowDecimal,
    category: formData.category.trim() || 'General',
    categoryId: formData.categoryId || undefined,
    sku: formData.sku.trim(),
    imageUrl: formData.imageUrl.trim() || undefined,
    productionAreaId: formData.productionAreaId || undefined,
    ...(editingProduct
      ? {}
      : { stock: formData.unlimitedStock ? 0 : (parseFloat(formData.stock) || 0) })
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS. Si algún otro test de ese archivo asume la regla vieja, ajustarlo — la regla nueva es la correcta.

- [ ] **Step 5: Limpiar el comentario obsoleto en ProductManagement**

En `handleSubmit` (~línea 246) el comentario dice "Por qué el stock viaja condicional: ver el comentario de `stockSeToco`", que ya no existe. Reemplazarlo por:

```ts
      // El stock no viaja en el payload de edición: se cambia sólo desde
      // StockAdjustDialog. Ver construirPayloadProducto.
```

Y el comentario largo del `else` (~líneas 278-283) sobre `stockSeToco` también hay que actualizarlo: ahora `stock` está presente porque `editingProduct` es `null`, que es la condición literal.

- [ ] **Step 6: Commit**

```bash
git add src/utils/productPayload.ts src/utils/productPayload.test.ts src/components/ProductManagement.tsx
git commit -m "refactor: el payload de producto lleva stock solo al crear"
```

---

### Task 5: El stock también sale del editor rápido de `NewOrderForm`

Si queda editable acá, siguen existiendo dos vías y el trabajo no cumple su objetivo.

**Files:**
- Modify: `src/components/NewOrderForm.tsx` (~línea 490-535 el guardado, y el JSX del campo de stock del diálogo de edición)

- [ ] **Step 1: Ubicar el campo en el JSX**

Run: `grep -n "editForm.stock\|editForm\.trackStock" src/components/NewOrderForm.tsx`

- [ ] **Step 2: Poner el stock en solo lectura**

Reemplazar el input de stock del diálogo de edición por el valor como dato, con el mismo criterio que la Tarea 3:

```jsx
                <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
                  <span className="text-lg font-mono text-gray-900">
                    {editForm.trackStock ? editForm.stock : '∞'}
                  </span>
                  <span className="text-xs text-gray-500">
                    Se cambia desde Gestión de Productos
                  </span>
                </div>
```

No se ofrece "Ajustar" acá: `StockAdjustDialog` no está montado en esta pantalla y montarlo es alcance del Bloque 2. Lo importante ahora es que **no se pueda tipear un stock que se va a perder**.

- [ ] **Step 3: Sacar el stock del request**

En `handleSaveEdit` (~línea 490-535): borrar el bloque de `let stock = 0; if (!isUnlimited) {...}`, borrar `eraIlimitadoAntes` y `stockSeToco`, y sacar `...(stockSeToco ? { stock: ... } : {})` del objeto que se manda. Este formulario **sólo edita** productos existentes, así que nunca manda stock.

Verificar que no queden variables sin usar (el typecheck las marca).

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

En navegador: Nuevo Pedido → editar un producto → el stock se ve pero no se puede tipear; cambiar el precio y guardar no altera el stock.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewOrderForm.tsx
git commit -m "fix: el editor rapido de producto ya no permite tipear stock"
```

---

## Verificación final del bloque

- [ ] **Suite completa**

Run: `npm test`
Expected: PASS, 65 tests. 57 del baseline + 3 de la Tarea 1 (`stockForm`) + 3 de la Tarea 2b (`stockEventDisplay`) + los de la Tarea 4 (uno reemplazado por tres, neto +2).

- [ ] **Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Build**

Run: `npm run build`

- [ ] **Regresión del bug reportado, en navegador**

El escenario que se perdía el viernes: entrar a Gestión de Productos, tocar cinco productos seguidos e intentar cargarles stock cerrando cada uno con la X. **No debe haber ninguna forma de tipear un stock y perderlo.** La única vía es el diálogo de ajuste, que confirma en el acto y muestra el toast.

- [ ] **Que no se haya roto lo de siempre**

1. Crear un producto nuevo con stock inicial → se guarda con ese stock.
2. Editar nombre, precio, categoría, imagen y SKU de un producto → se guardan y el stock no se mueve.
3. Un producto con receta configurada la conserva después de editarlo y después de un ajuste de stock.
4. Tomar un pedido que descuente stock → sigue descontando bien.

---

## Notas para quien implemente

- **El backend no se toca en este bloque.** Si algo parece necesitar un cambio de servidor, es del Bloque 2 — anotarlo y seguir.
- **`StockAdjustDialog` sigue funcionando como hoy** (manda el total absoluto). Su rediseño es del Bloque 2. Este bloque sólo cambia desde dónde se lo llama.
- **El problema de concurrencia sigue vivo** hasta el Bloque 2. No es una regresión de este trabajo.
- **Cuidado con dos diálogos de Radix superpuestos.** `ProductManagement.tsx` tiene varios comentarios sobre robos de foco entre capas; por eso cada acción de la ficha la cierra antes de abrir lo siguiente.
- **Verificar toda clase de Tailwind nueva** contra `src/index.css` antes de usarla. No avisa cuando falta: simplemente no aplica.
