# Sincronización de Stock Atómica — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar el oversell de pedidos con un descuento de stock atómico en el servidor y propagar los cambios de stock al resto de usuarios cada ~5 seg.

**Architecture:** Una función Postgres `create_order_with_stock` descuenta stock (con `SELECT ... FOR UPDATE`) y crea el pedido reutilizando `create_order_kv`, todo en una transacción. El cliente (`ordersAPI.create`) deja de validar/descontar stock y solo llama la nueva RPC. `NewOrderForm` refresca productos cada 5 seg para mostrar stock fresco.

**Tech Stack:** PostgreSQL/plpgsql (Supabase), React 18 + TypeScript, supabase-js.

**Nota sobre testing:** el proyecto NO tiene framework de tests automatizados (solo `npm run dev` y `npm run build`). La verificación se hace con: (a) un harness SQL para la lógica de la función, (b) `npm run build` para typecheck de los cambios TS, (c) verificación E2E manual en la app. La lógica de descuento/atomicidad/ilimitados ya fue validada con un harness sobre tabla temporal durante el brainstorming.

**Spec:** `docs/superpowers/specs/2026-06-29-stock-sync-atomico-design.md`

---

## Estructura de archivos

- **Crear** `supabase/migrations/20260629_create_order_with_stock.sql` — la función Postgres atómica (también se corre a mano en el SQL Editor de Supabase, porque las migraciones de este repo no se aplican automáticamente).
- **Modificar** `src/utils/api.tsx` (`ordersAPI.create`, ~líneas 236-357) — quitar validación/descuento client-side, llamar la nueva RPC, parsear el error `STOCK_INSUFICIENTE`.
- **Modificar** `src/components/NewOrderForm.tsx` (`loadProducts` ~líneas 121-161, efectos ~líneas 104-108) — refresco silencioso de productos cada 5 seg.

Dependencia existente (no se modifica): la función `create_order_kv` ya existe en Supabase e inserta en las tablas `orders` y `order_items`.

---

## Task 1: Función Postgres `create_order_with_stock`

**Files:**
- Create: `supabase/migrations/20260629_create_order_with_stock.sql`

- [ ] **Step 1: Escribir la migración con la función**

Crear `supabase/migrations/20260629_create_order_with_stock.sql` con este contenido exacto:

```sql
-- supabase/migrations/20260629_create_order_with_stock.sql
-- Crea el pedido + descuenta stock de forma atómica en una sola transacción.
-- El descuento ocurre antes de crear el pedido; si falta stock, se revierte todo.
-- Reutiliza create_order_kv para la inserción en orders/order_items (no duplica lógica).

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

    SELECT id, name, stock, unlimited_stock, track_stock
      INTO prod
      FROM products
      WHERE id = pid
      FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;  -- producto inexistente: no bloquea (igual que el cliente actual)
    END IF;

    IF prod.unlimited_stock OR NOT prod.track_stock OR prod.stock = -1 THEN
      CONTINUE;  -- ilimitado: nunca se toca
    END IF;

    IF prod.stock < qty THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', prod.name;
    END IF;

    UPDATE products SET stock = stock - qty WHERE id = pid;
  END LOOP;

  -- 2. Crear el pedido reutilizando la función existente (misma transacción)
  PERFORM create_order_kv(order_id, new_data);
END;
$function$;
```

- [ ] **Step 2: Aplicar la función en Supabase**

Copiar el contenido del archivo en el SQL Editor de Supabase y correrlo. Debe terminar con "Success. No rows returned".

- [ ] **Step 3: Verificar que la función existe**

Correr en el SQL Editor:

```sql
SELECT proname FROM pg_proc WHERE proname = 'create_order_with_stock';
```

Esperado: una fila con `create_order_with_stock`.

- [ ] **Step 4: Test de regresión de la lógica (harness sobre tabla temporal)**

Correr este harness en el SQL Editor. Replica la lógica de descuento/atomicidad/ilimitados de la función sobre una tabla temporal (no toca datos reales) y devuelve los resultados como filas:

