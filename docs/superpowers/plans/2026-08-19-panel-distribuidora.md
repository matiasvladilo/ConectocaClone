# Panel de Distribuidora + Captura de Movimientos de Stock — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empezar a acumular el historial de movimientos de stock que hoy no existe, y darle al admin un panel propio para ver qué hay que reponer en los productos de la Distribuidora.

**Architecture:** Una tabla nueva `stock_events` que registra cada movimiento (despacho / reposición / merma / ajuste) sin pedirle **ningún dato nuevo al usuario**: el tipo se deduce de lo que ya elige hoy en el diálogo de ajuste (modo + signo del número) y de la RPC de creación de pedidos. Encima de eso, una pantalla nueva `DistributionPanel` que muestra stock actual y alertas por SKU, filtrada a la categoría de la Distribuidora.

**Tech Stack:** React 18 + TypeScript + Vite · Tailwind (CSS **precompilado**, ver constraints) + Radix UI (`components/ui/*`) · sonner (toasts) · Supabase (Postgres + Edge Function con Hono)

## Contexto de diseño (por qué esto y no más)

Decisiones tomadas durante el diseño, para que no se reabran en la implementación:

- **No se guarda costo de compra ni proveedor.** Se evaluó y se descartó: no hace falta para predecir *cuánto* y *cada cuánto* reponer, y obligaría a cargar datos manualmente en cada recepción.
- **No se guarda `cantidad_solicitada` vs `cantidad_entregada`.** No aplica a este flujo: `NewOrderForm.tsx:294` y `:899` limitan el input al stock disponible, así que el local nunca puede pedir más de lo que hay. El escenario "pidió 10, le dimos 6" no ocurre.
- **No se calcula compra sugerida todavía.** `stock_events` arranca vacío; cualquier sugerencia hoy sería inventada. El panel muestra un texto explícito de "disponible cuando haya más historial".
- **El consumo histórico ya existe** en `order_items` + `orders.created_at` (meses de datos). Los eventos `despacho` de `stock_events` no lo reemplazan: existen para poder reconstruir el saldo de stock desde un único ledger.

## Global Constraints

- **Este proyecto NO tiene framework de tests.** `package.json` solo define `dev` y `build`. La verificación de cada tarea es: typecheck + prueba en navegador. **No instales Jest/Vitest.**
- **Comando de typecheck:** `npx tsc --noEmit 2>&1 | grep -v "_redirects"` → salida esperada **vacía**. Hay 4 errores preexistentes en `src/_redirects/` y `src/public/_redirects/` (artefactos de Figma) que ese grep filtra. Cualquier otra línea es un error tuyo.
- **⚠️ CRÍTICO — Tailwind NO se compila en este proyecto.** `src/index.css` es un bundle CSS ya compilado y no existen `tailwind.config.js` ni `postcss.config.js`. **Cualquier clase que no esté ya en ese archivo no hace nada, en silencio**: sin error, sin warning, el typecheck y el build pasan igual. **Antes de escribir cualquier clase que no aparezca en este plan, verificala** con `grep -cE '\.LA-CLASE[,{ :]' src/index.css` (para clases con `:` como `md:grid-cols-4`, usar `grep -cF '.md\:grid-cols-4' src/index.css`). Todas las clases usadas en este plan ya fueron verificadas. **`min-w-full` y `table-auto` NO existen** — no las uses.
- **Idioma: español rioplatense** en interfaz, comentarios y mensajes de commit.
- **Usar los componentes de `src/components/ui/`** (Dialog, Button, Input, Label, Card, Badge, Select). No crear nuevos.
- No levantes servidores de desarrollo. La verificación en navegador la hace el controlador.
- **Las migraciones NO se aplican solas.** Este repo tiene solo 4 migraciones versionadas y el resto del schema vive únicamente en Supabase. Cada tarea con SQL termina con el archivo creado y commiteado; **aplicarlo en Supabase lo hace el controlador a mano** desde el SQL editor.

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `supabase/migrations/20260819_create_stock_events.sql` | Tabla del kardex + índices + RLS | Crear |
| `supabase/migrations/20260819_add_product_min_stock.sql` | Columna `products.min_stock` | Crear |
| `supabase/migrations/20260819_stock_events_on_order.sql` | RPC v2: registra despachos | Crear |
| `supabase/functions/make-server-6d979413/index.ts` | Registrar eventos al ajustar stock; exponer `minStock`; endpoint de movimientos | Modificar |
| `src/utils/api.tsx` | Tipos `StockEvent`/`Product.minStock` + cliente `stockEventsAPI` | Modificar |
| `src/components/StockAdjustDialog.tsx` | Informar con qué **modo** se hizo el ajuste | Modificar |
| `src/components/ProductManagement.tsx` | Pasar el modo + campo "stock mínimo" en el formulario | Modificar |
| `src/components/DistributionPanel.tsx` | Panel: KPIs, tabla por SKU, filtros, drawer de movimientos | Crear |
| `src/App.tsx` | Registrar la pantalla `distribucion` | Modificar |
| `src/components/UserProfile.tsx` | Botón de acceso al panel (solo admin) | Modificar |

---

### Task 1: Tabla `stock_events` (el kardex)

**Files:**
- Create: `supabase/migrations/20260819_create_stock_events.sql`

**Interfaces:**
- Produces: la tabla `public.stock_events` que consumen las Tasks 2, 5 y 6. Columnas exactas: `id, business_id, product_id, product_name, type, quantity, stock_after, order_id, created_by, created_at`.

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/20260819_create_stock_events.sql`:

```sql
-- supabase/migrations/20260819_create_stock_events.sql
-- Kardex de movimientos de stock. Hasta ahora el único rastro de un cambio de
-- stock era el valor final en products.stock, que se sobrescribe: era imposible
-- saber POR QUÉ el stock pasó de 50 a 38. Cada fila acá es un evento inmutable.

CREATE TABLE IF NOT EXISTS public.stock_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL,

  -- product_id a propósito NO tiene foreign key. Un log de eventos es historia
  -- inmutable y tiene que sobrevivir al borrado del producto que lo generó
  -- (DELETE /products/:id borra físicamente). Por eso además se guarda
  -- product_name como snapshot: si el producto desaparece, el histórico sigue
  -- siendo legible.
  product_id   uuid NOT NULL,
  product_name text NOT NULL,

  -- despacho   = salida por pedido de un local (la genera la RPC)
  -- reposicion = entró mercadería (ajuste en modo "sumar", número positivo)
  -- merma      = rotura / vencimiento (ajuste en modo "sumar", número negativo)
  -- ajuste     = corrección de conteo (ajuste en modo "corregir total")
  type         text NOT NULL CHECK (type IN ('despacho', 'reposicion', 'merma', 'ajuste')),

  -- Siempre positiva: el signo lo da el `type`, no el número. Así las sumas por
  -- tipo no necesitan ABS() ni CASE.
  quantity     numeric NOT NULL CHECK (quantity > 0),

  -- Saldo resultante después del movimiento. Redundante pero barato, y permite
  -- reconstruir el stock a una fecha sin sumar toda la historia previa.
  stock_after  numeric,

  -- Solo en 'despacho'. Permite cruzar a orders.user_id para saber A QUÉ LOCAL
  -- se despachó, sin duplicar esa columna acá.
  order_id     uuid,

  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- La consulta principal del panel: movimientos de un SKU, más recientes primero.
