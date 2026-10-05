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
