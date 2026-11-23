-- Parámetros de reposición por negocio: cuántos días de stock se quiere cubrir
-- y con cuánta antelación avisar.
--
-- RECONSTRUIDA DESDE PRODUCCIÓN el 2026-11-22. Se aplicó a mano en conectocadev
-- (versión 20261116000420) y el archivo nunca se commiteó; este SQL es el que
-- registró `supabase_migrations.schema_migrations`, no una reescritura.
--
-- Al 2026-11-22 la tabla está VACÍA y ningún código del repo la referencia:
-- quedó creada por adelantado para una pantalla de ajustes de reposición que
-- todavía no existe. Si no se va a usar, se puede borrar (ver reversión).
--
-- Seguridad: RLS activo y NINGUNA política, o sea anon y authenticated no leen
-- ni escriben nada, aunque el esquema `public` de Supabase les dé GRANT ALL por
-- defecto. Solo service_role entra, porque hace bypass de RLS. Si algún día se
-- expone al cliente hay que escribir las políticas por business_id.

CREATE TABLE IF NOT EXISTS public.business_replenishment_settings (
  business_id   uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  coverage_days integer NOT NULL DEFAULT 7 CHECK (coverage_days BETWEEN 1 AND 60),
  alert_days    integer NOT NULL DEFAULT 3 CHECK (alert_days BETWEEN 1 AND 30),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  CHECK (alert_days <= coverage_days)
);

ALTER TABLE public.business_replenishment_settings ENABLE ROW LEVEL SECURITY;

-- Reversión:
--   DROP TABLE public.business_replenishment_settings;
