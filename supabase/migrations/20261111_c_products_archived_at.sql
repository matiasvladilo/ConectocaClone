-- Productos archivados.
--
-- Un producto que ya se usó en pedidos no se puede borrar: el borrado cascadea
-- a product_lots, y order_item_lots.lot_id referencia esos lotes (es el
-- registro de qué lote/costo consumió cada pedido, y lo usan la edición y la
-- anulación de pedidos para devolver stock). Postgres rechaza el DELETE.
--
-- Antes el endpoint DELETE /products/:id ignoraba ese error y respondía
-- "eliminado", así que el producto reaparecía al recargar. Ahora, si el
-- borrado choca con historial, el producto se archiva: deja de listarse en el
-- catálogo, pero el historial de pedidos y costos queda intacto.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.products.archived_at IS
  'Fecha en que se archivó el producto (eliminado desde la app pero con pedidos asociados). NULL = activo.';
