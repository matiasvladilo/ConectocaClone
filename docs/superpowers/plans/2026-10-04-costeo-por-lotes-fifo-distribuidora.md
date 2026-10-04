# Costeo por lotes (FIFO) para productos de Distribuidora — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el precio de venta de los productos comprados a un proveedor (sin receta, categoría Distribuidora) se actualice solo al costo del lote más viejo que todavía tiene stock, consumiendo los lotes en orden de llegada (FIFO).

**Architecture:** Tablas nuevas `product_lots` (un lote = una compra) y `order_item_lots` (de qué lote salió cada unidad vendida). Toda la aritmética de consumo FIFO vive en funciones de Postgres (`producto_usa_lotes`, `reponer_lote_fifo`, `consumir_lotes_fifo`) porque el descuento de stock real ocurre dentro de la RPC `create_order_with_stock`, en una transacción con `FOR UPDATE` — si la lógica de lotes viviera en TypeScript quedaría fuera de ese lock y dos ventas simultáneas podrían dejar un lote negativo. El backend (Edge Function) y el frontend son finos: piden costo al reponer, muestran el precio como solo lectura, y sustituyen `price × stock` por la suma de lotes en el panel de valor de inventario.

**Tech Stack:** Supabase (Postgres + Edge Function en Deno/Hono), React + TypeScript, `node:test` para utilidades puras.

## Global Constraints

- Solo entran en costeo por lotes los productos **sin receta** (`product_ingredients` vacío) que pertenecen a la categoría "Distribuidora" **o una subcategoría directa suya** — mismo criterio (un solo nivel, no recursivo) que ya usa `idsDeCategoriaConHijas` en `src/utils/categoryTree.ts`.
- El consumo es estrictamente FIFO: se agota primero el lote con `created_at` más antiguo que tenga `cantidad_restante > 0`.
- `products.price`, para estos productos, deja de ser editable a mano: lo recalculan las funciones de Postgres.
- Toda función nueva `SECURITY DEFINER` lleva `SET search_path = public` (convención ya establecida en `2026-09-07-stock-una-sola-via-design.md`, aunque las funciones viejas del repo no la tengan).
- No hay framework de tests de componentes. `npm test` corre `node --test src/utils/*.test.ts`. Todo lo demás (Edge Function, SQL, componentes React) se verifica manualmente con evidencia (consulta SQL directa o navegador).
- Proyecto Supabase real: `conectocadev` (id `xxmiujtywnnlqmekakzq`). Es el entorno de desarrollo activo, pero tiene datos reales (427 productos, 5166 pedidos) — las verificaciones SQL de este plan crean y borran un producto de prueba propio; no se tocan productos existentes.
- Spec de referencia: [`docs/superpowers/specs/2026-10-04-costeo-por-lotes-fifo-distribuidora-design.md`](../specs/2026-10-04-costeo-por-lotes-fifo-distribuidora-design.md).

---

## Hallazgo importante antes de empezar: `EditOrderDialog` queda fuera de este plan

Durante el diseño se confirmó que la **creación** de un pedido (`create_order_with_stock`, usada por `NewOrderForm`) es el único camino que este plan cubre para el despacho. La **edición** de la cantidad de un pedido ya creado (`EditOrderDialog.tsx`) ajusta `products.stock` por un camino distinto (delta directo sobre el producto, sin pasar por `create_order_with_stock`), y ese camino no queda cubierto por `consumir_lotes_fifo`/`reponer_lote_fifo` en este plan. Si se edita la cantidad de un producto de Distribuidora en un pedido ya creado, el stock se ajusta correctamente pero el lote consumido/devuelto puede desincronizarse del costeo.

Es una ampliación de alcance real respecto del spec (que tampoco la mencionaba), no una tarea de este plan. Queda anotado para decidir aparte: o se trata como seguimiento, o se agrega como tarea 17 antes de implementar. **No se resuelve en las tareas de abajo.**

---

### Task 1: Esquema — tablas `product_lots`, `order_item_lots` y tipo `consumo_lote`

**Files:**
- Create: `supabase/migrations/20261004_a_product_lots_schema.sql`

**Interfaces:**
- Produces: tabla `public.product_lots(id, business_id, product_id, costo_unitario, cantidad_inicial, cantidad_restante, origen, stock_event_id, created_at)`; tabla `public.order_item_lots(id, order_item_id, lot_id, cantidad, costo_unitario, created_at)`; tipo compuesto `public.consumo_lote(product_id, lot_id, cantidad, costo_unitario)`. Todas las tareas siguientes dependen de esto.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20261004_a_product_lots_schema.sql
-- Costeo por lotes (FIFO) para productos de Distribuidora sin receta.
-- Ver docs/superpowers/specs/2026-10-04-costeo-por-lotes-fifo-distribuidora-design.md

CREATE TABLE IF NOT EXISTS public.product_lots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  costo_unitario    numeric NOT NULL CHECK (costo_unitario >= 0),
  cantidad_inicial  integer NOT NULL CHECK (cantidad_inicial >= 0),
  cantidad_restante integer NOT NULL CHECK (cantidad_restante >= 0),
  -- reposicion = compra real cargada por el usuario
  -- ajuste     = lote "fantasma" (ajuste al alza sin compra registrada, o
  --              faltante cubierto automáticamente cuando los lotes no
  --              alcanzan para un consumo)
  -- migracion  = lote inicial creado al activar la feature, a partir del
  --              stock y price que el producto ya tenía
  origen            text NOT NULL CHECK (origen IN ('reposicion', 'ajuste', 'migracion')),
  -- Referencia a la reposición que originó el lote, para cruzar con el
  -- kardex. Nullable: un lote de origen 'migracion' no tiene stock_event.
  stock_event_id    uuid REFERENCES public.stock_events(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- La consulta que importa: "el lote más viejo con stock de este producto".
CREATE INDEX IF NOT EXISTS product_lots_fifo_idx
  ON public.product_lots (product_id, created_at ASC)
  WHERE cantidad_restante > 0;

CREATE INDEX IF NOT EXISTS product_lots_business_idx
  ON public.product_lots (business_id);

-- RLS activo sin políticas = nadie accede con la anon key. Mismo patrón que
-- stock_events: solo el Edge Function (service_role) y las RPCs
-- SECURITY DEFINER tocan esta tabla.
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;

-- De qué lote salió cada unidad vendida. order_item_id SÍ puede ser FK real
-- (a diferencia de stock_events.product_id): si se borra el pedido, se borra
-- el order_item, y con él esta fila — es historia que solo tiene sentido
-- junto al pedido que la generó.
CREATE TABLE IF NOT EXISTS public.order_item_lots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id   uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  -- RESTRICT y no CASCADE: un lote con historia de ventas no se borra solo
  -- porque sí. Esta app no tiene una ruta para borrar lotes a mano (ver
  -- "Fuera de alcance" del spec), así que en la práctica nunca se dispara.
  lot_id          uuid NOT NULL REFERENCES public.product_lots(id) ON DELETE RESTRICT,
  cantidad        integer NOT NULL CHECK (cantidad > 0),
  -- Snapshot: igual razón que order_items.product_name/price ya son
  -- snapshots (comentario de la tabla real en Supabase). La historia no se
  -- tiene que mover si el lote cambia después.
  costo_unitario  numeric NOT NULL CHECK (costo_unitario >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_item_lots_order_item_idx
  ON public.order_item_lots (order_item_id);

CREATE INDEX IF NOT EXISTS order_item_lots_lot_idx
  ON public.order_item_lots (lot_id);

ALTER TABLE public.order_item_lots ENABLE ROW LEVEL SECURITY;

-- Tipo de retorno para consumir_lotes_fifo() y para acumular el detalle
-- dentro de create_order_with_stock() antes de que existan los order_items.
CREATE TYPE public.consumo_lote AS (
  product_id      uuid,
  lot_id          uuid,
  cantidad        integer,
  costo_unitario  numeric
);
```

- [ ] **Step 2: Aplicar la migración**

Con el MCP de Supabase (`apply_migration`, `project_id: "xxmiujtywnnlqmekakzq"`, `name: "20261004_a_product_lots_schema"`) o `supabase db push` si se trabaja con el CLI linkeado localmente.

- [ ] **Step 3: Verificar en base**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('product_lots', 'order_item_lots');

SELECT typname FROM pg_type WHERE typname = 'consumo_lote';
```

Expected: las dos tablas y el tipo existen.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261004_a_product_lots_schema.sql
git commit -m "feat: esquema de lotes FIFO para costeo de Distribuidora"
```

---

### Task 2: Función `producto_usa_lotes` (alcance)

**Files:**
- Create: `supabase/migrations/20261004_b_producto_usa_lotes.sql`

**Interfaces:**
- Consumes: tablas `products`, `categories`, `product_ingredients` (ya existentes).
- Produces: `public.producto_usa_lotes(p_product_id uuid) RETURNS boolean`. La usan las Tasks 3, 4, 5, 7 y 8.

- [ ] **Step 1: Escribir la migración**

Replica en SQL el mismo criterio que `idsDeCategoriaConHijas`/`elegirCategoriaInicial` en `src/utils/categoryTree.ts`: la categoría "Distribuidora" se detecta por nombre (substring, sin distinguir mayúsculas), y el alcance incluye esa categoría **y sus hijas directas** — no es recursivo a más niveles.

```sql
-- supabase/migrations/20261004_b_producto_usa_lotes.sql
CREATE OR REPLACE FUNCTION public.producto_usa_lotes(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      p.category_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM categories c
        WHERE c.business_id = p.business_id
          AND c.id = p.category_id
          AND (
            lower(trim(c.name)) LIKE '%distribuidora%'
            OR EXISTS (
              SELECT 1 FROM categories padre
              WHERE padre.id = c.parent_id
                AND padre.business_id = p.business_id
                AND lower(trim(padre.name)) LIKE '%distribuidora%'
            )
          )
      )
      AND NOT EXISTS (SELECT 1 FROM product_ingredients pi WHERE pi.product_id = p.id)
    FROM products p
    WHERE p.id = p_product_id
  ), false);
