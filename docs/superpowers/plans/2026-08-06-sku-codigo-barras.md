# SKU / Código de Barras en Productos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir guardar el código de barras (SKU) de cada producto y buscar productos por ese código, tanto con pistola lectora como con la cámara del celular, dentro de Gestión de Productos.

**Architecture:** Se agrega una columna `sku` a la tabla `products` con índice único parcial por negocio. El backend (Supabase Edge Function con Hono) la acepta, valida duplicados y la devuelve. En el frontend se crea un componente de escaneo reutilizable (`BarcodeScannerDialog`) basado en ZXing, que se usa desde dos puntos de `ProductManagement.tsx`: el campo SKU del formulario y la barra de búsqueda. La pistola lectora no necesita código: se comporta como un teclado.

**Tech Stack:** React 18 + TypeScript + Vite · Tailwind + Radix UI (`components/ui/*`) · motion/react · sonner (toasts) · Supabase (Postgres + Edge Functions con Hono) · `@zxing/browser` + `@zxing/library` (nuevas)

**Spec:** [`docs/superpowers/specs/2026-08-06-sku-codigo-barras-design.md`](../specs/2026-08-06-sku-codigo-barras-design.md)

## Global Constraints

- **Este proyecto NO tiene framework de tests.** `package.json` solo define `dev` y `build`. No inventes ni instales Jest/Vitest — no está en alcance. La verificación de cada tarea es: typecheck + prueba en navegador con evidencia concreta.
- **Comando de typecheck:** `npx tsc --noEmit 2>&1 | grep -v "_redirects"` → salida esperada: **vacía**. El repo tiene 4 errores preexistentes en `src/_redirects/` y `src/public/_redirects/` (artefactos de Figma, no son código real); el `grep -v` los filtra. Si aparece cualquier otra línea, es un error tuyo.
- **Servidor de desarrollo:** usar las herramientas de preview del harness (`preview_start` con el nombre `vite`, definido en `.claude/launch.json`, puerto 3000). Nunca levantar el server con Bash.
- **Versiones exactas de las dependencias nuevas:** `@zxing/browser@0.2.1` y `@zxing/library@0.23.0`. `@zxing/browser` declara `@zxing/library@^0.23.0` como peer dependency; instalá ambas juntas.
- **Idioma de la interfaz: español rioplatense**, consistente con el resto de la app. Todos los textos visibles, mensajes de error y toasts en español.
- **El SKU se normaliza siempre igual:** `.trim()` en el cliente y en el backend; vacío se guarda como `NULL` en la base (nunca como `''`), porque el índice único parcial depende de eso.
- **La migración SQL hay que correrla a mano en Supabase** (Dashboard → SQL Editor). El archivo en `supabase/migrations/` versiona el cambio pero no lo aplica. Si el resto del código se despliega sin la columna, toda alta/edición de producto falla.

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `supabase/migrations/20260806_add_product_sku.sql` | Columna `sku` + índice único parcial por negocio | Crear |
| `src/utils/api.tsx` | Interface `Product` — agregar `sku?: string` | Modificar (~línea 52) |
| `supabase/functions/make-server-6d979413/index.ts` | `toProduct` + rutas `POST`/`PUT` de productos: aceptar, validar y devolver `sku` | Modificar (~líneas 95, 672, 752) |
| `src/components/BarcodeScannerDialog.tsx` | **Única responsabilidad:** abrir la cámara, leer un código, devolverlo. No sabe nada de productos. | Crear |
| `src/components/ProductManagement.tsx` | Campo SKU en el formulario, búsqueda por SKU, botones de escaneo, SKU en la tarjeta | Modificar (~líneas 31, 45, 59, 174, 225, 318, 536, 668, 774) |

El escáner vive en su propio archivo, sin acoplamiento a Gestión de Productos, para que agregarlo después a Nuevo Pedido sea solo importarlo.

---

### Task 1: Modelo de datos (migración + tipo `Product`)