```sql
CREATE OR REPLACE FUNCTION test_stock_demo()
RETURNS TABLE(test text, resultado text) LANGUAGE plpgsql AS $$
DECLARE
  v_emp numeric; v_caf numeric;
  r record; item jsonb; qty numeric; items jsonb;
BEGIN
  CREATE TEMP TABLE tmp_p (
    id uuid, name text, stock numeric,
    unlimited_stock boolean, track_stock boolean
  ) ON COMMIT DROP;

  INSERT INTO tmp_p (id, name, stock, unlimited_stock, track_stock) VALUES
    ('11111111-1111-1111-1111-111111111111','Empanada',5,false,true),
    ('22222222-2222-2222-2222-222222222222','Cafe',0,true,false);

  -- TEST 1: Empanada -2 (->3); Cafe pedido x10 pero ilimitado -> 0
  items := '[
    {"id":"11111111-1111-1111-1111-111111111111","quantity":2},
    {"id":"22222222-2222-2222-2222-222222222222","quantity":10}
  ]';
  FOR item IN SELECT value FROM jsonb_array_elements(items) AS t(value) LOOP
    qty := (item->>'quantity')::numeric;
    SELECT * INTO r FROM tmp_p WHERE id = (item->>'id')::uuid FOR UPDATE;
    IF r.unlimited_stock OR NOT r.track_stock OR r.stock = -1 THEN CONTINUE; END IF;
    IF r.stock < qty THEN RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', r.name; END IF;
    UPDATE tmp_p SET stock = stock - qty WHERE id = r.id;
  END LOOP;
  SELECT stock INTO v_emp FROM tmp_p WHERE name = 'Empanada';
  SELECT stock INTO v_caf FROM tmp_p WHERE name = 'Cafe';
  test := 'TEST 1'; resultado := format('Empanada=%s (esp 3), Cafe=%s (esp 0)', v_emp, v_caf); RETURN NEXT;

  -- TEST 2 (atomicidad): Empanada -2 (3->1) luego -5 (falla) -> revertir a 3
  BEGIN
    items := '[
      {"id":"11111111-1111-1111-1111-111111111111","quantity":2},
      {"id":"11111111-1111-1111-1111-111111111111","quantity":5}
    ]';
    FOR item IN SELECT value FROM jsonb_array_elements(items) AS t(value) LOOP
      qty := (item->>'quantity')::numeric;
      SELECT * INTO r FROM tmp_p WHERE id = (item->>'id')::uuid FOR UPDATE;
      IF r.unlimited_stock OR NOT r.track_stock OR r.stock = -1 THEN CONTINUE; END IF;
      IF r.stock < qty THEN RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', r.name; END IF;
      UPDATE tmp_p SET stock = stock - qty WHERE id = r.id;
    END LOOP;
    test := 'TEST 2'; resultado := 'FALLO: no debio permitirlo'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'TEST 2'; resultado := 'OK rechazado: ' || SQLERRM; RETURN NEXT;
  END;
  SELECT stock INTO v_emp FROM tmp_p WHERE name = 'Empanada';
  test := 'TEST 2 stock'; resultado := format('Empanada=%s (esp 3, sin descuento parcial)', v_emp); RETURN NEXT;

  DROP TABLE tmp_p;
  RETURN;
END $$;

SELECT * FROM test_stock_demo();

DROP FUNCTION test_stock_demo();
```

Esperado (3 filas):
- `TEST 1` → `Empanada=3 (esp 3), Cafe=0 (esp 0)`
- `TEST 2` → `OK rechazado: STOCK_INSUFICIENTE:Empanada`
- `TEST 2 stock` → `Empanada=3 (esp 3, sin descuento parcial)`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260629_create_order_with_stock.sql
git commit -m "feat: funcion create_order_with_stock para descuento atomico de stock"
```

---

## Task 2: Rutear `ordersAPI.create` por la nueva RPC

**Files:**
- Modify: `src/utils/api.tsx` (`ordersAPI.create`, ~líneas 252-357)

- [ ] **Step 1: Actualizar el comentario inicial**

En `src/utils/api.tsx`, reemplazar el comentario de la línea ~252:

Buscar:
```ts
    // START: Client-side creation to bypass backend limitations (Unlimited Stock Bug)
```

Reemplazar por:
```ts
    // Creación de pedido vía RPC create_order_with_stock: descuenta stock de forma
    // atómica en el servidor (FOR UPDATE) y crea el pedido en la misma transacción.