$$;
```

- [ ] **Step 2: Aplicar la migración** (igual mecanismo que Task 1, `name: "20261004_b_producto_usa_lotes"`)

- [ ] **Step 3: Verificar en base con datos reales (solo lectura, sin modificar nada)**

```sql
-- Buscar la categoría Distribuidora real para probar contra ella
SELECT id, name, business_id FROM categories WHERE lower(name) LIKE '%distribuidora%' LIMIT 3;

-- Tomar un product_id de esa categoría y uno de otra, y comparar:
SELECT id, name, category_id, producto_usa_lotes(id) AS en_lotes
FROM products
WHERE category_id = '<uuid de la categoría Distribuidora encontrada arriba>'
LIMIT 5;
```

Expected: los productos sin receta de esa categoría dan `true`; si alguno de esos tiene filas en `product_ingredients`, da `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261004_b_producto_usa_lotes.sql
git commit -m "feat: función SQL de alcance para costeo por lotes"
```

---

### Task 3: Función `reponer_lote_fifo` (entra mercadería)

**Files:**
- Create: `supabase/migrations/20261004_c_reponer_lote_fifo.sql`

**Interfaces:**
- Consumes: `public.producto_usa_lotes(uuid) RETURNS boolean` (Task 2), tabla `product_lots` (Task 1).
- Produces: `public.reponer_lote_fifo(p_product_id uuid, p_cantidad integer, p_costo_unitario numeric, p_origen text DEFAULT 'reposicion', p_stock_event_id uuid DEFAULT NULL) RETURNS public.product_lots`. La usan las Tasks 7 (reposición y ajuste al alza) y 6 (fallback de faltante dentro de `consumir_lotes_fifo`... en realidad esa la llama Task 4 directamente, ver abajo).

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20261004_c_reponer_lote_fifo.sql
CREATE OR REPLACE FUNCTION public.reponer_lote_fifo(
  p_product_id uuid,
  p_cantidad integer,
  p_costo_unitario numeric,
  p_origen text DEFAULT 'reposicion',
  p_stock_event_id uuid DEFAULT NULL
)
RETURNS public.product_lots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_lote public.product_lots;
  v_hay_lote_activo boolean;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  IF NOT public.producto_usa_lotes(p_product_id) THEN
    RAISE EXCEPTION 'PRODUCTO_FUERA_DE_ALCANCE:%', p_product_id;
  END IF;

  SELECT business_id INTO v_business_id FROM products WHERE id = p_product_id FOR UPDATE;

  -- El lote nuevo se va al final de la fila: si ya había un lote con stock,
  -- el precio de venta no cambia todavía (es el comportamiento pedido: 3
  -- viejas a $1000, entran 5 a $1200, el precio sigue en $1000).
  SELECT EXISTS (
    SELECT 1 FROM product_lots WHERE product_id = p_product_id AND cantidad_restante > 0
  ) INTO v_hay_lote_activo;

  INSERT INTO product_lots (
    business_id, product_id, costo_unitario, cantidad_inicial, cantidad_restante, origen, stock_event_id
  ) VALUES (
    v_business_id, p_product_id, p_costo_unitario, p_cantidad, p_cantidad, p_origen, p_stock_event_id
  )
  RETURNING * INTO v_lote;

  IF NOT v_hay_lote_activo THEN
    UPDATE products SET price = p_costo_unitario WHERE id = p_product_id;
  END IF;

  RETURN v_lote;
END;
$$;
```

- [ ] **Step 2: Aplicar la migración** (`name: "20261004_c_reponer_lote_fifo"`)

- [ ] **Step 3: Verificar en base con un producto de prueba (se crea y se borra en el mismo bloque, no toca datos reales)**

```sql
DO $$
DECLARE
  v_business_id uuid;
  v_categoria_id uuid;
  v_product_id uuid;
  v_lote1 record;
  v_lote2 record;
BEGIN
  SELECT business_id, id INTO v_business_id, v_categoria_id
  FROM categories WHERE lower(name) LIKE '%distribuidora%' LIMIT 1;

  INSERT INTO products (business_id, name, price, stock, category_id)
  VALUES (v_business_id, '__TEST_LOTES__', 0, 0, v_categoria_id)
  RETURNING id INTO v_product_id;

  SELECT * INTO v_lote1 FROM reponer_lote_fifo(v_product_id, 3, 1000);
  ASSERT (SELECT price FROM products WHERE id = v_product_id) = 1000,
    'el primer lote debe activar el precio';

  SELECT * INTO v_lote2 FROM reponer_lote_fifo(v_product_id, 5, 1200);
  ASSERT (SELECT price FROM products WHERE id = v_product_id) = 1000,
    'el segundo lote NO debe cambiar el precio mientras el primero tenga stock';

  RAISE NOTICE 'OK: lote1=% lote2=%', v_lote1.id, v_lote2.id;

  DELETE FROM products WHERE id = v_product_id; -- cascada borra los lotes
END $$;
```

Expected: `NOTICE: OK: ...` sin que salte ningún `ASSERT`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261004_c_reponer_lote_fifo.sql
git commit -m "feat: función SQL para crear lotes al reponer stock"
```

---

### Task 4: Función `consumir_lotes_fifo` (despacho, merma, ajuste a la baja)

**Files:**
- Create: `supabase/migrations/20261004_d_consumir_lotes_fifo.sql`

**Interfaces:**
- Consumes: `producto_usa_lotes` (Task 2), tabla `product_lots` (Task 1), tipo `consumo_lote` (Task 1).
- Produces: `public.consumir_lotes_fifo(p_product_id uuid, p_cantidad integer) RETURNS TABLE(lot_id uuid, cantidad integer, costo_unitario numeric)`. La usan las Tasks 5 (despacho, dentro de la RPC de pedidos) y 7 (merma / ajuste a la baja).

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20261004_d_consumir_lotes_fifo.sql
CREATE OR REPLACE FUNCTION public.consumir_lotes_fifo(p_product_id uuid, p_cantidad integer)
RETURNS TABLE(lot_id uuid, cantidad integer, costo_unitario numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restante integer := p_cantidad;
  v_lote record;
  v_tomar integer;
  v_ultimo_costo numeric;
  v_business_id uuid;
  v_lote_fantasma_id uuid;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  IF NOT public.producto_usa_lotes(p_product_id) THEN
    RAISE EXCEPTION 'PRODUCTO_FUERA_DE_ALCANCE:%', p_product_id;
  END IF;

  SELECT business_id INTO v_business_id FROM products WHERE id = p_product_id;

  FOR v_lote IN
    SELECT id, cantidad_restante, costo_unitario
    FROM product_lots
    WHERE product_id = p_product_id AND cantidad_restante > 0
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;

    v_tomar := LEAST(v_lote.cantidad_restante, v_restante);

    UPDATE product_lots
      SET cantidad_restante = cantidad_restante - v_tomar
      WHERE id = v_lote.id;

    lot_id := v_lote.id;
    cantidad := v_tomar;
    costo_unitario := v_lote.costo_unitario;
    RETURN NEXT;

    v_restante := v_restante - v_tomar;
    v_ultimo_costo := v_lote.costo_unitario;
  END LOOP;

  -- Los lotes no alcanzaron para cubrir la cantidad pedida (desincronización
  -- entre products.stock y la suma de lotes). En vez de bloquear la venta,
  -- se cubre el resto como un lote fantasma al último costo conocido —mismo
  -- criterio que un ajuste al alza— y queda un WARNING para poder auditarlo.
  IF v_restante > 0 THEN
    IF v_ultimo_costo IS NULL THEN
      SELECT price INTO v_ultimo_costo FROM products WHERE id = p_product_id;
    END IF;

    INSERT INTO product_lots (
      business_id, product_id, costo_unitario, cantidad_inicial, cantidad_restante, origen
    ) VALUES (
      v_business_id, p_product_id, v_ultimo_costo, v_restante, 0, 'ajuste'
    )
    RETURNING id INTO v_lote_fantasma_id;

    lot_id := v_lote_fantasma_id;
    cantidad := v_restante;
    costo_unitario := v_ultimo_costo;
    RETURN NEXT;

    RAISE WARNING 'LOTES_INSUFICIENTES: producto % necesitó % unidades de más al costo %',
      p_product_id, v_restante, v_ultimo_costo;
  END IF;

  -- Precio vigente = costo del lote más viejo que sigue con stock. Si no
  -- queda ninguno, products.price conserva el último valor conocido.
  UPDATE products
    SET price = (
      SELECT costo_unitario FROM product_lots
      WHERE product_id = p_product_id AND cantidad_restante > 0
      ORDER BY created_at ASC
      LIMIT 1
    )
    WHERE id = p_product_id
      AND EXISTS (
        SELECT 1 FROM product_lots WHERE product_id = p_product_id AND cantidad_restante > 0
      );
END;
$$;
```

