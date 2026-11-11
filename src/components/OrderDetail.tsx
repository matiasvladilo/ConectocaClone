import { Order } from '../App';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatCLP } from '../utils/format';
import { DeliveryGuide } from './DeliveryGuide';
import {
  ArrowLeft,
  Package,
  Clock,
  CheckCircle2,
  Check,
  Truck,
  ChevronDown,
  Trash2,
  Printer,
  X,
  Edit
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EditOrderDialog } from './EditOrderDialog';
import { canEditOrder } from '../utils/orderPermissions';

// Paleta de sistema de iOS (misma familia que "Mi cuenta", Historial y Nuevo pedido).
const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
};

const COLOR_ESTADO: Record<string, string> = {
  pending: '#FF9500',
  in_progress: '#007AFF',
  completed: '#34C759',
  dispatched: '#5856D6',
  delivered: '#30B0C7',
  cancelled: '#FF3B30',
};

// "2,5" en vez de "2.5000000001".
const fmtCantidad = (n: number) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n || 0);

interface OrderDetailProps {
  order: Order;
  onBack: () => void;
  onDelete?: (orderId: string) => Promise<void>;
  onStatusChange?: (orderId: string, newStatus: any, progress: number) => Promise<void>;
  userRole?: string;
  accessToken: string;
  onRefresh: () => void;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any; description: string }> = {
  pending: {
    label: 'Pendiente',
    color: 'text-amber-700',
    bgColor: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200',
    icon: Clock,
    description: 'Tu pedido está esperando ser procesado'
  },
  in_progress: {
    label: 'En Preparación',
    color: 'text-blue-700',
    bgColor: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200',
    icon: Package,
    description: 'Estamos fabricando tu pedido'
  },
  completed: {
    label: 'Listo',
    color: 'text-green-700',
    bgColor: 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200',
    icon: CheckCircle2,
    description: 'Tu pedido está listo para despacho'
  },
  dispatched: {
    label: 'Despachado',
    color: 'text-indigo-700',
    bgColor: 'bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-200',
    icon: Truck,
    description: 'Pedido en camino a tu local'
  },
  delivered: {
    label: 'Recibido',
    color: 'text-teal-700',
    bgColor: 'bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200',
    icon: CheckCircle2,
    description: 'Pedido recibido correctamente'
  },
  cancelled: {
    label: 'Cancelado',
    color: 'text-red-700',
    bgColor: 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200',
    icon: X,
    description: 'El pedido fue cancelado'
  }
};

const statusSteps = [
  { key: 'pending', label: 'Ingresado', progress: 0 },
  { key: 'in_progress', label: 'En Preparación', progress: 25 },
  { key: 'completed', label: 'Listo', progress: 50 },
  { key: 'dispatched', label: 'Despachado', progress: 75 },
  { key: 'delivered', label: 'Recibido', progress: 100 }
];

