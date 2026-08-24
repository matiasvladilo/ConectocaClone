-- supabase/migrations/20260823_add_category_parent.sql
-- Subcategorías de UN SOLO NIVEL por auto-referencia. Se eligió esto sobre una
-- tabla `subcategories` aparte porque una subcategoría se comporta idéntico a
-- una categoría: así todo lo que ya funciona (productos, filtros, panel de
-- distribuidora) sigue funcionando sin duplicar el CRUD entero.
--
-- La profundidad máxima de 1 NO se puede expresar como constraint de columna
-- (requeriría un CHECK con subconsulta, que Postgres no permite). La impone el
-- Edge Function en POST y PUT /categories. Ver el spec del 2026-08-23.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT;

-- ON DELETE RESTRICT y no CASCADE: borrar una categoría padre NO debe llevarse
-- puestas sus subcategorías en silencio. El backend además lo chequea y devuelve
-- un 400 explicando el motivo; esto es la red de seguridad si ese chequeo se
-- saltea por cualquier vía.

-- La consulta que más se repite: "las hijas de X" (agrupar el listado, armar el
-- conjunto de ids del filtro, contar hijas antes de borrar).
CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories (parent_id);
