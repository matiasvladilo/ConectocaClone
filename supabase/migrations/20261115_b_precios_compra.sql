-- supabase/migrations/20261115_b_precios_compra.sql
-- Conexión con Oca Pricing: el mejor precio de compra de cada producto, enviado cada madrugada.
-- Spec: docs/superpowers/specs/2026-11-15-conexion-oca-pricing-design.md

CREATE TABLE IF NOT EXISTS public.precios_compra (
  business_id      uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  proveedor        text NOT NULL,
  proveedor_nombre text NOT NULL,
  precio_unidad    numeric NOT NULL CHECK (precio_unidad > 0),
  formato_unidades integer CHECK (formato_unidades >= 1),
  formato          text NOT NULL DEFAULT '',
  observado_en     timestamptz NOT NULL,
  url              text NOT NULL DEFAULT '',
  recibido_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, product_id)
);

-- RLS activo sin políticas: solo la Edge Function (service_role), como stock_events.
ALTER TABLE public.precios_compra ENABLE ROW LEVEL SECURITY;

-- Reemplaza TODO el conjunto del negocio en una transacción (la función es atómica):
-- un envío parcial nunca deja mezclados precios viejos y nuevos.
CREATE OR REPLACE FUNCTION public.reemplazar_precios_compra(p_business_id uuid, p_precios jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  -- Serializa envíos simultáneos del mismo negocio (evita choques de clave primaria).
  PERFORM pg_advisory_xact_lock(hashtext(p_business_id::text));
  DELETE FROM public.precios_compra WHERE business_id = p_business_id;
  INSERT INTO public.precios_compra
    (business_id, product_id, proveedor, proveedor_nombre, precio_unidad, formato_unidades, formato, observado_en, url)
  SELECT p_business_id,
         (x->>'productId')::uuid,
         x->>'proveedor',
         x->>'proveedorNombre',
         (x->>'precioUnidad')::numeric,
         NULLIF(x->>'formatoUnidades', '')::integer,
         COALESCE(x->>'formato', ''),
         (x->>'observadoEn')::timestamptz,
         COALESCE(x->>'url', '')
  FROM jsonb_array_elements(p_precios) AS x;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Igual que 20261004_i: revocar PUBLIC además de anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.reemplazar_precios_compra(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_precios_compra(uuid, jsonb) TO service_role;