**Files:**
- Create: `supabase/migrations/20260806_add_product_sku.sql`
- Modify: `src/utils/api.tsx:52`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: columna `products.sku` (`text`, nullable) en la base; campo `sku?: string` en la interface `Product` exportada desde `src/utils/api.tsx`. Las tareas 2, 4 y 5 dependen de ambos.

- [ ] **Step 1: Crear el archivo de migración**

Crear `supabase/migrations/20260806_add_product_sku.sql`:

```sql
-- supabase/migrations/20260806_add_product_sku.sql
-- Agrega el SKU / código de barras del producto.
-- Es opcional, pero si está cargado no puede repetirse dentro del mismo negocio.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text;

-- Índice único PARCIAL: la unicidad aplica por negocio y solo sobre SKUs cargados.
-- Sin el WHERE, todos los productos sin SKU colisionarían entre sí.
-- Es por negocio (no global) porque dos negocios distintos pueden vender el mismo
-- EAN: el código identifica al producto del fabricante, no al del negocio.
CREATE UNIQUE INDEX IF NOT EXISTS products_business_sku_unique
  ON products (business_id, sku)
  WHERE sku IS NOT NULL AND sku <> '';
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Abrir el Dashboard de Supabase del proyecto → **SQL Editor** → pegar el contenido del archivo → **Run**.

Verificar que la columna existe, ejecutando en el mismo SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'sku';
```

Salida esperada: una fila → `sku | text | YES`.

Verificar que el índice existe:

```sql
SELECT indexname FROM pg_indexes
WHERE tablename = 'products' AND indexname = 'products_business_sku_unique';
```

Salida esperada: una fila con `products_business_sku_unique`.

**Si alguna de las dos consultas no devuelve filas, no sigas** — el resto del plan depende de esto.

- [ ] **Step 3: Agregar `sku` a la interface `Product`**

En `src/utils/api.tsx`, dentro de `export interface Product` (~línea 52), agregar el campo justo después de `categoryId`:

```ts
  category?: string;
  categoryId?: string;
  sku?: string; // SKU / código de barras (EAN-13, UPC, Code128...). Opcional, único por negocio.
  productionAreaId?: string; // New: ID of production area assigned to this product
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260806_add_product_sku.sql src/utils/api.tsx
git commit -m "feat: agregar columna sku a productos con indice unico por negocio"
```

---

### Task 2: Backend — aceptar, validar y devolver el SKU

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts` (función `toProduct` ~línea 75-100; ruta `POST /products` ~línea 663-731; ruta `PUT /products/:id` ~línea 733-823)

**Interfaces:**
- Consumes: columna `products.sku` (Task 1).
- Produces: los endpoints `GET/POST/PUT /make-server-6d979413/products` leen y escriben `sku`. `toProduct` devuelve siempre `sku: string` (`''` si no hay). Un SKU duplicado devuelve HTTP **400** con `{ error: 'Ya existe un producto con el SKU "<sku>"' }`. Las tareas 4 y 5 dependen de que el campo viaje en ambas direcciones.

- [ ] **Step 1: Devolver el SKU en `toProduct`**

En `supabase/functions/make-server-6d979413/index.ts`, dentro de `function toProduct(r: any)` (~línea 91), agregar el campo junto a `categoryId`:

```ts
    category: r.categories?.name || r.category_name || 'General',
    categoryId: r.category_id,
    sku: r.sku || '', // se normaliza a '' para que los formularios no lidien con null
    productionAreaId: r.production_area_id,
```

Las consultas de productos usan `select('*, ...')`, así que la columna nueva ya viene incluida sin tocar los `select`.

- [ ] **Step 2: Agregar el helper de validación de SKU duplicado**

En el mismo archivo, justo **antes** de la línea `// ─── PRODUCT ROUTES ───` (~línea 622), agregar:

