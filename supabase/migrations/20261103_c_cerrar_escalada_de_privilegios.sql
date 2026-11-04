-- C-02 y A-08 — Cerrar la escalada de privilegios por PostgREST.
--
-- ESTADO VERIFICADO EN PRODUCCIÓN ANTES DE ESTA MIGRACIÓN
--
-- Políticas (pg_policies):
--   public.profiles   | profiles_update_own      | UPDATE | (auth.uid() = id)                            | with_check = NULL
--   public.businesses | businesses_select_member | SELECT | (id = auth_business_id() OR owner_id = uid()) | with_check = NULL
--
-- Grants (information_schema.role_table_grants):
--   profiles   | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--   businesses | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- C-02: la política de UPDATE autoriza la propia fila y NO RESTRINGE COLUMNAS.
-- `role` y `business_id` están en esa misma fila. Cualquier usuario autenticado
-- podía hacer
--
--   PATCH /rest/v1/profiles?id=eq.<su id>   {"role":"admin","business_id":"<otro>"}
--
-- y quedar admin del negocio real. El Edge Function hace lo correcto —su
-- PUT /profile tiene lista blanca de name/address/notificationPrefs y no toca
-- role ni business_id— pero esa lista blanca no sirve de nada mientras exista la
-- ruta REST paralela.
--
-- A-08: la política de SELECT sobre businesses es de fila completa, así que
-- `invite_code` es legible por cualquier miembro vía
-- GET /rest/v1/businesses?select=invite_code. El Edge Function sí lo oculta a
-- quien no es propietario; la política no.
--
-- ESTA MIGRACIÓN NO SE APLICÓ. Ver docs/SECURITY_AUDIT.md.
--
-- NO ES DESTRUCTIVA: no borra ni modifica ninguna fila. Solo cambia permisos y
-- políticas. Es reversible con el bloque del final.

-- ─── profiles ────────────────────────────────────────────────────────────────

-- 1. Quitar el UPDATE de tabla completa y devolverlo solo sobre las columnas que
--    el usuario tiene por qué editar de sí mismo. Son exactamente las que ya
--    acepta el PUT /profile del Edge Function.
--
--    El grant por columna es la defensa principal: aunque mañana alguien
--    reescriba la política de forma laxa, sin el grant el UPDATE de `role` no
--    pasa.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (
  name,
  address,
  notification_pref_order_status,
  notification_pref_production
) ON public.profiles TO authenticated;

-- 2. INSERT y DELETE sobre profiles no los usa ningún camino del cliente: los
--    perfiles los crea el signup y el GET /profile, los dos con service_role.
--    No hay política que los autorice, así que hoy ya fallan — se revoca el
--    grant para que fallen por permiso y no por política, que es un borde menos.
REVOKE INSERT, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

-- 3. Segunda capa: WITH CHECK explícito que congela role y business_id.
--
--    Con `WITH CHECK` omitido, Postgres reusa la expresión de `USING` para
--    validar la fila nueva, y `auth.uid() = id` se cumple igual después de
--    cambiarse el rol. Hay que nombrar las columnas.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- El rol y el negocio solo los cambia el Edge Function (service_role, que
    -- no pasa por RLS): el alta por signup y el
    -- PUT /business/members/:id/role, que exige admin del mismo negocio.
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND business_id IS NOT DISTINCT FROM
        (SELECT p.business_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ─── businesses ──────────────────────────────────────────────────────────────

-- A-08: el código de invitación sale del SELECT directo. Se entrega únicamente
-- por GET /business del Edge Function, que ya aplica la regla de propietario.
REVOKE SELECT ON public.businesses FROM anon, authenticated;
GRANT SELECT (id, name, owner_id, created_at, updated_at) ON public.businesses TO authenticated;

-- Escribir negocios es cosa del signup y del regenerate-code, los dos con
-- service_role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.businesses FROM anon, authenticated;

-- ─── notifications ───────────────────────────────────────────────────────────

-- Misma clase de problema que profiles, con mucho menos alcance (solo filas
-- propias): `notifications_update_own` tampoco tiene WITH CHECK ni restricción
-- de columnas, así que un usuario puede reescribir el título y el texto de sus
-- propias notificaciones. Lo único que necesita poder cambiar es `read`.
REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON public.notifications FROM anon, authenticated;

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Resto de las tablas con políticas de SELECT ─────────────────────────────

-- products, orders, categories, ingredients y production_areas tienen política
-- de SELECT por negocio (correcta) pero conservan los grants de INSERT, UPDATE,
-- DELETE y TRUNCATE que Supabase da por defecto. Hoy esas escrituras fallan por
-- falta de política, pero el margen es incómodo: agregar una política de SELECT
-- demasiado amplia en el futuro, o una de ALL por descuido, abriría la escritura
-- de inmediato. Toda la escritura pasa por el Edge Function con service_role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.products         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_items      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.categories       FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ingredients      FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.production_areas FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.stock_events     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.product_lots     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_item_lots  FROM anon, authenticated;

-- anon no necesita leer nada de esto: la app exige sesión para todo salvo el
-- formulario público de reclamos, que usa su propia Edge Function.
REVOKE SELECT ON public.products         FROM anon;
REVOKE SELECT ON public.orders           FROM anon;
REVOKE SELECT ON public.order_items      FROM anon;
REVOKE SELECT ON public.categories       FROM anon;
REVOKE SELECT ON public.ingredients      FROM anon;
REVOKE SELECT ON public.production_areas FROM anon;
REVOKE SELECT ON public.profiles         FROM anon;
REVOKE SELECT ON public.notifications    FROM anon;

-- ─── Cómo revertir ───────────────────────────────────────────────────────────
--
-- Si algo del cliente dependía de una escritura directa que no se detectó,
-- esto devuelve el estado anterior (que es el estado por defecto de Supabase):
--
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, SELECT ON public.<tabla> TO anon, authenticated;
--   DROP POLICY profiles_update_own ON public.profiles;
--   CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id);
--
-- Antes de revertir conviene mirar los logs de PostgREST: un 401/403 ahí dice
-- qué camino quedó cortado, y casi siempre la respuesta correcta es moverlo al
-- Edge Function, no devolver el grant.
