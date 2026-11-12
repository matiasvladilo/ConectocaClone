import React from 'react';
import { User, Order } from '../App';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Package, Plus, Menu, Bell, Clock, CheckCircle2, Truck, TrendingUp, ChevronRight, MessageSquare, BarChart3, X, Store } from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { PaginationInfo, productsAPI, categoriesAPI, Product, Category } from '../utils/api';
import { nombreCategoriaRaiz } from '../utils/categoryTree';
import logo from '../assets/logo-icon.png';
import { motion } from 'motion/react';
import { SwipeableOrderCard } from './SwipeableOrderCard';
import { type FlowStep } from '../utils/orderStatusFlow';
import { aplicarCambioEstado } from '../utils/cambioEstadoDeslizando';

interface HomeScreenProps {
  user: User;
  orders: Order[];
  onViewOrder: (order: Order) => void;
  onNewOrder: () => void;
  onViewProfile: () => void;
  onOpenNotifications?: () => void;
  unreadNotifications?: number;
  onViewHistory?: () => void;
  onGoToProduction?: () => void;
  onGoToDashboard?: () => void;
  onManageProducts?: () => void;
  onGoToBakeryKDS?: () => void;
  // Cambiar el estado de un pedido deslizando la tarjeta. Mismo handler que usa
  // OrderDetail; si no se pasa, el deslizado queda desactivado.
  onUpdateOrderStatus?: (orderId: string, newStatus: any, progress: number) => Promise<void>;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  accessToken: string;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  pending: {
    label: 'Pendiente',
    color: 'text-amber-700',
    bgColor: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200',
    icon: Clock
  },
  in_progress: {
    label: 'En Preparación',
    color: 'text-blue-700',
    bgColor: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200',
    icon: Package
  },
  completed: {
    label: 'Listo para Despacho',
    color: 'text-green-700',
    bgColor: 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200',
    icon: CheckCircle2
  },
  dispatched: {
    label: 'Despachado',
    color: 'text-indigo-700',
    bgColor: 'bg-gradient-to-r from-indigo-50 to-violet-50 border-indigo-200',
    icon: Truck
  },
  delivered: {
    label: 'Recibido',
    color: 'text-teal-700',
    bgColor: 'bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200',
    icon: CheckCircle2
  },
  cancelled: {
    label: 'Cancelado',
    color: 'text-red-700',
    bgColor: 'bg-gradient-to-r from-red-50 to-pink-50 border-red-200',
    icon: X
  }
};

const SCROLL_KEY = 'ordersScrollPosition';

// Cantidad total del pedido: hasta 2 decimales y con coma ("2,5"), para que
// los productos que se piden en decimales no muestren errores de redondeo.
const formatearCantidad = (n: number) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n || 0);

