-- supabase/migrations/20261115_a_business_replenishment_settings.sql
-- «Para comprar»: días de cobertura y de aviso de la reposición, por negocio.
-- Mismo patrón que business_label_settings. Sin fila = valores por defecto (7 y 3),
-- definidos también en replenishment.ts (AJUSTES_POR_DEFECTO).

CREATE TABLE IF NOT EXISTS public.business_replenishment_settings (
  business_id   uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  coverage_days integer NOT NULL DEFAULT 7 CHECK (coverage_days BETWEEN 1 AND 60),
  alert_days    integer NOT NULL DEFAULT 3 CHECK (alert_days BETWEEN 1 AND 30),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  CHECK (alert_days <= coverage_days)
);

-- RLS activo sin políticas: nadie la toca con la anon key; solo el Edge Function
-- (service_role), igual que stock_events y product_lots.
ALTER TABLE public.business_replenishment_settings ENABLE ROW LEVEL SECURITY;
