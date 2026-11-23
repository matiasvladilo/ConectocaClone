-- Precios de compra observados en proveedores externos, uno por producto y
-- negocio (el más reciente gana: la PK es (business_id, product_id)).
--
-- RECONSTRUIDA DESDE PRODUCCIÓN el 2026-11-22. Se aplicó a mano en conectocadev
-- (versión 20261116000429) y el archivo nunca se commiteó; este SQL es el que
-- registró `supabase_migrations.schema_migrations`, no una reescritura.
--
-- Al 2026-11-22 la tabla tiene 200 filas pero NINGÚN código de este repo la
-- referencia: la escribe un proceso externo con service_role (el scraper de
-- precios / FinanzaOca). Ojo con esto antes de borrarla o cambiarle el esquema:
-- el productor vive fuera de este repositorio.
--
-- `reemplazar_precios_compra` es un reemplazo atómico de todo el set de un
-- negocio: toma un advisory lock por business_id, borra y reinserta, así dos
-- corridas simultáneas del scraper no se entrelazan. Devuelve cuántas filas
-- quedaron.
--
-- Seguridad: RLS activo y NINGUNA política, o sea anon y authenticated no leen
-- ni escriben nada, aunque el esquema `public` de Supabase les dé GRANT ALL por
-- defecto. La función es SECURITY DEFINER pero con el EXECUTE revocado a
-- PUBLIC/anon/authenticated y concedido solo a service_role.

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

ALTER TABLE public.precios_compra ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reemplazar_precios_compra(p_business_id uuid, p_precios jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
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

REVOKE EXECUTE ON FUNCTION public.reemplazar_precios_compra(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reemplazar_precios_compra(uuid, jsonb) TO service_role;

-- Reversión:
--   DROP FUNCTION public.reemplazar_precios_compra(uuid, jsonb);
--   DROP TABLE public.precios_compra;
