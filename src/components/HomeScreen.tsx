import React from 'react';
import { User, Order } from '../App';
import { Package, Plus, Menu, Bell, Clock, CheckCircle2, Truck, ChevronRight, MessageSquare, BarChart3, X, Store } from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { PaginationInfo, productsAPI, categoriesAPI, Product, Category } from '../utils/api';
import { nombreCategoriaRaiz } from '../utils/categoryTree';
import logo from '../assets/logo-icon.png';
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
    label: 'En preparación',
    color: 'text-blue-700',
    bgColor: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200',
    icon: Package
  },
  completed: {
    label: 'Listo para despacho',
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

  // Resumen siempre visible (antes iba plegado): son los números que se miran
  // al abrir la app. Cuenta lo que trae la primera página, igual que antes.
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
    <div className="min-h-screen" style={{ background: IOS.fondo }}>
      {/* Encabezado */}
      <div style={{ background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)', paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
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
                style={{ ...botonRedondo, position: 'relative' }}
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
            <button type="button" onClick={onViewProfile} aria-label="Abrir menú" className="boton-ios" style={botonRedondo}>
              <Menu style={{ width: 19, height: 19, color: '#fff' }} />
            </button>
          </div>

          {orders.length > 0 && (
            <div
              className="home-resumen"
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
      <div className="max-w-md mx-auto home-contenedor" style={{ padding: '16px 16px max(env(safe-area-inset-bottom), 32px)' }}>
        {/* Acción principal */}
        {onNewOrder && (
          <button
            type="button"
            onClick={onNewOrder}
            className="boton-ios"
            style={{
              width: '100%', height: 50, borderRadius: 12, border: 'none', background: IOS.azul, color: '#fff',
              fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
            }}
          >
            <Plus style={{ width: 20, height: 20 }} strokeWidth={2.5} />
            {isProduction ? 'Nueva orden de producción' : 'Nuevo pedido'}
          </button>
        )}

        {/* Accesos */}
        {accesos.length > 0 && (
          <div style={{ ...tarjeta, marginTop: 12 }}>
            {accesos.map((a, i) => {
              const Icono = a.icon;
              return (
                <div key={a.key}>
                  {i > 0 && <div style={{ height: 0.5, background: IOS.separador, marginLeft: 56 }} />}
                  <button type="button" onClick={a.onClick} className="fila-ios"
                    style={{ width: '100%', height: 48, display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px 0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <span style={{ width: 29, height: 29, borderRadius: 7, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icono style={{ width: 17, height: 17, color: '#fff' }} />
                    </span>
                    <span style={{ flex: 1, fontSize: 17, color: IOS.texto }}>{a.label}</span>
                    <ChevronRight style={{ width: 18, height: 18, color: '#C7C7CC' }} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pedidos */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '22px 4px 8px' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: IOS.texto }}>Pedidos</h2>
          {onViewHistory ? (
            <button
              type="button"
              onClick={onViewHistory}
              aria-label={pagination ? `Ver historial completo (${pagination.total} pedidos)` : 'Ver historial completo'}
              style={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 44, padding: '0 2px', fontSize: 17, color: IOS.azul, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Ver todo
              <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          ) : pagination && (
            <span style={{ fontSize: 15, color: IOS.secundario }}>{pagination.total} en total</span>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Filtrar pedidos"
          className="home-segmentos"
          style={{ display: 'flex', padding: 2, marginBottom: 12, background: IOS.relleno, borderRadius: 9 }}
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
                style={{
                  flex: 1, height: 30, borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  fontWeight: activo ? 600 : 500, color: IOS.texto,
                  background: activo ? '#fff' : 'transparent',
                  boxShadow: activo ? '0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04)' : 'none',
                }}
              >
                {etiqueta}
                {cantidad !== null && cantidad > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: IOS.secundario }}>{cantidad}</span>
                )}
              </button>
            );
          })}
        </div>

        {isLoading && displayOrders.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse" style={{ ...tarjeta, borderRadius: 16, height: 92 }} />
            ))}
          </div>
        ) : displayOrders.length === 0 ? (
          <div style={{ ...tarjeta, padding: '36px 24px', textAlign: 'center' }}>
            <Package style={{ width: 40, height: 40, color: '#C7C7CC', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 17, fontWeight: 600, color: IOS.texto }}>Todavía no hay pedidos</p>
            <p style={{ fontSize: 15, color: IOS.secundario, marginTop: 4 }}>Cuando hagas uno, aparecerá aquí.</p>
          </div>
        ) : (
          <div style={{ opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? 'none' : undefined, transition: 'opacity .3s' }}>
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

              const entradas = Object.entries(grupos);
              if (entradas.length === 0) {
                const vacio = {
                  hoy: 'No hay pedidos para hoy',
                  proximos: 'No hay pedidos para los próximos días',
                  anteriores: 'No hay pedidos anteriores en esta página',
                }[segmento];
                return <p style={{ textAlign: 'center', fontSize: 15, color: IOS.secundario, padding: '40px 0' }}>{vacio}</p>;
              }

              return entradas.map(([dateLabel, groupOrders]) => (
                <div key={dateLabel} style={{ marginBottom: 18 }}>
                  {/* En Hoy no hace falta el título: todo es del mismo día. */}
                  {segmento !== 'hoy' && (
                    <h3 style={{ fontSize: 13, fontWeight: 400, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: 0.2, margin: '4px 16px 7px' }}>
                      {dateLabel}
                    </h3>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {groupOrders.map((order) => (
                      <SwipeableOrderCard
                        key={order.id}
                        orderId={order.id}
                        status={order.status}
                        userRole={user.role}
                        onTap={() => handleViewOrder(order)}
                        onCambiarEstado={cambiarEstadoPedido}
                      >
                        <TarjetaPedido
                          order={order}
                          mostrarLocal={!!order.customerName && order.customerName !== user.name}
                          categorias={categoriasDePedido(order)}
                        />
                      </SwipeableOrderCard>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {pagination && onPageChange && segmento === 'anteriores' && (
          <div style={{ marginTop: 16 }}>
            <PaginationControls pagination={pagination} onPageChange={onPageChange} isLoading={isLoading} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: '#8E8E93',
  separador: 'rgba(60, 60, 67, 0.18)',
  relleno: 'rgba(118, 118, 128, 0.12)',
  azul: '#007AFF',
};

const ESTADO_COLOR: Record<string, string> = {
  pending: '#FF9500',
  in_progress: '#007AFF',
  completed: '#34C759',
  dispatched: '#5856D6',
  delivered: '#30B0C7',
  cancelled: '#FF3B30',
};

const tarjeta: React.CSSProperties = { background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' };

const botonRedondo: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.18)',
};

/** Hora del pedido; si se hizo otro día que el de entrega, con la fecha delante. */
function horaDelPedido(order: Order): string {
  const createdAt = order.createdAt || order.date;
  const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const deadlineDay = order.deadline ? localDay(new Date(order.deadline.slice(0, 10) + 'T12:00:00')) : null;
  const createdDay = createdAt ? localDay(new Date(createdAt)) : null;
  const hora = new Date(createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  if (deadlineDay && createdDay && deadlineDay !== createdDay) {
    const fecha = new Date(createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');
    return `${fecha}, ${hora}`;
  }
  return hora;
}

function TarjetaPedido({ order, mostrarLocal, categorias }: { order: Order; mostrarLocal: boolean; categorias: string[] }) {
  const config = statusConfig[order.status] || { label: 'Desconocido', icon: Package };
  const StatusIcon = config.icon;
  const color = ESTADO_COLOR[order.status] || IOS.secundario;
  const codigo = `#${order.id.slice(0, 8).toUpperCase()}`;
  const visibles = categorias.slice(0, 2);
  const resto = categorias.length - visibles.length;
  const enCurso = order.status === 'pending' || order.status === 'in_progress' || order.status === 'completed';

  return (
    <div style={{ background: IOS.tarjeta, borderRadius: 16, padding: '12px 14px 12px 12px', display: 'flex', gap: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 9, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <StatusIcon style={{ width: 19, height: 19, color: '#fff' }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: IOS.texto }}>
            {mostrarLocal ? order.customerName : `Pedido ${codigo}`}
          </p>
          {order.notes && order.notes.trim() && (
            <MessageSquare style={{ width: 15, height: 15, color: '#FF9500', flexShrink: 0 }} aria-label="Tiene observaciones" />
          )}
          <span style={{ fontSize: 14, color: IOS.secundario, flexShrink: 0 }}>{horaDelPedido(order)}</span>
        </div>
        <p className="truncate" style={{ fontSize: 14, color: IOS.secundario, marginTop: 1 }}>
          <span style={{ color, fontWeight: 600 }}>{config.label}</span>
          {' · '}{formatearCantidad(order.quantity)} unid.
          {mostrarLocal && <> · {codigo}</>}
        </p>
        {visibles.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {visibles.map((c) => (
              <span key={c} className="truncate" style={{ fontSize: 12, fontWeight: 500, color: '#3C3C43', background: IOS.relleno, borderRadius: 6, padding: '2px 7px', maxWidth: '45%' }}>
                {c}
              </span>
            ))}
            {resto > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: IOS.secundario, flexShrink: 0 }}>+{resto}</span>}
          </div>
        )}
        {enCurso && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: IOS.relleno, overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, order.progress || 0))}%`, height: '100%', borderRadius: 2, background: color, transition: 'width .6s' }} />
            </div>
            <span style={{ fontSize: 12, color: IOS.secundario, fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{order.progress || 0}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
