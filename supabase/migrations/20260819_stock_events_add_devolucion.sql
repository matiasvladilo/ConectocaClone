-- supabase/migrations/20260819_stock_events_add_devolucion.sql
-- Agrega el tipo 'devolucion' al kardex: stock que vuelve porque se borró un
-- pedido (DELETE /orders/:id restaura el stock de cada ítem).
--
-- Hacía falta un tipo propio y no reusar 'reposicion': una devolución no es
-- mercadería que entró, es un despacho que se deshizo. Mezclarlos inflaría la
-- señal de reposiciones justo en el dato que la feature quiere medir.
--
-- El CHECK de `type` se declaró inline en 20260819_create_stock_events.sql, así
-- que no tiene nombre explícito y Postgres se lo generó con la convención
-- <tabla>_<columna>_check, o sea `stock_events_type_check`. Por eso el DROP de
-- abajo usa ese nombre; el IF EXISTS lo hace idempotente y además tolera que en
-- algún entorno la restricción ya no esté.
--
-- Es seguro sobre una tabla con datos: el ADD revalida las filas existentes y
-- todas usan alguno de los cuatro tipos originales, que siguen permitidos.

ALTER TABLE public.stock_events DROP CONSTRAINT IF EXISTS stock_events_type_check;

ALTER TABLE public.stock_events ADD CONSTRAINT stock_events_type_check
  CHECK (type IN ('despacho', 'reposicion', 'merma', 'ajuste', 'devolucion'));
