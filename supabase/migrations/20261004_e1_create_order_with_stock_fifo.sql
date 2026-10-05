-- supabase/migrations/20261004_e_create_order_with_stock_fifo.sql
-- create_order_with_stock() ahora, además del descuento atómico de stock que
-- ya hacía, consume lotes FIFO para los productos de Distribuidora sin
-- receta y reparte el detalle de consumo hacia order_item_lots.
--
-- Orden de las fases (importa, ver docs/superpowers/sdd/.../task-5-brief.md):
--   1. Descuento de stock + consumo de lotes FIFO (bajo el mismo FOR UPDATE).
--      El detalle de consumo se acumula en v_consumos (consumo_lote[]) porque
--      todavía no existen filas en order_items a las que referenciar.
--   2. create_order_kv crea el pedido y sus order_items.
--   3. Recién ahora existen los order_item.id: se reparte v_consumos hacia
--      order_item_lots y se recalcula order_items.price como el promedio
--      ponderado exacto de los lotes consumidos para esa línea.
--
-- NOTA (desvío respecto del brief original): el SELECT del paso 3 contra
-- order_items filtraba por "order_id = v_order_id" sin calificar la columna.
-- Como el propio parámetro de la función se llama order_id (text), Postgres
-- no sabe si "order_id" es el parámetro o la columna order_items.order_id y
-- tira "column reference order_id is ambiguous" en tiempo de ejecución (visto
-- al correr la verificación del Step 4). Se corrigió calificando ambas
-- columnas como order_items.order_id / order_items.product_id.

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
      WHERE order_items.order_id = v_order_id AND order_items.product_id = v_product_id;

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