CREATE INDEX IF NOT EXISTS stock_events_product_created_idx
  ON public.stock_events (product_id, created_at DESC);

-- Para los futuros análisis por negocio y rango de fechas.
CREATE INDEX IF NOT EXISTS stock_events_business_created_idx
  ON public.stock_events (business_id, created_at DESC);

-- RLS activo sin políticas = nadie puede leer/escribir con la anon key.
-- Los únicos accesos son el Edge Function (service_role, bypassea RLS) y la RPC
-- create_order_with_stock (SECURITY DEFINER). El frontend nunca toca esta tabla
-- directamente.
ALTER TABLE public.stock_events ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Verificar que el SQL es válido**

Run: `grep -c "CREATE TABLE IF NOT EXISTS public.stock_events" supabase/migrations/20260819_create_stock_events.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260819_create_stock_events.sql
git commit -m "feat: tabla stock_events para el kardex de movimientos"
```

- [ ] **Step 4: Avisar al controlador**

Informar textualmente: *"Migración creada. Antes de la Task 2 hay que aplicar `20260819_create_stock_events.sql` en el SQL editor de Supabase — sin la tabla, los inserts de la Task 2 fallan."*

---

### Task 2: Registrar reposición / merma / ajuste al actualizar stock

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts` (ruta `PUT /products/:id`, línea ~785)

**Interfaces:**
- Consumes: tabla `stock_events` (Task 1).
- Produces: el endpoint `PUT /products/:id` acepta un campo nuevo opcional en el body: `modo?: 'sumar' | 'total'`. La Task 3 lo envía.

- [ ] **Step 1: Ampliar el SELECT del producto existente**

En `PUT /products/:id`, la consulta actual solo trae `id, business_id`. Para calcular el delta hace falta el stock previo.

Reemplazar:

```ts
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id, business_id')
      .eq('id', productId)
      .maybeSingle();
```

por:

```ts
    // Se traen stock y unlimited_stock además de los campos de permisos: el
    // registro en el kardex necesita el stock PREVIO para calcular el delta.
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id, business_id, stock, unlimited_stock')
      .eq('id', productId)
      .maybeSingle();
```

- [ ] **Step 2: Aceptar `modo` en el body**

En la misma ruta, reemplazar la línea de destructuring:

```ts
    const { ingredients, imageUrl, image, name, description, price, stock, categoryId, productionAreaId, unlimitedStock, trackStock, allowDecimal, laborCost, sku } = updates;
```

por:

```ts
    const { ingredients, imageUrl, image, name, description, price, stock, categoryId, productionAreaId, unlimitedStock, trackStock, allowDecimal, laborCost, sku, modo } = updates;
```

- [ ] **Step 3: Insertar el evento después del update**

En la misma ruta, justo **después** del bloque `if (updateErr) { ... }` y **antes** del bloque `if (ingredients !== undefined ...)`, insertar:

```ts
    // Kardex: se registra el movimiento sin pedirle ningún dato nuevo al usuario.
    // El tipo se deduce del modo con el que hizo el ajuste (lo manda
    // StockAdjustDialog) más el signo del delta:
    //   'sumar'  + delta > 0  -> reposicion  (llegó mercadería)
    //   'sumar'  + delta < 0  -> merma       (rotura / vencimiento)
    //   'total'               -> ajuste      (corrección de conteo)
    // Si el request no trae `modo` (ej. el formulario completo de edición, o el
    // ajuste que hace EditOrderDialog), se registra como 'ajuste': es el tipo
    // neutro y no ensucia el análisis de reposiciones.
    //
    // Solo se registra cuando el request cambió el stock Y NO tocó
    // unlimitedStock: al pasar un producto a stock ilimitado el backend fuerza
    // stock = 0, y eso no es un movimiento real de mercadería.
    const esAjusteDeStock =
      stock !== undefined &&
      unlimitedStock === undefined &&
      existing.unlimited_stock !== true;

    if (esAjusteDeStock) {
      const stockAnterior = Number(existing.stock);
      const stockNuevo = Number(updated.stock);
      const delta = stockNuevo - stockAnterior;

      if (delta !== 0) {
        const tipo = modo === 'sumar'
          ? (delta > 0 ? 'reposicion' : 'merma')
          : 'ajuste';

        const { error: eventoErr } = await supabaseAdmin.from('stock_events').insert({
          business_id: profile.businessId,
          product_id: productId,
          product_name: updated.name,
          type: tipo,
          quantity: Math.abs(delta),
          stock_after: stockNuevo,
          created_by: userId,
        });

        // El evento es historia, no parte de la operación: si falla, se loguea
        // pero NO se le devuelve error al usuario ni se revierte el stock. Un
        // kardex incompleto es mejor que un ajuste de stock que no se guarda.
        if (eventoErr) {
          console.error('Error registrando stock_event:', eventoErr);
        }
      }
    }
```

- [ ] **Step 4: Verificar el typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: salida vacía.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "feat: registrar reposicion, merma y ajuste en el kardex"
```

- [ ] **Step 6: Avisar al controlador**

Informar: *"El Edge Function cambió. Hay que redesplegarlo (`supabase functions deploy make-server-6d979413`) para que los cambios tomen efecto."*

---

### Task 3: El diálogo de ajuste informa con qué modo se hizo

**Files:**
- Modify: `src/components/StockAdjustDialog.tsx`
- Modify: `src/components/ProductManagement.tsx:338-356`
- Modify: `src/utils/api.tsx` (firma de `productsAPI.update`)

**Interfaces:**
- Consumes: `PUT /products/:id` con `modo` (Task 2).
- Produces: `StockAdjustDialog` exporta `export type ModoAjuste = 'sumar' | 'total'` y su prop `onConfirm` pasa a ser `(nuevoStock: number, modo: ModoAjuste) => Promise<void>`.

**Nota:** no hay ningún cambio visual. El usuario ve exactamente el mismo diálogo; lo único que cambia es que el dato del modo, que hoy se descarta, ahora viaja al backend.