```ts
/**
 * Verifica si un SKU ya está usado por otro producto del mismo negocio.
 * `excludeProductId` permite editar un producto sin que choque contra sí mismo.
 * Devuelve el mensaje de error si hay duplicado, o null si está libre.
 */
async function checkDuplicateSku(
  businessId: string,
  sku: string,
  excludeProductId?: string
): Promise<string | null> {
  if (!sku) return null; // SKU vacío es válido: el campo es opcional

  let query = supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('sku', sku);

  if (excludeProductId) query = query.neq('id', excludeProductId);

  const { count } = await query;
  return count && count > 0 ? `Ya existe un producto con el SKU "${sku}"` : null;
}
```

- [ ] **Step 3: Aceptar el SKU al crear producto (`POST /products`)**

En la ruta `app.post("/make-server-6d979413/products", ...)`:

**3a.** Agregar `sku` al destructuring del body (~línea 672):

```ts
    const { name, description, price, image, imageUrl, stock, categoryId, productionAreaId, ingredients, unlimitedStock, allowDecimal, laborCost, sku } = body;
```

**3b.** Después de la validación de `name`/`price` (~línea 676, justo después del `if (!name || price === undefined ...)`), agregar:

```ts
    const skuNorm = (sku || '').trim();
    const skuError = await checkDuplicateSku(profile.businessId, skuNorm);
    if (skuError) return c.json({ error: skuError }, 400);
```

**3c.** Agregar el campo al `.insert({...})` (~línea 691), junto a `category_id`:

```ts
        category_id: categoryId || null,
        sku: skuNorm || null, // null (no '') para que el índice único parcial ignore los vacíos
        production_area_id: productionAreaId || null,
```

**3d.** En el `if (insertErr)` (~línea 698), reemplazar el bloque por uno que distinga la violación de unicidad. El pre-chequeo de 3b es una consulta separada del insert, así que dos requests simultáneos podrían pasar ambos; el índice de la base es la garantía real, y este bloque convierte ese 500 en un 400 con mensaje claro:

```ts
    if (insertErr) {
      console.error('Error creating product:', insertErr);
      if (insertErr.code === '23505') {
        return c.json({ error: `Ya existe un producto con el SKU "${skuNorm}"` }, 400);
      }
      return c.json({ error: 'Error al crear producto' }, 500);
    }
```

- [ ] **Step 4: Aceptar el SKU al editar producto (`PUT /products/:id`)**

En la ruta `app.put("/make-server-6d979413/products/:id", ...)`:

**4a.** Agregar `sku` al destructuring de `updates` (~línea 752):

```ts
    const { ingredients, imageUrl, image, name, description, price, stock, categoryId, productionAreaId, unlimitedStock, trackStock, allowDecimal, laborCost, sku } = updates;
```

**4b.** Después del destructuring y antes de armar `updateData`, agregar la validación (excluyendo el producto actual):

```ts
    let skuNorm: string | undefined;
    if (sku !== undefined) {
      skuNorm = (sku || '').trim();
      const skuError = await checkDuplicateSku(profile.businessId, skuNorm, productId);
      if (skuError) return c.json({ error: skuError }, 400);
    }
```

**4c.** Agregar el campo a `updateData`, junto a la línea de `laborCost` (~línea 779):

```ts
    if (laborCost !== undefined) updateData.labor_cost = Number(laborCost) || 0;
    if (skuNorm !== undefined) updateData.sku = skuNorm || null;
```

**4d.** En el `if (updateErr)` (~línea 788), mismo tratamiento del código `23505`:

```ts
    if (updateErr) {
      console.error('Error updating product:', updateErr);
      // La condición `skuNorm !== undefined` importa: si el request no traía sku,
      // un 23505 vino de otro índice y el mensaje diría 'SKU "undefined"'.
      if (updateErr.code === '23505' && skuNorm !== undefined) {
        return c.json({ error: `Ya existe un producto con el SKU "${skuNorm}"` }, 400);
      }
      return c.json({ error: 'Error al actualizar producto' }, 500);
    }
```

- [ ] **Step 5: Desplegar la Edge Function**

