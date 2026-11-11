import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Order } from '../App';
import { DeliveryGuide } from './DeliveryGuide';
import { motion, AnimatePresence } from 'motion/react';
import { SwipeableOrderCard } from './SwipeableOrderCard';
import { aplicarCambioEstado } from '../utils/cambioEstadoDeslizando';
import { puedeAvanzar, ORDER_FLOW } from '../utils/orderStatusFlow';
import {
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Package,
  Star,
  MessageSquare,
  Printer,
  ChevronRight,
  X,
  Grid3x3,
} from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { PaginationInfo, ProductionArea as ProductionAreaType, productionAreasAPI } from '../utils/api';
import { toast } from 'sonner';
import { formatCLP } from '../utils/format';
import { parseDate } from '../utils/dateUtils';

/**
 * Panel de despacho / producción (roles dispatch, production y admin).
 *
 * Estilo iOS como Historial y Detalle del pedido: encabezado azul compacto con
 * buscador, píldoras de estado con conteo, filtros en una tarjeta plegable y
 * pedidos como tarjetas blancas. Deslizar una tarjeta sigue cambiando el
 * estado (SwipeableOrderCard); tocarla abre una hoja con el detalle y el
 * siguiente paso como botón principal.
 *
 * Nota: Tailwind está precompilado (src/index.css); el estilo va inline.
 */

interface ProductionAreaProps {
  orders: Order[];
  onBack: () => void;
  onUpdateOrderStatus: (orderId: string, status: Order['status'], progress: number) => void;
  accessToken: string | null;
  lastSync?: Date | null;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  onGoToKDS?: () => void;
  isLoading?: boolean;
  // Rol del usuario, para los permisos del deslizado de estado. La pantalla ya
  // está limitada a dispatch/admin/production, así que siempre es un rol que
  // mueve el flujo completo.
  userRole?: string;
}

type FilterStatus = 'all' | Order['status'];
type SortOption = 'date-desc' | 'date-asc' | 'amount-desc' | 'customer-asc';

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
  rojo: '#FF3B30',
  amarillo: '#FFCC00',
};

// Mismos colores de estado que Historial, Detalle y Analíticas.
const ESTADOS: { key: FilterStatus; label: string; color: string }[] = [
  { key: 'all', label: 'Todos', color: IOS.azul },
  { key: 'pending', label: 'Pendientes', color: '#FF9500' },
  { key: 'in_progress', label: 'En preparación', color: '#007AFF' },
  { key: 'completed', label: 'Listos', color: '#34C759' },
  { key: 'dispatched', label: 'Despachados', color: '#5856D6' },
  { key: 'delivered', label: 'Recibidos', color: '#30B0C7' },
  { key: 'cancelled', label: 'Cancelados', color: '#FF3B30' },
];

const ETIQUETA_ESTADO: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En preparación',
  completed: 'Listo',
  dispatched: 'Despachado',
  delivered: 'Recibido',
  cancelled: 'Cancelado',
};

const colorEstado = (status: string) => ESTADOS.find((e) => e.key === status)?.color ?? IOS.secundario;

// Verbo del botón principal según el estado al que se pasa.
const VERBO_PASO: Record<string, string> = {
  in_progress: 'Empezar preparación',
  completed: 'Marcar como listo',
  dispatched: 'Despachar',
  delivered: 'Marcar como recibido',
};

const ORDEN: [SortOption, string][] = [
  ['date-desc', 'Recientes'],
  ['date-asc', 'Antiguos'],
  ['amount-desc', 'Monto'],
  ['customer-asc', 'Local'],
];

const fmtCantidad = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