- [ ] **Step 2: Aplicar la migración** (`name: "20261004_d_consumir_lotes_fifo"`)

- [ ] **Step 3: Verificar en base — reproducir el ejemplo exacto del usuario (3 a $1000, +5 a $1200, consumir 2, consumir 3 más cruzando lotes)**

```sql
DO $$
DECLARE
  v_business_id uuid;
  v_categoria_id uuid;
  v_product_id uuid;
  v_fila record;
  v_total numeric := 0;
BEGIN
  SELECT business_id, id INTO v_business_id, v_categoria_id
  FROM categories WHERE lower(name) LIKE '%distribuidora%' LIMIT 1;

  INSERT INTO products (business_id, name, price, stock, category_id)
  VALUES (v_business_id, '__TEST_LOTES__', 0, 8, v_categoria_id)
  RETURNING id INTO v_product_id;

  PERFORM reponer_lote_fifo(v_product_id, 3, 1000);
  PERFORM reponer_lote_fifo(v_product_id, 5, 1200);

  -- Consumir 2: no debería cruzar lotes, precio sigue en 1000
  PERFORM consumir_lotes_fifo(v_product_id, 2);
  ASSERT (SELECT price FROM products WHERE id = v_product_id) = 1000, 'sigue en el lote viejo';

  -- Consumir 3 más: cruza — 1 a 1000 + 2 a 1200 = 3400
  FOR v_fila IN SELECT * FROM consumir_lotes_fifo(v_product_id, 3) LOOP
    v_total := v_total + v_fila.cantidad * v_fila.costo_unitario;
  END LOOP;
  ASSERT v_total = 3400, format('total esperado 3400, dio %', v_total);
  ASSERT (SELECT price FROM products WHERE id = v_product_id) = 1200, 'ahora debe estar en el lote nuevo';

  RAISE NOTICE 'OK: cruce de lotes da total %', v_total;

  DELETE FROM products WHERE id = v_product_id;
END $$;
```