La función corre en Supabase, no en Netlify: los cambios no llegan con `git push`. Desplegar con:

```bash
npx supabase functions deploy make-server-6d979413
```

Si el CLI pide login o el project ref, seguí sus instrucciones. **Si este paso no se hace, el frontend va a mandar el `sku` y el backend lo va a ignorar en silencio** — es la causa más probable de "guardo el SKU y no se guarda".

- [ ] **Step 6: Verificar que el índice único protege de verdad**

La verificación end-to-end por la interfaz llega en la Task 4, cuando exista el campo en el formulario. Lo que hay que confirmar **acá** es que la garantía de la base funciona, porque el manejo del código `23505` que acabás de escribir depende de eso.

Desde el SQL Editor de Supabase:

```sql
-- Cargar un SKU a mano y confirmar que el índice único lo protege.
UPDATE products SET sku = 'TEST-SKU-001' WHERE id = (SELECT id FROM products LIMIT 1);
-- Intentar duplicarlo en otro producto del MISMO negocio debe fallar:
UPDATE products SET sku = 'TEST-SKU-001'
WHERE id = (SELECT id FROM products WHERE sku IS NULL AND business_id = (
  SELECT business_id FROM products WHERE sku = 'TEST-SKU-001' LIMIT 1) LIMIT 1);
```

Salida esperada del segundo `UPDATE`: error `duplicate key value violates unique constraint "products_business_sku_unique"`.

Limpiar después:

```sql
UPDATE products SET sku = NULL WHERE sku = 'TEST-SKU-001';
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "feat: backend acepta y valida sku de producto"
```

---

### Task 3: Componente `BarcodeScannerDialog`

**Files:**
- Create: `src/components/BarcodeScannerDialog.tsx`
- Modify: `package.json` (dependencias nuevas)

**Interfaces:**
- Consumes: nada de las tareas anteriores (es independiente).
- Produces: componente exportado `BarcodeScannerDialog` con esta firma exacta, consumido por las tareas 4 y 5:

```ts
interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void; // se llama UNA vez, con el código ya trimmeado
  title?: string;                 // default: 'Escanear código de barras'
}
```

- [ ] **Step 1: Instalar las dependencias**

```bash
npm install @zxing/browser@0.2.1 @zxing/library@0.23.0
```

Verificar que quedaron instaladas:

Run: `npm ls @zxing/browser @zxing/library`
Expected: ambas listadas sin errores de peer dependency (`@zxing/browser@0.2.1` requiere `@zxing/library@^0.23.0`, que es la que instalamos).

- [ ] **Step 2: Crear el componente**