export function OrderDetail({ order, onBack, onDelete, onStatusChange, userRole, accessToken, onRefresh }: OrderDetailProps) {
  // Detalle de pasos del progreso: plegado por defecto; la barra de puntos
  // ya da el avance de un vistazo.
  const [progresoAbierto, setProgresoAbierto] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeliveryGuide, setShowDeliveryGuide] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const canEdit = canEditOrder(userRole);

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(order.id);
      toast.success('Pedido eliminado correctamente');
      onBack();
    } catch (error: any) {
      console.error('Error deleting order:', error);
      toast.error(error?.message || 'Error al eliminar el pedido');
      setIsDeleting(false);
    }
  };

  const config = statusConfig[order.status] || {
    label: 'Desconocido',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50 border-gray-200',
    icon: Package,
    description: 'Estado del pedido'
  };
  const StatusIcon = config.icon;
  const currentStepIndex = statusSteps.findIndex(step => step.key === order.status);

  const colorEstado = COLOR_ESTADO[order.status] || IOS.secundario;
  const cancelado = order.status === 'cancelled';
  const productos = order.products || [];

  const fechaPedido = new Date(order.createdAt || order.date);
  const fechaEntrega = order.deadline ? new Date(order.deadline.slice(0, 10) + 'T12:00:00') : null;
  const fmtFecha = (d: Date) =>
    d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const fmtHora = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });

  const cambiarEstado = async (newStatus: string) => {
    if (!onStatusChange || newStatus === order.status) return;
    const etiqueta = statusConfig[newStatus]?.label || newStatus;
    if (!window.confirm(`¿Cambiar el estado a "${etiqueta}"?`)) return;
    setIsUpdating(true);
    try {
      const progress = { in_progress: 25, completed: 50, dispatched: 75, delivered: 100 }[newStatus as 'in_progress'] ?? 0;
      await onStatusChange(order.id, newStatus, progress);
      toast.success(`Estado actualizado a ${etiqueta}`);
    } catch (error) {
      console.error('Error changing status:', error);
      toast.error('Error al actualizar');
    } finally {
      setIsUpdating(false);
    }
  };

  const marcarRecibido = async () => {
    if (!onStatusChange) return;
    setIsUpdating(true);
    try {
      await onStatusChange(order.id, 'delivered', 100);
      toast.success('Pedido marcado como recibido');
      onBack();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar estado');
    } finally {
      setIsUpdating(false);
    }
  };

  const separador = (inset = 16) => <div style={{ height: 0.5, background: IOS.separador, marginLeft: inset }} />;
  const encabezado = (texto: string) => (
    <p style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '22px 16px 6px' }}>{texto}</p>
  );
  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '10px 16px' }}>
      <span style={{ fontSize: 16, color: IOS.texto, flexShrink: 0 }}>{etiqueta}</span>
      <span className="min-w-0 truncate" style={{ marginLeft: 'auto', fontSize: 16, color: IOS.secundario, textAlign: 'right' }}>{valor}</span>
    </div>
  );
  const botonAccion = (estilo: 'primario' | 'tintado' | 'destructivo'): React.CSSProperties => ({
    width: '100%', height: 50, borderRadius: 14, border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontSize: 17, fontWeight: 600,
    background: estilo === 'primario' ? IOS.azul : estilo === 'tintado' ? IOS.tarjeta : IOS.tarjeta,
    color: estilo === 'primario' ? '#fff' : estilo === 'destructivo' ? '#FF3B30' : IOS.azul,
  });

  return (
    <div className="min-h-screen max-h-screen overflow-y-auto" style={{ background: IOS.fondo }}>
      {/* Encabezado compacto */}
      <div
        className="sticky top-0"
        style={{ zIndex: 20, background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
      >
        <div className="max-w-md mx-auto" style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            style={{
              width: 36, height: 36, borderRadius: 18, flexShrink: 0, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
            }}
          >
            <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
              Pedido #{order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
              {fmtFecha(fechaPedido)}, {fmtHora(fechaPedido)}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto" style={{ padding: '16px 16px 40px' }}>
        {/* Estado + progreso (desplegable) */}
        <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => !cancelado && setProgresoAbierto(!progresoAbierto)}
            aria-expanded={progresoAbierto}
            className="w-full"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: cancelado ? 'default' : 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 10, background: colorEstado, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <StatusIcon style={{ width: 22, height: 22, color: '#fff' }} />
            </span>
            <span className="min-w-0 flex-1">
              <span style={{ display: 'block', fontSize: 19, fontWeight: 700, color: IOS.texto }}>{config.label}</span>
              <span style={{ display: 'block', fontSize: 14, color: IOS.secundario }}>{config.description}</span>
            </span>
            {!cancelado && (
              <ChevronDown
                style={{
                  width: 18, height: 18, color: '#C7C7CC', flexShrink: 0,
                  transform: progresoAbierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s',
                }}
              />
            )}
          </button>

          {/* Pasos en miniatura: siempre visibles, dan el avance de un vistazo */}
          {!cancelado && (
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 14px' }}>
              {statusSteps.map((step, i) => {
                const hecho = i <= currentStepIndex;
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i === 0 ? '0 0 auto' : 1 }}>
                    {i > 0 && <div style={{ flex: 1, height: 3, borderRadius: 2, background: hecho ? colorEstado : '#E5E5EA' }} />}
                    <div style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: hecho ? colorEstado : '#E5E5EA' }} />
                  </div>
                );
              })}
            </div>
          )}

          <AnimatePresence initial={false}>
            {progresoAbierto && !cancelado && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{ overflow: 'hidden' }}
              >
                {separador()}
                <div style={{ padding: '6px 16px 10px' }}>
                  {statusSteps.map((step, i) => {
                    const hecho = i <= currentStepIndex;
                    const actual = i === currentStepIndex;
                    return (
                      <div key={step.key} style={{ display: 'flex', alignItems: 'stretch', gap: 12 }}>
                        {/* Línea de tiempo */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 22 }}>
                          <div style={{ flex: 1, width: 2, background: i === 0 ? 'transparent' : (hecho ? colorEstado : '#E5E5EA') }} />
                          <div
                            style={{
                              width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: hecho ? colorEstado : '#E5E5EA',
                            }}
                          >
                            {hecho && <Check style={{ width: 13, height: 13, color: '#fff' }} />}
                          </div>
                          <div style={{ flex: 1, width: 2, background: i === statusSteps.length - 1 ? 'transparent' : (i < currentStepIndex ? colorEstado : '#E5E5EA') }} />
                        </div>
                        <span style={{ padding: '10px 0', fontSize: 16, fontWeight: actual ? 600 : 400, color: hecho ? IOS.texto : IOS.secundario }}>
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Productos */}
        {encabezado(productos.length > 0 ? `${productos.length} ${productos.length === 1 ? 'producto' : 'productos'}` : 'Producto')}
        <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
          {productos.length > 0 ? productos.map((product, i) => (
            <div key={i}>
              {i > 0 && separador()}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                <span
                  style={{
                    minWidth: 34, height: 26, borderRadius: 7, padding: '0 6px', flexShrink: 0,
                    background: IOS.relleno, color: IOS.texto, fontSize: 14, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {fmtCantidad(product.quantity)}
                </span>
                <span className="min-w-0 flex-1">
                  <span style={{ display: 'block', fontSize: 16, color: IOS.texto }}>{product.name}</span>
                  <span style={{ display: 'block', fontSize: 13, color: IOS.secundario }}>{formatCLP(product.price)} c/u</span>
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: IOS.texto, flexShrink: 0 }}>
                  {formatCLP(product.price * product.quantity)}
                </span>
              </div>
            </div>
          )) : (
            <div style={{ padding: '12px 16px' }}>
              <p style={{ fontSize: 16, color: IOS.texto }}>{fmtCantidad(order.quantity)} × {order.productName}</p>
              <p style={{ fontSize: 13, color: IOS.secundario }}>Pedido creado antes de la actualización del sistema</p>
            </div>
          )}
          {separador(0)}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>Total</span>
            <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: IOS.texto }}>{formatCLP(order.total || 0)}</span>
          </div>
        </div>

        {/* Observaciones */}
        {order.notes && order.notes.trim() && (
          <>
            {encabezado('Observaciones')}
            <div style={{ background: IOS.tarjeta, borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ fontSize: 16, color: IOS.texto, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{order.notes}</p>
            </div>
          </>
        )}

        {/* Datos */}
        {encabezado('Información')}
        <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
          {fila('Local', order.customerName || '—')}
          {separador()}
          {fila('Entrega', fechaEntrega ? fmtFecha(fechaEntrega) : '—')}
          {separador()}
          {fila('Pedido el', `${fmtFecha(fechaPedido)}, ${fmtHora(fechaPedido)}`)}
          {separador()}
          {fila('N.º de pedido', <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 15 }}>{order.id.slice(0, 8).toUpperCase()}</span>)}
        </div>

        {/* Cambio manual de estado (admin / producción / despacho) */}
        {['admin', 'production', 'dispatch'].includes(userRole || '') && onStatusChange && (
          <>
            {encabezado('Gestión')}
            <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>
              <label style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 16px', gap: 12 }}>
                <span style={{ fontSize: 16, color: IOS.texto }}>Estado</span>
                <span style={{ marginLeft: 'auto', fontSize: 16, color: IOS.azul, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isUpdating ? 'Actualizando…' : config.label}
                  <ChevronDown style={{ width: 15, height: 15 }} />
                </span>
                <select
                  aria-label="Cambiar estado"
                  value={order.status}
                  disabled={isUpdating}
                  onChange={(e) => cambiarEstado(e.target.value)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                >
                  <option value="pending">Pendiente</option>
                  <option value="in_progress">En Preparación</option>
                  <option value="completed">Listo</option>
                  <option value="dispatched">Despachado</option>
                  <option value="delivered">Recibido/Entregado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </label>
            </div>
          </>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
          {order.status === 'dispatched' && userRole === 'local' && onStatusChange && (
            <button type="button" onClick={marcarRecibido} disabled={isUpdating} style={{ ...botonAccion('primario'), opacity: isUpdating ? 0.6 : 1 }}>
              <CheckCircle2 style={{ width: 19, height: 19 }} />
              {isUpdating ? 'Actualizando…' : 'Marcar como recibido'}
            </button>
          )}
          {canEdit && ['pending', 'in_progress', 'completed'].includes(order.status) && (
            <button type="button" onClick={() => setEditingOrder(order)} style={botonAccion('tintado')}>
              <Edit style={{ width: 18, height: 18 }} />
              Editar pedido
            </button>
          )}
          {['completed', 'dispatched', 'delivered'].includes(order.status) && ['production', 'dispatch', 'admin'].includes(userRole || '') && (
            <button type="button" onClick={() => setShowDeliveryGuide(true)} style={botonAccion('tintado')}>
              <Printer style={{ width: 18, height: 18 }} />
              Imprimir guía de despacho
            </button>
          )}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" disabled={isDeleting} style={botonAccion('destructivo')}>
                  <Trash2 style={{ width: 18, height: 18 }} />
                  {isDeleting ? 'Eliminando…' : 'Eliminar pedido'}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar este pedido?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. El pedido se elimina y el stock de los productos se restaura.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Delivery Guide Dialog */}
      <DeliveryGuide
        order={order}
        open={showDeliveryGuide}
        onClose={() => setShowDeliveryGuide(false)}
      />

      {/* Edit Order Dialog */}
      {editingOrder && (
        <EditOrderDialog
          isOpen={!!editingOrder}
          onClose={() => setEditingOrder(null)}
          order={editingOrder}
          accessToken={accessToken}
          userRole={userRole}
          onOrderUpdated={() => {
            onRefresh();
            setEditingOrder(null);
          }}
        />
      )}
    </div>
  );
}
