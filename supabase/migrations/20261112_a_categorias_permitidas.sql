-- Categorías que puede pedir cada miembro (p. ej. un cliente nuevo que solo
-- compra Panadería).
--
-- Modelo: lista blanca. Un perfil SIN filas en esta tabla puede pedir todo
-- (así los locales existentes no cambian). Con filas, solo esas categorías y
-- sus subcategorías.
--
-- Por qué una tabla aparte y no una columna en `profiles`: la política
-- `profiles_update_own` deja que cada usuario edite su propio perfil (salvo rol
-- y negocio). Una columna ahí la podría vaciar el mismo local. Esta tabla no
-- tiene permisos de escritura para clientes: solo se cambia con
-- fijar_categorias_permitidas(), que exige ser admin del mismo negocio.
--
-- La restricción se hace cumplir en la base (trigger en order_items), no solo
-- en la pantalla: un pedido armado a mano con un producto de otra categoría se
-- rechaza. Como vive en order_items, cubre tanto crear pedidos
-- (create_order_with_stock) como editarlos (update_order_with_stock), sin
-- importar qué versión de esas funciones esté desplegada.

CREATE TABLE IF NOT EXISTS public.categorias_permitidas (
  profile_id  uuid NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, category_id)
);

CREATE INDEX IF NOT EXISTS categorias_permitidas_business_idx ON public.categorias_permitidas (business_id);

ALTER TABLE public.categorias_permitidas ENABLE ROW LEVEL SECURITY;

-- Lectura: cada uno ve las suyas (la pantalla de pedido las usa para filtrar el
-- catálogo) y el admin ve las de su negocio (pantalla Miembros).
CREATE OR REPLACE FUNCTION public.es_admin_del_negocio(p_business uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin' AND business_id = p_business
  );
$$;

DROP POLICY IF EXISTS categorias_permitidas_select ON public.categorias_permitidas;
CREATE POLICY categorias_permitidas_select ON public.categorias_permitidas
  FOR SELECT
  USING (profile_id = auth.uid() OR public.es_admin_del_negocio(business_id));

REVOKE ALL ON public.categorias_permitidas FROM anon, authenticated;
GRANT SELECT ON public.categorias_permitidas TO authenticated;

-- Escritura atómica: reemplaza la lista completa de un miembro. Lista vacía =
-- sin restricción (puede pedir todo).
CREATE OR REPLACE FUNCTION public.fijar_categorias_permitidas(p_profile uuid, p_categorias uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business uuid;
BEGIN
  SELECT business_id INTO v_business FROM profiles WHERE id = p_profile;
  IF v_business IS NULL OR NOT public.es_admin_del_negocio(v_business) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  -- Todas las categorías tienen que ser del mismo negocio.
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_categorias, ARRAY[]::uuid[])) AS c(id)
    LEFT JOIN categories cat ON cat.id = c.id
    WHERE cat.id IS NULL OR cat.business_id IS DISTINCT FROM v_business
  ) THEN
    RAISE EXCEPTION 'CATEGORIA_INVALIDA';
  END IF;

  DELETE FROM categorias_permitidas WHERE profile_id = p_profile;
  INSERT INTO categorias_permitidas (profile_id, category_id, business_id)
  SELECT p_profile, c.id, v_business
  FROM (SELECT DISTINCT unnest(COALESCE(p_categorias, ARRAY[]::uuid[])) AS id) c;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fijar_categorias_permitidas(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fijar_categorias_permitidas(uuid, uuid[]) TO authenticated;

-- Cumplimiento: cada línea de pedido que inserta un usuario restringido tiene
-- que ser de una categoría permitida (o de una subcategoría de una permitida).
-- Sin sesión (service role) o sin restricciones, no hace nada: el admin que
-- edita el pedido de un local restringido no queda limitado.
CREATE OR REPLACE FUNCTION public.validar_categoria_permitida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cat uuid;
  v_padre uuid;
  v_nombre text;
BEGIN
  IF auth.uid() IS NULL OR NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM categorias_permitidas WHERE profile_id = auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT p.category_id, c.parent_id, p.name
    INTO v_cat, v_padre, v_nombre
  FROM products p LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.id = NEW.product_id;

  IF v_cat IS NULL OR NOT EXISTS (
    SELECT 1 FROM categorias_permitidas
    WHERE profile_id = auth.uid() AND category_id IN (v_cat, v_padre)
  ) THEN
    RAISE EXCEPTION 'CATEGORIA_NO_PERMITIDA:%', COALESCE(v_nombre, 'producto');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_categoria_permitida ON public.order_items;
CREATE TRIGGER order_items_categoria_permitida
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.validar_categoria_permitida();
