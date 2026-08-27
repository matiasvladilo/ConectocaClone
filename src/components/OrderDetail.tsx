import { Order } from '../App';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatCLP } from '../utils/format';
import { DeliveryGuide } from './DeliveryGuide';
import {
  ArrowLeft,
  Package,
  Calendar,
  Hash,
  User,
  Clock,
  CheckCircle2,
  Truck,
  ShoppingCart,
  DollarSign,
  ChevronDown,
  FileText,
  Trash2,
  MessageSquare,
  Printer,
  X,
  Edit
} from 'lucide-react';
import { motion } from 'motion/react';
import { EditOrderDialog } from './EditOrderDialog';
import { canEditOrder } from '../utils/orderPermissions';

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
  const [isOpen, setIsOpen] = useState(false);
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

  return (
    <div
      className="min-h-screen max-h-screen overflow-y-auto relative"
      style={{ background: 'linear-gradient(135deg, #EAF2FF 0%, #CFE0FF 100%)' }}
    >
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>

      {/* Header - Sticky */}
      <div
        className="sticky top-0 z-20 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          borderBottom: '3px solid #FFD43B',
          paddingTop: 'max(env(safe-area-inset-top), 20px)'
        }}
      >
        <div className="max-w-md mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <motion.button
              onClick={onBack}
              whileHover={{ scale: 1.1, x: -4 }}
              whileTap={{ scale: 0.95 }}
              className="w-11 h-11 flex items-center justify-center rounded-full"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div>
              <h1 className="text-white tracking-wide flex items-center gap-2" style={{ fontSize: '18px', fontWeight: 600 }}>
                <FileText className="w-5 h-5" />
                Detalle del Pedido
              </h1>
              <p className="text-blue-100 text-xs">
                Seguimiento completo
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 py-4 space-y-4 relative z-10 pb-6">
        {/* Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card
            className="border-2 shadow-lg overflow-hidden"
            style={{
              borderRadius: '16px',
              borderLeftWidth: '6px',
              borderLeftColor: order.status === 'pending' ? '#F59E0B' :
                order.status === 'in_progress' ? '#0059FF' :
                  order.status === 'completed' ? '#10B981' :
                    order.status === 'dispatched' ? '#6366F1' :
                      order.status === 'delivered' ? '#14B8A6' : '#6B7280',
              borderTopColor: '#E0EDFF',
              borderRightColor: '#E0EDFF',
              borderBottomColor: '#E0EDFF'
            }}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h2 className="text-[#0047BA]" style={{ fontSize: '20px', fontWeight: 600 }}>
                    {order.productName}
                  </h2>
                  <p className="text-gray-600 text-sm mt-1">{config.description}</p>
                </div>
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: order.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' :
                      order.status === 'in_progress' ? 'rgba(0, 89, 255, 0.1)' :
                        order.status === 'completed' ? 'rgba(16, 185, 129, 0.1)' :
                          order.status === 'dispatched' ? 'rgba(99, 102, 241, 0.1)' :
                            order.status === 'delivered' ? 'rgba(20, 184, 166, 0.1)' : 'rgba(107, 114, 128, 0.1)'
                  }}
                >
                  <StatusIcon
                    className="w-6 h-6"
                    style={{
                      color: order.status === 'pending' ? '#F59E0B' :
                        order.status === 'in_progress' ? '#0059FF' :
                          order.status === 'completed' ? '#10B981' :
                            order.status === 'dispatched' ? '#6366F1' :
                              order.status === 'delivered' ? '#14B8A6' : '#6B7280'
                    }}
                  />
                </div>
              </div>
              <Badge className={`${config.bgColor} ${config.color} border px-3 py-1.5 flex items-center gap-2 w-fit`} style={{ fontSize: '13px', fontWeight: 500 }}>
                <StatusIcon className="w-4 h-4" />
                {config.label}
              </Badge>
            </CardContent>
          </Card>
        </motion.div>

        {/* Progress Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card
            className="border-2 shadow-lg"
            style={{ borderRadius: '16px', borderColor: '#E0EDFF' }}
          >
            <CardContent className="p-6">
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-gray-700" style={{ fontWeight: 500 }}>Progreso del pedido</span>
                  <span className="text-[#0059FF]" style={{ fontSize: '16px', fontWeight: 600 }}>{order.progress}%</span>
                </div>
                <div
                  className="w-full rounded-full h-3 overflow-hidden"
                  style={{ background: 'rgba(0, 71, 186, 0.1)' }}
                >
                  <motion.div
                    className="h-3 rounded-full"
                    style={{
                      background: order.status === 'delivered'
                        ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)' // Green for delivered
                        : order.status === 'dispatched'
                          ? 'linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)' // Indigo for dispatched
                          : order.status === 'in_progress'
                            ? 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)' // Blue for progress
                            : 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)', // Amber for pending
                      width: `${order.progress}%`
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${order.progress}%` }}
                    transition={{ duration: 1, delay: 0.3 }}
                  />
                </div>
              </div>

              {/* Status Steps */}
              <div className="space-y-4">
                {statusSteps.map((step, index) => {
                  const isCompleted = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;

                  return (
                    <motion.div
                      key={step.key}
                      className="flex items-center gap-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + (index * 0.1) }}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300`}
                        style={{
                          background: isCompleted
                            ? 'linear-gradient(135deg, #0059FF 0%, #0047BA 100%)'
                            : 'rgba(229, 231, 235, 1)',
                          boxShadow: isCompleted ? '0 4px 12px rgba(0, 89, 255, 0.3)' : 'none'
                        }}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-white" />
                        ) : (
                          <div className="w-3 h-3 bg-gray-400 rounded-full" />
                        )}
                      </div>
                      <span
                        className={`text-sm transition-colors`}
                        style={{
                          color: isCurrent ? '#0047BA' : isCompleted ? '#374151' : '#9CA3AF',
                          fontWeight: isCurrent ? 600 : 500
                        }}
                      >
                        {step.label}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Order Details - Collapsible */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card
              className="overflow-hidden border-2 shadow-lg"
              style={{ borderRadius: '16px', borderColor: '#E0EDFF' }}
            >
              <CollapsibleTrigger asChild>
                <motion.div
                  className="p-6 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 transition-all"
                  whileHover={{ backgroundColor: 'rgba(239, 246, 255, 0.5)' }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-[#0047BA] flex items-center gap-2" style={{ fontSize: '16px', fontWeight: 600 }}>
                      <ShoppingCart className="w-5 h-5" />
                      Información del Pedido
                    </h3>
                    <motion.div
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0, 89, 255, 0.1)' }}
                    >
                      <ChevronDown className="w-5 h-5 text-[#0059FF]" />
                    </motion.div>
                  </div>

                  {/* Preview when collapsed */}
                  {!isOpen && (
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div
                        className="p-3 rounded-xl"
                        style={{ background: 'linear-gradient(135deg, #F0F7FF 0%, #E8F2FF 100%)' }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Hash className="w-3.5 h-3.5 text-[#0059FF]" />
                          <p className="text-xs text-gray-600" style={{ fontWeight: 500 }}>ID del Pedido</p>
                        </div>
                        <p className="text-xs text-gray-800 font-mono" style={{ fontWeight: 500 }}>
                          {order.id.slice(0, 8).toUpperCase()}
                        </p>
                      </div>

                      <div
                        className="p-3 rounded-xl"
                        style={{ background: 'linear-gradient(135deg, #F0F7FF 0%, #E8F2FF 100%)' }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <User className="w-3.5 h-3.5 text-[#0059FF]" />
                          <p className="text-xs text-gray-600" style={{ fontWeight: 500 }}>Cliente</p>
                        </div>
                        <p className="text-xs text-gray-800 truncate" style={{ fontWeight: 500 }}>
                          {order.customerName}
                        </p>
                      </div>

                      <div
                        className="p-3 rounded-xl col-span-2"
                        style={{ background: 'linear-gradient(135deg, #F0F7FF 0%, #E8F2FF 100%)' }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-3.5 h-3.5 text-[#0059FF]" />
                          <p className="text-xs text-gray-600" style={{ fontWeight: 500 }}>Fecha de Pedido</p>
                        </div>
                        <p className="text-xs text-gray-800" style={{ fontWeight: 500 }}>
                          {new Date(order.createdAt || order.date).toLocaleString('es-CL', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>

                      <div
                        className="p-4 rounded-xl col-span-2 border-2"
                        style={{
                          background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                          borderColor: '#0059FF'
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-[#0059FF]" />
                            <span className="text-sm text-[#0047BA]" style={{ fontWeight: 600 }}>Total</span>
                          </div>
                          <span className="text-[#0047BA]" style={{ fontSize: '18px', fontWeight: 600 }}>
                            {formatCLP(order.total || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 pb-6 px-6">
                  <Separator className="mb-5" />

                  {/* Products Detail */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-gray-700" style={{ fontWeight: 600 }}>
                        {order.products && order.products.length > 0
                          ? `${order.products.length} ${order.products.length === 1 ? 'producto' : 'productos'}`
                          : '1 producto'}
                      </span>
                    </div>

                    {order.products && order.products.length > 0 ? (
                      <div className="space-y-3">
                        {order.products.map((product, index) => (
                          <motion.div
                            key={index}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                          >
                            {/* Product Image */}
                            <div
                              className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center"
                              style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' }}
                            >
                              <Package className="w-7 h-7 text-[#0059FF]" />
                            </div>

                            {/* Product Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900" style={{ fontWeight: 500 }}>
                                {product.quantity}x {product.name}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                ${product.price.toLocaleString('es-CL', { minimumFractionDigits: 2 })} c/u
                              </p>
                            </div>

                            {/* Price */}
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm text-[#0047BA]" style={{ fontWeight: 600 }}>
                                ${(product.price * product.quantity).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            </div>
                          </motion.div>
                        ))}

                        <Separator className="my-4" />

                        {/* Total */}
                        <div
                          className="flex items-center justify-between p-4 rounded-xl border-2"
                          style={{
                            background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                            borderColor: '#0059FF'
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-[#0059FF]" />
                            <span className="text-[#0047BA]" style={{ fontWeight: 600 }}>Total del Pedido</span>
                          </div>
                          <span className="text-[#0047BA]" style={{ fontSize: '20px', fontWeight: 600 }}>
                            ${order.total ? order.total.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)' }}>
                          <div className="w-14 h-14 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center">
                            <Package className="w-7 h-7 text-gray-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-900" style={{ fontWeight: 500 }}>
                              {order.quantity}x {order.productName}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 text-center mt-3">
                          Pedido creado antes de la actualización del sistema
                        </p>
                      </div>
                    )}

                    {/* Notes Section */}
                    {order.notes && order.notes.trim() && (
                      <>
                        <Separator className="my-5" />
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-[#0059FF]" />
                            <span className="text-sm text-gray-700" style={{ fontWeight: 600 }}>
                              Observaciones
                            </span>
                          </div>
                          <div
                            className="p-4 rounded-xl border-2"
                            style={{
                              background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                              borderColor: '#FCD34D'
                            }}
                          >
                            <p className="text-sm text-gray-800" style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                              {order.notes}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          {/* Admin Status Management - Allow manually changing status */}
          {['admin', 'production', 'dispatch'].includes(userRole || '') && onStatusChange && (
            <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm mb-3">
              <p className="text-sm font-medium text-gray-700 mb-2">Gestión de Estado (Admin)</p>
              <div className="flex gap-2">
                <select
                  className="flex-1 h-10 rounded-md border border-gray-300 px-3 py-1 text-sm bg-white text-black"
                  value={order.status}
                  onChange={async (e) => {
                    const newStatus = e.target.value as any;
                    const confirmChange = window.confirm(`¿Cambiar estado a "${newStatus}"?`);
                    if (!confirmChange) return;

                    setIsUpdating(true);
                    try {
                      // Determines progress based on status
                      let progress = 0;
                      if (newStatus === 'in_progress') progress = 25;
                      if (newStatus === 'completed') progress = 50;
                      if (newStatus === 'dispatched') progress = 75;
                      if (newStatus === 'delivered') progress = 100;
                      if (newStatus === 'cancelled') progress = 0;

                      await onStatusChange(order.id, newStatus, progress);
                      toast.success(`Estado actualizado a ${newStatus}`);
                    } catch (error) {
                      console.error('Error changing status:', error);
                      toast.error('Error al actualizar');
                    } finally {
                      setIsUpdating(false);
                    }
                  }}
                  disabled={isUpdating}
                >
                  <option value="pending">Pendiente</option>
                  <option value="in_progress">En Preparación</option>
                  <option value="completed">Listo</option>
                  <option value="dispatched">Despachado</option>
                  <option value="delivered">Recibido/Entregado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>
          )}
          {/* Print Delivery Guide Button - Only for completed or delivered orders */}
          {/* Edit Order Button */}
          {canEdit && ['pending', 'in_progress', 'completed'].includes(order.status) && (
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => setEditingOrder(order)}
                className="w-full h-12 relative overflow-hidden group mb-3"
                style={{
                  background: 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
                }}
              >
                <div className="flex items-center gap-2 relative z-10 text-white">
                  <Edit className="w-4 h-4" />
                  Editar Pedido
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-[#D97706] to-[#B45309] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* Print Delivery Guide Button - For completed/dispatched orders. Visible to production/dispatch/admin */}
          {['completed', 'dispatched', 'delivered'].includes(order.status) && ['production', 'dispatch', 'admin'].includes(userRole || '') && (
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => setShowDeliveryGuide(true)}
                className="w-full h-12 relative overflow-hidden group"
                style={{
                  background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
              >
                <div className="flex items-center gap-2 relative z-10 text-white">
                  <Printer className="w-4 h-4" />
                  Imprimir Guía de Despacho
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-[#059669] to-[#047857] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          {/* Recibido Button - Only for DISPATCHED orders and LOCAL users */}
          {order.status === 'dispatched' && userRole === 'local' && onStatusChange && (
            <motion.div whileTap={{ scale: 0.98 }}>
              <Button
                onClick={async () => {
                  setIsUpdating(true);
                  try {
                    // Change status to delivered (entregado)
                    await onStatusChange(order.id, 'delivered', 100);
                    toast.success('Pedido marcado como recibido');
                    onBack();
                  } catch (error) {
                    console.error('Error updating status:', error);
                    toast.error('Error al actualizar estado');
                  } finally {
                    setIsUpdating(false);
                  }
                }}
                disabled={isUpdating}
                className="w-full h-12 relative overflow-hidden group"
                style={{
                  background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  boxShadow: '0 4px 14px rgba(0, 89, 255, 0.3)'
                }}
              >
                <div className="flex items-center gap-2 relative z-10 text-white">
                  <CheckCircle2 className="w-4 h-4" />
                  {isUpdating ? 'Actualizando...' : 'Recibido'}
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-[#006DFF] to-[#0059FF] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </motion.div>
          )}

          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              onClick={onBack}
              className="w-full h-12 relative overflow-hidden group"
              style={{
                background: 'linear-gradient(90deg, #0059FF 0%, #004BCE 100%)',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(0, 89, 255, 0.3)'
              }}
            >
              <div className="flex items-center gap-2 relative z-10 text-white">
                <ArrowLeft className="w-4 h-4" />
                Volver al Listado
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-[#006DFF] to-[#0059FF] opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </motion.div>

          {/* Delete Button */}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <motion.div whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outline"
                    className="w-full h-12 border-2 border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700"
                    style={{
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: 600
                    }}
                    disabled={isDeleting}
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      {isDeleting ? 'Eliminando...' : 'Eliminar Pedido'}
                    </div>
                  </Button>
                </motion.div>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. El pedido será eliminado permanentemente y el stock de los productos será restaurado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </motion.div>
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
