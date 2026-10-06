-- supabase/migrations/20261004_k_previsualizar_precio_lotes.sql
-- Seguimiento post-deploy: el carrito de NewOrderForm mostraba
-- product.price × quantity como total antes de confirmar, pero para un
-- producto de Distribuidora el precio real que se cobra (order_items.price,
-- ver create_order_with_stock / update_order_with_stock) es el promedio
-- ponderado de los lotes FIFO que la línea termina consumiendo. Si el pedido
-- cruza dos lotes de costo muy distinto, esa cuenta simple quedaba lejos del
-- cobro real (ej.: carrito mostraba $25.500 para un cobro real de $4.500) y
-- se reportó como si fuera un bug.
--
-- Esta función es de SOLO LECTURA: simula el mismo recorrido FIFO que
-- consumir_lotes_fifo (mismo orden por created_at, mismo fallback al último
-- costo conocido si los lotes no alcanzan a cubrir la cantidad) pero sin
-- tocar product_lots, para que el frontend pueda mostrar el precio real
-- ANTES de confirmar el pedido.
--
-- A diferencia de consumir_lotes_fifo (bloqueada para authenticated en
-- 20261004_i_..., solo se llama internamente desde las RPC de pedidos), esta
-- SÍ se llama directo desde el frontend, así que necesita su propio chequeo
-- de autorización: el producto tiene que pertenecer al negocio del usuario
-- autenticado (SECURITY DEFINER salta el RLS de products, no se puede confiar
-- en que el cliente solo pida IDs de su propio negocio).
CREATE OR REPLACE FUNCTION public.previsualizar_precio_lotes(p_product_id uuid, p_cantidad integer)
RETURNS TABLE(precio_unitario numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_restante integer;
  v_lote record;
  v_tomar integer;
  v_suma_costo numeric := 0;
  v_suma_cantidad integer := 0;
  v_ultimo_costo numeric;
  v_precio numeric;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM products p
    JOIN profiles pr ON pr.id = auth.uid()
    WHERE p.id = p_product_id AND p.business_id = pr.business_id
  ) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
  END IF;

  IF NOT public.producto_usa_lotes(p_product_id) THEN
    RAISE EXCEPTION 'PRODUCTO_FUERA_DE_ALCANCE:%', p_product_id;
  END IF;

  v_restante := p_cantidad;

  FOR v_lote IN
    SELECT pl.cantidad_restante, pl.costo_unitario
    FROM product_lots pl
    WHERE pl.product_id = p_product_id AND pl.cantidad_restante > 0
    ORDER BY pl.created_at ASC
  LOOP
    EXIT WHEN v_restante <= 0;

    v_tomar := LEAST(v_lote.cantidad_restante, v_restante);
    v_suma_costo := v_suma_costo + v_tomar * v_lote.costo_unitario;
    v_suma_cantidad := v_suma_cantidad + v_tomar;
    v_restante := v_restante - v_tomar;
    v_ultimo_costo := v_lote.costo_unitario;
  END LOOP;

  -- Mismo criterio que consumir_lotes_fifo: si los lotes no alcanzan (stock
  -- desincronizado, p.ej. unidades cargadas antes de que el producto entrara
  -- en alcance), el resto se cotiza al último costo conocido, o al precio
  -- vigente del producto si no hay ningún lote con stock. Así la
  -- previsualización coincide con lo que el pedido real va a cobrar.
  IF v_restante > 0 THEN
    IF v_ultimo_costo IS NULL THEN
      SELECT price INTO v_ultimo_costo FROM products WHERE id = p_product_id;
    END IF;
    v_suma_costo := v_suma_costo + v_restante * v_ultimo_costo;
    v_suma_cantidad := v_suma_cantidad + v_restante;
  END IF;

  v_precio := ROUND(v_suma_costo / v_suma_cantidad, 2);

  precio_unitario := v_precio;
  total := v_precio * p_cantidad;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.previsualizar_precio_lotes(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_precio_lotes(uuid, integer) TO authenticated;
