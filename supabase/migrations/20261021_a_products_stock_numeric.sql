-- products.stock pasa de integer a numeric para los productos con
-- "Venta por fracción" (allow_decimal). Con integer, un stock inicial de 6.8
-- no se podía guardar y vender 0.5 hacía `stock - 0.5`, que Postgres
-- redondeaba de vuelta al entero: el stock nunca bajaba.
--
-- Los valores actuales no cambian (todo entero es un numeric válido). El
-- CHECK (stock >= 0) y el default 0 se mantienen solos.
--
-- Los lotes (product_lots, order_item_lots) siguen en integer a propósito:
-- producto_usa_lotes excluye los productos con allow_decimal, así que los
-- `qty::integer` de create/update_order_with_stock solo corren con
-- cantidades enteras.
ALTER TABLE public.products
  ALTER COLUMN stock TYPE numeric USING stock::numeric;