- [ ] **Step 1: Exportar el tipo del modo**

En `src/components/StockAdjustDialog.tsx`, reemplazar:

```ts
type Modo = 'sumar' | 'total';
```

por:

```ts
// Se exporta porque el backend necesita saber con qué modo se hizo el ajuste
// para clasificar el movimiento en el kardex (reposición vs corrección).
export type ModoAjuste = 'sumar' | 'total';
```

- [ ] **Step 2: Actualizar los usos internos del tipo**

En el mismo archivo, reemplazar:

```ts
  onConfirm: (nuevoStock: number) => Promise<void>;
```

por:

```ts
  onConfirm: (nuevoStock: number, modo: ModoAjuste) => Promise<void>;
```

Y reemplazar:

```ts
  const [modo, setModo] = useState<Modo>('sumar');
```

por:

```ts
  const [modo, setModo] = useState<ModoAjuste>('sumar');
```

- [ ] **Step 3: Pasar el modo al confirmar**

En el mismo archivo, reemplazar:

```ts
    await onConfirm(nuevoStock);
```

por:

```ts
    await onConfirm(nuevoStock, modo);
```

- [ ] **Step 4: Permitir `modo` en el cliente de la API**

En `src/utils/api.tsx`, en `productsAPI.update`, reemplazar la firma:

```ts
  update: async (token: string, productId: string, updates: Partial<Product> & { ingredients?: Array<{ ingredientId: string; quantity: number }> }): Promise<Product> => {
```

por:

```ts
  // `modo` no es un campo del producto: es metadato del ajuste que el backend
  // usa para clasificar el movimiento en el kardex. No se persiste en products.
  update: async (token: string, productId: string, updates: Partial<Product> & { ingredients?: Array<{ ingredientId: string; quantity: number }>; modo?: 'sumar' | 'total' }): Promise<Product> => {
```

- [ ] **Step 5: Enviar el modo desde ProductManagement**

En `src/components/ProductManagement.tsx`, reemplazar la firma y la llamada de `handleAjustarStock`:

```ts
  const handleAjustarStock = async (nuevoStock: number) => {
    if (!stockProduct) return;
    try {
      setSavingStock(true);
      // Se manda SOLO el stock: el backend actualiza únicamente los campos
      // presentes, así que la receta y el resto del producto quedan intactos
      // (y no se dispara el chequeo de permisos de recetas).
      const actualizado = await productsAPI.update(accessToken, stockProduct.id, { stock: nuevoStock });
```

por:

```ts
  const handleAjustarStock = async (nuevoStock: number, modo: ModoAjuste) => {
    if (!stockProduct) return;
    try {
      setSavingStock(true);
      // Se manda SOLO el stock + el modo: el backend actualiza únicamente los
      // campos presentes, así que la receta y el resto del producto quedan
      // intactos (y no se dispara el chequeo de permisos de recetas).
      // El `modo` no modifica el producto: le dice al backend si esto fue una
      // reposición, una merma o una corrección de conteo.
      const actualizado = await productsAPI.update(accessToken, stockProduct.id, { stock: nuevoStock, modo });
```

- [ ] **Step 6: Importar el tipo en ProductManagement**

En `src/components/ProductManagement.tsx`, buscar la línea que importa `StockAdjustDialog` y agregarle el tipo:

```ts
import { StockAdjustDialog, type ModoAjuste } from './StockAdjustDialog';
```

- [ ] **Step 7: Verificar el typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: salida vacía.

- [ ] **Step 8: Commit**

```bash
git add src/components/StockAdjustDialog.tsx src/components/ProductManagement.tsx src/utils/api.tsx
git commit -m "feat: el ajuste de stock informa su modo para clasificar el movimiento"
```

---

### Task 4: Stock mínimo por producto

**Files:**
- Create: `supabase/migrations/20260819_add_product_min_stock.sql`
- Modify: `supabase/functions/make-server-6d979413/index.ts` (`toProduct` línea ~75, `POST /products` línea ~704, `PUT /products/:id` línea ~785)
- Modify: `src/utils/api.tsx` (interface `Product`)
- Modify: `src/components/ProductManagement.tsx` (formulario)

**Interfaces:**
- Produces: `Product.minStock?: number` en `src/utils/api.tsx`, consumido por la Task 7.

**Por qué:** hoy "stock bajo" está hardcodeado en `< 10` para todos los productos por igual (`ProductManagement.tsx:373`). 10 unidades puede ser mucho para un producto y poco para otro. `ingredients` ya tiene su `min_stock` configurable; `products` no.

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/20260819_add_product_min_stock.sql`:

```sql
-- supabase/migrations/20260819_add_product_min_stock.sql
-- Umbral de "stock bajo" por producto. Hasta ahora el umbral era un 10 fijo
-- hardcodeado en el frontend para todos los SKU por igual.
-- Es NULL-able a propósito: los productos ya cargados no tienen umbral definido
-- y el panel usa un default (10) para ellos, así funciona desde el día uno sin
-- tener que configurar cada SKU a mano.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_stock numeric;
```

- [ ] **Step 2: Exponer `minStock` en el mapper del backend**

En `supabase/functions/make-server-6d979413/index.ts`, en `toProduct`, agregar la línea justo después de `stock: r.stock,`:

```ts
    minStock: r.min_stock != null ? Number(r.min_stock) : undefined,
```

- [ ] **Step 3: Aceptar `minStock` al crear un producto**

En `POST /products`, reemplazar:

```ts
    const { name, description, price, image, imageUrl, stock, categoryId, productionAreaId, ingredients, unlimitedStock, allowDecimal, laborCost, sku } = body;
```

por:

```ts
    const { name, description, price, image, imageUrl, stock, categoryId, productionAreaId, ingredients, unlimitedStock, allowDecimal, laborCost, sku, minStock } = body;
```

Y en el objeto del `.insert({...})` de esa misma ruta, agregar después de la línea `stock: isUnlimited ? 0 : (stock !== undefined ? parseInt(stock) : 100),`:

```ts
        min_stock: minStock !== undefined && minStock !== null && minStock !== '' ? Number(minStock) : null,
```

- [ ] **Step 4: Aceptar `minStock` al editar un producto**

En `PUT /products/:id`, agregar `minStock` al destructuring (que en la Task 2 ya quedó con `modo`):

```ts
    const { ingredients, imageUrl, image, name, description, price, stock, categoryId, productionAreaId, unlimitedStock, trackStock, allowDecimal, laborCost, sku, modo, minStock } = updates;
