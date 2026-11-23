-- Valores por defecto de las preferencias de notificaciones.
--
-- Estado del pedido: solo "Despachado" y "Recibido" encendidos; En preparación,
-- Listo y Cancelado arrancan apagados.
-- Catálogo (cambio de precio, producto nuevo): encendido solo para los locales,
-- que son los que compran; el resto lo enciende si quiere.
--
-- Se aplicó el mismo día en que nació la columna (20261111_a), cuando ningún
-- usuario había elegido nada todavía, así que no pisa elecciones de nadie.
--
-- Nota: en producción este archivo quedó partido en DOS entradas de
-- `schema_migrations`: 20261111140035 (el ALTER/UPDATE de abajo) y
-- 20261111140601 "20261111_c_notificaciones_default_por_rol_trigger" (la
-- función y el trigger). No falta nada en el repo — es el mismo SQL, aplicado
-- en dos tandas. No confundir ese `_c` de prod con el `20261111_c` del repo,
-- que es products_archived_at y se aplicó después (20261111155958).

ALTER TABLE public.profiles
  ALTER COLUMN notificaciones_silenciadas
  SET DEFAULT '{estado_preparacion,estado_listo,estado_cancelado,precio,producto_nuevo}';

UPDATE public.profiles
SET notificaciones_silenciadas = CASE
  WHEN role = 'local' THEN '{estado_preparacion,estado_listo,estado_cancelado}'::text[]
  ELSE '{estado_preparacion,estado_listo,estado_cancelado,precio,producto_nuevo}'::text[]
END
WHERE notificaciones_silenciadas = '{}';

-- Perfiles nuevos: el default de la columna deja el catálogo apagado; si el
-- perfil nace como local, se enciende (cambio de precio y producto nuevo).
CREATE OR REPLACE FUNCTION public.notificaciones_por_defecto_segun_rol()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'local' THEN
    NEW.notificaciones_silenciadas :=
      array_remove(array_remove(NEW.notificaciones_silenciadas, 'precio'), 'producto_nuevo');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notificaciones_por_defecto_segun_rol ON public.profiles;
CREATE TRIGGER notificaciones_por_defecto_segun_rol
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notificaciones_por_defecto_segun_rol();

REVOKE EXECUTE ON FUNCTION public.notificaciones_por_defecto_segun_rol() FROM PUBLIC, anon, authenticated;

-- Reversión:
--   DROP TRIGGER notificaciones_por_defecto_segun_rol ON public.profiles;
--   DROP FUNCTION public.notificaciones_por_defecto_segun_rol();
--   ALTER TABLE public.profiles ALTER COLUMN notificaciones_silenciadas SET DEFAULT '{}';
