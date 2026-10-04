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
