-- supabase/migrations/20261004_d_consumir_lotes_fifo.sql
-- NOTE: The brief's original SQL had unqualified references to `costo_unitario` that
-- collide with the RETURN TABLE output column, causing "column reference is ambiguous"
-- at runtime. This version qualifies table columns via aliases (pl.*) to resolve the collision.
-- Also restores the brief's guarded UPDATE (with EXISTS) to avoid unnecessary updated_at triggers.
CREATE OR REPLACE FUNCTION public.consumir_lotes_fifo(p_product_id uuid, p_cantidad integer)
RETURNS TABLE(lot_id uuid, cantidad integer, costo_unitario numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restante integer := p_cantidad;
  v_lote record;
  v_tomar integer;
  v_ultimo_costo numeric;
  v_business_id uuid;
  v_lote_fantasma_id uuid;
  v_nuevo_precio numeric;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'CANTIDAD_INVALIDA';
  END IF;

  IF NOT public.producto_usa_lotes(p_product_id) THEN
    RAISE EXCEPTION 'PRODUCTO_FUERA_DE_ALCANCE:%', p_product_id;
  END IF;

  SELECT business_id INTO v_business_id FROM products WHERE id = p_product_id;

  FOR v_lote IN
    SELECT id, cantidad_restante, pl.costo_unitario AS costo_unitario
    FROM product_lots pl
    WHERE pl.product_id = p_product_id AND pl.cantidad_restante > 0
    ORDER BY pl.created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;

    v_tomar := LEAST(v_lote.cantidad_restante, v_restante);

    UPDATE product_lots
      SET cantidad_restante = cantidad_restante - v_tomar
      WHERE id = v_lote.id;

    lot_id := v_lote.id;
    cantidad := v_tomar;
    costo_unitario := v_lote.costo_unitario;
    RETURN NEXT;

    v_restante := v_restante - v_tomar;
    v_ultimo_costo := v_lote.costo_unitario;
  END LOOP;

  -- Los lotes no alcanzaron para cubrir la cantidad pedida (desincronización
  -- entre products.stock y la suma de lotes). En vez de bloquear la venta,
  -- se cubre el resto como un lote fantasma al último costo conocido —mismo
  -- criterio que un ajuste al alza— y queda un WARNING para poder auditarlo.
  IF v_restante > 0 THEN
    IF v_ultimo_costo IS NULL THEN
      SELECT price INTO v_ultimo_costo FROM products WHERE id = p_product_id;
    END IF;

    INSERT INTO product_lots (
      business_id, product_id, costo_unitario, cantidad_inicial, cantidad_restante, origen
    ) VALUES (
      v_business_id, p_product_id, v_ultimo_costo, v_restante, 0, 'ajuste'
    )
    RETURNING id INTO v_lote_fantasma_id;

    lot_id := v_lote_fantasma_id;
    cantidad := v_restante;
    costo_unitario := v_ultimo_costo;
    RETURN NEXT;

    RAISE WARNING 'LOTES_INSUFICIENTES: producto % necesitó % unidades de más al costo %',
      p_product_id, v_restante, v_ultimo_costo;
  END IF;

  -- Precio vigente = costo del lote más viejo que sigue con stock. Si no
  -- queda ninguno, products.price conserva el último valor conocido.
  UPDATE products
    SET price = (
      SELECT pl.costo_unitario FROM product_lots pl
      WHERE pl.product_id = p_product_id AND pl.cantidad_restante > 0
      ORDER BY pl.created_at ASC
      LIMIT 1
    )
    WHERE id = p_product_id
      AND EXISTS (
        SELECT 1 FROM product_lots WHERE product_id = p_product_id AND cantidad_restante > 0
      );
END;
$$;
