/**
 * Preferencias de notificaciones por categoría.
 *
 * Cada usuario guarda en `profiles.notificaciones_silenciadas` la lista de
 * categorías que NO quiere recibir (vacía = recibe todo). La app oculta esas
 * notificaciones, no suena ni muestra aviso por ellas, y el servidor deja de
 * crearlas (ver `categoriaDeNotificacion` en el Edge Function: misma lógica).
 *
 * Las notificaciones de estado de pedido comparten `type` ('order_updated' para
 * pendiente, en preparación, despachado y recibido), así que la etapa se lee del
 * título. Los títulos los arma App.tsx (statusTitles) y no cambiaron nunca.
 */

import type { Notification } from './api';
import type { OrderStatus } from '../App';

export type CategoriaNotificacion =
  | 'pedido_nuevo'
  | 'estado_preparacion'
  | 'estado_listo'
  | 'estado_despachado'
  | 'estado_recibido'
  | 'estado_cancelado'
  | 'precio'
  | 'producto_nuevo'
  | 'stock'
  | 'asistencia';

export function categoriaDeNotificacion(n: Pick<Notification, 'type' | 'title'>): CategoriaNotificacion | null {
  switch (n.type) {
    case 'order_created': return 'pedido_nuevo';
    case 'order_completed': return 'estado_listo';
    case 'order_cancelled': return 'estado_cancelado';
    case 'product_updated': return 'precio';
    case 'product_created': return 'producto_nuevo';
    case 'warning':
    case 'error': return 'stock';
    case 'attendance_check_in':
    case 'attendance_check_out': return 'asistencia';
    case 'order_updated': {
      const t = n.title.toLowerCase();
      if (t.includes('despachado')) return 'estado_despachado';
      if (t.includes('recibido') || t.includes('entregado')) return 'estado_recibido';
      if (t.includes('listo')) return 'estado_listo';
      if (t.includes('cancelado')) return 'estado_cancelado';
      return 'estado_preparacion'; // "En Preparación" y "Pedido Pendiente"
    }
    default: return null; // 'info' y otros: siempre se muestran
  }
}

/** Categoría del aviso que genera un cambio de estado de pedido. */
export function categoriaDeEstado(status: OrderStatus): CategoriaNotificacion {
  switch (status) {
    case 'completed': return 'estado_listo';
    case 'dispatched': return 'estado_despachado';
    case 'delivered': return 'estado_recibido';
    case 'cancelled': return 'estado_cancelado';
    default: return 'estado_preparacion';
  }
}

export function estaSilenciada(
  n: Pick<Notification, 'type' | 'title'>,
  silenciadas: readonly string[],
): boolean {
  const c = categoriaDeNotificacion(n);
  return c !== null && silenciadas.includes(c);
}

export interface SeccionPreferencias {
  titulo: string;
  pie?: string;
  opciones: { clave: CategoriaNotificacion; label: string }[];
}

/** Qué interruptores ve cada rol: solo lo que de verdad le puede llegar. */
export function seccionesParaRol(role: string): SeccionPreferencias[] {
  const secciones: SeccionPreferencias[] = [];

  if (role === 'local' || role === 'admin' || role === 'user') {
    secciones.push({
      titulo: 'Estado de mis pedidos',
      pie: 'Elige en qué momentos de tu pedido quieres un aviso.',
      opciones: [
        { clave: 'estado_preparacion', label: 'En preparación' },
        { clave: 'estado_listo', label: 'Listo' },
        { clave: 'estado_despachado', label: 'Despachado' },
        { clave: 'estado_recibido', label: 'Recibido' },
        { clave: 'estado_cancelado', label: 'Cancelado' },
      ],
    });
  }

  // Catálogo: lo puede activar cualquiera. Por defecto viene encendido solo
  // para los locales (ver migración 20261111_b).
  {
    secciones.push({
      titulo: 'Catálogo',
      opciones: [
        { clave: 'precio', label: 'Cambios de precio' },
        { clave: 'producto_nuevo', label: 'Productos nuevos' },
      ],
    });
  }

  if (role === 'dispatch') {
    secciones.push({
      titulo: 'Pedidos',
      opciones: [{ clave: 'pedido_nuevo', label: 'Pedidos nuevos' }],
    });
  }

  if (role === 'admin' || role === 'production' || role === 'pastry') {
    secciones.push({
      titulo: 'Inventario',
      opciones: [{ clave: 'stock', label: 'Stock bajo de materia prima' }],
    });
  }

  return secciones;
}

// El cliente de Supabase se importa recién al usarlo, para que la lógica de
// categorías se pueda testear con `node --test` sin el entorno de Vite.
export async function cargarSilenciadas(userId: string): Promise<string[]> {
  const { createClient } = await import('./supabase/client');
  const { data, error } = await createClient()
    .from('profiles')
    .select('notificaciones_silenciadas')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.notificaciones_silenciadas) ? data!.notificaciones_silenciadas : [];
}

export async function guardarSilenciadas(userId: string, silenciadas: string[]): Promise<void> {
  const { createClient } = await import('./supabase/client');
  const { error } = await createClient()
    .from('profiles')
    .update({ notificaciones_silenciadas: silenciadas })
    .eq('id', userId);
  if (error) throw error;
}