Crear `src/components/BarcodeScannerDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScanBarcode, CameraOff } from 'lucide-react';

interface BarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (code: string) => void;
  title?: string;
}

// Solo formatos de código de barras de retail. Restringir la lista acelera la
// decodificación y reduce falsos positivos. QR queda afuera a propósito.
const BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
];

function cameraErrorMessage(err: unknown): string {
  // getUserMedia solo funciona en contexto seguro. Esto pasa al abrir la app
  // por IP de red local (http://192.168.x.x) para probar desde el celular.
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'El escaneo requiere una conexión segura (HTTPS).';
  }
  const name = (err as { name?: string } | undefined)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Necesitamos permiso para usar la cámara. Habilitalo en los ajustes del navegador.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return 'No se encontró ninguna cámara disponible en este dispositivo.';
  }
  return 'No se pudo iniciar la cámara.';
}

/**
 * Vista con la cámara en vivo. Va en un componente aparte para que el <video>
 * esté garantizadamente montado cuando corre el efecto: se monta y desmonta
 * junto con el diálogo, así el cleanup siempre apaga la cámara.
 */
function ScannerView({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef(false); // evita disparar onScan más de una vez
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    let cancelled = false;

    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS);
    const reader = new BrowserMultiFormatReader(hints);

    reader
      .decodeFromConstraints(
        { video: { facingMode: 'environment' } }, // cámara trasera
        videoEl,
        (result, _err, controls) => {
          if (!result || scannedRef.current) return;
          scannedRef.current = true;
          controls.stop();
          controlsRef.current = null;
          onScan(result.getText().trim());
        }
      )
      .then((controls) => {
        // Si el diálogo se cerró mientras la cámara arrancaba, apagarla ya mismo.
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[BarcodeScanner] Error iniciando la cámara:', err);
        setError(cameraErrorMessage(err));
      });

    return () => {
      cancelled = true;
      // Sin esto la cámara queda encendida consumiendo batería.
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onScan]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
          <CameraOff className="w-7 h-7 text-red-500" />
        </div>
        <p className="text-sm text-gray-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '4 / 3' }}>
      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      {/* Marco guía para apuntar el código */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-4/5 h-1/3 border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
    </div>
  );
}

export function BarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = 'Escanear código de barras',
}: BarcodeScannerDialogProps) {
  const handleScan = (code: string) => {
    onScan(code);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-blue-600" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Apuntá la cámara al código de barras del producto.
          </DialogDescription>
        </DialogHeader>

        <ScannerView onScan={handleScan} />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Notas sobre la API usada (verificada contra los tipos de `@zxing/browser@0.2.1`):
- `decodeFromConstraints(constraints, videoEl, callback)` devuelve `Promise<IScannerControls>`.
- Para detener se usa **`controls.stop()`** (no `reader.reset()`, que era la API vieja de `@zxing/library`).
- `result.getText()` devuelve el contenido del código como string.

> ⚠️ **CORRECCIÓN POST-REVISIÓN — el código de arriba tiene un defecto. No lo copies tal cual.**
>
> El `useEffect` mostrado depende de `[onScan]`. Como el padre pasa `onScan` como
> arrow function inline, cada re-render del padre le cambia la identidad y
> re-ejecuta el efecto, apagando y prendiendo la cámara. No es teórico:
> [`src/App.tsx:306`](../../../src/App.tsx) hace polling cada 5 segundos y
> `ProductManagement` no está memoizado, así que la cámara parpadearía cada 5
> segundos justo mientras el usuario intenta escanear.
>
> **La versión implementada y revisada corrige esto** guardando `onScan` en un ref
> sincronizado en cada render e invocando `onScanRef.current(...)` desde el callback,
> con el efecto de arranque en `[]`. La fuente de verdad es el archivo real:
> [`src/components/BarcodeScannerDialog.tsx`](../../../src/components/BarcodeScannerDialog.tsx)
> (corregido en el commit `f9e4bc59`, desviación del plan aprobada por el dueño).

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/BarcodeScannerDialog.tsx
git commit -m "feat: componente reutilizable de escaneo de codigo de barras"
```

---

### Task 4: Campo SKU en el formulario de producto

**Files:**
- Modify: `src/components/ProductManagement.tsx` (imports ~línea 15-33; `ProductFormData` ~línea 45; `emptyForm` ~línea 59; `handleOpenDialog` ~línea 174; `handleSubmit` ~línea 225; formulario ~línea 782)

**Interfaces:**
- Consumes: `Product.sku` (Task 1), backend que persiste `sku` (Task 2), `BarcodeScannerDialog` (Task 3).
- Produces: `ProductFormData.sku: string`. La Task 5 usa el mismo componente en otro punto de este archivo.

- [ ] **Step 1: Agregar los imports**

En `src/components/ProductManagement.tsx`, agregar `Barcode` y `Camera` a la lista de íconos de `lucide-react` (~línea 30, junto a `Filter`):

```ts
  AlertTriangle,
  Filter,
  Barcode,
  Camera
} from 'lucide-react';
```

Cambiar el import de React de la primera línea para sumar `lazy` y `Suspense`:

```ts
import { useState, useEffect, lazy, Suspense } from 'react';
```

Y debajo del import de `ImageUpload` (~línea 35), agregar el import **diferido** del escáner:

```ts
import { ImageUpload } from './ImageUpload';

// Carga diferida: ZXing es una dependencia pesada y solo hace falta cuando
// alguien abre el escáner. Con un import estático entraría en el bundle
// inicial de toda la app, incluso para quien nunca escanea nada.
// El `.then(...)` es necesario porque BarcodeScannerDialog es un named export
// y React.lazy espera un módulo con `default`.
const BarcodeScannerDialog = lazy(() =>
  import('./BarcodeScannerDialog').then((m) => ({ default: m.BarcodeScannerDialog }))
);
```

- [ ] **Step 2: Agregar `sku` al estado del formulario**

En `interface ProductFormData` (~línea 50), junto a `categoryId`:

```ts
  category: string;
  categoryId: string;
  sku: string;
  imageUrl: string;
```

En `const emptyForm` (~línea 65), en la misma posición:

```ts
  category: 'General',
  categoryId: '',
  sku: '',
  imageUrl: '',
```

- [ ] **Step 3: Cargar y enviar el SKU**

En `handleOpenDialog`, dentro del `setFormData({...})` de la rama de edición (~línea 180), junto a `categoryId`:

```ts
        categoryId: product.categoryId || '',
        sku: product.sku || '',
        imageUrl: product.imageUrl || '',
```

En `handleSubmit`, dentro de `const productData = {...}` (~línea 234), junto a `categoryId`:

```ts
        categoryId: formData.categoryId || undefined,
        sku: formData.sku.trim(),
        imageUrl: formData.imageUrl.trim() || undefined,
```

Se manda siempre (aunque sea `''`) para que vaciar el SKU de un producto lo borre en la base — el backend traduce `''` a `NULL`.

- [ ] **Step 4: Agregar el estado del escáner del formulario**

Junto a los demás `useState` del componente (~línea 86, después de `currentUserId`):

```ts
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formScannerOpen, setFormScannerOpen] = useState(false);
```

- [ ] **Step 5: Agregar el campo SKU al formulario**

En el `<form onSubmit={handleSubmit}>`, **después** del bloque del campo "Nombre del Producto" y **antes** del de "Descripción" (~línea 783, entre los dos `<div className="col-span-2">`), insertar:

```tsx
              <div className="col-span-2">
                <Label htmlFor="sku" className="flex items-center gap-2">
                  <Barcode className="w-4 h-4 text-gray-500" />
                  SKU / Código de barras
                </Label>
                <div className="relative">
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    onKeyDown={(e) => {
                      // La pistola lectora manda Enter al final del código. Sin esto,
                      // escanear dentro del form dispararía un submit prematuro.
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    placeholder="Ej: 7801234567890"
                    inputMode="numeric"
                    className="pr-11"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setFormScannerOpen(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors"
                    aria-label="Escanear código de barras con la cámara"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Opcional. Podés escanearlo con la pistola lectora o con la cámara.
                </p>
              </div>
```

- [ ] **Step 6: Montar el diálogo del escáner**

Al final del componente, justo **antes** del `<AlertDialog>` de confirmación de borrado (~línea 1037), agregar:

```tsx
      {/* Escáner del formulario: completa el campo SKU.
          Se renderiza solo cuando está abierto para que la carga diferida
          sirva de algo: el chunk de ZXing se baja recién al primer uso. */}
      {formScannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScannerDialog
            open
            onOpenChange={setFormScannerOpen}
            onScan={(code) => setFormData((prev) => ({ ...prev, sku: code }))}
            title="Escanear código del producto"
          />
        </Suspense>
      )}
```

Dos detalles deliberados:
- **Renderizado condicional:** si el diálogo estuviera siempre montado (solo con `open={false}`), el `lazy` se resolvería igual al cargar la pantalla y no ahorraríamos nada.
- **`setFormData` en forma funcional:** el callback del escáner se dispara fuera del ciclo de render, así que leer `formData` directo podría usar un valor viejo.

- [ ] **Step 7: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 8: Verificar en el navegador**

