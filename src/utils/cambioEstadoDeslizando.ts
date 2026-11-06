import { toast } from 'sonner';
import type { FlowStep } from './orderStatusFlow.ts';

type UpdateStatusFn = (orderId: string, newStatus: any, progress: number) => Promise<void>;

/**
 * Aplica un cambio de estado disparado al deslizar una tarjeta, con el aviso y
 * el "Deshacer" (vuelve al estado previo). Es la misma lógica para el inicio,
 * despacho y producción, así que vive acá una sola vez.
 *
 * El cambio es optimista (el handler de App ya actualiza el estado local); si
 * la API falla, se avisa del error.
 */
export async function aplicarCambioEstado(
  onUpdateOrderStatus: UpdateStatusFn | undefined,
  orderId: string,
  destino: FlowStep,
  previo: FlowStep,
): Promise<void> {
  if (!onUpdateOrderStatus) return;
  try {
    await onUpdateOrderStatus(orderId, destino.key, destino.progress);
    const flecha = destino.progress > previo.progress ? '→' : '←';
    toast.success(`Pedido #${orderId.slice(0, 8).toUpperCase()}  ${flecha}  ${destino.label}`, {
      action: {
        label: 'Deshacer',
        onClick: () => { onUpdateOrderStatus(orderId, previo.key, previo.progress).catch(() => {}); },
      },
      duration: 4000,
    });
  } catch {
    toast.error('No se pudo cambiar el estado del pedido');
  }
}