```

Y agregar, junto a las otras asignaciones de `updateData` (por ejemplo después de `if (laborCost !== undefined) updateData.labor_cost = Number(laborCost) || 0;`):

```ts
    // '' se guarda como null (sin umbral), no como 0: un umbral de 0 significaría
    // "avisame solo cuando esté agotado", que es una intención distinta a "no lo configuré".
    if (minStock !== undefined) {
      updateData.min_stock = minStock === null || minStock === '' ? null : Number(minStock);
    }
```

- [ ] **Step 5: Agregar `minStock` al tipo del frontend**

En `src/utils/api.tsx`, en la interface `Product`, agregar después de `stock: number;`:

```ts
  minStock?: number; // Umbral de "stock bajo" por SKU. undefined = usar el default del panel.
```

- [ ] **Step 6: Agregar el campo al formulario de producto**

En `src/components/ProductManagement.tsx`:

(a) En la interface del form state, agregar junto a `stock: string;`:

```ts
  minStock: string;
```

(b) En el objeto de estado inicial (donde está `stock: '',`), agregar:

```ts
  minStock: '',
```

(c) En la función que carga un producto para editarlo (donde está `stock: product.stock.toString(),`), agregar:

```ts
        minStock: product.minStock !== undefined ? product.minStock.toString() : '',
```

(d) En el payload de guardado (donde está `stock: formData.unlimitedStock ? 0 : (parseInt(formData.stock) || 0),`), agregar:

```ts
        minStock: formData.minStock.trim() === '' ? null : (parseInt(formData.minStock) || 0),
```

(e) En el JSX, inmediatamente **después** del bloque `<div>` que contiene el `<Label htmlFor="stock">Stock *</Label>` y su input, agregar:

```tsx
              <div>
                <Label htmlFor="min-stock">Stock mínimo</Label>
                <Input
                  id="min-stock"
                  type="number"
                  min="0"
                  value={formData.minStock}
                  onChange={(e) => setFormData({ ...formData, minStock: e.target.value })}
                  placeholder="Ej: 10"
                  disabled={formData.unlimitedStock}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cuando el stock llegue a este número, el panel de Distribuidora lo marca como bajo. Si lo dejás vacío se usa 10.
                </p>
              </div>
```

- [ ] **Step 7: Verificar el typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: salida vacía.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260819_add_product_min_stock.sql supabase/functions/make-server-6d979413/index.ts src/utils/api.tsx src/components/ProductManagement.tsx
git commit -m "feat: stock minimo configurable por producto"
```

- [ ] **Step 9: Avisar al controlador**

Informar: *"Hay que aplicar `20260819_add_product_min_stock.sql` en Supabase y redesplegar el Edge Function."*

---

### Task 5: Registrar los despachos en el kardex

**Files:**
- Create: `supabase/migrations/20260819_stock_events_on_order.sql`

**Interfaces:**
- Consumes: tabla `stock_events` (Task 1).
- Produces: nada que consuman otras tasks. Es el único punto donde se generan eventos de tipo `despacho`.

**⚠️ Esta tarea toca el camino crítico de creación de pedidos.** La función se reescribe completa (`CREATE OR REPLACE`) partiendo del original en `supabase/migrations/20260629_create_order_with_stock.sql`. El único cambio es el `INSERT` al final del loop y el agregado de `business_id` al `SELECT INTO`. **No cambies nada más de la lógica** — el comportamiento de `STOCK_INSUFICIENTE` se mantiene idéntico.

- [ ] **Step 1: Crear la migración**

Crear `supabase/migrations/20260819_stock_events_on_order.sql`:

```sql
-- supabase/migrations/20260819_stock_events_on_order.sql
-- Agrega el registro del despacho en el kardex, en la MISMA transacción que el
-- descuento de stock: así el ledger nunca puede quedar desincronizado del saldo.
-- Todo lo demás es idéntico a 20260629_create_order_with_stock.sql.

CREATE OR REPLACE FUNCTION public.create_order_with_stock(order_id text, new_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  item jsonb;
  prod record;
  qty  numeric;
  pid  uuid;
BEGIN
  -- 1. Descuento atómico de stock (solo productos con stock controlado)
  FOR item IN
    SELECT value FROM jsonb_array_elements(COALESCE(new_data->'products', '[]'::jsonb)) AS t(value)
  LOOP
    IF (item->>'productId') IS NULL
       OR (item->>'productId') = ''
       OR (item->>'productId') = 'null' THEN
      CONTINUE;
    END IF;

    pid := (item->>'productId')::uuid;
    qty := GREATEST(COALESCE((item->>'quantity')::numeric, 0), 0);

    -- business_id se suma al SELECT porque lo necesita el INSERT del kardex.
    SELECT id, name, stock, unlimited_stock, track_stock, business_id
      INTO prod
      FROM products
      WHERE id = pid
      FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;  -- producto inexistente: no bloquea (igual que el cliente actual)
    END IF;

    IF prod.unlimited_stock OR NOT prod.track_stock OR prod.stock = -1 THEN
      CONTINUE;  -- ilimitado: nunca se toca (y no genera evento: no hay saldo que reconstruir)
    END IF;

    IF prod.stock < qty THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', prod.name;
    END IF;

    UPDATE products SET stock = stock - qty WHERE id = pid;

    -- Kardex: el despacho queda en la misma transacción que el descuento.
    -- qty = 0 no genera evento (no hubo movimiento real) y además violaría el
    -- CHECK (quantity > 0) de la tabla.
    -- created_by = auth.uid() funciona igual en SECURITY DEFINER: lee el claim
    -- del JWT, no el rol de ejecución.
    IF qty > 0 THEN
      INSERT INTO public.stock_events (
        business_id, product_id, product_name, type, quantity, stock_after, order_id, created_by
      ) VALUES (
        prod.business_id, pid, prod.name, 'despacho', qty, prod.stock - qty, order_id::uuid, auth.uid()
      );
    END IF;
  END LOOP;

  -- 2. Crear el pedido reutilizando la función existente (misma transacción)
  PERFORM create_order_kv(order_id, new_data);
END;
$function$;
```

- [ ] **Step 2: Verificar que la lógica de STOCK_INSUFICIENTE quedó intacta**

Run: `grep -c "STOCK_INSUFICIENTE" supabase/migrations/20260819_stock_events_on_order.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260819_stock_events_on_order.sql
git commit -m "feat: registrar los despachos de pedidos en el kardex"
```

- [ ] **Step 4: Avisar al controlador**

Informar: *"Hay que aplicar `20260819_stock_events_on_order.sql` en Supabase. **Verificación obligatoria después de aplicarla:** crear un pedido de prueba desde un local y confirmar (a) que el pedido se crea bien y (b) que aparece una fila `despacho` en `stock_events`. Esta migración toca el camino crítico de pedidos."*

---

