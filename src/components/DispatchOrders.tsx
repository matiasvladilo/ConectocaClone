import React, { useState } from 'react';
import { Order, OrderStatus } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import {
  ArrowLeft,
  Search,
  Filter,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  Printer,
  Eye,
  TrendingUp,
  ShoppingCart,
  Truck,
  Edit
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { motion, AnimatePresence } from 'motion/react';
import { formatCLP } from '../utils/format';
import { formatDateCL } from '../utils/dateUtils';
import { StandardDeliveryGuideContent } from './StandardDeliveryGuide';
import { EditOrderDialog } from './EditOrderDialog';
import { canEditOrder, isOrderEditableStatus } from '../utils/orderPermissions';

interface DispatchOrdersProps {
  orders: Order[];
  onBack: () => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, progress: number) => void;
  onViewOrder: (order: Order) => void;
  userName: string;
  userRole: string;
  lastSync?: Date | null;
  accessToken: string;
  onRefresh: () => void;
}

export function DispatchOrders({
  orders,
  onBack,
  onUpdateOrderStatus,
  onViewOrder,
  userName,
  userRole,
  lastSync,
  accessToken,
  onRefresh
}: DispatchOrdersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const canEdit = canEditOrder(userRole);

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'dispatched':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'delivered':
        return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'in_progress':
        return <TrendingUp className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'dispatched':
        return <Truck className="w-4 h-4" />;
      case 'delivered':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'in_progress':
        return 'En Preparación';
      case 'completed':
        return 'Listo';
      case 'dispatched':
        return 'Despachado';
      case 'delivered':
        return 'Recibido';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const handlePrintGuide = (order: Order) => {
    setSelectedOrderForPrint(order);
    // Trigger print after a small delay to ensure the component is rendered
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    const progressMap: Record<string, number> = {
      pending: 0,
      in_progress: 50,
      completed: 100,
      dispatched: 100, // Keep at 100 or visually restrict
      delivered: 100,
      cancelled: 100
    };
    onUpdateOrderStatus(orderId, newStatus, progressMap[newStatus] || 0);
  };

  // Filter orders
  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.productName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Sort orders: pending first, then by date
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    // Pending orders first
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;

    // In progress second
    if (a.status === 'in_progress' && b.status !== 'in_progress' && b.status !== 'pending') return -1;
    if (a.status !== 'in_progress' && b.status === 'in_progress' && a.status !== 'pending') return 1;

    // Then by date (newest first)
    return new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime();
  });

  // Stats
  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    inProgress: orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
    dispatched: orders.filter(o => o.status === 'dispatched').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-yellow-50 p-4 md:p-6 lg:p-8">
      {/* Hidden print component */}
      {selectedOrderForPrint && (
        <div className="hidden print:block">
          <StandardDeliveryGuideContent
            order={selectedOrderForPrint}
            onClose={() => setSelectedOrderForPrint(null)}
          />
        </div>
      )}

      <div className="max-w-7xl mx-auto print:hidden">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={onBack}
                className="shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl md:text-3xl text-gray-900">
                  📦 Pedidos de Locales
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Usuario de Despacho: {userName}
                </p>
                {lastSync && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Última actualización: {lastSync.toLocaleTimeString('es-CL')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
          <Card className="bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-gray-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-600 truncate">Total</p>
                  <p className="text-xl md:text-2xl text-gray-900">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-yellow-600 truncate">Pendientes</p>
                  <p className="text-xl md:text-2xl text-yellow-900">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-blue-600 truncate">En Preparación</p>
                  <p className="text-xl md:text-2xl text-blue-900">{stats.inProgress}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-green-600 truncate">Listos</p>
                  <p className="text-xl md:text-2xl text-green-900">{stats.completed}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-indigo-600 truncate">Despachados</p>
                  <p className="text-xl md:text-2xl text-indigo-900">{stats.dispatched}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar por ID, cliente, producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-gray-500 shrink-0" />
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as OrderStatus | 'ALL')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos los estados</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="in_progress">En Preparación</SelectItem>
                    <SelectItem value="completed">Listo</SelectItem>
                    <SelectItem value="dispatched">Despachado</SelectItem>
                    <SelectItem value="delivered">Recibido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders Grid */}
        {sortedOrders.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg text-gray-600 mb-2">
              {searchTerm || statusFilter !== 'ALL'
                ? 'No se encontraron pedidos con estos filtros'
                : 'No hay pedidos de locales'}
            </h3>
            <p className="text-sm text-gray-500">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Los pedidos de los locales aparecerán aquí'}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <AnimatePresence mode="popLayout">
              {(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const isFutureOrder = (deadline?: string) => {
                  if (!deadline) return false;
                  const parts = deadline.split('T')[0].split('-');
                  if (parts.length !== 3) return false;
                  const deadlineDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  deadlineDate.setHours(0, 0, 0, 0);
                  return deadlineDate > today;
                };

                const futureOrders: typeof sortedOrders = [];
                const regularOrders: typeof sortedOrders = [];

                sortedOrders.forEach(order => {
                  if (isFutureOrder(order.deadline)) {
                    futureOrders.push(order);
                  } else {
                    regularOrders.push(order);
                  }
                });

                const renderOrderCards = (ordersToRender: typeof sortedOrders, isFutureGroup: boolean) => {
                  return ordersToRender.map((order) => (
                    <motion.div
                      key={order.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card className={`hover:shadow-xl transition-shadow duration-300 border-2 ${isFutureGroup ? 'border-dashed bg-slate-50 border-purple-200 hover:shadow-md' : ''}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <CardTitle className={`text-lg truncate ${isFutureGroup ? 'text-purple-900' : ''}`}>
                                {order.customerName}
                              </CardTitle>
                              <p className="text-xs text-gray-500 mt-1">
                                Pedido #{order.id.substring(0, 8).toUpperCase()}
                              </p>
                            </div>
                            <Badge className={`${getStatusColor(order.status)} border shrink-0`}>
                              <span className="flex items-center gap-1.5">
                                {getStatusIcon(order.status)}
                                {getStatusLabel(order.status)}
                              </span>
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          {/* Products */}
                          <div className="space-y-2">
                            {order.products && order.products.length > 0 ? (
                              order.products.map((product, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm"
                                >
                                  <span className="text-gray-700 flex-1 truncate">{product.name}</span>
                                  <Badge variant="outline" className="text-xs ml-2 shrink-0">
                                    {product.quantity}x
                                  </Badge>
                                </div>
                              ))
                            ) : (
                              <div className="p-2 bg-gray-50 rounded-md text-sm">
                                <span className="text-gray-700">{order.productName}</span>
                              </div>
                            )}
                          </div>

                          {/* Total */}
                          {order.total && (
                            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                              <span className="text-sm text-blue-700">Total</span>
                              <span className="font-bold text-blue-900">
                                {formatCLP(order.total)}
                              </span>
                            </div>
                          )}

                          {/* Dates */}
                          <div className="flex gap-4 text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                            <div className="flex-1">
                              <p className="text-gray-500 flex items-center gap-1 mb-1">
                                <Clock className="w-3.5 h-3.5" />
                                Creación
                              </p>
                              <p className="font-medium text-gray-900 pl-4.5">
                                {new Date(order.createdAt || order.date).toLocaleString('es-CL', {
                                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                            </div>
                            <div className="w-px bg-gray-200" />
                            <div className="flex-1">
                              <p className="text-gray-500 flex items-center gap-1 mb-1">
                                <Package className="w-3.5 h-3.5" />
                                Entrega
                              </p>
                              <p className={`font-medium ${isFutureGroup ? 'text-purple-700' : 'text-gray-900'} pl-4.5`}>
                                {formatDateCL(order.deadline, { weekday: 'short', day: '2-digit', month: 'long' })}
                              </p>
                            </div>
                          </div>

                          {/* Notes */}
                          {order.notes && (
                            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                              <p className="text-xs text-gray-600 mb-1">Notas:</p>
                              <p className="text-sm text-gray-800 line-clamp-2">{order.notes}</p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-col gap-2 pt-2 border-t mt-4">
                            {/* Primary action buttons */}
                            <div className="flex gap-2">
                              {order.status === 'pending' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleStatusChange(order.id, 'in_progress')}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 shadow-sm"
                                >
                                  <TrendingUp className="w-4 h-4 mr-1.5" />
                                  Iniciar
                                </Button>
                              )}

                              {order.status === 'in_progress' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleStatusChange(order.id, 'completed')}
                                  className="flex-1 bg-green-600 hover:bg-green-700 shadow-sm"
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                  Listo
                                </Button>
                              )}

                              {order.status === 'completed' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleStatusChange(order.id, 'dispatched')}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                                >
                                  <Truck className="w-4 h-4 mr-1.5" />
                                  Despachar
                                </Button>
                              )}

                              {order.status === 'dispatched' && (
                                <div className="flex-1 text-center py-2 bg-indigo-50 border border-indigo-100 rounded-md">
                                  <p className="text-sm text-indigo-700 font-medium">
                                    🚚 Despachado
                                  </p>
                                </div>
                              )}

                              {order.status === 'delivered' && (
                                <div className="flex-1 text-center py-2 bg-teal-50 border border-teal-100 rounded-md">
                                  <p className="text-sm text-teal-700 font-medium">
                                    ✅ Recibido
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Secondary action buttons */}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onViewOrder(order)}
                                className="flex-1 bg-white hover:bg-gray-50"
                              >
                                <Eye className="w-4 h-4 mr-1.5" />
                                Detalle
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePrintGuide(order)}
                                className="flex-1 bg-white hover:bg-gray-50"
                              >
                                <Printer className="w-4 h-4 mr-1.5" />
                                Imprimir
                              </Button>
                            </div>

                            {/* Edit Button */}
                            {canEdit && isOrderEditableStatus(order.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingOrder(order)}
                                className="bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 border-amber-200 mt-1"
                              >
                                <Edit className="w-4 h-4 mr-1.5" />
                                Editar Pedido
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ));
                };

                return (
                  <>
                    {futureOrders.length > 0 && (
                      <>
                        <div className="col-span-1 md:col-span-2 lg:col-span-3 flex items-center gap-2 pb-2 pt-2">
                          <div className={`h-px flex-1 bg-gradient-to-r from-purple-300 to-transparent`} />
                          <span className={`text-sm font-medium px-4 py-1.5 rounded-full backdrop-blur-sm border text-purple-800 bg-purple-50/80 border-purple-200 shadow-sm`}>
                            <Clock className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                            Programados (Futuro)
                          </span>
                          <div className={`h-px flex-1 bg-gradient-to-l from-purple-300 to-transparent`} />
                        </div>
                        {renderOrderCards(futureOrders, true)}
                      </>
                    )}

                    {!searchTerm && statusFilter === 'ALL' && futureOrders.length > 0 && regularOrders.length > 0 && (
                      <div className="col-span-1 md:col-span-2 lg:col-span-3 flex items-center gap-2 pb-2 pt-6">
                        <div className={`h-px flex-1 bg-gradient-to-r from-blue-300 to-transparent`} />
                        <span className={`text-sm font-medium px-4 py-1.5 rounded-full backdrop-blur-sm border text-blue-800 bg-blue-50/80 border-blue-200 shadow-sm`}>
                          <Package className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                          De Hoy / Atrasados
                        </span>
                        <div className={`h-px flex-1 bg-gradient-to-l from-blue-300 to-transparent`} />
                      </div>
                    )}

                    {renderOrderCards(regularOrders, false)}
                  </>
                );
              })()}
            </AnimatePresence>
          </div>
        )}

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
    </div>
  );
}
