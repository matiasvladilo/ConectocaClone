import React from 'react';
import { User, Order } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Package, Plus, User as UserIcon, Menu, Clock, CheckCircle2, Truck, ChevronDown, ChevronUp, TrendingUp, History, MessageSquare, Factory, BarChart3, X, Store } from 'lucide-react';
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

export function HomeScreen({ user, orders, onViewOrder, onNewOrder, onViewProfile, onViewHistory, onGoToProduction, onGoToBakeryKDS, onGoToDashboard, onManageProducts, onUpdateOrderStatus, pagination, onPageChange, isLoading = false, accessToken }: HomeScreenProps) {
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

  // Resumen de pedidos: colapsado por defecto para que "Realizar nuevo pedido" y
  // la lista de pedidos sean lo primero que se ve. Se recuerda la preferencia:
  // si el usuario lo expande, queda expandido la próxima vez.
  const [statsExpanded, setStatsExpanded] = React.useState<boolean>(() => {
    try { return localStorage.getItem('conectoca_home_stats_expanded') === 'true'; }
    catch { return false; }
  });
  const toggleStats = () => {
    setStatsExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem('conectoca_home_stats_expanded', String(next)); } catch { /* storage no disponible */ }
      return next;
    });
  };

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
  const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
  const totalAmount = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  // Get unique customers count (only for admin)
  const uniqueCustomers = user.role === 'admin'
    ? new Set(orders.map(o => o.customerName)).size
    : 0;

  // Check if user is admin
  const isAdmin = user.role === 'admin';
  const isProduction = user.role === 'production';

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

      {/* Header */}
      <div
        className="relative z-10 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          borderBottom: '3px solid #FFD43B',
          paddingTop: 'max(env(safe-area-inset-top), 20px)'
        }}
      >
        <div className="max-w-md mx-auto px-6 py-6 home-contenedor">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <motion.div
                className="relative"
                whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5 }}
              >
                <img
                  src={logo}
                  alt="La Oca Logo"
                  className="w-12 h-12 object-contain relative z-10"
                  style={{ imageRendering: 'crisp-edges' }}
                />
              </motion.div>
              <div>
                <h1 className="text-white tracking-wide" style={{ fontSize: '18px', fontWeight: 600 }}>
                  CONECTOCA
                </h1>
                <p className="text-blue-100 text-xs">
                  Gestión de Pedidos La Oca
                </p>
              </div>
            </div>
            <motion.button
              onClick={onViewProfile}
              aria-label="Abrir menú"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="w-11 h-11 rounded-full flex items-center justify-center relative overflow-hidden group"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              <Menu className="w-5 h-5 text-white relative z-10" />
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-2"
          >
            <h2 className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
              ¡Hola, {user.name}! 👋
            </h2>
            {/* El rol ya lo comunica esta línea de panel; el badge
                "👑 ADMINISTRADOR" era redundante y ocupaba alto de más. */}
            <p className="text-blue-100" style={{ fontSize: '14px' }}>
              {isAdmin ? 'Panel de Administración - Vista Global' : isProduction ? 'Panel de Producción' : 'Bienvenido a tu panel de pedidos'}
            </p>
          </motion.div>

          {/* Resumen de pedidos (colapsable). La barra siempre muestra los
              números clave de un vistazo; el chevron despliega las tarjetas. */}
          {orders.length > 0 && (
            <div className="mt-6">
              <button
                onClick={toggleStats}
                aria-expanded={statsExpanded}
                className="w-full flex items-center justify-between gap-3 p-3 rounded-xl backdrop-blur-md text-left"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <span className="text-blue-50 text-xs sm:text-sm truncate">
                  {isAdmin
                    ? `${pendingOrders} pend · ${inProgressOrders} en proceso · ${completedOrders} listos · ${dispatchedOrders} desp · ${uniqueCustomers} clientes`
                    : `${pendingOrders} pendientes · ${inProgressOrders} en proceso`}
                </span>
                {statsExpanded
                  ? <ChevronUp className="w-4 h-4 text-blue-100 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-blue-100 shrink-0" />}
              </button>

          {statsExpanded && (isAdmin ? (
            // Admin stats - Comprehensive global view
            <motion.div
              className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 home-stats"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="p-3 rounded-xl backdrop-blur-md"
                style={{
                  background: 'rgba(255, 212, 59, 0.2)',
                  border: '1px solid rgba(255, 212, 59, 0.3)'
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5 text-yellow-200" />
                  <span className="text-[10px] text-yellow-100">Pendientes</span>
                </div>
                <p className="text-white" style={{ fontSize: '18px', fontWeight: 600 }}>
                  {pendingOrders}
                </p>
              </div>
              <div
                className="p-3 rounded-xl backdrop-blur-md"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Package className="w-3.5 h-3.5 text-blue-200" />
                  <span className="text-[10px] text-blue-100">En Proceso</span>
                </div>
                <p className="text-white" style={{ fontSize: '18px', fontWeight: 600 }}>
                  {inProgressOrders}
                </p>
              </div>
              <div
                className="p-3 rounded-xl backdrop-blur-md"
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-200" />
                  <span className="text-[10px] text-green-100">Listos</span>
                </div>
                <p className="text-white" style={{ fontSize: '18px', fontWeight: 600 }}>
                  {completedOrders}
                </p>
              </div>
              <div
                className="p-3 rounded-xl backdrop-blur-md"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Truck className="w-3.5 h-3.5 text-blue-200" />
                  <span className="text-[10px] text-blue-100">Despachados</span>
                </div>
                <p className="text-white" style={{ fontSize: '18px', fontWeight: 600 }}>
                  {dispatchedOrders}
                </p>
              </div>
              <div
                className="p-3 rounded-xl backdrop-blur-md col-span-2"
                style={{
                  background: 'rgba(255, 212, 59, 0.2)',
                  border: '1px solid rgba(255, 212, 59, 0.3)'
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <UserIcon className="w-3.5 h-3.5 text-yellow-200" />
                  <span className="text-[10px] text-yellow-100">Clientes Activos</span>
                </div>
                <p className="text-white" style={{ fontSize: '18px', fontWeight: 600 }}>
                  {uniqueCustomers}
                </p>
              </div>
            </motion.div>
          ) : (
            // Regular user stats
            <motion.div
              className="mt-2 grid grid-cols-2 gap-3"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="p-3 rounded-xl backdrop-blur-md"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-yellow-300" />
                  <span className="text-xs text-blue-100">Pendientes</span>
                </div>
                <p className="text-white" style={{ fontSize: '20px', fontWeight: 600 }}>
                  {pendingOrders}
                </p>
              </div>
              <div
                className="p-3 rounded-xl backdrop-blur-md"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Package className="w-4 h-4 text-green-300" />
                  <span className="text-xs text-blue-100">En Proceso</span>
                </div>
                <p className="text-white" style={{ fontSize: '20px', fontWeight: 600 }}>
                  {inProgressOrders}
                </p>
              </div>
            </motion.div>
          ))}
            </div>
          )}
        </div>
      </div>

      {/* En escritorio (>=1024px) el inicio se ensancha: los botones de acción
          pasan a una fila horizontal arriba y los pedidos quedan en una sola
          columna más ancha. El CSS de Tailwind está precompilado y casi no trae
          variantes lg:, por eso va acá con media query (mismo patrón que
          ProductManagement). */}
      <style>{`
        @media (min-width: 1024px) {
          .home-contenedor { max-width: 64rem; }
          .home-stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
          .home-acciones { display: flex; gap: 0.75rem; }
          .home-acciones > * { flex: 1 1 0; margin: 0 !important; }
          .home-acciones button { margin-top: 0 !important; }
          .home-segmentos { max-width: 420px; }
        }
      `}</style>
      <div className="max-w-md mx-auto px-6 py-6 space-y-6 relative z-10 home-contenedor">
        {/* Action Buttons */}
        <div className="space-y-3 home-acciones">
          {/* Dashboard Button - Only for production users - ABOVE production orders button */}
          {onGoToDashboard && isProduction && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onGoToDashboard}
                className="w-full h-14 text-white relative overflow-hidden group shadow-lg"
                style={{
                  background: 'linear-gradient(90deg, #0047BA 0%, #0059FF 100%)',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(0, 71, 186, 0.3)'
                }}
              >
                <div className="flex items-center justify-center gap-2 relative z-10">
                  <BarChart3 className="w-5 h-5" />
                  Dashboard de Producción
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* Product Management - Only for production users */}
          {onManageProducts && isProduction && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onManageProducts}
                className="w-full h-14 text-white relative overflow-hidden group shadow-lg"
                style={{
                  background: 'linear-gradient(90deg, #2563EB 0%, #3B82F6 100%)', // slightly different blue
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
                }}
              >
                <div className="flex items-center justify-center gap-2 relative z-10">
                  <Package className="w-5 h-5" />
                  Gestión de Productos
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* New Order Button - Different text for production users */}
          {onNewOrder && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                onClick={onNewOrder}
                className="w-full py-6 text-gray-900 hover:bg-yellow-400 transition-all group relative overflow-hidden"
                style={{
                  background: 'linear-gradient(90deg, #FFD43B 0%, #FFC700 100%)',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(255, 212, 59, 0.4)'
                }}
              >
                <div className="flex items-center justify-center gap-2 relative z-10">
                  <Plus className="w-5 h-5" />
                  {isProduction ? 'Realizar nueva orden de producción' : 'Realizar nuevo pedido'}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* Production Area Button - Only for admin and dispatch users */}
          {/* El admin entra a Despacho desde Mi Perfil: acá solo queda Gestionar Productos como botón principal. */}
          {onGoToProduction && user.role === 'dispatch' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onGoToProduction}
                className="w-full h-12 text-white relative overflow-hidden group shadow-lg"
                style={{
                  background: 'linear-gradient(90deg, #0047BA 0%, #0059FF 100%)',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(0, 71, 186, 0.3)'
                }}
              >
                <div className="flex items-center justify-center gap-2 relative z-10">
                  <Factory className="w-5 h-5" />
                  Ir a Panel de Despacho
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* Gestionar Productos (admin): ocupa el lugar del botón de Pastelería,
              que el admin igual puede abrir desde el panel. Va en azul (el color que
              tenía Despacho en este lugar) para no repetir el amarillo de
              "Realizar nuevo pedido" justo arriba. */}
          {onManageProducts && user.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.33 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onManageProducts}
                className="w-full h-12 relative overflow-hidden group shadow-lg mt-3"
                style={{
                  background: 'linear-gradient(90deg, #0047BA 0%, #0059FF 100%)',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(0, 71, 186, 0.3)',
                  color: 'white'
                }}
              >
                <div className="flex items-center justify-center gap-2 relative z-10">
                  <Package className="w-5 h-5" />
                  Gestionar Productos
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* Bakery KDS Button (despacho y pastelería; el admin ve Gestionar Productos) */}
          {onGoToBakeryKDS && (user.role === 'dispatch' || user.role === 'pastry') && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.33 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onGoToBakeryKDS}
                className="w-full h-12 text-white relative overflow-hidden group shadow-lg mt-3"
                style={{
                  background: 'linear-gradient(90deg, #D946EF 0%, #EC4899 100%)',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(236, 72, 153, 0.3)'
                }}
              >
                <div className="flex items-center justify-center gap-2 relative z-10">
                  <Store className="w-5 h-5" />
                  Ir a Panel de Pastelería
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* History Button */}
          {onViewHistory && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                onClick={onViewHistory}
                variant="outline"
                className="w-full h-12 border-2 hover:bg-blue-50 hover:border-[#0059FF] transition-colors group"
                style={{
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderColor: '#E0EDFF'
                }}
              >
                <div className="flex items-center justify-center gap-2 text-[#0047BA] group-hover:text-[#0059FF] transition-colors">
                  <History className="w-5 h-5" />
                  Ver historial completo
                </div>
              </Button>
            </motion.div>
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
              {pagination && (
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
                                <CardDescription className="flex items-center gap-x-2 gap-y-1 text-xs mt-1.5 flex-wrap">
                                  {categoriasDePedido(order).length > 0 && (
                                    <span className="bg-blue-50 text-blue-700 border-blue-200 border rounded px-1.5 py-0.5" style={{ fontSize: '10px', fontWeight: 600 }}>
                                      {categoriasDePedido(order).join(', ')}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Package className="w-3.5 h-3.5" />
                                    {order.quantity} unid.
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
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
                                  {order.customerName && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-1 font-medium text-blue-600">
                                        <Store className="w-3.5 h-3.5" />
                                        {order.customerName}
                                      </span>
                                    </>
                                  )}
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