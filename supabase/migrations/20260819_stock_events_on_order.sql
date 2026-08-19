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
