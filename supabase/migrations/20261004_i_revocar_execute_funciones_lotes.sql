-- supabase/migrations/20261004_i_revocar_execute_funciones_lotes.sql
-- Review final de la rama: las funciones de manipulación de lotes quedaron con
-- EXECUTE para PUBLIC/anon/authenticated (default de Supabase para funciones
-- nuevas). Casi todas son SECURITY DEFINER (corren como postgres, saltan RLS),
-- así que cualquier usuario logueado podía llamar, p.ej.,
-- `reponer_lote_fifo(<producto de cualquier negocio>, 1, 1)` desde la consola
-- del navegador y fijar el precio de venta de ese producto a lo que quisiera.
--
-- Solo están pensadas para dos llamadores:
--   - la Edge Function, que usa supabaseAdmin (service_role) → conserva EXECUTE;
--   - create_order_with_stock / update_order_with_stock, que son SECURITY
--     DEFINER con owner postgres: llaman a estas funciones COMO postgres, y el
--     owner conserva siempre sus privilegios sobre sus propias funciones, así
--     que este REVOKE no rompe esa vía interna.
--
-- producto_usa_lotes también se revoca a `authenticated`: no tiene ningún
-- llamador directo en el frontend (src/utils/productLots.ts replica el
-- criterio en TS, no llama al RPC); solo la usan la Edge Function
-- (service_role) y las funciones SECURITY DEFINER de arriba.
--
-- Hay que revocar PUBLIC además de anon/authenticated: si no, ambos roles
-- heredan EXECUTE de PUBLIC aunque se les saque el grant explícito.
REVOKE EXECUTE ON FUNCTION public.reponer_lote_fifo(uuid, integer, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consumir_lotes_fifo(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.devolver_a_lote(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalcular_precio_producto(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.producto_usa_lotes(uuid) FROM PUBLIC, anon, authenticated;

-- Por si acaso el GRANT explícito a service_role no existiera en algún entorno
-- (en el proyecto vivo ya está): la Edge Function depende de él.
GRANT EXECUTE ON FUNCTION public.reponer_lote_fifo(uuid, integer, numeric, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consumir_lotes_fifo(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.devolver_a_lote(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalcular_precio_producto(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.producto_usa_lotes(uuid) TO service_role;

-- consumir_lotes_fifo_test_original: copia de prueba que quedó en la base viva
-- durante las iteraciones de la Task 4 (no está en ningún archivo de
-- migración). Es SECURITY DEFINER, consume lotes y pone products.price = 0, y
-- tenía EXECUTE para anon. No se dropea acá (eso queda a decisión del dueño),
-- pero se le saca el EXECUTE a todos menos al owner/service_role. Guardado con
-- to_regprocedure para que el archivo se pueda re-aplicar en un proyecto nuevo,
-- donde esa función no existe.
DO $$
BEGIN
  IF to_regprocedure('public.consumir_lotes_fifo_test_original(uuid, integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.consumir_lotes_fifo_test_original(uuid, integer) FROM PUBLIC, anon, authenticated';
  END IF;
END;
$$;