```

- [ ] **Step 2: Quitar la validación y el descuento de stock del cliente**

Buscar el bloque (~líneas 267-302):
```ts
    // 1. Fetch Fresh Products for Stock Check
    // We assume getAll returns all products. If pagination is involved, we might need a specific getByIds or search.
    // For now, trusting getAll is sufficient as per usage.
    const productsResponse = await productsAPI.getAll(token);
    const freshProducts = Array.isArray(productsResponse) ? productsResponse : (productsResponse as any).data || [];

    const stockUpdates: Promise<any>[] = [];

    // 2. Validate & Prepare Stock Updates
    for (const item of orderData.products) {
      const product = freshProducts.find((p: any) => p.id === item.productId);

      if (!product) {
        // Fallback: If product not found in fresh list (maybe new?), allow it but warn? 
        // Or strict check. Strict check is safer.
        console.warn(`Producto ${item.name} (${item.productId}) no encontrado en lista fresca.`);
        continue;
      }

      const currentStock = Number(product.stock);

      // Check for unlimited stock (-1 or unlimitedStock flag or trackStock === false)
      if (currentStock === -1 || product.unlimitedStock === true || product.trackStock === false) {
        continue; // Skip stock check/update
      }

      if (currentStock < item.quantity) {
        throw new Error(`Stock insuficiente para "${item.name}". Disponible: ${currentStock}, Solicitado: ${item.quantity}`);
      }

      const newStock = Math.max(0, currentStock - item.quantity);
      stockUpdates.push(productsAPI.update(token, product.id, { stock: newStock }));
    }

    // 3. Execute Stock Updates
    await Promise.all(stockUpdates);
```

Reemplazar por (se mantiene el fetch SOLO para enriquecer con `productionAreaId`; el descuento ya no se hace acá):
```ts
    // Traer productos frescos solo para enriquecer cada item con su productionAreaId.
    // El descuento de stock NO se hace en el cliente: lo hace atómicamente la
    // función create_order_with_stock en el servidor.
    const productsResponse = await productsAPI.getAll(token);
    const freshProducts = Array.isArray(productsResponse) ? productsResponse : (productsResponse as any).data || [];
```

- [ ] **Step 3: Cambiar la llamada RPC y parsear el error de stock**

Buscar el bloque (~líneas 345-356):
```ts
    // 5. Save Order via RPC
    const { error } = await supabase.rpc('create_order_kv', {
      order_id: newOrderId,
      new_data: newOrder
    });

    if (error) {
      console.error('RPC Error creating order:', error);
      throw new Error(`Error guardando pedido: ${error.message}`);
    }

    return newOrder;
```

Reemplazar por:
```ts
    // 5. Crear pedido + descontar stock atómicamente vía RPC
    const { error } = await supabase.rpc('create_order_with_stock', {
      order_id: newOrderId,
      new_data: newOrder
    });

    if (error) {
      console.error('RPC Error creating order:', error);
      const stockMatch = (error.message || '').match(/STOCK_INSUFICIENTE:(.+)/);
      if (stockMatch) {
        throw new Error(`Stock insuficiente para "${stockMatch[1].trim()}"`);
      }
      throw new Error(`Error guardando pedido: ${error.message}`);
    }

    return newOrder;
```

- [ ] **Step 4: Typecheck con build**

Run: `npm run build`
Expected: build exitoso, sin errores de TypeScript. (Si `stockUpdates` o variables quedaron sin usar, el build lo marca — revisar que el bloque viejo se haya quitado entero.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/api.tsx
git commit -m "feat: rutear creacion de pedido por create_order_with_stock (descuento atomico)"
```

---

## Task 3: Refresco silencioso de productos en `NewOrderForm`

**Files:**
- Modify: `src/components/NewOrderForm.tsx` (`loadProducts` ~líneas 121-161; efecto de montaje ~líneas 104-108)

- [ ] **Step 1: Agregar parámetro `silent` a `loadProducts`**

Buscar la firma y el cuerpo de `loadProducts` (~líneas 121-161):
```ts
  const loadProducts = async () => {
    try {
      setIsLoadingProducts(true);
      console.log('🟢 [NewOrderForm] Loading products...');
      const apiProducts = await productsAPI.getAll(accessToken);
      console.log('🟢 [NewOrderForm] Products received:', apiProducts?.length || 0, 'products');
```