const hora = (s: string) => new Date(s).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Hoy", "Mañana", "Ayer" o "lun 3 nov" para la fecha de entrega (YYYY-MM-DD). */
function entregaCorta(deadline?: string): string | null {
  if (!deadline) return null;
  const d = /^\d{4}-\d{2}-\d{2}/.test(deadline) ? parseDate(deadline) : new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d);
  dia.setHours(0, 0, 0, 0);
  const diff = Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ProductionArea({ orders, onBack, onUpdateOrderStatus, accessToken, lastSync, pagination, onPageChange, onGoToKDS, isLoading = false, userRole }: ProductionAreaProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showDeliveryGuide, setShowDeliveryGuide] = useState(false);

  const [productionAreas, setProductionAreas] = useState<ProductionAreaType[]>([]);
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('all');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Prioritarios: marca local de la sesión (no se guarda en el servidor).
  const [priorityOrders, setPriorityOrders] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const titulo = userRole === 'production' ? 'Producción' : 'Despacho';

  useEffect(() => {
    if (!accessToken) return;
    productionAreasAPI
      .getAll(accessToken)
      .then(setProductionAreas)
      .catch((error) => console.error('Error loading production areas:', error));
  }, [accessToken]);

  // El detalle abierto sigue al pedido actualizado (p. ej. tras cambiar estado).
  useEffect(() => {
    if (!selectedOrder) return;
    const fresco = orders.find((o) => o.id === selectedOrder.id);
    if (fresco && fresco !== selectedOrder) setSelectedOrder(fresco);
  }, [orders, selectedOrder]);

  const areaPorId = useMemo(() => new Map(productionAreas.map((a) => [a.id, a])), [productionAreas]);

  const areasDePedido = (order: Order) => {
    const ids = new Set<string>();
    order.products?.forEach((p) => { if (p.productionAreaId) ids.add(p.productionAreaId); });
    return Array.from(ids).map((id) => areaPorId.get(id)).filter((a): a is ProductionAreaType => !!a);
  };

  const conteo = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return c;
  }, [orders]);

  const filtrosActivos = [dateFrom, dateTo, selectedAreaFilter !== 'all' ? 'x' : ''].filter(Boolean).length + (sortBy !== 'date-desc' ? 1 : 0);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let lista = orders.filter((order) => {
      if (filterStatus !== 'all' && order.status !== filterStatus) return false;
      if (selectedAreaFilter !== 'all' && !order.products?.some((p) => p.productionAreaId === selectedAreaFilter)) return false;
      if (q) {
        const enProductos = order.products?.some((p) => p.name.toLowerCase().includes(q));
        const coincide =
          order.id.toLowerCase().includes(q) ||
          order.customerName.toLowerCase().includes(q) ||
          order.productName.toLowerCase().includes(q) ||
          !!enProductos ||
          (order.deliveryAddress && order.deliveryAddress.toLowerCase().includes(q));
        if (!coincide) return false;
      }
      if ((dateFrom || dateTo) && order.createdAt) {
        // Fecha local (no toISOString, que en Chile corre el día después de las 21:00).
        const d = new Date(order.createdAt);
        const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateFrom && dia < dateFrom) return false;
        if (dateTo && dia > dateTo) return false;
      }
      return true;
    });

    const fecha = (o: Order) => new Date(o.createdAt || o.date).getTime();
    lista = [...lista].sort((a, b) => {
      const prio = (priorityOrders.has(b.id) ? 1 : 0) - (priorityOrders.has(a.id) ? 1 : 0);
      if (prio !== 0) return prio;
      switch (sortBy) {
        case 'date-asc': return fecha(a) - fecha(b);
        case 'amount-desc': return (b.total || 0) - (a.total || 0);
        case 'customer-asc': return a.customerName.localeCompare(b.customerName, 'es');
        default: return fecha(b) - fecha(a);
      }
    });
    return lista;
  }, [orders, filterStatus, selectedAreaFilter, searchQuery, dateFrom, dateTo, sortBy, priorityOrders]);

  const togglePriority = (orderId: string) => {
    setPriorityOrders((prev) => {
      const s = new Set(prev);
      if (s.has(orderId)) s.delete(orderId);
      else s.add(orderId);
      return s;
    });
  };

  const limpiarFiltros = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedAreaFilter('all');
    setSortBy('date-desc');
  };

  const handleStatusChange = (orderId: string, newStatus: Order['status']) => {
    const paso = ORDER_FLOW.find((p) => p.key === newStatus);
    const progress = paso ? paso.progress : newStatus === 'cancelled' ? 100 : 0;
    onUpdateOrderStatus(orderId, newStatus, progress);
    toast.success(`Pedido ${ETIQUETA_ESTADO[newStatus]?.toLowerCase() ?? newStatus}`);
  };

  const cambiarEstadoManual = (order: Order, nuevo: Order['status']) => {
    if (nuevo === order.status) return;
    if (nuevo === 'cancelled' && !window.confirm('¿Cancelar este pedido?')) return;
    handleStatusChange(order.id, nuevo);
  };

  return (
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          paddingTop: 'max(env(safe-area-inset-top), 16px)',
        }}
      >
        <div className="max-w-7xl mx-auto" style={{ padding: '8px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={onBack} aria-label="Volver" style={botonRedondo}>
              <ArrowLeft style={{ width: 20, height: 20, color: '#fff' }} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{titulo}</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                {lastSync ? `Actualizado ${lastSync.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : 'Pedidos de los locales'}
              </p>
            </div>
            {onGoToKDS && (
              <button type="button" onClick={onGoToKDS} aria-label="Vista cocina" style={botonRedondo}>
                <Grid3x3 style={{ width: 18, height: 18, color: '#fff' }} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'rgba(255,255,255,0.75)' }} />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar local, pedido o producto"
                className="buscador-sobre-azul"
                style={{
                  width: '100%', height: 36, borderRadius: 10, border: 'none', outline: 'none',
                  background: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: 16,
                  padding: searchQuery ? '0 34px 0 34px' : '0 12px 0 34px',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Borrar búsqueda"
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X style={{ width: 14, height: 14, color: '#fff' }} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltrosAbiertos((v) => !v)}
              aria-label="Filtros"
              aria-expanded={filtrosAbiertos}
              style={{
                ...botonRedondo, borderRadius: 10, position: 'relative',
                background: filtrosAbiertos ? '#fff' : 'rgba(255,255,255,0.18)',
              }}
            >
              <SlidersHorizontal style={{ width: 17, height: 17, color: filtrosAbiertos ? '#0047BA' : '#fff' }} />
              {filtrosActivos > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: IOS.rojo, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {filtrosActivos}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto" style={{ padding: '12px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Estados */}
        <div className="sin-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px 12px', padding: '0 16px' }}>
          {ESTADOS.map((e) => {
            const activo = filterStatus === e.key;
            const n = conteo[e.key] || 0;
            return (
              <button
                key={e.key}
                type="button"
                aria-pressed={activo}
                onClick={() => setFilterStatus(e.key)}
                style={{
                  flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: activo ? 600 : 500,
                  background: activo ? e.color : IOS.tarjeta,
                  color: activo ? '#fff' : IOS.texto,
                  boxShadow: activo ? 'none' : '0 0 0 0.5px rgba(0,0,0,0.08)',
                }}
              >
                {!activo && e.key !== 'all' && <span style={{ width: 8, height: 8, borderRadius: 4, background: e.color }} />}
                {e.label}
                <span style={{ fontSize: 12, fontWeight: 600, opacity: activo ? 0.9 : 0.5 }}>{n}</span>
              </button>
            );
          })}
        </div>

        {/* Filtros */}
        <AnimatePresence initial={false}>
          {filtrosAbiertos && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ ...tarjeta, padding: 14, marginBottom: 12 }}>
                <p style={etiquetaFiltro}>Ordenar</p>
                <div role="group" style={{ display: 'flex', padding: 2, borderRadius: 9, background: IOS.relleno, marginBottom: 14 }}>
                  {ORDEN.map(([v, t]) => {
                    const activo = sortBy === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={activo}
                        onClick={() => setSortBy(v)}
                        style={{
                          flex: 1, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13,
                          fontWeight: activo ? 600 : 500, color: IOS.texto,
                          background: activo ? '#fff' : 'transparent',
                          boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>

                <p style={etiquetaFiltro}>Ingresados entre</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: productionAreas.length > 0 ? 14 : 0 }}>
                  <CampoFecha etiqueta="Desde" valor={dateFrom} onCambio={setDateFrom} />
                  <CampoFecha etiqueta="Hasta" valor={dateTo} onCambio={setDateTo} />
                </div>

                {productionAreas.length > 0 && (
                  <>
                    <p style={etiquetaFiltro}>Área de producción</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {[{ id: 'all', name: 'Todas', color: undefined as string | undefined }, ...productionAreas].map((a) => {
                        const activo = selectedAreaFilter === a.id;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            aria-pressed={activo}
                            onClick={() => setSelectedAreaFilter(a.id)}
                            style={{
                              height: 30, padding: '0 12px', borderRadius: 15, cursor: 'pointer', fontSize: 13,
                              display: 'flex', alignItems: 'center', gap: 6,
                              border: 'none', fontWeight: activo ? 600 : 500,
                              background: activo ? IOS.azul : IOS.relleno,
                              color: activo ? '#fff' : IOS.texto,
                            }}
                          >
                            {a.color && <span style={{ width: 8, height: 8, borderRadius: 4, background: a.color }} />}
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {filtrosActivos > 0 && (
                  <button type="button" onClick={limpiarFiltros} style={{ marginTop: 14, color: IOS.azul, fontSize: 15, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Encabezado de la lista */}
        <p style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0 16px 6px' }}>
          {filteredOrders.length === orders.length
            ? `${filteredOrders.length} pedidos`
            : `${filteredOrders.length} de ${orders.length} pedidos`}
          {priorityOrders.size > 0 ? ` · ${priorityOrders.size} prioritario${priorityOrders.size !== 1 ? 's' : ''}` : ''}
        </p>

        {filteredOrders.length === 0 ? (
          <div style={{ ...tarjeta, padding: '40px 16px', textAlign: 'center' }}>
            <Package style={{ width: 36, height: 36, color: '#C7C7CC', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 15, color: IOS.secundario }}>No hay pedidos con estos filtros</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            style={{ gap: 10, opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.3s' }}
          >
            {filteredOrders.map((order) => {
              const areas = areasDePedido(order);
              const productos = order.products || [];
              const resumen = productos.length
                ? productos.slice(0, 3).map((p) => `${p.name} ×${fmtCantidad(p.quantity)}`).join(', ') +
                  (productos.length > 3 ? ` y ${productos.length - 3} más` : '')
                : order.productName;
              const entrega = entregaCorta(order.deadline);
              const prioritario = priorityOrders.has(order.id);
              const color = colorEstado(order.status);
              return (
                <SwipeableOrderCard
                  key={order.id}
                  orderId={order.id}
                  status={order.status}
                  userRole={userRole}
                  onTap={() => setSelectedOrder(order)}
                  onCambiarEstado={(id, destino, previo) => aplicarCambioEstado(onUpdateOrderStatus, id, destino, previo)}
                >
                  <div
                    className="fila-ios"
                    style={{
                      background: IOS.tarjeta, borderRadius: 16, padding: '12px 14px 12px 16px', cursor: 'pointer',
                      boxShadow: prioritario ? `inset 0 0 0 2px ${IOS.amarillo}` : undefined,
                      position: 'relative',
                    }}
                  >
                    {/* Franja de estado */}
                    <span style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 4, borderRadius: '0 3px 3px 0', background: color }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {prioritario && <Star style={{ width: 15, height: 15, color: IOS.amarillo, fill: IOS.amarillo, flexShrink: 0 }} />}
                      <span className="truncate" style={{ flex: 1, fontSize: 17, fontWeight: 600, color: IOS.texto }}>{order.customerName}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color, flexShrink: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: color }} />
                        {ETIQUETA_ESTADO[order.status] ?? order.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: IOS.secundario, marginTop: 2 }}>
                      <span>#{order.id.slice(0, 8).toUpperCase()}</span>
                      <span>·</span>
                      <span>{hora(order.createdAt || order.date)}</span>
                      {entrega && (
                        <>
                          <span>·</span>
                          <span style={{ color: entrega === 'Hoy' ? IOS.texto : IOS.secundario, fontWeight: entrega === 'Hoy' ? 600 : 400 }}>
                            Entrega {['Hoy', 'Mañana', 'Ayer'].includes(entrega) ? entrega.toLowerCase() : entrega}
                          </span>
                        </>
                      )}
                      {order.notes?.trim() && (
                        <MessageSquare aria-label="Tiene observaciones" style={{ width: 14, height: 14, color: '#FF9500', marginLeft: 2 }} />
                      )}
                    </div>
                    <p style={{ fontSize: 14, color: '#3C3C43', marginTop: 8, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {resumen}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: areas.length ? 10 : 4 }}>
                      <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                        {areas.slice(0, 2).map((a) => (
                          <span key={a.id} style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: IOS.relleno, color: IOS.texto, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: a.color || IOS.secundario }} />
                            {a.name}
                          </span>
                        ))}
                        {areas.length > 2 && <span style={{ fontSize: 12, color: IOS.secundario }}>+{areas.length - 2}</span>}
                      </div>
                      <span style={{ fontSize: 17, fontWeight: 600, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCLP(order.total || 0)}
                      </span>
                    </div>
                  </div>
                </SwipeableOrderCard>
              );
            })}
          </div>
        )}

        {filteredOrders.length > 0 && (
          <p style={{ fontSize: 12, color: IOS.secundario, textAlign: 'center', marginTop: 12 }}>
            Desliza un pedido a la derecha para avanzar su estado
          </p>
        )}

        {pagination && onPageChange && (
          <div style={{ marginTop: 16 }}>
            <PaginationControls pagination={pagination} onPageChange={onPageChange} isLoading={isLoading} />
          </div>
        )}
      </div>

      {/* Hoja de detalle */}
      {createPortal(
        <AnimatePresence>
          {selectedOrder && (
            <HojaPedido
              key="hoja"
              order={selectedOrder}
              userRole={userRole}
              prioritario={priorityOrders.has(selectedOrder.id)}
              onPrioridad={() => togglePriority(selectedOrder.id)}
              onClose={() => setSelectedOrder(null)}
              onAvanzar={(destino) => handleStatusChange(selectedOrder.id, destino)}
              onCambiarEstado={(nuevo) => cambiarEstadoManual(selectedOrder, nuevo)}
              onImprimir={() => setShowDeliveryGuide(true)}
              areas={areasDePedido(selectedOrder)}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}

      {selectedOrder && (
        <DeliveryGuide order={selectedOrder} open={showDeliveryGuide} onClose={() => setShowDeliveryGuide(false)} />
      )}
    </div>
  );
}

function HojaPedido({
  order, userRole, prioritario, onPrioridad, onClose, onAvanzar, onCambiarEstado, onImprimir, areas,
}: {
  order: Order;
  userRole?: string;
  prioritario: boolean;
  onPrioridad: () => void;
  onClose: () => void;
  onAvanzar: (destino: Order['status']) => void;
  onCambiarEstado: (nuevo: Order['status']) => void;
  onImprimir: () => void;
  areas: ProductionAreaType[];
}) {
  const siguiente = puedeAvanzar(order.status, userRole);
  const color = colorEstado(order.status);
  const productos = order.products || [];
  const entrega = order.deadline
    ? (/^\d{4}-\d{2}-\d{2}/.test(order.deadline) ? parseDate(order.deadline) : new Date(order.deadline))
        .toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 50 }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Pedido de ${order.customerName}`}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        drag="y"
        dragDirectionLock
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 120 || info.velocity.y > 600) onClose(); }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 51, margin: '0 auto', maxWidth: 640,
          background: IOS.fondo, borderRadius: '14px 14px 0 0', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 0' }}>
          <span style={{ width: 36, height: 5, borderRadius: 3, background: '#C7C7CC' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="truncate" style={{ fontSize: 20, fontWeight: 700, color: IOS.texto }}>{order.customerName}</p>
            <p style={{ fontSize: 13, color: IOS.secundario }}>
              Pedido #{order.id.slice(0, 8).toUpperCase()} · {hora(order.createdAt || order.date)}
            </p>
          </div>
          <button
            type="button"
            onClick={onPrioridad}
            aria-label={prioritario ? 'Quitar prioridad' : 'Marcar prioritario'}
            aria-pressed={prioritario}
            style={{ ...botonGris, background: prioritario ? '#FFF4CC' : '#E3E3E8' }}
          >
            <Star style={{ width: 17, height: 17, color: prioritario ? '#B38F00' : '#3C3C43', fill: prioritario ? IOS.amarillo : 'none' }} />
          </button>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={botonGris}>
            <X style={{ width: 17, height: 17, color: '#3C3C43' }} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 16px max(env(safe-area-inset-bottom), 20px)' }}>
          {/* Estado + siguiente paso */}
          <div style={{ ...tarjeta, padding: 14, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: siguiente ? 12 : 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
              <span style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>{ETIQUETA_ESTADO[order.status] ?? order.status}</span>
            </div>
            {siguiente && (
              <button
                type="button"
                onClick={() => onAvanzar(siguiente.key)}
                className="boton-ios"
                style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: colorEstado(siguiente.key), color: '#fff', fontSize: 17, fontWeight: 600, cursor: 'pointer' }}
              >
                {VERBO_PASO[siguiente.key] ?? `Pasar a ${siguiente.label}`}
              </button>
            )}
          </div>

          {order.notes?.trim() && (
            <Grupo titulo="Observaciones">
              <p style={{ padding: '12px 16px', fontSize: 15, color: IOS.texto, whiteSpace: 'pre-wrap', lineHeight: 1.45, background: '#FFF8E5' }}>
                {order.notes}
              </p>
            </Grupo>
          )}

          <Grupo titulo={`${productos.length} productos`}>
            {productos.map((p, i) => (
              <div key={i}>
                {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 64 }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                  <span style={{ minWidth: 36, height: 28, padding: '0 6px', borderRadius: 8, background: IOS.relleno, color: IOS.texto, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtCantidad(p.quantity)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, color: IOS.texto }}>{p.name}</p>
                    <p style={{ fontSize: 12, color: IOS.secundario }}>{formatCLP(p.price)} c/u</p>
                  </div>
                  <span style={{ fontSize: 15, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>{formatCLP(p.price * p.quantity)}</span>
                </div>
              </div>
            ))}
            <div style={{ height: 0.5, background: IOS.separador }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px' }}>
              <span style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>Total</span>
              <span style={{ fontSize: 17, fontWeight: 600, color: IOS.texto, fontVariantNumeric: 'tabular-nums' }}>{formatCLP(order.total || 0)}</span>
            </div>
          </Grupo>

          <Grupo titulo="Información">
            <FilaInfo etiqueta="Entrega" valor={entrega ?? '—'} />
            <FilaInfo etiqueta="Dirección" valor={order.deliveryAddress || 'Sin dirección'} />
            <FilaInfo etiqueta="Ingresó" valor={new Date(order.createdAt || order.date).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} ultima={areas.length === 0} />
            {areas.length > 0 && <FilaInfo etiqueta="Áreas" valor={areas.map((a) => a.name).join(', ')} ultima />}
          </Grupo>

          <Grupo>
            <label className="fila-ios" style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 16px', cursor: 'pointer' }}>
              <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>Cambiar estado</span>
              <span style={{ fontSize: 15, color: IOS.secundario }}>{ETIQUETA_ESTADO[order.status]}</span>
              <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC', marginLeft: 4 }} />
              <select
                value={order.status}
                onChange={(e) => onCambiarEstado(e.target.value as Order['status'])}
                aria-label="Cambiar estado"
                style={{ position: 'absolute', inset: 0, opacity: 0, fontSize: 16 }}
              >
                {Object.entries(ETIQUETA_ESTADO).map(([k, t]) => (
                  <option key={k} value={k}>{t}</option>
                ))}
              </select>
            </label>
            <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />
            <button
              type="button"
              onClick={onImprimir}
              className="fila-ios"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 16px', color: IOS.azul, fontSize: 16, textAlign: 'left' }}
            >
              <Printer style={{ width: 18, height: 18 }} />
              Imprimir guía de despacho
            </button>
          </Grupo>
        </div>
      </motion.div>
    </>
  );
}

function Grupo({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      {titulo && (
        <h3 style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0 16px 6px', fontWeight: 400 }}>
          {titulo}
        </h3>
      )}
      <div style={tarjeta}>{children}</div>
    </section>
  );
}

function FilaInfo({ etiqueta, valor, ultima }: { etiqueta: string; valor: string; ultima?: boolean }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 12, padding: '11px 16px', alignItems: 'baseline' }}>
        <span style={{ fontSize: 15, color: IOS.texto, flexShrink: 0 }}>{etiqueta}</span>
        <span style={{ flex: 1, textAlign: 'right', fontSize: 15, color: IOS.secundario }}>{valor}</span>
      </div>
      {!ultima && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 16 }} />}
    </>
  );
}

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
};

const botonGris: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 16, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#E3E3E8',
};

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const etiquetaFiltro: React.CSSProperties = { fontSize: 13, color: IOS.secundario, marginBottom: 6 };

/** Fecha nativa con su etiqueta visible: iOS no muestra placeholder en type=date. */
function CampoFecha({ etiqueta, valor, onCambio }: { etiqueta: string; valor: string; onCambio: (v: string) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRadius: 9, overflow: 'hidden', background: IOS.relleno }}>
      {/* appearance:none + display:block: sin esto el date de iOS impone su ancho mínimo y se sale de la tarjeta. */}
      <input
        type="date"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        aria-label={etiqueta}
        style={{ ...campoFecha, display: 'block', width: '100%', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none', background: 'transparent', color: valor ? IOS.texto : 'transparent' }}
      />
      {!valor && (
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: IOS.secundario, pointerEvents: 'none' }}>
          {etiqueta}
        </span>
      )}
    </div>
  );
}

const campoFecha: React.CSSProperties = {
  flex: 1, minWidth: 0, height: 36, borderRadius: 9, border: 'none', background: IOS.relleno,
  padding: '0 10px', fontSize: 15, color: IOS.texto,
};
