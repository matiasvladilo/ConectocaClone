-- C-01 (segunda parte) — Autorización dentro de create_order_with_stock.
--
-- La migración _a le quitó el EXECUTE a `anon`. Esto cierra el resto: la función
-- es SECURITY DEFINER (salta el RLS de products y de orders) y el frontend la
-- llama directo por supabase.rpc, así que todo lo que venga en `new_data` es
-- entrada del cliente. Antes de este cambio tomaba de ahí, sin validar:
--
--   NULLIF(new_data->>'businessId', '')::UUID   -- en qué negocio se crea
--   NULLIF(new_data->>'userId', '')::UUID       -- a nombre de quién
--
-- y descontaba stock con `WHERE id = pid`, sin filtrar por negocio. Un usuario
-- autenticado de cualquier negocio podía, con el UUID de un producto ajeno,
-- vaciarle el stock y consumirle los lotes FIFO.
--
-- Se aplica el mismo criterio que 20261004_j_..._autorizacion.sql le aplicó a
-- update_order_with_stock, con una diferencia: crear un pedido no es una acción
-- de staff, cualquier miembro del negocio puede hacerlo (es lo que hace un local
-- todos los días). Lo que se exige es que el negocio y el usuario del pedido
-- sean los del llamador, no los que mande el payload.
--
-- El resto del cuerpo es idéntico al que está hoy en producción.
--
-- ESTA MIGRACIÓN NO SE APLICÓ. Ver docs/SECURITY_AUDIT.md.

CREATE OR REPLACE FUNCTION public.create_order_with_stock(order_id text, new_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  v_business_id uuid;
  v_datos jsonb;
BEGIN
  -- ── Autorización ───────────────────────────────────────────────────────────
  -- Sin sesión, auth.uid() es NULL y no hay perfil: se rechaza. Esto es lo que
  -- vuelve inofensiva una llamada anónima incluso si el GRANT se reinstaurara
  -- por error en algún entorno.
  SELECT business_id INTO v_business_id FROM profiles WHERE id = auth.uid();

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  -- El negocio y el usuario del pedido se DERIVAN de la sesión y se reescriben
  -- sobre el payload. No se compara contra lo que mandó el cliente: se ignora.
  -- Comparar obligaría al frontend a adivinar bien y dejaría la puerta
  -- entreabierta; sobrescribir no.
  v_datos := new_data
    || jsonb_build_object(
         'businessId', v_business_id::text,
         'userId', auth.uid()::text
       );

  -- Ningún producto del pedido puede ser de otro negocio. Se valida ANTES de
  -- descontar nada: un pedido que mezcla productos de dos negocios no se arregla
  -- a medias.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_datos->'products', '[]'::jsonb)) AS t(value)
    JOIN products p ON p.id = (t.value->>'productId')::uuid
    WHERE (t.value->>'productId') IS NOT NULL
      AND (t.value->>'productId') <> ''
      AND (t.value->>'productId') <> 'null'
      AND p.business_id IS DISTINCT FROM v_business_id
  ) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  -- 1. Descuento atómico de stock (solo productos con stock controlado)
  FOR item IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_datos->'products', '[]'::jsonb)) AS t(value)
  LOOP
    IF (item->>'productId') IS NULL
       OR (item->>'productId') = ''
       OR (item->>'productId') = 'null' THEN
      CONTINUE;
    END IF;

    pid := (item->>'productId')::uuid;
    qty := GREATEST(COALESCE((item->>'quantity')::numeric, 0), 0);

    -- El filtro por business_id acá es redundante con la validación de arriba,
    -- y está igual: es la línea que hace que el descuento no pueda salirse del
    -- negocio ni aunque alguien agregue después otro camino de entrada.
    SELECT id, name, stock, unlimited_stock, track_stock, business_id
      INTO prod
      FROM products
      WHERE id = pid AND business_id = v_business_id
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

  -- 2. Crear el pedido reutilizando la función existente (misma transacción).
  --    Se le pasa v_datos, no new_data: es la versión con businessId y userId
  --    derivados de la sesión.
  PERFORM create_order_kv(order_id, v_datos);

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
  --
  --    Nota de seguridad: esto es también lo que vuelve irrelevante el `total`
  --    que manda el cliente. No hace falta validarlo porque se descarta.
  UPDATE orders SET total = (
    SELECT COALESCE(SUM(price * quantity), 0) FROM order_items WHERE order_items.order_id = v_order_id
  ) WHERE orders.id = v_order_id;
END;
$function$;

-- Se repiten los grants porque CREATE OR REPLACE no los altera, pero dejarlos
-- explícitos acá hace que esta migración sea autocontenida si se aplica sola.
REVOKE EXECUTE ON FUNCTION public.create_order_with_stock(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock(text, jsonb) TO authenticated, service_role;
