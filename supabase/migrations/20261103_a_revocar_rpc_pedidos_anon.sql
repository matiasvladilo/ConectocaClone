-- C-01 — Revocar las dos RPC de pedidos que `anon` podía ejecutar.
--
-- Estado verificado en producción (conectocadev) antes de esta migración:
--
--   proname                  | anon_exec | auth_exec
--   create_order_kv          | true      | true
--   create_order_with_stock  | true      | true
--
-- Ninguna de las dos consulta auth.uid() para autorizar. `create_order_with_stock`
-- toma business_id y user_id del JSONB del cliente y descuenta stock buscando el
-- producto solo por id, sin filtrar por negocio. `create_order_kv` hace
-- ON CONFLICT (id) DO UPDATE sobre orders y DELETE de sus order_items.
--
-- Es decir: con sola la clave anónima — que viaja en el bundle JS — se podían
-- crear pedidos en cualquier negocio, sobrescribir cualquier pedido existente por
-- UUID, borrar sus líneas y vaciar el stock de cualquier producto.
--
-- Este es exactamente el arreglo que la migración
-- 20261004_j_update_order_with_stock_autorizacion.sql ya le aplicó a la función
-- hermana `update_order_with_stock`. Las dos de acá quedaron fuera de ese barrido.
--
-- ESTA MIGRACIÓN NO SE APLICÓ. Ver docs/SECURITY_AUDIT.md.

-- ── create_order_kv ──────────────────────────────────────────────────────────
-- Es una subrutina interna: la llama create_order_with_stock por PERFORM, dentro
-- de la misma transacción. Nadie debería invocarla desde la API, ni anónimo ni
-- autenticado. PERFORM desde una función SECURITY DEFINER no necesita el grant,
-- así que revocarla a ambos roles no rompe esa vía interna.
REVOKE EXECUTE ON FUNCTION public.create_order_kv(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_kv(text, jsonb) TO service_role;

-- ── create_order_with_stock ──────────────────────────────────────────────────
-- Esta sí la llama el cliente (src/utils/api.tsx, ordersAPI.create) con el token
-- del usuario, así que `authenticated` conserva el EXECUTE. Lo que se le quita es
-- `anon`, y se le agrega autorización adentro (migración _b, a continuación).
REVOKE EXECUTE ON FUNCTION public.create_order_with_stock(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock(text, jsonb) TO authenticated, service_role;

-- ── auth_business_id ─────────────────────────────────────────────────────────
-- B-03 y el lint anon_security_definer_function_executable. De esta función
-- dependen seis políticas RLS, así que su search_path mutable es el más
-- relevante de los tres que marca el linter. Para `anon` devuelve NULL (no hay
-- auth.uid()), pero no hay motivo para que sea invocable sin sesión.
ALTER FUNCTION public.auth_business_id() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.auth_business_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_business_id() TO authenticated, service_role;

-- Los otros dos casos de search_path mutable que reporta el linter.
ALTER FUNCTION public.create_order_kv(text, jsonb) SET search_path = public;
ALTER FUNCTION public._update_updated_at() SET search_path = public;