Levantar el preview (`preview_start` con `vite`), iniciar sesión e ir a **Gestión de Productos**. Verificar, en orden:

1. **Crear con SKU:** "Nuevo Producto" → completar nombre, precio, stock y SKU `7801234567890` → Guardar. Toast de éxito.
2. **Persiste:** recargar la página, abrir ese producto con "Editar" → el campo SKU muestra `7801234567890`.
3. **Duplicado rechazado:** crear otro producto con el **mismo** SKU → toast de error `Ya existe un producto con el SKU "7801234567890"`, y el producto **no** se crea.
4. **Editar sin tocar el SKU:** abrir el primer producto, cambiarle solo el nombre → guarda bien (no debe chocar contra sí mismo).
5. **SKU opcional:** crear un producto **sin** SKU → se guarda. Crear un segundo sin SKU → también se guarda (el índice parcial no bloquea los vacíos).
6. **Vaciar el SKU:** editar el primer producto, borrar el SKU → guarda; ese código queda libre para otro producto.
7. **Enter no rompe el form:** con el foco en el campo SKU, apretar Enter → **no** se envía el formulario.

Confirmar en la consola del navegador que no hay errores.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "feat: campo sku con escaneo en el formulario de producto"
```

---

### Task 5: Búsqueda por SKU, escaneo desde el buscador y SKU en la tarjeta

**Files:**
- Modify: `src/components/ProductManagement.tsx` (`filteredProducts` ~línea 318; barra de búsqueda ~línea 536; tarjeta de producto ~línea 668)

**Interfaces:**
- Consumes: `Product.sku` (Task 1), backend que devuelve `sku` (Task 2), `BarcodeScannerDialog` (Task 3), imports de `Barcode`/`Camera` ya agregados (Task 4).
- Produces: entregable final de la feature.

- [ ] **Step 1: Agregar el estado del escáner del buscador**

Junto al `formScannerOpen` agregado en la Task 4 (~línea 87):

```ts
  const [formScannerOpen, setFormScannerOpen] = useState(false);
  const [searchScannerOpen, setSearchScannerOpen] = useState(false);
```

Son dos estados separados a propósito: abrir un escáner no debe afectar al otro.

- [ ] **Step 2: Incluir el SKU en el filtro de búsqueda**

Reemplazar el cuerpo de `const filteredProducts = products.filter(p => {...})` (~línea 318-326) por:

```ts
  const filteredProducts = products.filter(p => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q);

    const matchesCategory = selectedCategoryFilter === 'all' || p.category === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });
