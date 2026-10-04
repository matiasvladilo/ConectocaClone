-- supabase/migrations/20261004_e2_producto_usa_lotes_sin_decimales.sql
-- Fix de code review sobre Task 5: excluir productos allow_decimal del alcance
-- de costeo por lotes.
--
-- Motivo: consumir_lotes_fifo(p_product_id, p_cantidad integer) trunca/redondea
-- la cantidad a entero, y product_lots.cantidad_restante también es integer.
-- Un producto allow_decimal=true (ej. "Snickers Almendra", vendido por
-- fracciones) puede generar:
--   - qty=0.25 -> (0.25)::integer = 0 -> consumir_lotes_fifo lanza
--     CANTIDAD_INVALIDA -> toda la creación del pedido falla (0 filas en orders).
--   - qty=1.5 -> products.stock (integer) descuenta redondeando a 2, pero
--     round(1.5) en Postgres usa "round half to even" => 2; en otros casos el
--     redondeo de qty::integer puede no coincidir con el descuento real de
--     stock, desincronizando products.stock vs. product_lots.cantidad_restante.
--
-- products.stock ya es integer (no numeric): el soporte de cantidades
-- fraccionarias es una limitación latente y aceptada del sistema (ver
-- docs/.../2026-09-07-stock-una-sola-via-design.md), no algo que este plan de
-- costeo por lotes se propuso resolver. La solución correcta acá es simple:
-- un producto que permite decimales nunca entra al alcance de lotes.
CREATE OR REPLACE FUNCTION public.producto_usa_lotes(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      p.category_id IS NOT NULL
      AND NOT COALESCE(p.allow_decimal, false)
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
