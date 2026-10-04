-- supabase/migrations/20261004_f_devolucion_lotes.sql
-- Task 8: al borrar un pedido, devolver cada unidad consumida al lote exacto
-- del que salió (DELETE /orders/:id), usando el detalle que Task 5 dejó en
-- order_item_lots. Dos funciones chicas, de una sola responsabilidad cada
-- una — no se mete esta lógica dentro de consumir_lotes_fifo/reponer_lote_fifo
-- porque "devolver" no es ni un consumo ni una compra nueva.
--
-- Ambas son LANGUAGE sql (no plpgsql): no hay variables declaradas, así que
-- la clase de bug de "columna ambigua con parámetro/variable" que afectó a
-- las Tasks 4 y 5 (ver 20261004_d_consumir_lotes_fifo.sql y
-- 20261004_e3_create_order_with_stock_total_sync.sql) no aplica acá — se
-- verificó de todas formas en vivo (ver task-8-report.md) que los nombres de
-- parámetro (p_lot_id, p_cantidad, p_product_id) no colisionan con ninguna
-- columna de product_lots/products referenciada sin calificar.

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
