-- supabase/migrations/20261004_h_update_order_with_stock.sql
-- Task 17: editar un pedido reconcilia stock Y el consumo de lotes FIFO en la
-- misma transacción. Es la contraparte de create_order_with_stock: ahí todo es
-- consumo nuevo, acá hay que poder SUMAR y RESTAR sobre el desglose existente,
-- así que el detalle se arma en una tabla temporal.
CREATE OR REPLACE FUNCTION public.update_order_with_stock(p_order_id text, new_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order_id uuid := p_order_id::uuid;
  item jsonb;
  pid uuid;
  v_nuevo record;
  qty_nueva numeric;
  qty_vieja numeric;
  delta numeric;
  prod record;
  v_vistos uuid[] := ARRAY[]::uuid[];
  v_item_id uuid;
  v_consumo record;
  v_ol record;
  v_oi record;
  v_restante integer;
  v_tomar integer;
  v_cupo integer;
  v_lineas integer;
  v_i integer;
BEGIN
  -- Tabla de trabajo con el desglose de lotes del pedido.
  --
  -- (product_id, lot_id) es PRIMARY KEY a propósito: si el mismo lote puede
  -- aparecer en dos filas (el pedido ya consumía del lote A y una subida de
  -- cantidad vuelve a tomar de A), el `UPDATE ... WHERE lot_id = X` de la
  -- devolución descuenta las dos filas de una sola vez y el desglose queda
  -- corto contra la cantidad realmente despachada.
  --
  -- IF NOT EXISTS + TRUNCATE en vez de un CREATE a secas: ON COMMIT DROP recién
  -- libera el nombre al cerrar la transacción, así que dos llamados a esta
  -- función dentro de una misma transacción (p.ej. un script de verificación,
  -- o un futuro wrapper que edite varios pedidos) fallaban con
  -- "relation tmp_consumo_lotes already exists".
  CREATE TEMP TABLE IF NOT EXISTS tmp_consumo_lotes (
    product_id uuid NOT NULL,
    lot_id uuid NOT NULL,
    cantidad integer NOT NULL,
    costo_unitario numeric NOT NULL,
    PRIMARY KEY (product_id, lot_id)
  ) ON COMMIT DROP;
  TRUNCATE tmp_consumo_lotes;

  -- Sembrar con el desglose actual (antes de tocar nada). Se agrupa por lote:
  -- un pedido viejo puede tener el mismo lote repartido en varias filas.
  INSERT INTO tmp_consumo_lotes (product_id, lot_id, cantidad, costo_unitario)
  SELECT oi.product_id, ol.lot_id, SUM(ol.cantidad)::integer, MIN(ol.costo_unitario)
  FROM order_item_lots ol
  JOIN order_items oi ON oi.id = ol.order_item_id
  WHERE oi.order_id = v_order_id AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id, ol.lot_id;

  -- 1. Por cada PRODUCTO de la lista nueva (agregado: si viene dos veces en la
  --    lista, es un solo delta contra lo que el pedido tenía antes), aplicar el
  --    movimiento de stock/lotes correspondiente.
  FOR v_nuevo IN
    SELECT (t.value->>'productId')::uuid AS product_id,
           SUM(GREATEST(COALESCE((t.value->>'quantity')::numeric, 0), 0)) AS cantidad
    FROM jsonb_array_elements(COALESCE(new_data->'products', '[]'::jsonb)) AS t(value)
    WHERE (t.value->>'productId') IS NOT NULL
      AND (t.value->>'productId') <> ''
      AND (t.value->>'productId') <> 'null'
    GROUP BY 1
  LOOP
    pid := v_nuevo.product_id;
    qty_nueva := v_nuevo.cantidad;
    v_vistos := v_vistos || pid;

    SELECT COALESCE(SUM(oi.quantity), 0) INTO qty_vieja
      FROM order_items oi WHERE oi.order_id = v_order_id AND oi.product_id = pid;

    delta := qty_nueva - qty_vieja;
    IF delta = 0 THEN CONTINUE; END IF;

    SELECT p.id, p.name, p.stock, p.unlimited_stock, p.track_stock, p.business_id
      INTO prod FROM products p WHERE p.id = pid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF prod.unlimited_stock OR NOT prod.track_stock OR prod.stock = -1 THEN CONTINUE; END IF;

    IF delta > 0 THEN
      -- Piden más unidades de esta línea: es un despacho nuevo sobre el delta.
      IF prod.stock < delta THEN
        RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', prod.name;
      END IF;
      UPDATE products SET stock = stock - delta WHERE id = pid;
      INSERT INTO stock_events (business_id, product_id, product_name, type, quantity, stock_after, order_id, created_by)
        VALUES (prod.business_id, pid, prod.name, 'despacho', delta, prod.stock - delta, v_order_id, auth.uid());

      IF public.producto_usa_lotes(pid) THEN
        FOR v_consumo IN SELECT * FROM public.consumir_lotes_fifo(pid, delta::integer) LOOP
          INSERT INTO tmp_consumo_lotes (product_id, lot_id, cantidad, costo_unitario)
          VALUES (pid, v_consumo.lot_id, v_consumo.cantidad, v_consumo.costo_unitario)
          ON CONFLICT (product_id, lot_id) DO UPDATE
            SET cantidad = tmp_consumo_lotes.cantidad + EXCLUDED.cantidad;
        END LOOP;
      END IF;
    ELSE
      -- Piden menos: devolver |delta| unidades.
      UPDATE products SET stock = stock - delta WHERE id = pid; -- delta negativo = stock sube
      INSERT INTO stock_events (business_id, product_id, product_name, type, quantity, stock_after, order_id, created_by)
        VALUES (prod.business_id, pid, prod.name, 'devolucion', -delta, prod.stock - delta, v_order_id, auth.uid());

      IF public.producto_usa_lotes(pid) THEN
        -- Se devuelve a los lotes que este pedido había consumido, empezando
        -- por el más nuevo: es la contraparte simétrica de "se pidió de más"
        -- (lo último que se tomó es lo primero que se suelta).
        v_restante := (-delta)::integer;
        FOR v_ol IN
          SELECT t.lot_id, t.cantidad
          FROM tmp_consumo_lotes t
          JOIN product_lots pl ON pl.id = t.lot_id
          WHERE t.product_id = pid
          ORDER BY pl.created_at DESC
        LOOP
          EXIT WHEN v_restante <= 0;
          v_tomar := LEAST(v_ol.cantidad, v_restante);
          PERFORM public.devolver_a_lote(v_ol.lot_id, v_tomar);
          UPDATE tmp_consumo_lotes
            SET cantidad = cantidad - v_tomar
            WHERE product_id = pid AND lot_id = v_ol.lot_id;
          v_restante := v_restante - v_tomar;
        END LOOP;
        DELETE FROM tmp_consumo_lotes WHERE product_id = pid AND cantidad <= 0;
        PERFORM public.recalcular_precio_producto(pid);
      END IF;
    END IF;
  END LOOP;

  -- 2. Líneas que existían y ya no están en la lista nueva: se devuelven enteras.
  FOR pid IN
    SELECT DISTINCT oi.product_id
    FROM order_items oi
    WHERE oi.order_id = v_order_id AND oi.product_id IS NOT NULL AND NOT (oi.product_id = ANY(v_vistos))
  LOOP
    SELECT COALESCE(SUM(oi.quantity), 0) INTO qty_vieja
      FROM order_items oi WHERE oi.order_id = v_order_id AND oi.product_id = pid;

    SELECT p.id, p.name, p.stock, p.unlimited_stock, p.track_stock, p.business_id
      INTO prod FROM products p WHERE p.id = pid FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF prod.unlimited_stock OR NOT prod.track_stock OR prod.stock = -1 THEN CONTINUE; END IF;

    IF qty_vieja > 0 THEN
      UPDATE products SET stock = stock + qty_vieja WHERE id = pid;
      INSERT INTO stock_events (business_id, product_id, product_name, type, quantity, stock_after, order_id, created_by)
        VALUES (prod.business_id, pid, prod.name, 'devolucion', qty_vieja, prod.stock + qty_vieja, v_order_id, auth.uid());
    END IF;

    IF public.producto_usa_lotes(pid) THEN
      FOR v_ol IN SELECT t.lot_id, t.cantidad FROM tmp_consumo_lotes t WHERE t.product_id = pid
      LOOP
        PERFORM public.devolver_a_lote(v_ol.lot_id, v_ol.cantidad);
      END LOOP;
      DELETE FROM tmp_consumo_lotes WHERE product_id = pid;
      PERFORM public.recalcular_precio_producto(pid);
    END IF;
  END LOOP;

  -- 3. Actualizar los campos del pedido y reconstruir order_items.
  UPDATE orders SET
    total = COALESCE((new_data->>'total')::numeric, orders.total),
    notes = COALESCE(NULLIF(TRIM(new_data->>'notes'), ''), orders.notes),
    deadline = CASE WHEN new_data->>'deadline' IS NOT NULL AND new_data->>'deadline' <> ''
                    THEN (new_data->>'deadline')::timestamptz ELSE orders.deadline END,
    customer_name = COALESCE(NULLIF(TRIM(new_data->>'customerName'), ''), orders.customer_name),
    delivery_address = COALESCE(NULLIF(TRIM(new_data->>'deliveryAddress'), ''), orders.delivery_address),
    updated_at = now()
  WHERE orders.id = v_order_id;

  DELETE FROM order_items WHERE order_items.order_id = v_order_id; -- cascada borra order_item_lots viejos

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(new_data->'products', '[]'::jsonb)) AS t(value)
  LOOP
    INSERT INTO order_items (order_id, product_id, product_name, quantity, price, production_area_id, area_status)
    VALUES (
      v_order_id,
      CASE WHEN (item->>'productId') IS NOT NULL AND (item->>'productId') <> '' AND (item->>'productId') <> 'null'
           THEN (item->>'productId')::uuid ELSE NULL END,
      COALESCE(NULLIF(item->>'name', ''), 'Producto'),
      GREATEST(COALESCE((item->>'quantity')::numeric, 1), 0.001),
      COALESCE((item->>'price')::numeric, 0),
      CASE WHEN (item->>'productionAreaId') IS NOT NULL AND (item->>'productionAreaId') <> '' AND (item->>'productionAreaId') <> 'null'
           THEN (item->>'productionAreaId')::uuid ELSE NULL END,
      COALESCE(NULLIF(item->>'areaStatus', ''), 'pending')::area_status_type
    );
  END LOOP;

  -- 4. Repartir el desglose de lotes sobre las líneas recién reconstruidas.
  --    En el caso normal (un producto = una línea) la última línea se lleva
  --    todo y queda igual que en create_order_with_stock; el reparto por cupo
  --    existe para que un producto repetido en dos líneas no termine con el
  --    mismo lote contado dos veces.
  FOR pid IN SELECT DISTINCT t.product_id FROM tmp_consumo_lotes t
  LOOP
    SELECT COUNT(*) INTO v_lineas
      FROM order_items oi WHERE oi.order_id = v_order_id AND oi.product_id = pid;
    IF v_lineas = 0 THEN CONTINUE; END IF;

    v_i := 0;
    FOR v_oi IN
      SELECT oi.id, oi.quantity FROM order_items oi
      WHERE oi.order_id = v_order_id AND oi.product_id = pid
      ORDER BY oi.created_at, oi.id
    LOOP
      v_i := v_i + 1;
      -- NULL = sin cupo: la última línea absorbe lo que quede (así no se
      -- pierde ninguna unidad del desglose si hubo deriva de datos).
      v_cupo := CASE WHEN v_i = v_lineas THEN NULL ELSE v_oi.quantity::integer END;
      v_item_id := v_oi.id;

      FOR v_ol IN
        SELECT t.lot_id, t.cantidad, t.costo_unitario
        FROM tmp_consumo_lotes t
        JOIN product_lots pl ON pl.id = t.lot_id
        WHERE t.product_id = pid AND t.cantidad > 0
        ORDER BY pl.created_at ASC
      LOOP
        EXIT WHEN v_cupo IS NOT NULL AND v_cupo <= 0;
        v_tomar := CASE WHEN v_cupo IS NULL THEN v_ol.cantidad ELSE LEAST(v_ol.cantidad, v_cupo) END;
        CONTINUE WHEN v_tomar <= 0;

        INSERT INTO order_item_lots (order_item_id, lot_id, cantidad, costo_unitario)
        VALUES (v_item_id, v_ol.lot_id, v_tomar, v_ol.costo_unitario);

        UPDATE tmp_consumo_lotes
          SET cantidad = cantidad - v_tomar
          WHERE product_id = pid AND lot_id = v_ol.lot_id;

        IF v_cupo IS NOT NULL THEN v_cupo := v_cupo - v_tomar; END IF;
      END LOOP;

      DELETE FROM tmp_consumo_lotes WHERE product_id = pid AND cantidad <= 0;

      -- order_items.price pasa a ser el promedio ponderado exacto de los lotes
      -- asignados a la línea: price × quantity da el costo real aunque la línea
      -- haya cruzado dos costos distintos.
      UPDATE order_items oi
        SET price = (
          SELECT SUM(ol.cantidad * ol.costo_unitario) / SUM(ol.cantidad)
          FROM order_item_lots ol WHERE ol.order_item_id = v_item_id
        )
        WHERE oi.id = v_item_id
          AND EXISTS (SELECT 1 FROM order_item_lots ol WHERE ol.order_item_id = v_item_id);
    END LOOP;
  END LOOP;

  -- 5. Recalcular el total desde las líneas reales, no desde lo que mandó el
  --    cliente: si alguna línea cruzó lotes, su price ya quedó reescrito al
  --    promedio ponderado exacto más arriba, y el total tiene que reflejar eso
  --    (mismo motivo por el que create_order_with_stock, Task 5, lo hace al
  --    final — sin esto el pedido queda cobrando el total viejo).
  UPDATE orders SET total = (
    SELECT COALESCE(SUM(oi.price * oi.quantity), 0) FROM order_items oi WHERE oi.order_id = v_order_id
  ) WHERE orders.id = v_order_id;
END;
$function$;