Expected: `NOTICE: OK: cruce de lotes da total 3400`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261004_d_consumir_lotes_fifo.sql
git commit -m "feat: función SQL de consumo FIFO de lotes"
```

---

### Task 5: `create_order_with_stock` consume lotes al despachar un pedido

**Files:**
- Create: `supabase/migrations/20261004_e_create_order_with_stock_fifo.sql`

**Interfaces:**
- Consumes: `producto_usa_lotes`, `consumir_lotes_fifo` (Tasks 2, 4); tabla `order_item_lots` (Task 1); función existente `create_order_kv` (no se toca).
- Produces: redefine `public.create_order_with_stock(order_id text, new_data jsonb)` — misma firma, mismos llamadores (`src/utils/api.tsx:353`), comportamiento ampliado.

Este es el punto más delicado del plan: el consumo de lotes tiene que pasar **antes** de `create_order_kv` (para tener el lock y el descuento de stock), pero el reparto hacia `order_item_lots` tiene que pasar **después** (porque hasta que `create_order_kv` corre no existen filas en `order_items` a las que referenciar). La solución es acumular el detalle de consumo en una variable de tipo `consumo_lote[]` durante el paso 1, y usarla recién en el paso 3.

- [ ] **Step 1: Leer la definición actual antes de tocarla**

```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'create_order_with_stock';
```

Confirmar que coincide con `supabase/migrations/20260819_stock_events_on_order.sql` (si alguien la tocó desde entonces sin dejar migración, hay que partir de la versión real, no de la del archivo).

- [ ] **Step 2: Escribir la migración**

```sql
-- supabase/migrations/20261004_e_create_order_with_stock_fifo.sql
CREATE OR REPLACE FUNCTION public.create_order_with_stock(order_id text, new_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  item jsonb;
  prod record;
  qty  numeric;
  pid  uuid;
  v_order_id uuid := order_id::uuid;
  v_consumo record;
  v_consumos public.consumo_lote[] := ARRAY[]::public.consumo_lote[];
  v_item_id uuid;
  v_product_id uuid;
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

    SELECT id, name, stock, unlimited_stock, track_stock, business_id
      INTO prod
      FROM products
      WHERE id = pid
      FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF prod.unlimited_stock OR NOT prod.track_stock OR prod.stock = -1 THEN
      CONTINUE;
    END IF;

    IF prod.stock < qty THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', prod.name;
    END IF;

    UPDATE products SET stock = stock - qty WHERE id = pid;

    IF qty > 0 THEN
      INSERT INTO public.stock_events (
        business_id, product_id, product_name, type, quantity, stock_after, order_id, created_by
      ) VALUES (
        prod.business_id, pid, prod.name, 'despacho', qty, prod.stock - qty, v_order_id, auth.uid()
      );

      -- Costeo por lotes: solo para productos de Distribuidora sin receta.
      -- Se consume ACÁ, en la misma transacción y bajo el mismo FOR UPDATE
      -- que ya protege el descuento de stock de arriba.
      IF public.producto_usa_lotes(pid) THEN
        FOR v_consumo IN SELECT * FROM public.consumir_lotes_fifo(pid, qty::integer)
        LOOP
          v_consumos := v_consumos || ROW(pid, v_consumo.lot_id, v_consumo.cantidad, v_consumo.costo_unitario)::public.consumo_lote;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- 2. Crear el pedido reutilizando la función existente (misma transacción)
  PERFORM create_order_kv(order_id, new_data);

  -- 3. Repartir el consumo de lotes sobre los order_items recién creados.
  --    Tiene que ir DESPUÉS de create_order_kv: hasta acá no existían las
  --    filas de order_items a las que referenciar.
  IF array_length(v_consumos, 1) IS NOT NULL THEN
    FOR v_product_id IN
      SELECT DISTINCT (c).product_id FROM unnest(v_consumos) AS c
    LOOP
      SELECT id INTO v_item_id
      FROM order_items
      WHERE order_id = v_order_id AND product_id = v_product_id;

      IF v_item_id IS NOT NULL THEN
        INSERT INTO order_item_lots (order_item_id, lot_id, cantidad, costo_unitario)
        SELECT v_item_id, (c).lot_id, (c).cantidad, (c).costo_unitario
        FROM unnest(v_consumos) AS c
        WHERE (c).product_id = v_product_id;

        -- order_items.price pasa a ser el promedio ponderado exacto de los
        -- lotes consumidos para esa línea: price × quantity sigue dando el
        -- total correcto aunque la línea haya cruzado dos costos distintos.
        UPDATE order_items
          SET price = (
            SELECT SUM((c).cantidad * (c).costo_unitario) / SUM((c).cantidad)
            FROM unnest(v_consumos) AS c
            WHERE (c).product_id = v_product_id
          )
          WHERE id = v_item_id;
      END IF;
    END LOOP;
  END IF;
END;
$function$;
```

- [ ] **Step 3: Aplicar la migración** (`name: "20261004_e_create_order_with_stock_fifo"`)

- [ ] **Step 4: Verificar en base — crear un pedido real contra un producto de prueba con dos lotes, usando la misma RPC que usa el frontend**

```sql
DO $$
DECLARE
  v_business_id uuid;
  v_categoria_id uuid;
  v_user_id uuid;
  v_product_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_item record;
BEGIN
  SELECT business_id, id INTO v_business_id, v_categoria_id
  FROM categories WHERE lower(name) LIKE '%distribuidora%' LIMIT 1;

  SELECT id INTO v_user_id FROM profiles WHERE business_id = v_business_id LIMIT 1;

  INSERT INTO products (business_id, name, price, stock, category_id)
  VALUES (v_business_id, '__TEST_LOTES_PEDIDO__', 0, 4, v_categoria_id)
  RETURNING id INTO v_product_id;

  PERFORM reponer_lote_fifo(v_product_id, 1, 1000); -- queda 1 unidad vieja
  PERFORM reponer_lote_fifo(v_product_id, 3, 1200);

  PERFORM create_order_with_stock(
    v_order_id::text,
    jsonb_build_object(
      'businessId', v_business_id,
      'userId', v_user_id,
      'status', 'pending',
      'total', 3400,
      'products', jsonb_build_array(
        jsonb_build_object('productId', v_product_id, 'name', '__TEST_LOTES_PEDIDO__', 'quantity', 3, 'price', 1133.33)
      )
    )
  );

  SELECT id, price, quantity INTO v_item FROM order_items WHERE order_id = v_order_id;
  ASSERT round(v_item.price * v_item.quantity) = 3400,
    format('total esperado 3400, dio %', v_item.price * v_item.quantity);
  ASSERT (SELECT count(*) FROM order_item_lots WHERE order_item_id = v_item.id) = 2,
    'la línea tiene que haber cruzado dos lotes';

  RAISE NOTICE 'OK: order_item price=% total=%', v_item.price, v_item.price * v_item.quantity;

  DELETE FROM orders WHERE id = v_order_id; -- cascada borra order_items y order_item_lots
  DELETE FROM products WHERE id = v_product_id;
END $$;
```

Expected: `NOTICE: OK: ...` sin `ASSERT` fallido.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004_e_create_order_with_stock_fifo.sql
git commit -m "feat: la RPC de pedidos consume lotes FIFO y reparte order_item_lots"
```

---

### Task 6: `registrarStockEvent` devuelve el id insertado

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts:177-203`

**Interfaces:**
- Produces: `registrarStockEvent(...)` pasa de `Promise<void>` a `Promise<string | null>` (el `id` del evento insertado, o `null` si no se insertó). Lo consume la Task 7 para poblar `product_lots.stock_event_id`.

- [ ] **Step 1: Modificar la función**

```ts
async function registrarStockEvent(params: {
  businessId: string;
  productId: string;
  productName: string;
  type: 'despacho' | 'reposicion' | 'merma' | 'ajuste' | 'devolucion';
  quantity: number;
  stockAfter: number;
  createdBy?: string | null;
  orderId?: string | null;
}): Promise<string | null> {
  if (!(params.quantity > 0)) return null;

  const { data, error } = await supabaseAdmin.from('stock_events').insert({
    business_id: params.businessId,
    product_id: params.productId,
    product_name: params.productName,
    type: params.type,
    quantity: params.quantity,
    stock_after: params.stockAfter,
    order_id: params.orderId ?? null,
    created_by: params.createdBy ?? null,
  }).select('id').single();

  if (error) {
    console.error('Error registrando stock_event:', error);
    return null;
  }

  return data?.id ?? null;
}
```

- [ ] **Step 2: Confirmar que los llamadores existentes siguen compilando**

Los tres llamadores actuales (`index.ts` líneas ~971, ~1476, ~1779) no usan el valor de retorno — siguen funcionando igual, solo cambia el tipo de la promesa.

```bash
cd supabase/functions/make-server-6d979413 && deno check index.ts
```

Expected: sin errores de tipo nuevos.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "fix: registrarStockEvent devuelve el id insertado"
```

---

### Task 7: `PUT /products/:id` — reposición con costo, merma, ajuste

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts:850-981`

**Interfaces:**
- Consumes: `registrarStockEvent` (Task 6, ahora devuelve id), RPCs `producto_usa_lotes`, `reponer_lote_fifo`, `consumir_lotes_fifo` (Tasks 2-4).
- Produces: el body de `PUT /products/:id` acepta un campo nuevo opcional `costoUnitario: number`, obligatorio cuando el ajuste es una reposición (`modo: 'sumar'`, delta positivo) sobre un producto en alcance.

- [ ] **Step 1: Agregar `costoUnitario` a la destructuración del body**

En `index.ts:871`:

```ts
const { ingredients, imageUrl, image, name, description, price, stock, categoryId, productionAreaId, unlimitedStock, trackStock, allowDecimal, laborCost, sku, modo, minStock, costoUnitario } = updates;
```

- [ ] **Step 2: Validar el costo ANTES de tocar la base de datos**

Insertar justo después del bloque de `skuNorm` (antes de armar `updateData`), usando `existing.stock` (ya se trae en el `SELECT` de la línea 861-865):

```ts
// Si esto va a ser una reposición de un producto en alcance, el costo es
// obligatorio — y hay que saberlo ANTES de escribir nada: si se valida
// después del update, un request sin costo deja stock movido sin lote.
if (stock !== undefined && modo === 'sumar' && existing.unlimited_stock !== true) {
  const deltaPrevisto = parseInt(stock) - Number(existing.stock);
  if (deltaPrevisto > 0) {
    const { data: enLotes } = await supabaseAdmin.rpc('producto_usa_lotes', { p_product_id: productId });
    const costoValido = costoUnitario !== undefined && costoUnitario !== null && !isNaN(Number(costoUnitario)) && Number(costoUnitario) >= 0;
    if (enLotes && !costoValido) {
      return c.json({ error: 'Costo requerido para reponer stock de un producto de Distribuidora' }, 400);
    }
  }
}
```

- [ ] **Step 3: Conectar los lotes al bloque `esAjusteDeStock` existente**

Reemplazar el bloque (`index.ts:958-981`, dentro de `if (esAjusteDeStock) { ... }`):

```ts
if (esAjusteDeStock) {
  const stockAnterior = Number(existing.stock);
  const stockNuevo = Number(updated.stock);
  const delta = stockNuevo - stockAnterior;

  if (delta !== 0) {
    const tipo = modo === 'sumar'
      ? (delta > 0 ? 'reposicion' : 'merma')
      : 'ajuste';

    const eventId = await registrarStockEvent({
      businessId: profile.businessId,
      productId,
      productName: updated.name,
      type: tipo,
      quantity: Math.abs(delta),
      stockAfter: stockNuevo,
      createdBy: userId,
    });

    const { data: enLotes } = await supabaseAdmin.rpc('producto_usa_lotes', { p_product_id: productId });

    if (enLotes) {
      if (tipo === 'reposicion') {
        // Ya validado en el Step 2: costoUnitario existe y es válido acá.
        const { error: loteError } = await supabaseAdmin.rpc('reponer_lote_fifo', {
          p_product_id: productId,
          p_cantidad: Math.abs(delta),
          p_costo_unitario: Number(costoUnitario),
          p_origen: 'reposicion',
          p_stock_event_id: eventId,
        });
        if (loteError) console.error('Error creando lote de reposición:', loteError);
      } else if (tipo === 'merma') {
        const { error: loteError } = await supabaseAdmin.rpc('consumir_lotes_fifo', {
          p_product_id: productId,
          p_cantidad: Math.abs(delta),
        });
        if (loteError) console.error('Error consumiendo lote por merma:', loteError);
      } else if (delta < 0) {
        // Ajuste a la baja (corrección de conteo): FIFO, igual que una merma.
        const { error: loteError } = await supabaseAdmin.rpc('consumir_lotes_fifo', {
          p_product_id: productId,
          p_cantidad: Math.abs(delta),
        });
        if (loteError) console.error('Error consumiendo lote por ajuste:', loteError);
      } else {
        // Ajuste al alza: no hay compra registrada para este stock que
        // "apareció". Se crea un lote fantasma al costo del lote más
        // reciente conocido, o al price actual si todavía no hay ninguno.
        const { data: ultimoLote } = await supabaseAdmin
          .from('product_lots')
          .select('costo_unitario')
          .eq('product_id', productId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const costoFantasma = ultimoLote?.costo_unitario ?? Number(updated.price);

        const { error: loteError } = await supabaseAdmin.rpc('reponer_lote_fifo', {
          p_product_id: productId,
          p_cantidad: delta,
          p_costo_unitario: costoFantasma,
          p_origen: 'ajuste',
          p_stock_event_id: eventId,
        });
        if (loteError) console.error('Error creando lote fantasma de ajuste:', loteError);
      }
    }
  }
}
```

- [ ] **Step 4: Verificar con `deno check`**

```bash
cd supabase/functions/make-server-6d979413 && deno check index.ts
```

Expected: sin errores.

- [ ] **Step 5: Desplegar y verificar en vivo contra un producto de prueba**

Desplegar la función (`supabase functions deploy make-server-6d979413` o el flujo de despliegue habitual del proyecto), y con un producto real de Distribuidora creado a mano para la prueba:

1. `PUT /products/:id` con `{ stock: <actual+3>, modo: 'sumar' }` **sin** `costoUnitario` → debe responder 400 con el mensaje de costo requerido, y el stock del producto **no** debe haber cambiado.
2. El mismo request **con** `costoUnitario: 1000` → 200, `GET /products/:id/stock-events` muestra una `reposicion`, y hay una fila nueva en `product_lots`.
3. `PUT /products/:id` con `{ stock: <actual-1>, modo: 'sumar' }` (merma) → consume del lote más viejo.
4. `PUT /products/:id` con `{ stock: <total mayor>, modo: 'total' }` (ajuste al alza) → crea un lote de `origen = 'ajuste'`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts
git commit -m "feat: PUT /products pide costo al reponer stock de Distribuidora y consume lotes FIFO"
```

---

### Task 8: Devolución — `DELETE /orders/:id` restaura los lotes originales

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts:1739-1801`

**Interfaces:**
- Consumes: tabla `order_item_lots` (Task 1).
- Produces: al borrar un pedido, cada línea en alcance devuelve sus unidades exactamente a los lotes de los que salieron.

- [ ] **Step 1: Traer `order_item_lots` junto con los `order_items`**

En `index.ts:1748-1752`, ampliar el `select`:

```ts
const { data: order } = await supabaseAdmin
  .from('orders')
  .select('*, order_items(id, product_id, quantity, order_item_lots(lot_id, cantidad))')
  .eq('id', orderId)
  .maybeSingle();
```

- [ ] **Step 2: Restaurar los lotes dentro del loop existente**

Modificar el loop de `index.ts:1758-1791` — después de registrar el evento `devolucion`, agregar:

```ts
for (const item of (order.order_items || [])) {
  if (!item.product_id) continue;
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, name, business_id, stock, unlimited_stock, track_stock')
    .eq('id', item.product_id)
    .maybeSingle();

  if (product) {
    const isUnlimited = product.unlimited_stock === true || product.track_stock === false;
    if (!isUnlimited) {
      const stockNuevo = product.stock + item.quantity;
      await supabaseAdmin
        .from('products')
        .update({ stock: stockNuevo })
        .eq('id', item.product_id);

      await registrarStockEvent({
        businessId: product.business_id,
        productId: product.id,
        productName: product.name,
        type: 'devolucion',
        quantity: item.quantity,
        stockAfter: stockNuevo,
        createdBy: userId,
        orderId,
      });

      // Devolver cada unidad al lote exacto del que salió — aunque ese
      // lote ya esté en 0, se reabre. El FIFO lo vuelve a consumir
      // primero la próxima vez, así que no hace falta lógica extra.
      for (const ol of (item.order_item_lots || [])) {
        const { error: loteError } = await supabaseAdmin.rpc('devolver_a_lote', {
          p_lot_id: ol.lot_id,
          p_cantidad: ol.cantidad,
        });
        if (loteError) console.error('Error devolviendo unidades al lote:', loteError);
      }

      if ((item.order_item_lots || []).length > 0) {
        // Puede haber reactivado un lote más viejo y más barato que el
        // que estaba activo: recalcular el precio vigente.
        await supabaseAdmin.rpc('recalcular_precio_producto', { p_product_id: product.id });
      }
    }
  }
}
```

- [ ] **Step 3: Agregar las dos funciones SQL que este paso usa**

Son dos funciones chicas, de una sola responsabilidad cada una — no se mete esta lógica dentro de `consumir_lotes_fifo`/`reponer_lote_fifo` porque "devolver" no es ni un consumo ni una compra nueva.

```sql
-- supabase/migrations/20261004_f_devolucion_lotes.sql
CREATE OR REPLACE FUNCTION public.devolver_a_lote(p_lot_id uuid, p_cantidad integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE product_lots
    SET cantidad_restante = cantidad_restante + p_cantidad
    WHERE id = p_lot_id;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_precio_producto(p_product_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE products
    SET price = (
      SELECT costo_unitario FROM product_lots
      WHERE product_id = p_product_id AND cantidad_restante > 0
      ORDER BY created_at ASC
      LIMIT 1
    )
    WHERE id = p_product_id
      AND EXISTS (
        SELECT 1 FROM product_lots WHERE product_id = p_product_id AND cantidad_restante > 0
      );
$$;
```

- [ ] **Step 4: Aplicar la migración** (`name: "20261004_f_devolucion_lotes"`)

- [ ] **Step 5: Verificar con `deno check` y en base**

```bash
cd supabase/functions/make-server-6d979413 && deno check index.ts
```

```sql
-- devolver_a_lote y recalcular_precio_producto existen y son invocables
SELECT proname FROM pg_proc WHERE proname IN ('devolver_a_lote', 'recalcular_precio_producto');
```

- [ ] **Step 6: Verificación end-to-end en navegador**

Con un producto de Distribuidora de prueba con dos lotes activos: crear un pedido que cruce los dos lotes (como en el Task 5), confirmar los `order_item_lots` generados, borrar el pedido desde la UI, y verificar que ambos lotes recuperan exactamente su cantidad original (`product_lots.cantidad_restante` vuelve a lo que era antes del pedido).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts supabase/migrations/20261004_f_devolucion_lotes.sql
git commit -m "feat: al borrar un pedido se devuelven las unidades a sus lotes originales"
```

---

### Task 9: `GET /products` expone `lotsValue` agregado por producto

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts:75-102` (`toProduct`)
- Modify: `supabase/functions/make-server-6d979413/index.ts:726-766` (`GET /products`)

**Interfaces:**
- Produces: cada producto devuelto por `GET /products` incluye `lotsValue?: number` — la suma de `cantidad_restante × costo_unitario` de sus lotes vivos. `undefined` para productos sin lotes (fuera de alcance, o en alcance pero sin stock todavía). Lo consume la Task 15 (`DistributionPanel`).

- [ ] **Step 1: `toProduct` acepta un segundo argumento opcional**

```ts
function toProduct(r: any, lotsValue?: number) {
  const ingredients = (r.product_ingredients || []).map((pi: any) => ({
    ingredientId: pi.ingredient_id,
    quantity: pi.quantity,
  }));
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    price: Number(r.price),
    image: r.image_url || '',
    imageUrl: r.image_url || '',
    stock: r.stock,
    minStock: r.min_stock != null ? Number(r.min_stock) : undefined,
    unlimitedStock: r.unlimited_stock,
    trackStock: r.track_stock,
    allowDecimal: r.allow_decimal || false,
    category: r.categories?.name || r.category_name || 'General',
    categoryId: r.category_id,
    sku: r.sku || '',
    productionAreaId: r.production_area_id,
    ingredients,
    laborCost: Number(r.labor_cost) || 0,
    businessId: r.business_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lotsValue,
  };
}
```

Los demás llamadores de `toProduct(row)` (POST, PUT, DELETE de un solo producto) no pasan el segundo argumento — queda `undefined`, que es el valor correcto para una respuesta de un solo producto fuera del contexto del panel.

- [ ] **Step 2: `GET /products` calcula el agregado y lo pasa**

```ts
app.get("/make-server-6d979413/products", async (c) => {
  const { error, userId } = await verifyAuth(c.req.header('Authorization'));
  if (error) return c.json({ error }, 401);

  try {
    const profile = await getProfile(userId!);
    if (!profile?.businessId) return c.json({ error: 'Usuario no asociado a ningun negocio' }, 404);

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '1000');
    const offset = (page - 1) * limit;

    const { data: products, count } = await supabaseAdmin
      .from('products')
      .select('*, categories(name), product_ingredients(ingredient_id, quantity)', { count: 'exact' })
      .eq('business_id', profile.businessId)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    // Agregado de lotes: una sola query extra para todo el negocio, no una
    // por producto. Solo lotes con stock > 0 participan del valor.
    const { data: filasLotes } = await supabaseAdmin
      .from('product_lots')
      .select('product_id, cantidad_restante, costo_unitario')
      .eq('business_id', profile.businessId)
      .gt('cantidad_restante', 0);

    const lotsValueByProduct = new Map<string, number>();
    for (const l of filasLotes || []) {
      const previo = lotsValueByProduct.get(l.product_id) || 0;
      lotsValueByProduct.set(l.product_id, previo + Number(l.cantidad_restante) * Number(l.costo_unitario));
    }

    const total = count ?? 0;
    const result = (products || []).map((p: any) => toProduct(p, lotsValueByProduct.get(p.id)));

    return c.json({
      data: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1,
      }
    });
  } catch (err: any) {
    console.error('Error getting products:', err);
    return c.json({ error: 'Error al obtener productos' }, 500);
  }
});
```

- [ ] **Step 3: Agregar `lotsValue` al tipo `Product` del frontend**

En `src/utils/api.tsx:42-61`:

```ts
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image?: string;
  imageUrl?: string;
  stock: number;
  minStock?: number;
  unlimitedStock?: boolean;
  trackStock?: boolean;
  category?: string;
  categoryId?: string;
  sku?: string;
  productionAreaId?: string;
  ingredients?: ProductIngredient[];
  laborCost?: number;
  // Suma de cantidad_restante × costo_unitario de los lotes vivos de este
  // producto. Solo viene poblado en GET /products (lista); undefined si el
  // producto no tiene lotes (fuera de alcance, o en alcance sin stock).
  lotsValue?: number;
  createdAt?: string;
  updatedAt?: string;
}
```

- [ ] **Step 4: Verificar con `deno check` y en navegador**

```bash
cd supabase/functions/make-server-6d979413 && deno check index.ts
```

Con un producto de prueba con lotes cargados: `GET /products` en la pestaña de red del navegador muestra `lotsValue` poblado para ese producto, y `undefined`/ausente para el resto.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/make-server-6d979413/index.ts src/utils/api.tsx
git commit -m "feat: GET /products expone el valor de inventario agregado por lotes"
```

