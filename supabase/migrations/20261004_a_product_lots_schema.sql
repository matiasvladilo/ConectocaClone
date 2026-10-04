-- supabase/migrations/20261004_a_product_lots_schema.sql
-- Costeo por lotes (FIFO) para productos de Distribuidora sin receta.
-- Ver docs/superpowers/specs/2026-10-04-costeo-por-lotes-fifo-distribuidora-design.md

CREATE TABLE IF NOT EXISTS public.product_lots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  costo_unitario    numeric NOT NULL CHECK (costo_unitario >= 0),
  cantidad_inicial  integer NOT NULL CHECK (cantidad_inicial >= 0),
  cantidad_restante integer NOT NULL CHECK (cantidad_restante >= 0),
  -- reposicion = compra real cargada por el usuario
  -- ajuste     = lote "fantasma" (ajuste al alza sin compra registrada, o
  --              faltante cubierto automáticamente cuando los lotes no
  --              alcanzan para un consumo)
  -- migracion  = lote inicial creado al activar la feature, a partir del
  --              stock y price que el producto ya tenía
  origen            text NOT NULL CHECK (origen IN ('reposicion', 'ajuste', 'migracion')),
  -- Referencia a la reposición que originó el lote, para cruzar con el
  -- kardex. Nullable: un lote de origen 'migracion' no tiene stock_event.
  stock_event_id    uuid REFERENCES public.stock_events(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- La consulta que importa: "el lote más viejo con stock de este producto".
CREATE INDEX IF NOT EXISTS product_lots_fifo_idx
  ON public.product_lots (product_id, created_at ASC)
  WHERE cantidad_restante > 0;

CREATE INDEX IF NOT EXISTS product_lots_business_idx
  ON public.product_lots (business_id);

-- RLS activo sin políticas = nadie accede con la anon key. Mismo patrón que
-- stock_events: solo el Edge Function (service_role) y las RPCs
-- SECURITY DEFINER tocan esta tabla.
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;

-- De qué lote salió cada unidad vendida. order_item_id SÍ puede ser FK real
-- (a diferencia de stock_events.product_id): si se borra el pedido, se borra
-- el order_item, y con él esta fila — es historia que solo tiene sentido
-- junto al pedido que la generó.
CREATE TABLE IF NOT EXISTS public.order_item_lots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id   uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  -- RESTRICT y no CASCADE: un lote con historia de ventas no se borra solo
  -- porque sí. Esta app no tiene una ruta para borrar lotes a mano (ver
  -- "Fuera de alcance" del spec), así que en la práctica nunca se dispara.
  lot_id          uuid NOT NULL REFERENCES public.product_lots(id) ON DELETE RESTRICT,
  cantidad        integer NOT NULL CHECK (cantidad > 0),
  -- Snapshot: igual razón que order_items.product_name/price ya son
  -- snapshots (comentario de la tabla real en Supabase). La historia no se
  -- tiene que mover si el lote cambia después.
  costo_unitario  numeric NOT NULL CHECK (costo_unitario >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_item_lots_order_item_idx
  ON public.order_item_lots (order_item_id);

CREATE INDEX IF NOT EXISTS order_item_lots_lot_idx
  ON public.order_item_lots (lot_id);

ALTER TABLE public.order_item_lots ENABLE ROW LEVEL SECURITY;

-- Tipo de retorno para consumir_lotes_fifo() y para acumular el detalle
-- dentro de create_order_with_stock() antes de que existan los order_items.
CREATE TYPE public.consumo_lote AS (
  product_id      uuid,
  lot_id          uuid,
  cantidad        integer,
  costo_unitario  numeric
);
