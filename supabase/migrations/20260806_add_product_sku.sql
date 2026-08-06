-- supabase/migrations/20260806_add_product_sku.sql
-- Agrega el SKU / código de barras del producto.
-- Es opcional, pero si está cargado no puede repetirse dentro del mismo negocio.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text;

-- Índice único PARCIAL: la unicidad aplica por negocio y solo sobre SKUs cargados.
-- Sin el WHERE, todos los productos sin SKU colisionarían entre sí.
-- Es por negocio (no global) porque dos negocios distintos pueden vender el mismo
-- EAN: el código identifica al producto del fabricante, no al del negocio.
CREATE UNIQUE INDEX IF NOT EXISTS products_business_sku_unique
  ON products (business_id, sku)
  WHERE sku IS NOT NULL AND sku <> '';