export function HomeScreen({ user, orders, onViewOrder, onNewOrder, onViewProfile, onOpenNotifications, unreadNotifications, onViewHistory, onGoToProduction, onGoToBakeryKDS, onGoToDashboard, onManageProducts, onUpdateOrderStatus, pagination, onPageChange, isLoading = false, accessToken }: HomeScreenProps) {
  // Control segmentado de la lista de pedidos (estilo iOS). Reemplaza al
  // botón "Mostrar/Ocultar Futuros", que mezclaba los pedidos de días
  // siguientes arriba de los de hoy.
  const [segmento, setSegmento] = React.useState<'hoy' | 'proximos' | 'anteriores'>('hoy');

  // Catálogo para poder mostrar la categoría de cada pedido en su tarjeta
  // (pedido de un trabajador: cuesta encontrar el pedido correcto a simple
  // vista cuando hay varios en pantalla). Los pedidos no guardan la categoría
  // de sus productos, así que hay que cruzar por productId contra el catálogo.
  const [catalogProducts, setCatalogProducts] = React.useState<Product[] | null>(null);
  const [catalogCategories, setCatalogCategories] = React.useState<Category[] | null>(null);

  // Confirmó un cambio de estado deslizando una tarjeta. La lógica (aviso +
  // "Deshacer" + error) se comparte con despacho y producción en el helper.
  const cambiarEstadoPedido = (orderId: string, destino: FlowStep, previo: FlowStep) =>
    aplicarCambioEstado(onUpdateOrderStatus, orderId, destino, previo);

  React.useEffect(() => {
    (async () => {
      try {
        const [products, categories] = await Promise.all([
          productsAPI.getAll(accessToken),
          categoriesAPI.getAll(accessToken),
        ]);
        setCatalogProducts(products);
        setCatalogCategories(categories);
      } catch (err) {
        console.error('Error cargando catálogo para categorizar pedidos:', err);
        setCatalogProducts([]);
        setCatalogCategories([]);
      }
    })();
  }, [accessToken]);

  const categoriaPorProducto = React.useMemo(() => {
    const mapa = new Map<string, string>();
    if (!catalogProducts || !catalogCategories) return mapa;
    for (const p of catalogProducts) {
      mapa.set(p.id, nombreCategoriaRaiz(catalogCategories, p.categoryId));
    }
    return mapa;
  }, [catalogProducts, catalogCategories]);

  const categoriasDePedido = (order: Order): string[] => {
    const vistas = new Set<string>();
    const resultado: string[] = [];
    for (const item of order.products || []) {
      const categoria = categoriaPorProducto.get(item.productId);
      if (categoria && !vistas.has(categoria)) {
        vistas.add(categoria);
        resultado.push(categoria);
      }
    }
    return resultado;
  };

  // Restore scroll position when returning from an order detail
  React.useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      window.scrollTo(0, Number(saved));
      sessionStorage.removeItem(SCROLL_KEY);
    }
  }, []);

  const handleViewOrder = (order: Order) => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    onViewOrder(order);
  };

  // If pagination is enabled, use all orders (already paginated from backend)
  // Otherwise, show only first 5 orders (legacy behavior)
  const displayOrders = pagination ? orders : orders.slice(0, 5);

  // Cada pedido cae en un segmento según su día de entrega (o el de creación
  // si no tiene fecha de entrega), comparando fechas LOCALES para no correrse
  // de día por la zona horaria.
  const inicioDeHoy = new Date();
  inicioDeHoy.setHours(0, 0, 0, 0);
  const diaDelPedido = (order: Order) => {
    if (order.deadline) {
      const [y, m, d] = order.deadline.split('T')[0].split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const creado = new Date(order.createdAt || order.date);
    creado.setHours(0, 0, 0, 0);
    return creado;
  };
  const pedidosPorSegmento: Record<'hoy' | 'proximos' | 'anteriores', Order[]> = { hoy: [], proximos: [], anteriores: [] };
  displayOrders.forEach(order => {
    const dia = diaDelPedido(order).getTime();
    const destino = dia === inicioDeHoy.getTime() ? 'hoy' : dia > inicioDeHoy.getTime() ? 'proximos' : 'anteriores';
    pedidosPorSegmento[destino].push(order);
  });

  // Hoy y Próximos salen de la página 1 (la API ordena por fecha de creación,
  // así que lo reciente está ahí); la paginación solo tiene sentido en Anteriores.
  const cambiarSegmento = (nuevo: 'hoy' | 'proximos' | 'anteriores') => {
    setSegmento(nuevo);
    if (nuevo !== 'anteriores' && pagination && pagination.page !== 1 && onPageChange) {
      onPageChange(1);
    }
  };

  // Calculate quick stats
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const inProgressOrders = orders.filter(o => o.status === 'in_progress').length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const dispatchedOrders = orders.filter(o => o.status === 'dispatched').length;

  // Check if user is admin
  const isAdmin = user.role === 'admin';
  const isProduction = user.role === 'production';

  const primerNombre = (user.name || '').trim().split(/\s+/)[0] || user.name;
  const subtituloPanel = isAdmin ? 'Vista global del negocio' : isProduction ? 'Panel de producción' : 'Tus pedidos de hoy y próximos';

  const resumen: { label: string; valor: number }[] = isAdmin || user.role === 'dispatch'
    ? [
        { label: 'Pendientes', valor: pendingOrders },
        { label: 'En prep.', valor: inProgressOrders },
        { label: 'Listos', valor: completedOrders },
        { label: 'Despachados', valor: dispatchedOrders },
      ]
    : [
        { label: 'Pendientes', valor: pendingOrders },
        { label: 'En preparación', valor: inProgressOrders },
        { label: 'Listos', valor: completedOrders },
      ];

  // Accesos secundarios por rol, como lista agrupada de iOS.
  const accesos: { key: string; label: string; icon: any; color: string; onClick: () => void }[] = [];
  if (onGoToDashboard && isProduction) accesos.push({ key: 'dash', label: 'Panel de producción', icon: BarChart3, color: '#5856D6', onClick: onGoToDashboard });
  if (onGoToProduction && user.role === 'dispatch') accesos.push({ key: 'desp', label: 'Panel de despacho', icon: Truck, color: '#5856D6', onClick: onGoToProduction });
  if (onGoToBakeryKDS && (user.role === 'dispatch' || user.role === 'pastry')) accesos.push({ key: 'past', label: 'Panel de pastelería', icon: Store, color: '#FF2D55', onClick: onGoToBakeryKDS });
  if (onManageProducts && (isAdmin || isProduction)) accesos.push({ key: 'prod', label: 'Productos', icon: Package, color: '#FF9500', onClick: onManageProducts });

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #EAF2FF 0%, #CFE0FF 100%)' }}
    >
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-96 h-96 bg-yellow-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      {/* Encabezado (estilo iOS). La sección "Mis Pedidos" de abajo conserva
          su diseño original a pedido del usuario. */}
      <div className="relative z-10" style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="max-w-md mx-auto home-contenedor" style={{ padding: '8px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src={logo} alt="La Oca" style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate" style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>Hola, {primerNombre}</h1>
              <p className="truncate" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>{subtituloPanel}</p>
            </div>
            {onOpenNotifications && (
              <button
                type="button"
                onClick={onOpenNotifications}
                aria-label={unreadNotifications ? `Notificaciones, ${unreadNotifications} sin leer` : 'Notificaciones'}
                className="boton-ios"
                style={{ ...botonRedondoIOS, position: 'relative' }}
              >
                <Bell style={{ width: 19, height: 19, color: '#fff' }} />
                {!!unreadNotifications && unreadNotifications > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
                    background: '#FF3B30', color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center',
                    boxShadow: '0 0 0 2px #0060E0',
                  }}>
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>
            )}
            <button type="button" onClick={onViewProfile} aria-label="Abrir menú" className="boton-ios" style={botonRedondoIOS}>
              <Menu style={{ width: 19, height: 19, color: '#fff' }} />
            </button>
          </div>

          {/* Resumen siempre visible (antes iba plegado): son los números que se
              miran al abrir la app. Cuenta lo que trae la primera página. */}
          {orders.length > 0 && (
            <div
              style={{
                marginTop: 14, display: 'grid', gridTemplateColumns: `repeat(${resumen.length}, minmax(0, 1fr))`,
                background: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: '10px 2px',
              }}
            >
              {resumen.map((r, i) => (
                <div key={r.label} style={{ textAlign: 'center', minWidth: 0, borderLeft: i > 0 ? '0.5px solid rgba(255,255,255,0.22)' : 'none', padding: '0 2px' }}>
                  <p style={{ color: '#fff', fontSize: 22, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{r.valor}</p>
                  <p className="truncate" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, letterSpacing: -0.2 }}>{r.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* En escritorio (>=1024px) el inicio se ensancha. El CSS de Tailwind está
          precompilado y casi no trae variantes lg:, por eso va con media query. */}
      <style>{`
        @media (min-width: 1024px) {
          .home-contenedor { max-width: 64rem; }
          .home-segmentos { max-width: 420px; }
        }
      `}</style>
      <div className="max-w-md mx-auto px-6 py-6 space-y-6 relative z-10 home-contenedor">
        {/* Acción principal + accesos por rol (estilo iOS) */}
        <div>
          {onNewOrder && (
            <button
              type="button"
              onClick={onNewOrder}
              className="boton-ios"
              style={{
                width: '100%', height: 50, borderRadius: 12, border: 'none', background: '#007AFF', color: '#fff',
                fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0, 122, 255, 0.25)',
              }}
            >
              <Plus style={{ width: 20, height: 20 }} strokeWidth={2.5} />
              {isProduction ? 'Nueva orden de producción' : 'Nuevo pedido'}
            </button>
          )}

          {accesos.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginTop: 12 }}>
              {accesos.map((a, i) => {
                const Icono = a.icon;
                return (
                  <div key={a.key}>
                    {i > 0 && <div style={{ height: 0.5, background: 'rgba(60, 60, 67, 0.18)', marginLeft: 56 }} />}
                    <button type="button" onClick={a.onClick} className="fila-ios"
                      style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px 0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                      <span style={{ width: 29, height: 29, borderRadius: 7, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icono style={{ width: 17, height: 17, color: '#fff' }} />
                      </span>
                      <span style={{ flex: 1, fontSize: 17, color: '#000' }}>{a.label}</span>
                      <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC' }} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Orders List */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-[#0047BA] flex items-center gap-2"
              style={{ fontSize: '18px', fontWeight: 600 }}
            >
              <TrendingUp className="w-5 h-5" />
              {pagination ? 'Mis Pedidos' : 'Pedidos Recientes'}
            </h3>
            <div className="flex items-center gap-3">
              {/* Historial completo: enlace discreto "Ver todo" (estilo
                  encabezado de sección de iOS) en vez de un botón grande;
                  la pestaña "Anteriores" ya cubre lo reciente. */}
              {onViewHistory ? (
                <button
                  type="button"
                  onClick={onViewHistory}
                  aria-label={pagination ? `Ver historial completo (${pagination.total} pedidos)` : 'Ver historial completo'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    minHeight: 44,
                    padding: '0 2px',
                    fontSize: 15,
                    fontWeight: 500,
                    color: '#0059FF',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Ver todo
                  <ChevronRight style={{ width: 17, height: 17 }} />
                </button>
              ) : pagination && (
                <span
                  className="text-xs px-2 py-1 rounded-full"
                  style={{
                    background: 'rgba(0, 71, 186, 0.1)',
                    color: '#0047BA',
                    fontWeight: 500
                  }}
                >
                  {pagination.total} total
                </span>
              )}
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Filtrar pedidos"
            className="flex p-1 mb-4 home-segmentos"
            style={{ background: 'rgba(0, 71, 186, 0.08)', borderRadius: '10px' }}
          >
            {([
              ['hoy', 'Hoy'],
              ['proximos', 'Próximos'],
              ['anteriores', 'Anteriores'],
            ] as const).map(([valor, etiqueta]) => {
              const activo = segmento === valor;
              const cantidad = valor === 'anteriores' ? null : pedidosPorSegmento[valor].length;
              return (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => cambiarSegmento(valor)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm transition-colors"
                  style={{
                    borderRadius: '8px',
                    fontWeight: activo ? 600 : 500,
                    color: activo ? '#0047BA' : '#64748B',
                    background: activo ? 'white' : 'transparent',
                    boxShadow: activo ? '0 1px 3px rgba(0, 71, 186, 0.15)' : 'none'
                  }}
                >
                  {etiqueta}
                  {cantidad !== null && cantidad > 0 && (
                    <span
                      className="text-xs rounded-full"
                      style={{ background: activo ? 'rgba(0, 71, 186, 0.1)' : 'rgba(100, 116, 139, 0.12)', lineHeight: '18px', padding: '0 6px' }}
                    >
                      {cantidad}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {isLoading && displayOrders.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse" style={{ borderRadius: '16px' }}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-3">
                        <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                        <div className="h-6 bg-gray-200 rounded w-24"></div>
                      </div>
                      <div className="h-4 bg-gray-200 rounded w-1/2 mt-2"></div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="w-full h-2.5 bg-gray-100 rounded-full mb-2"></div>
                      <div className="flex justify-between">
                        <div className="h-3 bg-gray-200 rounded w-20"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </motion.div>
            ) : displayOrders.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Card
                  className="border-2 border-dashed border-gray-300"
                  style={{ borderRadius: '16px' }}
                >
                  <CardContent className="p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-600 mb-2" style={{ fontSize: '15px', fontWeight: 500 }}>
                      No tienes pedidos aún
                    </p>
                    <p className="text-gray-400 text-sm">
                      Crea tu primer pedido para comenzar
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <div className={isLoading ? 'opacity-50 transition-opacity duration-300 pointer-events-none' : ''}>
                {(() => {
                  const etiquetaDeDia = (order: Order) =>
                    diaDelPedido(order).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

                  // Agrupa por día manteniendo el orden de llegada. En Próximos se
                  // ordena del día más cercano al más lejano.
                  const pedidosDelSegmento = pedidosPorSegmento[segmento];
                  const grupos: Record<string, typeof displayOrders> = {};
                  const ordenados = segmento === 'proximos'
                    ? [...pedidosDelSegmento].sort((x, y) => diaDelPedido(x).getTime() - diaDelPedido(y).getTime())
                    : pedidosDelSegmento;
                  ordenados.forEach(order => {
                    const clave = etiquetaDeDia(order);
                    if (!grupos[clave]) grupos[clave] = [];
                    grupos[clave].push(order);
                  });

                  const renderOrderGroup = ([dateLabel, groupOrders]: [string, typeof displayOrders], groupIndex: number, mostrarTitulo: boolean) => (
                    <div key={dateLabel} className="space-y-3 mb-6">
                      {/* Date Header (en Hoy no hace falta: todo es del mismo día) */}
                      {mostrarTitulo && (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + (groupIndex * 0.05) }}
                          className="flex items-center gap-2 pb-1 pt-2"
                        >
                          <span className="text-sm font-medium text-gray-500">
                            {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
                          </span>
                          <div className="h-px flex-1 bg-gradient-to-r from-blue-200 to-transparent" />
                        </motion.div>
                      )}

                      {/* Orders for this date */}
                      {groupOrders.map((order, index) => {
                        const config = statusConfig[order.status] || {
                          label: 'Desconocido',
                          color: 'text-gray-700',
                          bgColor: 'bg-gray-50 border-gray-200',
                          icon: Package
                        };
                        const StatusIcon = config.icon;

                        return (
                          <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + (groupIndex * 0.1) + (index * 0.05) }}
                          >
                            <SwipeableOrderCard
                              orderId={order.id}
                              status={order.status}
                              userRole={user.role}
                              onTap={() => handleViewOrder(order)}
                              onCambiarEstado={cambiarEstadoPedido}
                            >
                            <Card
                              className="cursor-pointer transition-all duration-300 border-2 group hover:shadow-xl"
                              style={{
                                borderRadius: '16px',
                                borderLeftWidth: order.status === 'pending' || order.status === 'in_progress' || order.status === 'completed' ? '4px' : '2px',
                                borderLeftColor: order.status === 'pending' ? '#F59E0B' :
                                  order.status === 'in_progress' ? '#0059FF' :
                                    order.status === 'completed' ? '#10B981' : undefined
                              }}
                            >
                              <CardHeader className="pb-2 pt-3">
                                <div className="flex justify-between items-center gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <CardTitle
                                      className="text-[#0047BA] group-hover:text-[#0059FF] transition-colors truncate"
                                      style={{ fontSize: '14px', fontWeight: 600 }}
                                    >
                                      Pedido #{order.id.slice(0, 8).toUpperCase()}
                                    </CardTitle>
                                    {order.notes && order.notes.trim() && (
                                      <div
                                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                                        style={{
                                          background: 'linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)',
                                          boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)'
                                        }}
                                        title="Tiene observaciones"
                                      >
                                        <MessageSquare className="w-3 h-3 text-amber-900" />
                                      </div>
                                    )}
                                  </div>
                                  <Badge
                                    className={`${config.bgColor} ${config.color} border flex items-center gap-1.5 px-2.5 py-1 flex-shrink-0`}
                                    style={{ fontSize: '11px', fontWeight: 500 }}
                                  >
                                    <StatusIcon className="w-3.5 h-3.5" />
                                    {config.label}
                                  </Badge>
                                </div>
                                {/* Metadatos en dos líneas fijas en vez de una fila que se
                                    partía en cualquier lado: con varias categorías el badge
                                    ocupaba un renglón entero y los "•" quedaban colgando al
                                    final de línea; las cantidades decimales salían como
                                    "2.5000000001 unid.". */}
                                <CardDescription className="text-xs mt-1.5">
                                  <span className="flex items-center min-w-0" style={{ gap: 12, whiteSpace: 'nowrap' }}>
                                    <span className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                                      <Package className="w-3.5 h-3.5" />
                                      {formatearCantidad(order.quantity)} unid.
                                    </span>
                                    <span className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                                      <Clock className="w-3.5 h-3.5" />
                                      {(() => {
                                        const createdAt = order.createdAt || order.date;
                                        // Compare LOCAL calendar dates (not UTC) to avoid midnight-shift false positives
                                        const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                                        const deadlineDay = order.deadline ? localDay(new Date(order.deadline.slice(0, 10) + 'T12:00:00')) : null;
                                        const createdDay = createdAt ? localDay(new Date(createdAt)) : null;
                                        const hora = new Date(createdAt).toLocaleString('es-CL', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          hour12: false
                                        });
                                        // Si el pedido se hizo otro día que el de entrega, se
                                        // antepone la fecha para que "14:32" no se lea como hora
                                        // de hoy. Antes esto llevaba el rótulo "Pedido anticipado",
                                        // que aparecía en casi todos los pedidos y sumaba ruido.
                                        if (deadlineDay && createdDay && deadlineDay !== createdDay) {
                                          const fecha = new Date(createdAt).toLocaleDateString('es-CL', {
                                            day: 'numeric',
                                            month: 'short'
                                          });
                                          return `${fecha}, ${hora}`;
                                        }
                                        return hora;
                                      })()}
                                    </span>
                                    {/* El local se omite en la cuenta del propio local: ya
                                        figura en el saludo y se repetía en cada tarjeta. */}
                                    {order.customerName && order.customerName !== user.name && (
                                      <span className="flex items-center gap-1 font-medium text-blue-600 min-w-0">
                                        <Store className="w-3.5 h-3.5" style={{ flexShrink: 0 }} />
                                        <span className="truncate">{order.customerName}</span>
                                      </span>
                                    )}
                                  </span>
                                  {(() => {
                                    const categorias = categoriasDePedido(order);
                                    if (categorias.length === 0) return null;
                                    const visibles = categorias.slice(0, 2);
                                    const resto = categorias.length - visibles.length;
                                    return (
                                      <span className="flex items-center mt-1.5 min-w-0" style={{ gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {visibles.map((c) => (
                                          <span
                                            key={c}
                                            className="truncate"
                                            style={{
                                              fontSize: 11, fontWeight: 600, color: '#1D4ED8', background: '#EFF6FF',
                                              borderRadius: 6, padding: '2px 7px', maxWidth: '45%',
                                            }}
                                          >
                                            {c}
                                          </span>
                                        ))}
                                        {resto > 0 && (
                                          <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', flexShrink: 0 }}>
                                            +{resto}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })()}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="pt-0 pb-3">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="flex-1 rounded-full h-1.5 overflow-hidden"
                                    style={{ background: 'rgba(0, 71, 186, 0.1)' }}
                                  >
                                    <motion.div
                                      className="h-1.5 rounded-full"
                                      style={{
                                        background: order.status === 'completed'
                                          ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
                                          : order.status === 'in_progress'
                                            ? 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)'
                                            : 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
                                        width: `${order.progress}%`
                                      }}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${order.progress}%` }}
                                      transition={{ duration: 0.8, delay: 0.5 + (groupIndex * 0.1) + (index * 0.05) }}
                                    />
                                  </div>
                                  <span className="text-[11px] text-gray-500 tabular-nums" style={{ fontWeight: 500 }}>
                                    {order.progress}%
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                            </SwipeableOrderCard>
                          </motion.div>
                        );
                      })}
                    </div>
                  );

                  const entradas = Object.entries(grupos);
                  if (entradas.length === 0) {
                    const vacio = {
                      hoy: 'No hay pedidos para hoy',
                      proximos: 'No hay pedidos para los próximos días',
                      anteriores: 'No hay pedidos anteriores en esta página',
                    }[segmento];
                    return (
                      <p className="text-center text-sm text-gray-500" style={{ padding: '40px 0' }}>{vacio}</p>
                    );
                  }
                  return entradas.map((entrada, i) => renderOrderGroup(entrada, i, segmento !== 'hoy'));
                })()}
              </div>
            )}

            {/* Pagination Controls */}
            {pagination && onPageChange && segmento === 'anteriores' && (
              <div className="mt-6">
                <PaginationControls
                  pagination={pagination}
                  onPageChange={onPageChange}
                  isLoading={isLoading}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const botonRedondoIOS: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
};
