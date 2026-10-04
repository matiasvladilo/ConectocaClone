-- supabase/migrations/20261004_e3_create_order_with_stock_total_sync.sql
-- Fix de code review sobre Task 5: orders.total nunca se recalculaba después
-- de que el paso 3 reescribe order_items.price al promedio ponderado por
-- lote. El frontend manda `total` calculado con el price "de catálogo"
-- previo al pedido (ej. 3 × 1000 = 3000), pero si la línea cruza a un lote
-- más caro el costo real termina siendo 3400 — create_order_kv graba el
-- total que llegó en el payload y nada lo corrige después, así que el
-- pedido queda cobrado de menos. Esto contradice el objetivo del feature
-- (el total cobrado tiene que coincidir con el cálculo exacto por lote).
--
-- Fix: al final de la función, recalcular orders.total de forma
-- incondicional a partir de las filas reales de order_items. Para líneas que
-- no cruzaron lotes esto es un no-op (reconstruye el mismo total que ya
-- había mandado el cliente); para líneas que sí cruzaron, corrige el total
-- al valor real.
--
-- NOTA: la primera versión de este UPDATE usaba "WHERE order_id = v_order_id"
-- sin calificar — mismo error de columna ambigua que ya había aparecido en
-- 20261004_e (el parámetro de la función se llama order_id). Se detectó al
-- correr la verificación en vivo y se corrigió calificando como
-- order_items.order_id / orders.id.

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

      -- Costeo por lotes: solo para productos de Distribuidora sin receta
      -- (y, desde 20261004_e2, sin allow_decimal). Se consume ACÁ, en la
      -- misma transacción y bajo el mismo FOR UPDATE que ya protege el
      -- descuento de stock de arriba.
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

  -- 4. Sincronizar orders.total con el costo real de las líneas.
  --    Incondicional: para pedidos sin ninguna línea de lotes, esto
  --    reconstruye el mismo total que ya mandó el cliente (no-op en los
  --    valores); para pedidos que cruzaron lotes, corrige el total al valor
  --    exacto en vez de dejar el que el cliente calculó con el precio de
  --    catálogo previo al despacho.
  UPDATE orders SET total = (
    SELECT COALESCE(SUM(price * quantity), 0) FROM order_items WHERE order_items.order_id = v_order_id
  ) WHERE orders.id = v_order_id;
END;
$function$;
