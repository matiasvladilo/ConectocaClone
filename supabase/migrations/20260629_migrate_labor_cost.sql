-- supabase/migrations/20260629_migrate_labor_cost.sql
-- Migra el ingrediente falso "Costo Mano de Obra" a products.labor_cost.
-- Reversible: hacer backup de product_ingredients antes de correr (ver Step 2 del plan).

-- 1. Copiar la cantidad del ingrediente falso a products.labor_cost
UPDATE products p
SET labor_cost = pi.quantity
FROM product_ingredients pi
JOIN ingredients i ON i.id = pi.ingredient_id
WHERE pi.product_id = p.id
  AND i.name = 'Costo Mano de Obra';

-- 2. Quitar las filas del ingrediente falso de las recetas
DELETE FROM product_ingredients pi
USING ingredients i
WHERE pi.ingredient_id = i.id
  AND i.name = 'Costo Mano de Obra';

-- 3. Eliminar el ingrediente falso del listado de materias primas
DELETE FROM ingredients
WHERE name = 'Costo Mano de Obra';