### Task 6: Endpoint y cliente para consultar movimientos de un producto

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts` (mapper nuevo + ruta nueva)
- Modify: `src/utils/api.tsx` (tipo + cliente)

**Interfaces:**
- Consumes: tabla `stock_events` (Task 1).
- Produces, consumido por la Task 7:

```ts
export interface StockEvent {
  id: string;
  productId: string;
  productName: string;
  type: 'despacho' | 'reposicion' | 'merma' | 'ajuste';
  quantity: number;
  stockAfter?: number;
  orderId?: string;
  createdAt: string;
}
export const stockEventsAPI: {
  getByProduct: (token: string, productId: string, limit?: number) => Promise<StockEvent[]>;
};
```

- [ ] **Step 1: Agregar el mapper en el backend**

En `supabase/functions/make-server-6d979413/index.ts`, después de la función `toIngredient` (línea ~142), agregar:

```ts
function toStockEvent(r: any) {
  return {
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    type: r.type,
    quantity: Number(r.quantity),
    stockAfter: r.stock_after != null ? Number(r.stock_after) : undefined,
    orderId: r.order_id || undefined,
    createdAt: r.created_at,
  };
}
```

- [ ] **Step 2: Agregar la ruta**

En el mismo archivo, inmediatamente **después** de la ruta `app.delete('/make-server-6d979413/products/:productId/ingredients/:ingredientId', ...)` (termina en la línea ~1115), agregar:

```ts
// Movimientos de stock de un producto. Solo admin: es información de gestión,
// no operativa. No hay ruta GET /products/:id, así que este path no colisiona.
app.get('/make-server-6d979413/products/:id/stock-events', async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const productId = c.req.param('id');
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);
    if (profile.role !== 'admin') return c.json({ error: 'No autorizado' }, 403);

    // El tope duro evita que un limit gigante en la query traiga la tabla entera.
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

    // El filtro por business_id no es redundante con el product_id: evita que
    // un id de otro negocio devuelva datos si se lo pasan a mano.
    const { data } = await supabaseAdmin
      .from('stock_events')
      .select('*')
      .eq('business_id', profile.businessId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return c.json({ data: (data || []).map(toStockEvent) });
  } catch (err: any) {
    console.error('Error getting stock events:', err);
    return c.json({ error: 'Error al obtener movimientos' }, 500);
  }
});
```

- [ ] **Step 3: Agregar el tipo y el cliente en el frontend**

En `src/utils/api.tsx`, al final del archivo, agregar:

```ts
export interface StockEvent {
  id: string;
  productId: string;
  productName: string;
  type: 'despacho' | 'reposicion' | 'merma' | 'ajuste';
  quantity: number;   // siempre positiva: el signo lo da el `type`
  stockAfter?: number;
  orderId?: string;
  createdAt: string;
}

export const stockEventsAPI = {
  getByProduct: async (token: string, productId: string, limit: number = 50): Promise<StockEvent[]> => {
    const response = await fetchAPI(`/products/${productId}/stock-events?limit=${limit}`, {}, token);
    return response?.data || [];
  },
};
```

- [ ] **Step 4: Verificar el typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: salida vacía.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts src/utils/api.tsx
git commit -m "feat: endpoint para consultar los movimientos de stock de un producto"
```

---

### Task 7: Componente `DistributionPanel`

**Files:**
- Create: `src/components/DistributionPanel.tsx`

**Interfaces:**
- Consumes: `Product` (con `minStock` de la Task 4), `Category`, `productsAPI`, `categoriesAPI`, `StockEvent` y `stockEventsAPI` (Task 6) — todos de `src/utils/api.tsx`.
- Produces: named export `DistributionPanel`, consumido por la Task 8:

```ts
interface DistributionPanelProps {
  onBack: () => void;
  accessToken: string;
}
```

**Clases Tailwind:** todas las de este componente ya fueron verificadas contra `src/index.css`. **No agregues clases nuevas sin verificarlas.** Recordá que `min-w-full` y `table-auto` **no existen**.

- [ ] **Step 1: Crear el componente**

