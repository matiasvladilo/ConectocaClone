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