---

### Task 10: Migración de datos — lote inicial para el stock existente

**Files:**
- Create: `supabase/migrations/20261004_g_migrar_lotes_iniciales.sql`

**Interfaces:**
- Consumes: `producto_usa_lotes` (Task 2), tabla `product_lots` (Task 1).
- Produces: cada producto en alcance con `stock > 0` que todavía no tiene ningún lote recibe uno, con el stock y el `price` que ya tenía.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/20261004_g_migrar_lotes_iniciales.sql
-- Lote inicial para el stock que ya existía antes de activar el costeo por
-- lotes. No toca products.stock ni products.price — son el punto de
-- partida, no un cambio. Idempotente: el WHERE NOT EXISTS evita duplicar
-- si esta migración se corre más de una vez.
INSERT INTO product_lots (business_id, product_id, costo_unitario, cantidad_inicial, cantidad_restante, origen, created_at)
SELECT
  p.business_id,
  p.id,
  p.price,
  p.stock,
  p.stock,
  'migracion',
  now()
FROM products p
WHERE p.stock > 0
  AND public.producto_usa_lotes(p.id)
  AND NOT EXISTS (SELECT 1 FROM product_lots pl WHERE pl.product_id = p.id);
```

- [ ] **Step 2: Contar cuántos productos van a recibir lote, ANTES de aplicar**

```sql
SELECT count(*) FROM products p
WHERE p.stock > 0
  AND public.producto_usa_lotes(p.id)
  AND NOT EXISTS (SELECT 1 FROM product_lots pl WHERE pl.product_id = p.id);
