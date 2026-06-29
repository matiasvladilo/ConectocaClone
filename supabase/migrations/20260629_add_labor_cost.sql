-- supabase/migrations/20260629_add_labor_cost.sql
-- Agrega el costo de mano de obra como columna propia del producto.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS labor_cost numeric NOT NULL DEFAULT 0;
