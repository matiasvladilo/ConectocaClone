-- C-03 — Sacar las tablas de respaldo de la API pública.
--
-- PROBADO EN VIVO CONTRA PRODUCCIÓN, sin sesión, solo con la clave anónima
-- (la que viaja en el bundle JS):
--
--   GET /rest/v1/backup_ingredients_20260629?select=*&limit=2          -> HTTP 200
--   GET /rest/v1/backup_products_labor_20260629?select=*&limit=2       -> HTTP 200
--   GET /rest/v1/backup_product_ingredients_20260629?select=*&limit=2  -> HTTP 200
--
-- La primera respuesta trae business_id, name, unit, current_stock, min_stock,
-- cost_per_unit y supplier de materias primas reales. Son 91 materias primas con
-- costo y proveedor, 305 líneas de receta y 95 costos de mano de obra, legibles
-- sin autenticar.
--
-- Y los grants incluyen UPDATE, DELETE y TRUNCATE para `anon`: cualquiera podía
-- BORRAR los respaldos, que es lo que se usaría para recuperarse de un incidente.
--
-- Además, el business_id del negocio real sale de acá, y es el punto de partida
-- de la cadena de C-02.
--
-- ESTA MIGRACIÓN NO SE APLICÓ. Ver docs/SECURITY_AUDIT.md.
--
-- NO BORRA DATOS: mueve las tablas de esquema. `public` es el esquema que
-- PostgREST expone; `backups` no está en la lista de esquemas expuestos, así que
-- dejan de ser alcanzables por la API y siguen intactas y consultables desde el
-- SQL editor o un psql. Es reversible con el bloque del final.

CREATE SCHEMA IF NOT EXISTS backups;

COMMENT ON SCHEMA backups IS
  'Respaldos puntuales de migraciones. Fuera de `public` a propósito: PostgREST '
  'no expone este esquema. No agregarlo a la configuración de esquemas expuestos.';

-- Por si acaso: que nadie herede permisos por el esquema.
REVOKE ALL ON SCHEMA backups FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA backups TO service_role;

ALTER TABLE IF EXISTS public.backup_ingredients_20260629         SET SCHEMA backups;
ALTER TABLE IF EXISTS public.backup_product_ingredients_20260629 SET SCHEMA backups;
ALTER TABLE IF EXISTS public.backup_products_labor_20260629      SET SCHEMA backups;

-- Mover de esquema conserva los grants que ya tenían las tablas, así que hay que
-- revocarlos explícitamente: sin esto, seguirían siendo legibles si alguien
-- agregara `backups` a los esquemas expuestos.
REVOKE ALL ON ALL TABLES IN SCHEMA backups FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA backups TO service_role;

-- Y RLS encima, como última capa. Sin políticas queda en denegar-todo, que es
-- exactamente lo que corresponde a un respaldo: nadie lo lee por la API.
ALTER TABLE backups.backup_ingredients_20260629         ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups.backup_product_ingredients_20260629 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups.backup_products_labor_20260629      ENABLE ROW LEVEL SECURITY;

-- ─── Sobre eliminarlas ───────────────────────────────────────────────────────
--
-- Son respaldos del 2026-06-29 de una migración ya aplicada
-- (20260629_migrate_labor_cost.sql). A cuatro meses, probablemente ya no
-- aporten y sí sumen superficie. Pero ESA DECISIÓN NO ES DE LA AUDITORÍA:
-- borrar datos es del dueño del dato. Esta migración los deja fuera de alcance
-- sin tocarlos. Si después se confirma que no se necesitan:
--
--   DROP TABLE backups.backup_ingredients_20260629;
--   DROP TABLE backups.backup_product_ingredients_20260629;
--   DROP TABLE backups.backup_products_labor_20260629;
--
-- ─── Cómo revertir ───────────────────────────────────────────────────────────
--
--   ALTER TABLE backups.backup_ingredients_20260629 SET SCHEMA public;
--   (ídem las otras dos)
--
-- No hace falta restaurar los grants de anon: eran el problema.