```

Anotar el número — se usa para verificar el resultado en el Step 4.

- [ ] **Step 3: Aplicar la migración** (`name: "20261004_g_migrar_lotes_iniciales"`)

- [ ] **Step 4: Verificar**

```sql
SELECT count(*) FROM product_lots WHERE origen = 'migracion';
```

Expected: coincide con el número del Step 2.

```sql
-- Confirmar que no se tocó price ni stock de ningún producto
SELECT p.id, p.name, p.price, p.stock, pl.costo_unitario, pl.cantidad_restante
FROM products p JOIN product_lots pl ON pl.product_id = p.id AND pl.origen = 'migracion'
LIMIT 10;
```

Expected: `p.price = pl.costo_unitario` y `p.stock = pl.cantidad_restante` en cada fila.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004_g_migrar_lotes_iniciales.sql
git commit -m "feat: migrar el stock existente de Distribuidora a un lote inicial"
```

---

### Task 11: `productoUsaLotes` — utilidad pura del frontend + tests

**Files:**
- Create: `src/utils/productLots.ts`
- Create: `src/utils/productLots.test.ts`

**Interfaces:**
- Consumes: `elegirCategoriaInicial`, `idsDeCategoriaConHijas` (`src/utils/categoryTree.ts`, ya existen).
- Produces: `productoUsaLotes(product: Product, categories: Category[]): boolean`. La usan las Tasks 13 y 14.

- [ ] **Step 1: Escribir la función**

```ts
// src/utils/productLots.ts
import type { Product, Category } from './api';
import { elegirCategoriaInicial, idsDeCategoriaConHijas } from './categoryTree';

/**
 * Mismo criterio que usa el backend en producto_usa_lotes(): sin receta, y
 * en la categoría Distribuidora o una subcategoría directa suya. Reutiliza
 * la misma detección por nombre que ya usa DistributionPanel, para que
 * mover un producto de categoría cambie su comportamiento sin que haga
 * falta ningún flag nuevo.
 */
export function productoUsaLotes(product: Product, categories: Category[]): boolean {
  if (!product.categoryId) return false;
  if ((product.ingredients?.length ?? 0) > 0) return false;

  const distribuidoraId = elegirCategoriaInicial(categories);
  if (distribuidoraId === 'all') return false; // no existe la categoría Distribuidora

  const idsValidos = idsDeCategoriaConHijas(categories, distribuidoraId);
  return idsValidos.has(product.categoryId);
}
```

- [ ] **Step 2: Escribir los tests**

```ts
// src/utils/productLots.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productoUsaLotes } from './productLots';
import type { Product, Category } from './api';

const categorias: Category[] = [
  { id: 'cat-distri', name: 'Distribuidora', createdAt: '' },
  { id: 'cat-lacteos', name: 'Lácteos', parentId: 'cat-distri', createdAt: '' },
  { id: 'cat-nietos', name: 'Sub de lácteos', parentId: 'cat-lacteos', createdAt: '' },
  { id: 'cat-otra', name: 'Panadería', createdAt: '' },
];

function producto(overrides: Partial<Product>): Product {
  return {
    id: 'p1', name: 'Test', description: '', price: 100, stock: 1,
    ...overrides,
  } as Product;
}

test('producto sin receta en la categoría Distribuidora directa usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-distri' }), categorias), true);
});

test('producto sin receta en una subcategoría directa de Distribuidora usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-lacteos' }), categorias), true);
});

test('una subcategoría de segundo nivel NO entra (el criterio es un solo nivel)', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-nietos' }), categorias), false);
});

test('producto con receta no usa lotes aunque esté en Distribuidora', () => {
  assert.equal(
    productoUsaLotes(producto({ categoryId: 'cat-distri', ingredients: [{ ingredientId: 'i1', quantity: 1 }] }), categorias),
    false
  );
});

test('producto fuera de Distribuidora no usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-otra' }), categorias), false);
});

test('producto sin categoría no usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: undefined }), categorias), false);
});

test('si no existe ninguna categoría Distribuidora, nada usa lotes', () => {
  const sinDistribuidora = categorias.filter(c => c.id !== 'cat-distri' && c.id !== 'cat-lacteos' && c.id !== 'cat-nietos');
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-otra' }), sinDistribuidora), false);
});
```

- [ ] **Step 3: Correr los tests**

```bash
npm test
```

Expected: los 7 tests nuevos pasan, y el total sigue siendo 57 + 7 = 64 (o el baseline vigente al momento de implementar) sin ninguno roto.

- [ ] **Step 4: Commit**

```bash
git add src/utils/productLots.ts src/utils/productLots.test.ts
git commit -m "feat: utilidad pura para detectar productos en alcance de costeo por lotes"
```

---

### Task 12: `productsAPI.update` acepta `costoUnitario`

**Files:**
- Modify: `src/utils/api.tsx:567-573`

**Interfaces:**
- Produces: `productsAPI.update(token, productId, updates)` — `updates` acepta ahora `costoUnitario?: number` además de `modo`. La usa la Task 14.

- [ ] **Step 1: Ampliar la firma**