Crear `src/components/DistributionPanel.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ArrowLeft, PackageX, AlertTriangle, Boxes, Search, History } from 'lucide-react';
import { toast } from 'sonner';
import { productsAPI, categoriesAPI, stockEventsAPI } from '../utils/api';
import type { Product, Category, StockEvent } from '../utils/api';
import { formatCLP } from '../utils/format';
import { formatDateCL } from '../utils/dateUtils';

interface DistributionPanelProps {
  onBack: () => void;
  accessToken: string;
}

export type EstadoStock = 'agotado' | 'bajo' | 'ok';

// Umbral por defecto para los productos que todavía no tienen min_stock cargado.
// Replica el 10 que hasta ahora estaba hardcodeado en ProductManagement.
export const MIN_STOCK_POR_DEFECTO = 10;

// Clave de localStorage para recordar qué categoría eligió el admin. Se guarda
// porque el panel se usa siempre sobre la misma categoría (la de Distribuidora)
// y volver a elegirla en cada visita sería fricción pura.
const CLAVE_CATEGORIA = 'conectoca:distribucion:categoria';

/**
 * Los productos de stock ilimitado no se reponen, así que no participan del
 * panel: devuelve null para que el llamador los excluya.
 */
export function calcularEstadoStock(product: Product): EstadoStock | null {
  if (product.unlimitedStock === true || product.stock === -1 || product.trackStock === false) {
    return null;
  }
  if (product.stock <= 0) return 'agotado';
  const minimo = product.minStock ?? MIN_STOCK_POR_DEFECTO;
  return product.stock <= minimo ? 'bajo' : 'ok';
}

/**
 * Busca la categoría de la Distribuidora por nombre. Se hace por nombre y no por
 * un id fijo porque la app es multi-tenant: cada negocio tiene sus propias
 * categorías y ninguna id sirve para todos. Si no la encuentra, muestra todas.
 */
export function elegirCategoriaInicial(categories: Category[]): string {
  const distri = categories.find(c => c.name.trim().toLowerCase().includes('distribuidora'));
  return distri ? distri.id : 'all';
}

const ETIQUETA_MOVIMIENTO: Record<StockEvent['type'], string> = {
  despacho: 'Despacho a local',
  reposicion: 'Llegó mercadería',
  merma: 'Merma',
  ajuste: 'Corrección de conteo',
};

export function DistributionPanel({ onBack, accessToken }: DistributionPanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriaId, setCategoriaId] = useState<string>('all');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoStock>('todos');

  const [productoMovimientos, setProductoMovimientos] = useState<Product | null>(null);
  const [movimientos, setMovimientos] = useState<StockEvent[]>([]);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        setLoading(true);
        const [respProductos, respCategorias] = await Promise.all([
          productsAPI.getAll(accessToken),
          categoriesAPI.getAll(accessToken),
        ]);
        const listaProductos = Array.isArray(respProductos)
          ? respProductos
          : (respProductos as any).data || [];
        setProducts(listaProductos);
        setCategories(respCategorias);

        // La categoría guardada manda, pero solo si todavía existe: si la
        // borraron, caer en la detección por nombre evita un panel vacío.
        const guardada = localStorage.getItem(CLAVE_CATEGORIA);
        const sigueExistiendo = guardada && respCategorias.some(c => c.id === guardada);
        setCategoriaId(sigueExistiendo ? guardada! : elegirCategoriaInicial(respCategorias));
      } catch (error: any) {
        console.error('Error cargando el panel de distribución:', error);
        toast.error('Error al cargar el panel');
      } finally {
        setLoading(false);
      }
    };
    cargar();
  }, [accessToken]);

  const handleCambiarCategoria = (valor: string) => {
    setCategoriaId(valor);
    localStorage.setItem(CLAVE_CATEGORIA, valor);
  };

  // Productos del ámbito del panel: los de la categoría elegida que además
  // controlan stock (los ilimitados devuelven estado null y se descartan).
  const productosDelAmbito = useMemo(() => {
    return products
      .map(p => ({ producto: p, estado: calcularEstadoStock(p) }))
      .filter((x): x is { producto: Product; estado: EstadoStock } => x.estado !== null)
      .filter(x => categoriaId === 'all' || x.producto.categoryId === categoriaId);
  }, [products, categoriaId]);

  const stats = useMemo(() => ({
    total: productosDelAmbito.length,
    agotados: productosDelAmbito.filter(x => x.estado === 'agotado').length,
    bajos: productosDelAmbito.filter(x => x.estado === 'bajo').length,
    valor: productosDelAmbito.reduce((sum, x) => sum + x.producto.price * x.producto.stock, 0),
  }), [productosDelAmbito]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productosDelAmbito
      .filter(x => filtroEstado === 'todos' || x.estado === filtroEstado)
      .filter(x => !q ||
        x.producto.name.toLowerCase().includes(q) ||
        (x.producto.sku || '').toLowerCase().includes(q))
      // Lo más urgente arriba: agotados, después bajos, y dentro de cada grupo
      // el de menos stock primero.
      .sort((a, b) => {
        const peso = { agotado: 0, bajo: 1, ok: 2 };
        if (peso[a.estado] !== peso[b.estado]) return peso[a.estado] - peso[b.estado];
        return a.producto.stock - b.producto.stock;
      });
  }, [productosDelAmbito, filtroEstado, busqueda]);

  const abrirMovimientos = async (producto: Product) => {
    setProductoMovimientos(producto);
    setMovimientos([]);
    try {
      setCargandoMovimientos(true);
      setMovimientos(await stockEventsAPI.getByProduct(accessToken, producto.id));
    } catch (error: any) {
      console.error('Error cargando movimientos:', error);
      toast.error('Error al cargar los movimientos');
    } finally {
      setCargandoMovimientos(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Distribuidora</h1>
            <p className="text-sm text-gray-600">Stock actual y productos a reponer</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <PackageX className="w-4 h-4" />
                Agotados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-red-600">{stats.agotados}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <AlertTriangle className="w-4 h-4" />
                Stock bajo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-amber-600">{stats.bajos}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 text-gray-600">
                <Boxes className="w-4 h-4" />
                Productos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold text-gray-900">{stats.total}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 shadow-md">
            <CardHeader className="pb-3">
              <CardDescription className="text-gray-600">Valor del inventario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-green-600">{formatCLP(stats.valor)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o SKU"
            />
          </div>

          <Select value={categoriaId} onValueChange={handleCambiarCategoria}>
            <SelectTrigger>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="agotado">Agotados</SelectItem>
              <SelectItem value="bajo">Stock bajo</SelectItem>
              <SelectItem value="ok">Stock OK</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="shadow-md">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 text-sm text-gray-500">Cargando…</div>
            ) : filas.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">
                No hay productos que controlen stock en esta categoría.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-3 py-2 text-gray-600">Producto</th>
                      <th className="text-left px-3 py-2 text-gray-600">Estado</th>
                      <th className="text-right px-3 py-2 text-gray-600">Stock</th>
                      <th className="text-right px-3 py-2 text-gray-600">Mínimo</th>
                      <th className="text-right px-3 py-2 text-gray-600">Movimientos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(({ producto, estado }) => (
                      <tr key={producto.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="text-gray-900">{producto.name}</div>
                          {producto.sku && (
                            <div className="text-xs text-gray-500 font-mono">{producto.sku}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {estado === 'agotado' ? (
                            <Badge className="bg-red-50 text-red-600">Agotado</Badge>
                          ) : estado === 'bajo' ? (
                            <Badge className="bg-amber-50 text-amber-600">Bajo</Badge>
                          ) : (
                            <Badge className="bg-gray-50 text-gray-600">OK</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-900">{producto.stock}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">
                          {producto.minStock ?? MIN_STOCK_POR_DEFECTO}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="outline" onClick={() => abrirMovimientos(producto)}>
                            <History className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Se deja explícito para que quede claro que está planeado y no olvidado:
            calcular una sugerencia hoy sería inventar un número, porque el
            historial de reposiciones recién empieza a acumularse. */}
        <p className="text-xs text-gray-500">
          La sugerencia de cuánto y cada cuánto reponer va a estar disponible cuando se acumule
          más historial de movimientos.
        </p>
      </div>

      <Dialog open={!!productoMovimientos} onOpenChange={(o) => !o && setProductoMovimientos(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Movimientos</DialogTitle>
            <DialogDescription>{productoMovimientos?.name}</DialogDescription>
          </DialogHeader>

          {cargandoMovimientos ? (
            <div className="text-sm text-gray-500">Cargando…</div>
          ) : movimientos.length === 0 ? (
            <div className="text-sm text-gray-500">
              Todavía no hay movimientos registrados para este producto.
            </div>
          ) : (
            <div className="space-y-2">
              {movimientos.map(m => (
                <div key={m.id} className="flex items-center justify-between border-b py-2">
                  <div>
                    <div className="text-sm text-gray-900">{ETIQUETA_MOVIMIENTO[m.type]}</div>
                    <div className="text-xs text-gray-500">{formatDateCL(m.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono ${m.type === 'reposicion' ? 'text-green-600' : m.type === 'ajuste' ? 'text-gray-600' : 'text-red-600'}`}>
                      {m.type === 'reposicion' ? '+' : m.type === 'ajuste' ? '' : '−'}{m.quantity}
                    </div>
                    {m.stockAfter !== undefined && (
                      <div className="text-xs text-gray-500">queda {m.stockAfter}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verificar el typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: salida vacía.

- [ ] **Step 3: Commit**

```bash
git add src/components/DistributionPanel.tsx
git commit -m "feat: panel de distribuidora con stock actual y alertas por SKU"
```

---

### Task 8: Conectar el panel a la aplicación

**Files:**
- Modify: `src/App.tsx` (tipo `Pantalla` línea ~143, import, uso de `UserProfile` línea ~1706, bloque de render nuevo)
- Modify: `src/components/UserProfile.tsx` (prop + botón)

**Interfaces:**
- Consumes: `DistributionPanel` (Task 7).

- [ ] **Step 1: Registrar la pantalla en el tipo**

En `src/App.tsx`, en el tipo `Pantalla`, agregar `| "distribucion"` después de `| "analytics"`:

```ts
  | "analytics"
  | "distribucion"
```

- [ ] **Step 2: Importar el componente**

En `src/App.tsx`, junto a los otros imports de componentes (por ejemplo después del import de `Analytics`):

```ts
import { DistributionPanel } from "./components/DistributionPanel";
```

- [ ] **Step 3: Pasar el callback a UserProfile**

En `src/App.tsx`, en el uso de `<UserProfile ... />`, agregar después de la línea `onViewAnalytics={() => setCurrentScreen("analytics")}`:

```tsx
          onViewDistribution={
            currentUser.role === "admin"
              ? () => setCurrentScreen("distribucion")
              : undefined
          }
```

- [ ] **Step 4: Agregar el bloque de render**

En `src/App.tsx`, inmediatamente **después** del bloque `{currentScreen === "analytics" && currentUser && ( ... )}`, agregar:

```tsx
      {currentScreen === "distribucion" && currentUser && accessToken && (
        <DistributionPanel
          onBack={() => setCurrentScreen("profile")}
          accessToken={accessToken}
        />
      )}
```

- [ ] **Step 5: Agregar la prop en UserProfile**

En `src/components/UserProfile.tsx`, en la interface de props, agregar junto a `onViewAnalytics?: () => void;`:

```ts
  onViewDistribution?: () => void;
```

Y agregarla al destructuring de la firma del componente, después de `onViewAnalytics`:

```ts
export function UserProfile({ user, onBack, onLogout, onUpdateProfile, onViewAnalytics, onViewDistribution, onManageAttendance, onManageProducts, onManageProductionAreas, onManageIngredients, onManageProductIngredients, accessToken }: UserProfileProps) {
```

- [ ] **Step 6: Agregar el botón de acceso**

En `src/components/UserProfile.tsx`, inmediatamente **después** del bloque del botón de Analíticas (el que termina con `)}` en la línea ~744) y **antes** del comentario `{/* Admin actions */}`, agregar:

```tsx
        {/* Panel de Distribuidora (solo admin) */}
        {user.role === 'admin' && onViewDistribution && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.22 }}
            whileTap={{ scale: 0.98 }}
            className="mb-4"
          >
            <Button
              onClick={onViewDistribution}
              className="w-full h-12 relative overflow-hidden group"
              style={{
                background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(0, 89, 255, 0.3)'
              }}
            >
              <div className="flex items-center gap-2 relative z-10 text-white">
                <Boxes className="w-5 h-5" />
                Panel de Distribuidora
              </div>
            </Button>
          </motion.div>
        )}
```

- [ ] **Step 7: Importar el ícono**

En `src/components/UserProfile.tsx`, agregar `Boxes` a la lista de íconos importados de `lucide-react`.

- [ ] **Step 8: Verificar el typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -v "_redirects"`
Expected: salida vacía.

- [ ] **Step 9: Verificar el build**

Run: `npm run build`
Expected: build exitoso, sin errores.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/components/UserProfile.tsx
git commit -m "feat: acceso al panel de distribuidora desde el perfil de admin"
```

---

## Verificación final (la hace el controlador, en navegador)

Con las 3 migraciones aplicadas y el Edge Function redesplegado:

1. **Reposición** → Productos → botón "Stock" → modo "Sumar" → `+20` → Confirmar.
   Esperado: el stock sube 20 y en `stock_events` aparece una fila `reposicion` con `quantity = 20`.
2. **Merma** → mismo diálogo, modo "Sumar" → `-3` → Confirmar.
   Esperado: fila `merma` con `quantity = 3`.
3. **Ajuste** → modo "Corregir total" → un número distinto al actual → Confirmar.
   Esperado: fila `ajuste` con `quantity` = valor absoluto de la diferencia.
4. **Despacho** → crear un pedido desde un local.
   Esperado: el pedido se crea normalmente **y** aparece una fila `despacho` con su `order_id`.
5. **Panel** → Perfil → "Panel de Distribuidora".
   Esperado: arranca filtrado en la categoría Distribuidora, los agotados aparecen primero, y el botón de historial de cada fila muestra los movimientos de los pasos 1-4.
6. **Stock mínimo** → editar un producto, poner mínimo en 50, guardar.
   Esperado: si su stock es menor a 50, el panel lo marca como "Bajo".

## Invariante del kardex

**Toda escritura a `products.stock` tiene que registrar un evento en `stock_events`.**

Es la regla central de la feature y no hay ningún test que la haga cumplir (el proyecto
no tiene framework de tests). Si un camino cambia el stock sin registrar, el kardex se ve
completo sin estarlo, y eso **no se puede detectar ni reconstruir después**: el valor
anterior de `products.stock` ya se sobrescribió.

En la práctica la regla se aplica así:

- **En el Edge Function**: todo pasa por el helper `registrarStockEvent(...)`
  (`supabase/functions/make-server-6d979413/index.ts`, cerca de los mappers `toXxx`).
  Es un único punto de entrada a propósito: la primera versión tenía el INSERT inline en
  `PUT /products/:id` y por eso los otros tres caminos que mueven stock se olvidaron de
  registrar. **Si agregás un `update({ stock: ... })` nuevo, agregá la llamada al helper
  en la misma línea de código, no después.**
- **Única excepción legítima**: la RPC `create_order_with_stock`, que hace su propio
  INSERT dentro de la **misma transacción** que el descuento. Ahí el ledger no puede
  quedar desincronizado del saldo ni aunque falle algo, que es más fuerte que lo que
  logra el helper.

Caminos cubiertos hoy y con qué tipo:

| Camino | Tipo registrado |
|---|---|
| `PUT /products/:id` (ajuste manual, modo "sumar" con delta > 0) | `reposicion` |
| `PUT /products/:id` (ajuste manual, modo "sumar" con delta < 0) | `merma` |
| `PUT /products/:id` (modo "corregir total", o sin `modo`) | `ajuste` |
| RPC `create_order_with_stock` (pedido nuevo) | `despacho` |
| `POST /orders` (ruta legacy) | `despacho` |
| `DELETE /orders/:id` (restaura el stock de cada ítem) | `devolucion` |
| `PATCH /production-orders/:id/status` → `TERMINADA` | `reposicion` |

`devolucion` es el tipo agregado por `20260819_stock_events_add_devolucion.sql`. La
producción terminada se mapea a `reposicion` y no a un tipo propio porque es stock que
entra, y porque la Distribuidora **solo compra** — no usa órdenes de producción, así que
ese camino no afecta a sus productos; se cubre igual para que el kardex no mienta sobre
los productos de panadería/pastelería.

## Procedimiento de aplicación

El orden importa: hay dependencias entre pasos que, si se invierten, van de "un endpoint
devuelve 500" a "todo pedido nuevo falla". Aplicar en este orden exacto.

### 0. Chequeos pre-vuelo (SQL editor, antes de aplicar nada)

```sql
-- (a) Productos sin business_id. Si da > 0 hay que backfillear ANTES:
--     el INSERT al kardex tiene business_id NOT NULL, y como corre en la misma
--     transacción que el descuento, aborta la creación de pedidos de esos productos.
SELECT count(*) FROM products WHERE business_id IS NULL;
```

```sql
-- (b) Ownership de la RPC vs. de la tabla del kardex.
--     SECURITY DEFINER NO bypassea RLS: corre con los privilegios del OWNER de la
--     función. Lo que evita RLS es que ese owner sea también el owner de la tabla
--     (sin FORCE ROW LEVEL SECURITY) o que tenga BYPASSRLS.
--     Si fn_owner <> tbl_owner, el INSERT de la RPC puede fallar y —por la atomicidad
--     de esa función— tumbar la creación de pedidos entera.
SELECT p.proowner::regrole AS fn_owner, c.relowner::regrole AS tbl_owner, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_proc p, pg_class c
 WHERE p.proname = 'create_order_with_stock' AND c.relname = 'stock_events';
```

```sql
-- (c) create_order_kv tiene que existir con esa firma: la RPC la invoca.
SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'create_order_kv';
```

### 1. Migraciones (PRIMERO, todas, en este orden)

1. `supabase/migrations/20260819_add_product_min_stock.sql`
2. `supabase/migrations/20260819_create_stock_events.sql`
3. `supabase/migrations/20260819_stock_events_add_devolucion.sql`
4. `supabase/migrations/20260819_stock_events_on_order.sql`

**`create_stock_events` tiene que ir antes que `stock_events_on_order`.** No es
cosmético: `CREATE OR REPLACE FUNCTION` **no valida que las tablas del cuerpo existan**
al momento de crearla. Si se aplica al revés, la migración "se aplica bien" sin un solo
error visible y después **todo pedido nuevo falla en runtime** al llegar al INSERT.

`stock_events_add_devolucion` puede ir antes o después de `stock_events_on_order` (son
independientes), pero siempre después de `create_stock_events`, que es la que crea la
tabla y el CHECK que reemplaza.

### 2. Deploy del Edge Function (DESPUÉS de las migraciones)

**Nunca antes.** Si el Edge Function se despliega antes de aplicar
`20260819_add_product_min_stock.sql`, crear y editar productos devuelve **500**: el
backend escribe `min_stock`, una columna que todavía no existiría.

El orden inverso (migraciones aplicadas, Edge viejo todavía corriendo) es inofensivo: las
columnas y la tabla nuevas simplemente no se usan hasta que se despliega.

### 3. Rollback

- **Edge Function**: redesplegar la versión anterior.
- **RPC `create_order_with_stock`**: la versión previa exacta es
  `supabase/migrations/20260629_create_order_with_stock.sql`. Reaplicarla revierte el
  `CREATE OR REPLACE` (deja de escribir el kardex y vuelve a descontar stock a secas).
- **`stock_events` / `min_stock`**: no hace falta revertirlas. Una tabla y una columna
  sin usar no molestan a nadie, y dropearlas perdería el histórico ya acumulado.

## Riesgos conocidos

- **El orden de aplicación no es opcional.** Ver "Procedimiento de aplicación": el peor
  caso de invertirlo es una caída total de la creación de pedidos, y en el caso de las
  migraciones **sin ningún error visible al aplicar**.
- **`create_order_kv` no está versionada en este repo.** La Task 5 hace `CREATE OR REPLACE` de `create_order_with_stock`, que la invoca. Si esa función no existe con esa firma exacta en Supabase, la creación de pedidos se rompe. Verificar en el SQL editor **antes** de aplicar la migración (chequeo pre-vuelo (c)).
- **El acceso de la RPC al kardex depende del ownership, no del `SECURITY DEFINER`.** Ver chequeo pre-vuelo (b). Si el owner de la función no coincide con el de `stock_events`, el INSERT falla y arrastra la creación del pedido.
- **Los eventos empiezan en cero.** Ningún movimiento anterior a la fecha de aplicación se puede reconstruir: el histórico de stock arranca el día que se aplica la Task 1.
- **La categoría se detecta por nombre.** Si la categoría "Distribuidora" se renombra, el panel cae en "Todas las categorías" y el admin la vuelve a elegir a mano (la elección queda guardada). Es intencional: la app es multi-tenant y ningún id fijo sirve para todos los negocios.

## Limitaciones conocidas (documentadas a propósito, NO se arreglan ahora)

- **Ajustes concurrentes se pisan.** `PUT /products/:id` lee el stock actual y escribe un
  valor absoluto calculado en el cliente, sin lock ni update condicional. Dos ajustes
  simultáneos sobre el mismo producto pierden uno, y el kardex queda con dos eventos que
  no cierran contra el saldo final. Es aceptable hoy porque el flujo real es un admin
  ajustando de a un producto por vez; si en algún momento hay varios usuarios ajustando
  en paralelo, hay que mover el ajuste a una RPC con `SELECT ... FOR UPDATE`, como ya hace
  `create_order_with_stock`.
  (Contraste: la RPC **sí** es segura, porque toma `FOR UPDATE` sobre la fila.)
- **`EditOrderDialog` clasifica de más.** Mueve stock por cambios de cantidad de un pedido
  llamando a `PUT /products/:id` **sin `modo`**, así que todo queda registrado como
  `ajuste`. Es consumo o devolución real clasificado de forma imprecisa: **no deja huecos**
  en el kardex (el movimiento se registra), pero mete ruido en la señal de demanda, que es
  justo lo que la feature quiere medir. Arreglarlo requiere que ese diálogo mande el tipo
  correcto (`despacho` / `devolucion`) o que el ajuste pase por el flujo de pedidos.
