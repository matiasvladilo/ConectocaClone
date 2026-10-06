-- supabase/migrations/20261004_l_previsualizar_precio_lotes_edicion.sql
-- previsualizar_precio_lotes (20261004_k_...) sirve para un carrito NUEVO
-- (NewOrderForm), donde nada está reservado todavía. Reutilizarla tal cual en
-- EditOrderDialog da un resultado incorrecto: product_lots.cantidad_restante
-- YA tiene descontadas las unidades que el pedido que se está editando
-- consumió la primera vez, así que una simulación "desde cero" ve esos lotes
-- más vacíos (o en 0) de lo que realmente están disponibles para este pedido,
-- y devuelve un precio más caro del que el guardado real va a cobrar.
-- Reproducido en vivo: pedido de 4 unidades de "Prueba" (3 lote @$100 + 1
-- lote @$300, guardado price=$150) — previsualizar_precio_lotes(producto, 4)
-- contra los lotes vivos (el de $100 ya en 0 porque este MISMO pedido se lo
-- llevó) daba $300, no $150.
--
-- Esta función espeja la lógica real de update_order_with_stock
-- (20261004_j_...) en vez de la de creación: parte del desglose
-- order_item_lots que el pedido YA tiene para este producto, y solo simula
-- el DELTA contra la cantidad nueva — consumo fresco de lotes vivos si sube,
-- devolución empezando por el lote más nuevo que el pedido consumió si baja —
-- exactamente como lo hace el guardado real. Es de solo lectura: no toca
-- product_lots ni order_item_lots.
CREATE OR REPLACE FUNCTION public.previsualizar_precio_lotes_edicion(
  p_order_id uuid,
  p_product_id uuid,
  p_cantidad_nueva integer
)
RETURNS TABLE(precio_unitario numeric, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_qty_vieja integer;
  v_costo_total_viejo numeric;
  v_restante integer;
  v_lote record;
  v_ol record;
  v_tomar integer;
  v_suma_costo numeric := 0;
  v_suma_cantidad integer := 0;
  v_ultimo_costo numeric;
  v_precio numeric;
  v_delta integer;
BEGIN
  IF p_cantidad_nueva IS NULL OR p_cantidad_nueva <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  -- Autorización: tanto el pedido como el producto tienen que ser del
  -- negocio del usuario autenticado (SECURITY DEFINER salta el RLS de
  -- orders/products; no se puede confiar en que el cliente solo pida IDs de
  -- su propio negocio). Mismo criterio que update_order_with_stock.
  IF NOT EXISTS (
    SELECT 1 FROM orders o
    JOIN profiles pr ON pr.id = auth.uid()
    WHERE o.id = p_order_id AND o.business_id = pr.business_id
  ) THEN
    RAISE EXCEPTION 'NO_AUTORIZADO';
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

  -- Lo que este pedido ya tiene comprometido para este producto (0 si es una
  -- línea nueva que todavía no se guardó, o un pedido legacy sin desglose).
  SELECT COALESCE(SUM(ol.cantidad), 0)::integer, COALESCE(SUM(ol.cantidad * ol.costo_unitario), 0)
    INTO v_qty_vieja, v_costo_total_viejo
  FROM order_item_lots ol
  JOIN order_items oi ON oi.id = ol.order_item_id
  WHERE oi.order_id = p_order_id AND oi.product_id = p_product_id;

  v_delta := p_cantidad_nueva - v_qty_vieja;

  IF v_delta > 0 THEN
    -- Pide más: lo ya comprometido no se toca; el delta se cotiza fresco
    -- contra los lotes vivos, igual que create_order_with_stock.
    v_restante := v_delta;
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

    IF v_restante > 0 THEN
      IF v_ultimo_costo IS NULL THEN
        SELECT price INTO v_ultimo_costo FROM products WHERE id = p_product_id;
      END IF;
      v_suma_costo := v_suma_costo + v_restante * v_ultimo_costo;
      v_suma_cantidad := v_suma_cantidad + v_restante;
    END IF;

    v_precio := ROUND((v_costo_total_viejo + v_suma_costo) / (v_qty_vieja + v_suma_cantidad), 2);
  ELSE
    -- Pide menos (o igual): se devuelven |delta| unidades empezando por el
    -- lote MÁS NUEVO que este pedido había consumido —misma regla simétrica
    -- que update_order_with_stock— y se recalcula el promedio sobre lo que
    -- queda. Con delta = 0 el loop no entra y el precio es el ya guardado.
    v_restante := -v_delta;
    FOR v_ol IN
      SELECT SUM(ol.cantidad)::integer AS cantidad,
             SUM(ol.cantidad * ol.costo_unitario) / SUM(ol.cantidad) AS costo_prom
      FROM order_item_lots ol
      JOIN order_items oi ON oi.id = ol.order_item_id
      JOIN product_lots pl ON pl.id = ol.lot_id
      WHERE oi.order_id = p_order_id AND oi.product_id = p_product_id
      GROUP BY ol.lot_id, pl.created_at
      ORDER BY pl.created_at DESC
    LOOP
      EXIT WHEN v_restante <= 0;

      v_tomar := LEAST(v_ol.cantidad, v_restante);
      v_costo_total_viejo := v_costo_total_viejo - v_tomar * v_ol.costo_prom;
      v_restante := v_restante - v_tomar;
    END LOOP;

    v_precio := ROUND(v_costo_total_viejo / p_cantidad_nueva, 2);
  END IF;

  precio_unitario := v_precio;
  total := v_precio * p_cantidad_nueva;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.previsualizar_precio_lotes_edicion(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_precio_lotes_edicion(uuid, uuid, integer) TO authenticated;
