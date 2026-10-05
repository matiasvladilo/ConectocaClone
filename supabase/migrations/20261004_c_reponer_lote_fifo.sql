CREATE OR REPLACE FUNCTION public.reponer_lote_fifo(
  p_product_id uuid,
  p_cantidad integer,
  p_costo_unitario numeric,
  p_origen text DEFAULT 'reposicion',
  p_stock_event_id uuid DEFAULT NULL
)
RETURNS public.product_lots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_lote public.product_lots;
  v_hay_lote_activo boolean;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  IF NOT public.producto_usa_lotes(p_product_id) THEN
    RAISE EXCEPTION 'PRODUCTO_FUERA_DE_ALCANCE:%', p_product_id;
  END IF;

  SELECT business_id INTO v_business_id FROM products WHERE id = p_product_id FOR UPDATE;

  -- El lote nuevo se va al final de la fila: si ya había un lote con stock,
  -- el precio de venta no cambia todavía (es el comportamiento pedido: 3
  -- viejas a $1000, entran 5 a $1200, el precio sigue en $1000).
  SELECT EXISTS (
    SELECT 1 FROM product_lots WHERE product_id = p_product_id AND cantidad_restante > 0
  ) INTO v_hay_lote_activo;

  INSERT INTO product_lots (
    business_id, product_id, costo_unitario, cantidad_inicial, cantidad_restante, origen, stock_event_id
  ) VALUES (
    v_business_id, p_product_id, p_costo_unitario, p_cantidad, p_cantidad, p_origen, p_stock_event_id
  )
  RETURNING * INTO v_lote;

  IF NOT v_hay_lote_activo THEN
    UPDATE products SET price = p_costo_unitario WHERE id = p_product_id;
  END IF;

  RETURN v_lote;
END;
$$;