```

- [ ] **Step 3: Agregar el botón de cámara a la barra de búsqueda**

En el bloque de búsqueda (~línea 536), reemplazar el `<div className="relative flex-1">` completo por:

```tsx
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar por nombre, SKU, descripción o categoría..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 pr-11 h-11 bg-white border-[#CBD5E1]"
                  style={{ borderRadius: '10px' }}
                />
                <button
                  type="button"
                  onClick={() => setSearchScannerOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors"
                  aria-label="Buscar escaneando un código de barras"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>
```

El botón va **dentro** del input (posicionado absoluto) y no al lado, para no comer ancho en celular, donde el selector de categoría ya ocupa espacio.

- [ ] **Step 4: Mostrar el SKU en la tarjeta del producto**

Justo **después** del `<h3>` con el nombre del producto (~línea 672, antes del bloque de la descripción), agregar:

```tsx
                    {product.sku && (
                      <p className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-mono">
                        <Barcode className="w-3.5 h-3.5 shrink-0" />
                        {product.sku}
                      </p>
                    )}
```

Sin esto, quien busca por código no tiene forma de confirmar que el resultado es el producto correcto.

- [ ] **Step 5: Montar el diálogo del escáner del buscador**

Junto al `BarcodeScannerDialog` del formulario agregado en la Task 4, agregar el segundo:

```tsx
      {/* Escáner del buscador: filtra la grilla por el código leído */}
      {searchScannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScannerDialog
            open
            onOpenChange={setSearchScannerOpen}
            onScan={(code) => setSearchQuery(code)}
            title="Buscar por código de barras"
          />
        </Suspense>
      )}
```

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: sin salida.

- [ ] **Step 7: Verificar la búsqueda en el navegador**

Con el preview corriendo, en **Gestión de Productos** (usando los productos creados en la Task 4):

1. **SKU completo:** tipear `7801234567890` en el buscador → queda solo ese producto.
2. **Fragmento de SKU:** tipear `78012` → sigue matcheando (búsqueda por substring, igual que los otros campos).
3. **Sin regresión:** buscar por nombre, por descripción y por categoría → los tres siguen funcionando.
4. **SKU visible:** el código aparece bajo el nombre en la tarjeta, en tipografía monoespaciada.
5. **Combinado con el filtro:** con una categoría seleccionada en el filtro, buscar por SKU → ambos criterios se aplican juntos.
6. **Pistola lectora** (si hay hardware disponible): hacer clic en el buscador y disparar → el código se escribe y la grilla filtra.

- [ ] **Step 8: Verificar el escaneo por cámara**

Este paso necesita HTTPS y una cámara real. `localhost` cuenta como contexto seguro, así que en la notebook funciona; para el celular hay que usar la URL de Netlify (no la IP de red local, que el navegador bloquea por no ser HTTPS).

En la notebook, con `localhost`:

1. Clic en el ícono de cámara del buscador → se abre el diálogo y se ve la imagen en vivo.
2. Mostrarle un código de barras (sirve el de cualquier producto físico, o uno en pantalla) → lee, cierra el diálogo y filtra la grilla.
3. Clic en el ícono de cámara del campo SKU del formulario → escanear → completa el campo.
4. **Apagado de la cámara:** abrir el escáner y tocar "Cancelar" → **el indicador de cámara del dispositivo se apaga**. Repetir cerrando con Escape y con el clic afuera del diálogo. Esta es la falla más común y silenciosa de este tipo de componente: si queda prendida, revisá el cleanup del `useEffect`.
5. **Permiso denegado:** denegar el permiso de cámara en el navegador y abrir el escáner → aparece el mensaje explicativo, la app no se rompe.

Después, desde el celular contra la URL de Netlify (una vez desplegado), repetir 1-3 en Android y en iPhone.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProductManagement.tsx
git commit -m "feat: buscar productos por sku y escanear desde el buscador"
```

---

## Cierre

- [ ] **Verificación final antes de desplegar**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"` → sin salida.
Run: `npm run build` → termina sin errores.

Confirmar que la carga diferida funciona (si no, ZXing quedó en el bundle principal y el `lazy` no sirvió de nada):

```bash
npm run build && ls -la build/assets/ | sort -k5 -n | tail -8
```

Esperado: un chunk **separado** para el escáner, aparte del bundle principal. Para confirmar cuál es:

```bash
grep -rl "BrowserMultiFormatReader\|EAN_13" build/assets/*.js | head
```

Esperado: el nombre del archivo que aparece **no** debe ser el bundle principal (el más grande, el que referencia `index.html`). Verificalo con:

```bash
grep -o 'assets/[^"]*\.js' build/index.html
```

Si ZXing aparece dentro del archivo que referencia `index.html`, revisá que el renderizado del diálogo sea condicional (`{scannerOpen && ...}`) y no solo `open={scannerOpen}`.

- [ ] **Desplegar**

El backend y el frontend se despliegan por vías distintas — hay que hacer las dos:

```bash
npx supabase functions deploy make-server-6d979413
```

```bash
git checkout main && git merge --ff-only dev && git push origin main && git checkout dev
```

Recordá el orden: **migración SQL → Edge Function → frontend**. Si el frontend sale primero, los usuarios ven el campo SKU pero no se guarda nada.

- [ ] **Verificar en producción**

En `https://conectocadev.netlify.app`: crear un producto con SKU, buscarlo por código y probar el escaneo por cámara desde el celular.