```ts
// `modo` y `costoUnitario` no son campos del producto: son metadato del
// ajuste que el backend usa para clasificar el movimiento en el kardex y
// para crear el lote cuando corresponde. No se persisten tal cual en
// products (costoUnitario pasa a ser el costo del lote nuevo).
update: async (token: string, productId: string, updates: Partial<Product> & { ingredients?: Array<{ ingredientId: string; quantity: number }>; modo?: 'sumar' | 'total'; costoUnitario?: number }): Promise<Product> => {
  const response = await fetchAPI(`/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }, token);
  return response?.data || response;
},
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add src/utils/api.tsx
git commit -m "feat: productsAPI.update acepta costoUnitario para reposiciones con lote"
```

---

### Task 13: `StockAdjustDialog` — campo de costo condicional

**Files:**
- Modify: `src/components/StockAdjustDialog.tsx`

**Interfaces:**
- Consumes: ninguna nueva (recibe `enLotes` como prop, calculado por quien lo use — Task 14).
- Produces: `onConfirm` pasa a `(nuevoStock: number, modo: ModoAjuste, costoUnitario?: number) => Promise<void>`. Rompe la firma actual — la Task 14 actualiza el único llamador (`ProductManagement.tsx`).

- [ ] **Step 1: Escribir el componente actualizado**

```tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { BoxIcon, DollarSign } from 'lucide-react';
import type { Product } from '../utils/api';

export type ModoAjuste = 'sumar' | 'total';

interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  // true si el producto es de Distribuidora sin receta: pide costo al
  // reponer. Lo calcula quien use el diálogo (tiene las categorías a mano).
  enLotes?: boolean;
  onConfirm: (nuevoStock: number, modo: ModoAjuste, costoUnitario?: number) => Promise<void>;
  saving?: boolean;
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
  enLotes = false,
  onConfirm,
  saving = false,
}: StockAdjustDialogProps) {
  const [modo, setModo] = useState<ModoAjuste>('sumar');
  const [valor, setValor] = useState('');
  const [costo, setCosto] = useState('');

  const stockActual = product?.stock ?? 0;

  useEffect(() => {
    if (open) {
      setModo('sumar');
      setValor('');
      setCosto('');
    }
  }, [open, product?.id]);

  const cantidad = /^-?\d+$/.test(valor.trim()) ? parseInt(valor.trim(), 10) : null;
  const hayNumero = cantidad !== null;
  const nuevoStock = !hayNumero ? null : modo === 'sumar' ? stockActual + cantidad : cantidad;
  const quedaNegativo = nuevoStock !== null && nuevoStock < 0;

  // El costo solo es obligatorio cuando esto va a ser una reposición real
  // (modo sumar, cantidad positiva) de un producto en alcance.
  const esReposicion = modo === 'sumar' && hayNumero && cantidad! > 0;
  const requiereCosto = enLotes && esReposicion;
  const costoNumerico = costo.trim() === '' ? null : Number(costo.trim());
  const costoValido = !requiereCosto || (costoNumerico !== null && !isNaN(costoNumerico) && costoNumerico >= 0);

  const puedeConfirmar = hayNumero && !quedaNegativo && costoValido && !saving;

  const handleConfirmar = async () => {
    if (!puedeConfirmar || nuevoStock === null) return;
    await onConfirm(nuevoStock, modo, requiereCosto ? Number(costo.trim()) : undefined);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BoxIcon className="w-5 h-5 text-blue-600" />
            Ajustar stock
          </DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={modo === 'sumar' ? 'default' : 'outline'} onClick={() => setModo('sumar')} disabled={saving}>
            Sumar
          </Button>
          <Button type="button" variant={modo === 'total' ? 'default' : 'outline'} onClick={() => setModo('total')} disabled={saving}>
            Corregir total
          </Button>
        </div>

        <div className="text-sm text-gray-600">
          Stock actual: <span className="font-mono text-gray-900">{stockActual}</span>
        </div>

        <div>
          <Label htmlFor="stock-valor">
            {modo === 'sumar' ? 'Cuánto sumar' : 'Stock real contado'}
          </Label>
          <Input
            id="stock-valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && puedeConfirmar) {
                e.preventDefault();
                handleConfirmar();
              }
            }}
            placeholder={modo === 'sumar' ? 'Ej: 20' : 'Ej: 47'}
            inputMode="numeric"
            autoFocus
            autoComplete="off"
            disabled={saving}
          />
          <p className="text-xs text-gray-500 mt-1">
            {modo === 'sumar'
              ? 'Podés poner un número negativo para restar (mermas o roturas).'
              : 'Reemplaza el stock actual por este número.'}
          </p>
        </div>

        {requiereCosto && (
          <div>
            <Label htmlFor="stock-costo">Costo de esta compra (por unidad)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="stock-costo"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                placeholder="Ej: 1000"
                inputMode="decimal"
                className="pl-9"
                disabled={saving}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Este producto es de Distribuidora: el precio de venta se actualiza solo según el costo de cada compra.
            </p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-300 rounded-lg py-2 px-3 text-center">
          {!hayNumero ? (
            <span className="text-sm text-gray-500">Ingresá una cantidad</span>
          ) : quedaNegativo ? (
            <span className="text-sm text-red-600">El stock no puede quedar negativo</span>
          ) : requiereCosto && !costoValido ? (
            <span className="text-sm text-red-600">Ingresá el costo de esta compra</span>
          ) : (
            <span className="text-blue-700">
              {modo === 'sumar' ? (
                <>
                  {stockActual} {cantidad! < 0 ? '−' : '+'} {Math.abs(cantidad!)} ={' '}
                  <span className="text-2xl font-mono">{nuevoStock}</span> unidades
                </>
              ) : (
                <>
                  {stockActual} → <span className="text-2xl font-mono">{nuevoStock}</span> unidades
                </>
              )}
            </span>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmar}
            disabled={!puedeConfirmar}
            style={{ background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)', color: 'white' }}
          >
            {saving ? 'Guardando...' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: error esperado en `ProductManagement.tsx` (todavía no actualizado) — se resuelve en la Task 14. Si hay errores en algún otro archivo, revisar antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add src/components/StockAdjustDialog.tsx
git commit -m "feat: StockAdjustDialog pide el costo de la compra al reponer stock de Distribuidora"
```

---

### Task 14: `ProductManagement` — calcular alcance, precio solo lectura, enviar costo

**Files:**
- Modify: `src/components/ProductManagement.tsx`
- Modify: `src/utils/productPayload.ts`
- Modify: `src/utils/productPayload.test.ts`

**Interfaces:**
- Consumes: `productoUsaLotes` (Task 11), `StockAdjustDialog` con la firma nueva (Task 13), `productsAPI.update` con `costoUnitario` (Task 12).

- [ ] **Step 1: `construirPayloadProducto` deja de mandar `price` al editar un producto en alcance**

```ts
// src/utils/productPayload.ts
import type { Product } from './api';

export interface ProductFormData {
  name: string;
  description: string;
  price: string;
  stock: string;
  minStock: string;
  category: string;
  categoryId: string;
  sku: string;
  imageUrl: string;
  productionAreaId: string;
  unlimitedStock: boolean;
  allowDecimal: boolean;
}

interface Params {
  formData: ProductFormData;
  editingProduct: Product | null;
  priceValue: number;
  // true si el producto es de Distribuidora sin receta: el precio lo
  // recalcula el backend según el lote activo, así que no se manda al
  // editar (mismo criterio que ya se usa para `stock`).
  enLotes: boolean;
}

export function construirPayloadProducto({ formData, editingProduct, priceValue, enLotes }: Params) {
  return {
    name: formData.name.trim(),
    description: formData.description.trim(),
    ...(editingProduct && enLotes ? {} : { price: priceValue }),
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

- [ ] **Step 2: Actualizar los tests existentes de `construirPayloadProducto`**

`src/utils/productPayload.test.ts` ya existe con 13 tests, todos contra los fixtures `formBase` (un `ProductFormData`) y `productoBase` (un producto editado a modo de ejemplo), y todos llaman a `construirPayloadProducto` sin `enLotes`. Como el campo pasa a ser requerido en `Params`, hay que agregar `enLotes: false` a los 13 llamados existentes (son los de las líneas 30-34, 39-43, 51-55, 63-67, 74-78, 83-87, 92-96, 103-107, 112-116, 121-125, 130-134, 139-143, 153-157) — `false` preserva el comportamiento actual en todos, porque ninguno de esos casos es sobre un producto de Distribuidora.

Sumar dos casos nuevos al final del archivo, usando los mismos fixtures:

```ts
test('al editar un producto en alcance de lotes, no manda price', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, price: '9999' },
    editingProduct: productoBase,
    priceValue: 9999,
    enLotes: true,
  });
  assert.equal('price' in payload, false);
});

test('al editar un producto fuera de alcance, sigue mandando price', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, price: '500' },
    editingProduct: productoBase,
    priceValue: 500,
    enLotes: false,
  });
  assert.equal(payload.price, 500);
});
```

- [ ] **Step 3: Correr los tests**

```bash
npm test
```

Expected: todos los tests de `productPayload.test.ts` pasan, incluidos los dos nuevos.

- [ ] **Step 4: En `ProductManagement.tsx`, calcular `enLotes` y pasarlo a donde haga falta**

Importar la utilidad:

```ts
import { productoUsaLotes } from '../utils/productLots';
```

Donde se arma `productData` (línea ~286), agregar `enLotes`:

```ts
const enLotes = editingProduct ? productoUsaLotes(editingProduct, categories) : false;

const productData = construirPayloadProducto({
  formData,
  editingProduct,
  priceValue,
  enLotes,
});
```

- [ ] **Step 5: El campo "Precio de Venta" se muestra solo lectura para productos en alcance**

Reemplazar el bloque de `index.ts:1022-1036` (el `<div>` del campo `price`):

```tsx
<div>
  <Label htmlFor={enLotes ? undefined : 'price'}>Precio de Venta *</Label>
  {enLotes ? (
    // Mismo patrón visual que ya usa el bloque de stock al editar: el
    // precio de estos productos lo calcula el backend según el lote
    // activo, no se edita a mano.
    <div className="rounded-lg bg-blue-50 px-4 py-3">
      <span className="text-lg font-mono text-gray-900">{formatCLP(parseCLP(formData.price))}</span>
      <p className="text-xs text-gray-600 mt-1">
        Se actualiza solo según el costo del lote de compra activo.
      </p>
    </div>
  ) : (
    <div className="relative">
      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <Input
        id="price"
        type="text"
        value={formData.price}
        onChange={(e) => setFormData({ ...formData, price: formatCLPInput(e.target.value) })}
        placeholder="0"
        className="pl-9"
        required
      />
    </div>
  )}
</div>
```

`priceValue` solo existe dentro de `handleSubmit` (línea 263) — no está disponible en el render. Por eso el JSX de arriba recalcula con `formatCLP(parseCLP(formData.price))` en vez de reusar esa variable. `parseCLP` y `formatCLP` ya están importados en el archivo (se usan en el campo editable de más abajo y en otros lugares del componente).

- [ ] **Step 6: Pasar `enLotes` a `StockAdjustDialog` y aceptar `costoUnitario` en `handleAjustarStock`**

```ts
const handleAjustarStock = async (nuevoStock: number, modo: ModoAjuste, costoUnitario?: number) => {
  if (!stockProduct) return;
  try {
    setSavingStock(true);
    const actualizado = await productsAPI.update(accessToken, stockProduct.id, { stock: nuevoStock, modo, costoUnitario });
    setProducts(products.map(p => (p.id === actualizado.id ? actualizado : p)));

    if (editingProduct?.id === actualizado.id) {
      setEditingProduct(actualizado);
      setFormData(prev => ({ ...prev, stock: actualizado.stock.toString() }));
    }

    toast.success(`Stock de "${actualizado.name}" actualizado a ${nuevoStock}`);
    setStockProduct(null);
  } catch (error: any) {
    console.error('Error ajustando stock:', error);
    toast.error(error.message || 'Error al actualizar el stock');
  } finally {
    setSavingStock(false);
  }
};
```

Y en el JSX donde se renderiza el diálogo (línea ~1383):

```tsx
<StockAdjustDialog
  open={!!stockProduct}
  onOpenChange={(o) => !o && setStockProduct(null)}
  product={stockProduct}
  enLotes={stockProduct ? productoUsaLotes(stockProduct, categories) : false}
  onConfirm={handleAjustarStock}
  saving={savingStock}
/>
```

- [ ] **Step 7: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 8: Verificación en navegador**

1. Abrir un producto de Distribuidora sin receta para editar: el campo "Precio de Venta" se ve de solo lectura con la nota.
2. Abrir un producto fuera de alcance: el campo sigue editable como siempre.
3. Tocar "Ajustar" en un producto de Distribuidora → el diálogo pide costo al elegir "Sumar" con cantidad positiva, y no lo pide en "Corregir total" ni con cantidad negativa.
4. Reponer con costo → el toast de éxito aparece, y el precio del producto (visible al reabrir la ficha) refleja lo esperado según el estado de los lotes.

- [ ] **Step 9: Commit**

```bash
git add src/components/ProductManagement.tsx src/utils/productPayload.ts src/utils/productPayload.test.ts
git commit -m "feat: ProductManagement muestra precio de Distribuidora como solo lectura y pide costo al reponer"
```

---

### Task 15: `DistributionPanel` — "Valor del inventario" usa `lotsValue`

**Files:**
- Modify: `src/components/DistributionPanel.tsx:129-134`

**Interfaces:**
- Consumes: `Product.lotsValue` (Task 9).

- [ ] **Step 1: Cambiar el cálculo de `stats.valor`**

```ts
const stats = useMemo(() => ({
  total: productosDelAmbito.length,
  agotados: productosDelAmbito.filter(x => x.estado === 'agotado').length,
  bajos: productosDelAmbito.filter(x => x.estado === 'bajo').length,
  // Si el producto tiene lotes (lotsValue viene poblado), ese valor ya
  // contempla que puede haber stock a dos costos distintos a la vez. Si no
  // tiene lotes (fuera de alcance, o en alcance pero sin stock todavía),
  // se usa el cálculo de siempre.
  valor: productosDelAmbito.reduce(
    (sum, x) => sum + (x.producto.lotsValue ?? x.producto.price * x.producto.stock),
    0
  ),
}), [productosDelAmbito]);
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/DistributionPanel.tsx
git commit -m "feat: Valor del inventario usa el costo por lotes cuando el producto tiene"
```

---

### Task 16: Verificación end-to-end en navegador

**Files:** ninguno (solo verificación manual, sin código nuevo).

- [ ] **Step 1: Iniciar el entorno de desarrollo**

```bash
npm run dev
```

- [ ] **Step 2: Reproducir el escenario completo del usuario con un producto real de prueba**

1. Crear (o elegir) un producto de Distribuidora sin receta, stock en 0.
2. Reponer 3 unidades a costo $1000 desde `ProductManagement` → el panel de Distribuidora muestra el producto con stock 3, y "Valor del inventario" lo suma a $3000.
3. Reponer 5 unidades más a costo $1200 → stock pasa a 8, el precio de venta (visible en la ficha del producto, o en `NewOrderForm`) sigue en $1000.
4. Desde `NewOrderForm`, hacer un pedido de 2 unidades de un local → se descuentan del lote viejo, el precio de venta sigue en $1000.
5. Hacer un segundo pedido de 3 unidades → cruza los dos lotes (queda 1 del lote viejo + 2 del nuevo); el total cobrado en el pedido es $3400 exacto, no $3600.
6. Después de ese pedido, el precio de venta del producto pasa a mostrarse en $1200.
7. Borrar ese segundo pedido desde la pantalla de pedidos → el stock vuelve a 6, y los lotes recuperan exactamente sus cantidades (verificable con una consulta SQL directa a `product_lots`, o indirectamente: el precio de venta vuelve a $1000 porque el lote viejo se reactivó con 1 unidad).
8. Hacer una merma de 1 unidad → se descuenta del lote más viejo con stock.
9. Hacer un "Corregir total" que suba el stock sin que haya una compra registrada (ajuste al alza) → se crea un lote de origen `ajuste` al costo del último lote conocido.
10. Confirmar con un producto fuera de la categoría Distribuidora (o uno con receta dentro de ella) que **nada** de este flujo aplica: el precio se sigue editando a mano, y `StockAdjustDialog` no pide costo.

- [ ] **Step 3: Revisar la consola del navegador y los logs de la Edge Function durante toda la prueba**

Sin errores inesperados en ninguno de los pasos anteriores.

- [ ] **Step 4: Confirmar que el baseline de tests sigue en verde**

```bash
npm test
npx tsc --noEmit
```

Expected: todos los tests pasan (incluidos los `productLots.test.ts` y `productPayload.test.ts` nuevos), sin errores de tipos.

---

## Resumen de dependencias entre tareas

```
Task 1 (esquema)
  └─ Task 2 (producto_usa_lotes)
       ├─ Task 3 (reponer_lote_fifo)
       ├─ Task 4 (consumir_lotes_fifo)
       │    └─ Task 5 (create_order_with_stock)
       └─ Task 7 (PUT /products, usa 2+3+4) ── depende también de Task 6 (registrarStockEvent)
  └─ Task 8 (devolución, usa order_item_lots de la Task 1 y Task 5)
  └─ Task 10 (migración de datos, usa Task 2)
Task 9 (GET /products + tipo Product.lotsValue) — independiente del resto de SQL
Task 11 (productoUsaLotes frontend) — independiente, solo necesita categoryTree.ts existente
Task 12 (productsAPI.update) → Task 13 (StockAdjustDialog) → Task 14 (ProductManagement)
Task 9 → Task 15 (DistributionPanel)
Task 16 depende de TODO lo anterior desplegado
```
