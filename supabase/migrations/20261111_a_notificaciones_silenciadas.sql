-- Preferencias de notificaciones por categoría.
--
-- Lista de categorías que el usuario NO quiere recibir (vacía = recibe todo).
-- Las claves viven en src/utils/preferenciasNotificaciones.ts y en el Edge
-- Function (categoriaDeNotificacion): 'pedido_nuevo', 'estado_preparacion',
-- 'estado_listo', 'estado_despachado', 'estado_recibido', 'estado_cancelado',
-- 'precio', 'producto_nuevo', 'stock', 'asistencia'.
--
-- El usuario la edita directo desde la app (PostgREST): la política
-- profiles_update_own limita a su propia fila y el GRANT por columna (como en
-- 20261103_c) le deja tocar solo esta columna además de las que ya tenía.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notificaciones_silenciadas text[] NOT NULL DEFAULT '{}';

GRANT UPDATE (notificaciones_silenciadas) ON public.profiles TO authenticated;

-- Reversión:
--   REVOKE UPDATE (notificaciones_silenciadas) ON public.profiles FROM authenticated;
--   ALTER TABLE public.profiles DROP COLUMN notificaciones_silenciadas;
