import type { StockEvent } from './api';

export const ETIQUETA_MOVIMIENTO: Record<StockEvent['type'], string> = {
  despacho: 'Despacho a local',
  reposicion: 'Llegó mercadería',
  merma: 'Merma',
  ajuste: 'Corrección de conteo',
  devolucion: 'Devolución por pedido borrado',
};

/**
 * Cómo se dibuja cada tipo de movimiento.
 *
 * 'ajuste' es el caso raro: `quantity` en la base es siempre positiva y el signo
 * lo da el tipo, pero una corrección de conteo puede haber sido para arriba o
 * para abajo — y ese dato NO existe en la tabla. Antes se mostraba el número sin
 * signo, que se lee como si fuera un alta. La salida honesta es no fingir un
 * signo y decir explícitamente que el número es la magnitud de la corrección,
 * apoyándose en el stock resultante (que sí es un dato real).
 */
export const SIGNO_MOVIMIENTO: Record<StockEvent['type'], '+' | '−' | ''> = {
  despacho: '−',
  merma: '−',
  reposicion: '+',
  devolucion: '+',
  ajuste: '',
};

export const COLOR_MOVIMIENTO: Record<StockEvent['type'], string> = {
  despacho: 'text-red-600',
  merma: 'text-red-600',
  reposicion: 'text-green-600',
  devolucion: 'text-green-600',
  ajuste: 'text-gray-600',
};
