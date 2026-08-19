-- supabase/migrations/20260819_add_product_min_stock.sql
-- Umbral de "stock bajo" por producto. Hasta ahora el umbral era un 10 fijo
-- hardcodeado en el frontend para todos los SKU por igual.
-- Es NULL-able a propósito: los productos ya cargados no tienen umbral definido
-- y el panel usa un default (10) para ellos, así funciona desde el día uno sin
-- tener que configurar cada SKU a mano.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_stock numeric;
