import type { Order, OrderStatus } from '../App';
import type { Order as APIOrder } from './api';

// Convierte un pedido tal como lo manda GET /orders al formato que usa la app.
// Vive aparte para que la carga principal (App) y el historial completo
// (OrderHistory, que pide todas las páginas) armen los pedidos igual.
export function mapApiOrder(order: APIOrder): Order {
  const products = order.products || [];
  // Fecha de creación: createdAt si es válida; si no, el timestamp de un id
  // estilo MongoDB (pedidos antiguos).
  let resolvedCreatedAt: string | undefined;
  if (order.createdAt) {
    const d = new Date(order.createdAt);
    if (!isNaN(d.getTime())) resolvedCreatedAt = order.createdAt;
  }
  if (!resolvedCreatedAt && order.id && /^[0-9a-f]{24}$/i.test(order.id)) {
    const ts = parseInt(order.id.slice(0, 8), 16) * 1000;
    resolvedCreatedAt = new Date(ts).toISOString();
  }
  const safeDate = resolvedCreatedAt
    ? new Date(resolvedCreatedAt).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return {
    id: order.id || crypto.randomUUID(),
    productName: products.map((p) => p.name || 'Producto').join(', ') || 'Sin productos',
    quantity: products.reduce((sum, p) => sum + (p.quantity || 0), 0),
    date: safeDate,
    status: (order.status === 'entregado' ? 'delivered' :
      order.status === 'despachado' ? 'dispatched' :
        order.status || 'pending') as OrderStatus,
    customerName: order.customerName || '',
    deadline: order.deadline ? order.deadline.slice(0, 10) : safeDate,
    progress: order.progress || 0,
    products: products,
    total: order.total || 0,
    deliveryAddress: order.deliveryAddress || 'Sin dirección registrada',
    userId: order.userId || '',
    createdAt: resolvedCreatedAt,
    notes: order.notes,
    itemStatuses: order.itemStatuses || {},
  };
}
