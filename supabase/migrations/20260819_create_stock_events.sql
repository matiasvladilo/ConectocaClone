-- supabase/migrations/20260819_create_stock_events.sql
-- Kardex de movimientos de stock. Hasta ahora el único rastro de un cambio de
-- stock era el valor final en products.stock, que se sobrescribe: era imposible
-- saber POR QUÉ el stock pasó de 50 a 38. Cada fila acá es un evento inmutable.

CREATE TABLE IF NOT EXISTS public.stock_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL,

  -- product_id a propósito NO tiene foreign key. Un log de eventos es historia
  -- inmutable y tiene que sobrevivir al borrado del producto que lo generó
  -- (DELETE /products/:id borra físicamente). Por eso además se guarda
  -- product_name como snapshot: si el producto desaparece, el histórico sigue
  -- siendo legible.
  product_id   uuid NOT NULL,
  product_name text NOT NULL,

  -- despacho   = salida por pedido de un local (la genera la RPC)
  -- reposicion = entró mercadería (ajuste en modo "sumar", número positivo)
  -- merma      = rotura / vencimiento (ajuste en modo "sumar", número negativo)
  -- ajuste     = corrección de conteo (ajuste en modo "corregir total")
  type         text NOT NULL CHECK (type IN ('despacho', 'reposicion', 'merma', 'ajuste')),

  -- Siempre positiva: el signo lo da el `type`, no el número. Así las sumas por
  -- tipo no necesitan ABS() ni CASE.
  quantity     numeric NOT NULL CHECK (quantity > 0),

  -- Saldo resultante después del movimiento. Redundante pero barato, y permite
  -- reconstruir el stock a una fecha sin sumar toda la historia previa.
  stock_after  numeric,

  -- Solo en 'despacho'. Permite cruzar a orders.user_id para saber A QUÉ LOCAL
  -- se despachó, sin duplicar esa columna acá.
  order_id     uuid,

  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- La consulta principal del panel: movimientos de un SKU, más recientes primero.
CREATE INDEX IF NOT EXISTS stock_events_product_created_idx
  ON public.stock_events (product_id, created_at DESC);

-- Para los futuros análisis por negocio y rango de fechas.
CREATE INDEX IF NOT EXISTS stock_events_business_created_idx
  ON public.stock_events (business_id, created_at DESC);

-- RLS activo sin políticas = nadie puede leer/escribir con la anon key. El
-- frontend nunca toca esta tabla directamente. Los únicos accesos son:
--
--   1. El Edge Function, con la service_role key. Ese rol tiene BYPASSRLS, así
--      que efectivamente ignora las políticas.
--   2. La RPC create_order_with_stock, declarada SECURITY DEFINER.
--
-- OJO con el caso 2: SECURITY DEFINER NO "bypassea RLS". Lo único que hace es
-- correr la función con los privilegios del OWNER de la función en vez de los
-- del que la llama. Lo que evita RLS es otra cosa: que ese owner sea también el
-- owner de la tabla (el owner de una tabla no queda sujeto a sus políticas,
-- salvo que la tabla tenga FORCE ROW LEVEL SECURITY), o que tenga BYPASSRLS.
--
-- O sea que el acceso de la RPC depende de que el owner de la función y el de
-- stock_events coincidan, y eso hay que VERIFICARLO en cada entorno; no se
-- deduce del SECURITY DEFINER. El chequeo pre-vuelo está documentado en
-- docs/superpowers/plans/2026-08-19-panel-distribuidora.md. Si no coinciden, el
-- INSERT del kardex falla y —por ser la misma transacción— tumba la creación
-- del pedido entero.
ALTER TABLE public.stock_events ENABLE ROW LEVEL SECURITY;
