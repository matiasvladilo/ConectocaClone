import React from 'react';
import { User, Order } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Package, Plus, User as UserIcon, Clock, CheckCircle2, Truck, Sparkles, TrendingUp, History, MessageSquare, Factory, BarChart3, X, Store } from 'lucide-react';
import { PaginationControls } from './PaginationControls';
import { PaginationInfo } from '../utils/api';
import logo from '../assets/logo.png';
import { motion } from 'motion/react';

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
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
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

export function HomeScreen({ user, orders, onViewOrder, onNewOrder, onViewProfile, onViewHistory, onGoToProduction, onGoToBakeryKDS, onGoToDashboard, onManageProducts, pagination, onPageChange, isLoading = false }: HomeScreenProps) {
  const [showFutureOrders, setShowFutureOrders] = React.useState(true);

  // If pagination is enabled, use all orders (already paginated from backend)
  // Otherwise, show only first 5 orders (legacy behavior)
  const displayOrders = pagination ? orders : orders.slice(0, 5);

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
        <div className="max-w-md mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <motion.div
                className="relative"
                whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                transition={{ duration: 0.5 }}
              >
                <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-lg" />
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
                <p className="text-blue-100 text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  Gestión de Pedidos La Oca
                </p>
              </div>
            </div>
            <motion.button
              onClick={onViewProfile}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="w-11 h-11 rounded-full flex items-center justify-center relative overflow-hidden group"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              <UserIcon className="w-5 h-5 text-white relative z-10" />
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-white" style={{ fontSize: '24px', fontWeight: 600 }}>
                ¡Hola, {user.name}! 👋
              </h2>
              {isAdmin && (
                <Badge
                  className="border px-2.5 py-1 text-xs"
                  style={{
                    background: 'linear-gradient(90deg, #FFD43B 0%, #FFC700 100%)',
                    color: '#0047BA',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(255, 212, 59, 0.3)'
                  }}
                >
                  👑 ADMINISTRADOR
                </Badge>
              )}
            </div>
            <p className="text-blue-100" style={{ fontSize: '14px' }}>
              {isAdmin ? 'Panel de Administración - Vista Global' : isProduction ? 'Panel de Producción' : 'Bienvenido a tu panel de pedidos'}
            </p>
          </motion.div>

          {/* Quick Stats */}
          {orders.length > 0 && isAdmin ? (
            // Admin stats - Comprehensive global view
            <motion.div
              className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
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
          ) : orders.length > 0 && (
            // Regular user stats
            <motion.div
              className="mt-6 grid grid-cols-2 gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
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
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 py-6 space-y-6 relative z-10">
        {/* Action Buttons */}
        <div className="space-y-3">
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
          {onGoToProduction && (user.role === 'admin' || user.role === 'dispatch') && (
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

          {/* Bakery KDS Button */}
          {onGoToBakeryKDS && (user.role === 'admin' || user.role === 'dispatch' || user.role === 'pastry') && (
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
              <button
                onClick={() => setShowFutureOrders(!showFutureOrders)}
                className={`text-[11px] px-2.5 py-1 rounded-full transition-all flex items-center gap-1 border font-medium ${showFutureOrders
                  ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                  }`}
                title={showFutureOrders ? 'Ocultar Pedidos Futuros' : 'Mostrar Pedidos Futuros'}
              >
                <Store className="w-3 h-3" />
                {showFutureOrders ? 'Ocultar Futuros' : 'Mostrar Futuros'}
              </button>
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
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);

                  const getDeadlineLocal = (deadline: string) => {
                    const parts = deadline.split('T')[0].split('-');
                    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    d.setHours(0, 0, 0, 0);
                    return d;
                  };

                  const isTodayOrder = (deadline?: string) => {
                    if (!deadline) return false;
                    const dl = getDeadlineLocal(deadline);
                    return dl.getTime() === today.getTime();
                  };

                  const isFutureOrder = (deadline?: string) => {
                    if (!deadline) return false;
                    const dl = getDeadlineLocal(deadline);
                    return dl > today;
                  };

                  const getDateKey = (dateStr: string) => {
                    const date = new Date(dateStr);
                    return date.toLocaleDateString('es-CL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long'
                    });
                  };

                  // Separate upcoming (today + future, toggle-controlled) and regular orders
                  const upcomingOrders: typeof displayOrders = [];
                  const regularOrders: typeof displayOrders = [];

                  displayOrders.forEach(order => {
                    if (isTodayOrder(order.deadline) || isFutureOrder(order.deadline)) {
                      upcomingOrders.push(order);
                    } else {
                      regularOrders.push(order);
                    }
                  });

                  // Group regular orders by deadline (if exists) or creation date
                  const regularGrouped: Record<string, typeof displayOrders> = {};
                  regularOrders.forEach(order => {
                    let dateKey: string;
                    if (order.deadline) {
                      const parts = order.deadline.split('T')[0].split('-');
                      const dl = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                      dateKey = dl.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
                    } else {
                      dateKey = getDateKey(order.createdAt || order.date);
                    }
                    if (!regularGrouped[dateKey]) regularGrouped[dateKey] = [];
                    regularGrouped[dateKey].push(order);
                  });

                  // Group upcoming orders by deadline, marking today vs future
                  // Each entry: { orders, isToday }
                  const upcomingGrouped: Record<string, { orders: typeof displayOrders; isToday: boolean }> = {};
                  upcomingOrders.forEach(order => {
                    const parts = order.deadline!.split('T')[0].split('-');
                    const deadlineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    const isToday = isTodayOrder(order.deadline);
                    const dateKey = isToday
                      ? 'Hoy · ' + deadlineDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
                      : 'Para el ' + deadlineDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
                    if (!upcomingGrouped[dateKey]) upcomingGrouped[dateKey] = { orders: [], isToday };
                    upcomingGrouped[dateKey].orders.push(order);
                  });

                  const renderOrderGroup = ([dateLabel, groupOrders]: [string, typeof displayOrders], groupIndex: number, isFutureGroup: boolean, isTodayGroup: boolean = false) => (
                    <div key={dateLabel} className="space-y-3 mb-6">
                      {/* Date Header */}
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + (groupIndex * 0.1) }}
                        className="flex items-center gap-2 pb-1 pt-2"
                      >
                        <div className={`h-px flex-1 ${isTodayGroup ? 'bg-gradient-to-r from-orange-300 to-transparent' : isFutureGroup ? 'bg-gradient-to-r from-purple-300 to-transparent' : 'bg-gradient-to-r from-blue-200 to-transparent'}`} />
                        <span
                          className={`text-sm font-medium capitalize px-2 py-1 rounded-full backdrop-blur-sm border ${isTodayGroup ? 'text-orange-800 bg-orange-50/80 border-orange-200 shadow-sm' : isFutureGroup ? 'text-purple-800 bg-purple-50/80 border-purple-200 shadow-sm' : 'text-blue-800 bg-blue-50/80 border-blue-100'}`}
                        >
                          {isTodayGroup && <Clock className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-orange-600" />}
                          {!isTodayGroup && isFutureGroup && <Clock className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-purple-600" />}
                          {dateLabel}
                        </span>
                        <div className={`h-px flex-1 ${isTodayGroup ? 'bg-gradient-to-l from-orange-300 to-transparent' : isFutureGroup ? 'bg-gradient-to-l from-purple-300 to-transparent' : 'bg-gradient-to-l from-blue-200 to-transparent'}`} />
                      </motion.div>

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
                            <Card
                              className={`cursor-pointer transition-all duration-300 border-2 group ${isTodayGroup ? 'hover:shadow-xl' : isFutureGroup ? 'hover:shadow-md border-dashed bg-slate-50 border-purple-200' : 'hover:shadow-xl'}`}
                              onClick={() => onViewOrder(order)}
                              style={{
                                borderRadius: '16px',
                                borderLeftWidth: order.status === 'pending' || order.status === 'in_progress' || order.status === 'completed' ? '4px' : '2px',
                                borderLeftColor: order.status === 'pending' ? '#F59E0B' :
                                  order.status === 'in_progress' ? '#0059FF' :
                                    order.status === 'completed' ? '#10B981' : undefined
                              }}
                            >
                              <CardHeader className="pb-3">
                                <div className="flex justify-between items-start gap-3">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <CardTitle
                                      className={`${isTodayGroup ? 'text-orange-900 group-hover:text-orange-700' : isFutureGroup ? 'text-purple-900 group-hover:text-purple-700' : 'text-[#0047BA] group-hover:text-[#0059FF]'} transition-colors truncate`}
                                      style={{ fontSize: '16px', fontWeight: 600 }}
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
                                <CardDescription className="flex items-center gap-3 text-xs mt-2 flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <Package className="w-3.5 h-3.5" />
                                    {order.quantity} unid.
                                  </span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {(() => {
                                      const createdAt = order.createdAt || order.date;
                                      const deadlineDay = order.deadline ? order.deadline.slice(0, 10) : null;
                                      const createdDay = createdAt ? new Date(createdAt).toISOString().split('T')[0] : null;
                                      // Only show time if order was created on the same day as deadline
                                      if (deadlineDay && createdDay && deadlineDay !== createdDay) {
                                        return 'Pedido anticipado';
                                      }
                                      return new Date(createdAt).toLocaleString('es-CL', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: false
                                      });
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
                              <CardContent className="pt-0">
                                <div
                                  className="w-full rounded-full h-2.5 overflow-hidden"
                                  style={{ background: 'rgba(0, 71, 186, 0.1)' }}
                                >
                                  <motion.div
                                    className="h-2.5 rounded-full"
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
                                <div className="flex items-center justify-between mt-2">
                                  <p className="text-xs text-gray-600" style={{ fontWeight: 500 }}>
                                    {order.progress}% completado
                                  </p>
                                  {order.progress === 100 && (
                                    <span className="text-xs text-green-600 flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Completado
                                    </span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                  );

                  // Render upcoming (today + future, toggle-controlled) first, then regular
                  let currentGroupIndex = 0;
                  const renderedGroups: React.ReactNode[] = [];

                  if (showFutureOrders) {
                    Object.entries(upcomingGrouped).forEach(([dateKey, { orders, isToday }]) => {
                      renderedGroups.push(renderOrderGroup([dateKey, orders], currentGroupIndex++, !isToday, isToday));
                    });
                  }

                  Object.entries(regularGrouped).forEach(entry => {
                    renderedGroups.push(renderOrderGroup(entry, currentGroupIndex++, false, false));
                  });

                  return renderedGroups;
                })()}
              </div>
            )}

            {/* Pagination Controls */}
            {pagination && onPageChange && (
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