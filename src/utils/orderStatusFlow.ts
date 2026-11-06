/**
 * Flujo lineal de estados de un pedido y quién puede moverlo.
 *
 * POR QUÉ ES UN MÓDULO APARTE: deslizar una tarjeta para avanzar o retroceder el
 * estado tiene que respetar EXACTAMENTE los mismos permisos que ya aplica el
 * Edge Function en PUT /orders/:id/status; si la UI permitiera un deslizado que
 * el backend va a rechazar, el usuario vería la tarjeta cambiar y volver atrás
 * sola. Esa correspondencia se prueba acá, con node:test, sin levantar nada.
 *
 * Es puro: no importa React ni Capacitor.
 */

export type OrderStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export interface FlowStep {
  key: OrderStatus;
  /** Etiqueta que se muestra al usuario. */
  label: string;
  /** Progreso que le corresponde a este estado (0–100). */
  progress: number;
}

/**
 * El recorrido lineal. `cancelled` queda FUERA a propósito: no es un paso del
 * flujo, es una salida, y no se llega a él deslizando.
 */
export const ORDER_FLOW: FlowStep[] = [
  { key: 'pending', label: 'Pendiente', progress: 0 },
  { key: 'in_progress', label: 'En Preparación', progress: 25 },
  { key: 'completed', label: 'Listo', progress: 50 },
  { key: 'dispatched', label: 'Despachado', progress: 75 },
  { key: 'delivered', label: 'Recibido', progress: 100 },
];

/**
 * Roles que mueven el flujo completo en los dos sentidos. Coincide con el
 * `isPowerUser` del Edge Function (production, dispatch, admin, pastry).
 */
const ROLES_FLUJO_COMPLETO = new Set(['admin', 'production', 'dispatch', 'pastry']);

/** Posición en el flujo, o -1 si el estado no es parte del recorrido lineal. */
export function flowIndex(status: string): number {
  return ORDER_FLOW.findIndex(s => s.key === status);
}

/** El siguiente paso del flujo, o null si no hay (último estado o fuera de flujo). */
export function siguienteEstado(status: string): FlowStep | null {
  const i = flowIndex(status);
  if (i < 0 || i >= ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[i + 1];
}

/** El paso anterior del flujo, o null si no hay (primer estado o fuera de flujo). */
export function estadoAnterior(status: string): FlowStep | null {
  const i = flowIndex(status);
  if (i <= 0) return null;
  return ORDER_FLOW[i - 1];
}

/**
 * A qué estado puede AVANZAR este usuario desde `status`, o null si no puede.
 *
 * - Roles de flujo completo: el siguiente del flujo.
 * - local / user: solo de Despachado a Recibido (marcar "Recibido" lo que se
 *   les entregó); nada más. Es la única transición que el Edge Function les
 *   permite (rama isLocalDelivering).
 */
export function puedeAvanzar(status: string, role: string | null | undefined): FlowStep | null {
  const destino = siguienteEstado(status);
  if (!destino) return null;

  if (role && ROLES_FLUJO_COMPLETO.has(role)) return destino;
  if ((role === 'local' || role === 'user') && status === 'dispatched') return destino;
  return null;
}

/**
 * A qué estado puede RETROCEDER este usuario desde `status`, o null.
 *
 * Solo los roles de flujo completo retroceden. Un local nunca retrocede: marcar
 * recibido es terminal para él.
 */
export function puedeRetroceder(status: string, role: string | null | undefined): FlowStep | null {
  const destino = estadoAnterior(status);
  if (!destino) return null;
  if (role && ROLES_FLUJO_COMPLETO.has(role)) return destino;
  return null;
}