Reemplazar el inicio por (agrega `silent = false` y evita el spinner cuando es silencioso):
```ts
  const loadProducts = async (silent = false) => {
    try {
      if (!silent) setIsLoadingProducts(true);
      console.log('🟢 [NewOrderForm] Loading products...', silent ? '(silent)' : '');
      const apiProducts = await productsAPI.getAll(accessToken);
      console.log('🟢 [NewOrderForm] Products received:', apiProducts?.length || 0, 'products');
```

- [ ] **Step 2: Silenciar toasts y limpieza en el catch/finally**

Buscar el bloque final de `loadProducts` (~líneas 148-161):
```ts
      setProducts(transformedProducts);

      // Show message if no products
      if (transformedProducts.length === 0) {
        toast.info('No hay productos disponibles. El administrador debe crear productos primero.');
      }
    } catch (error) {
      console.error('❌ [NewOrderForm] Error loading products:', error);
      toast.error('Error al cargar productos');
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  };
```

Reemplazar por (en modo silencioso no muestra toasts ni borra la lista previa):
```ts
      setProducts(transformedProducts);

      // Show message if no products (solo en carga visible)
      if (!silent && transformedProducts.length === 0) {
        toast.info('No hay productos disponibles. El administrador debe crear productos primero.');
      }
    } catch (error) {
      console.error('❌ [NewOrderForm] Error loading products:', error);
      if (!silent) {
        toast.error('Error al cargar productos');
        setProducts([]);
      }
    } finally {
      if (!silent) setIsLoadingProducts(false);
    }
  };
```

- [ ] **Step 3: Agregar el intervalo de refresco cada 5 seg**

Buscar el efecto de montaje (~líneas 104-108):
```ts
  // Load products from API
  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);
```

Reemplazar por (agrega un intervalo que refresca productos en silencio cada 5 seg):
```ts
  // Load products from API
  useEffect(() => {
    loadProducts();
    loadCategories();
  }, []);

  // Refrescar productos cada 5 seg para reflejar cambios de stock de otros usuarios
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadProducts(true);
    }, 5000);
    return () => clearInterval(intervalId);
  }, [accessToken]);
```

- [ ] **Step 4: Typecheck con build**

Run: `npm run build`
Expected: build exitoso, sin errores de TypeScript.

- [ ] **Step 5: Commit**

```bash
git add src/components/NewOrderForm.tsx
git commit -m "feat: refrescar stock cada 5s en NewOrderForm para reflejar cambios de otros usuarios"
```

---

## Task 4: Verificación E2E manual

**Files:** ninguno (verificación en la app corriendo).

- [ ] **Step 1: Levantar la app**

Run: `npm run dev`
Abrir la app en el navegador e iniciar sesión.

- [ ] **Step 2: Pedido normal descuenta stock**

Elegir un producto con stock controlado (ej. stock = 5), pedir 2 unidades y confirmar el pedido. Luego, en Gestión de Productos (o en el SQL Editor con `SELECT name, stock FROM products WHERE id = '<id>'`), verificar que el stock quedó en 3.

- [ ] **Step 3: Producto ilimitado no se descuenta**

Pedir cualquier cantidad de un producto ilimitado (`unlimited_stock = true` o `track_stock = false`). Confirmar el pedido. Verificar que su stock NO cambió.

- [ ] **Step 4: Stock insuficiente rechaza el pedido**

Tomar un producto con stock bajo (ej. stock = 1) e intentar pedir más (ej. 5). Al confirmar, debe aparecer el mensaje `Stock insuficiente para "<nombre>"` y NO debe crearse el pedido (verificar que no aparece en la lista de pedidos y que el stock sigue en 1).

- [ ] **Step 5: Propagación de stock entre usuarios (≤5 seg)**

Abrir la app en dos sesiones/navegadores con la pantalla de nuevo pedido. En la sesión A, cambiar el stock de un producto desde Gestión de Productos (o crear un pedido). En la sesión B, sin recargar, verificar que el stock mostrado se actualiza en ≤5 seg.

- [ ] **Step 6: Confirmar que no quedó la función de prueba**

Run en el SQL Editor:
```sql
SELECT proname FROM pg_proc WHERE proname = 'test_stock_demo';
```
Esperado: 0 filas (la función de prueba del Task 1 se borró con `DROP FUNCTION`).
