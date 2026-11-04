import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  Check,
  Trash2,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { toast } from 'sonner';

import { Notification } from '../utils/api';

interface NotificationsPanelProps {
  notifications: Notification[];
  isOpen: boolean;
  onClose: () => void;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (notificationId: string) => void;
  onNotificationClick?: (notification: Notification) => void;
}

export function NotificationsPanel({
  notifications,
  isOpen,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onNotificationClick
}: NotificationsPanelProps) {
  // Ensure notifications is always an array
  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const unreadCount = safeNotifications.filter(n => !n.read).length;

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'order_created':
        return <Package className="w-5 h-5 text-blue-600" />;
      case 'order_updated':
        return <Clock className="w-5 h-5 text-amber-600" />;
      case 'order_completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'order_cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'info':
        return <AlertCircle className="w-5 h-5 text-blue-600" />;
      case 'attendance_check_in':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'attendance_check_out':
        return <Clock className="w-5 h-5 text-purple-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'order_created':
        return 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200';
      case 'order_updated':
        return 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200';
      case 'order_completed':
        return 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200';
      case 'order_cancelled':
        return 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200';
      case 'warning':
        return 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300';
      case 'error':
        return 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300';
      case 'info':
        return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200';
      case 'attendance_check_in':
        return 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200';
      case 'attendance_check_out':
        return 'bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200';
      default:
        return 'bg-white border-gray-200';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;

    return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (onNotificationClick) {
      onNotificationClick(notification);
    }
  };

  const handleDelete = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    onDelete(notificationId);
    toast.success('Notificación eliminada');
  };

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div
              className="px-6 pb-6"
              style={{
                background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
                borderBottom: '3px solid #FFD43B',
                // Este panel es `fixed top-0`, así que arranca pegado a la barra
                // de estado / notch: sin este inset el título quedaba tapado en
                // el contenedor nativo. En web el env() vale 0 y queda el 24px.
                paddingTop: 'max(env(safe-area-inset-top), 24px)'
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}
                  >
                    <Bell className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white" style={{ fontSize: '20px', fontWeight: 600 }}>
                      Notificaciones
                    </h2>
                    <p className="text-blue-100 text-xs">
                      Mantente al día con tus pedidos
                    </p>
                  </div>
                </div>
                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }}
                >
                  <X className="w-5 h-5 text-white" />
                </motion.button>
              </div>

              {unreadCount > 0 && (
                <div className="flex items-center justify-between">
                  <Badge
                    className="border px-3 py-1.5"
                    style={{
                      background: 'linear-gradient(90deg, #FFD43B 0%, #FFC700 100%)',
                      color: '#0047BA',
                      fontSize: '12px',
                      fontWeight: 600,
                      boxShadow: '0 2px 8px rgba(255, 212, 59, 0.3)'
                    }}
                  >
                    {unreadCount} nueva{unreadCount !== 1 ? 's' : ''}
                  </Badge>
                  <motion.button
                    onClick={onMarkAllAsRead}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="text-white hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
                    style={{ fontSize: '12px', fontWeight: 500 }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Marcar todas
                  </motion.button>
                </div>
              )}
            </div>

            {/* Notifications List */}
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-3">
                {safeNotifications.length === 0 ? (
                  <div className="text-center py-24">
                    <div
                      className="w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)' }}
                    >
                      <Bell className="w-10 h-10 text-blue-300" />
                    </div>
                    <p className="text-gray-600 mb-2" style={{ fontSize: '15px', fontWeight: 500 }}>
                      No hay notificaciones
                    </p>
                    <p className="text-sm text-gray-400">
                      Te avisaremos cuando haya novedades
                    </p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {safeNotifications.map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        onClick={() => handleNotificationClick(notification)}
                        className={`
                          p-4 rounded-xl border-l-4 cursor-pointer transition-all
                          ${getNotificationColor(notification.type)}
                          ${notification.read ? 'opacity-60' : 'shadow-md hover:shadow-lg'}
                          hover:scale-[1.02]
                        `}
                        style={{ borderRadius: '12px' }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                            style={{
                              background: notification.type === 'order_created' ? 'rgba(0, 89, 255, 0.1)' :
                                notification.type === 'order_updated' ? 'rgba(245, 158, 11, 0.1)' :
                                  notification.type === 'order_completed' ? 'rgba(16, 185, 129, 0.1)' :
                                    notification.type === 'order_cancelled' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(107, 114, 128, 0.1)'
                            }}
                          >
                            {getNotificationIcon(notification.type)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3
                                className={`text-sm ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}
                                style={{ fontWeight: notification.read ? 500 : 600 }}
                              >
                                {notification.title}
                              </h3>
                              {!notification.read && (
                                <div
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                                  style={{
                                    background: 'linear-gradient(135deg, #0059FF 0%, #0047BA 100%)',
                                    boxShadow: '0 0 8px rgba(0, 89, 255, 0.5)'
                                  }}
                                />
                              )}
                            </div>

                            <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">
                              {notification.message}
                            </p>

                            <div className="flex items-center justify-between mt-3">
                              <span
                                className="text-xs px-2 py-1 rounded-full"
                                style={{
                                  background: 'rgba(0, 71, 186, 0.1)',
                                  color: '#0047BA',
                                  fontWeight: 500
                                }}
                              >
                                {formatTime(notification.createdAt)}
                              </span>

                              <div className="flex items-center gap-1">
                                {notification.orderId && (
                                  <ChevronRight className="w-4 h-4 text-gray-400" />
                                )}
                                <motion.button
                                  onClick={(e) => handleDelete(e, notification.id)}
                                  whileHover={{ scale: 1.2 }}
                                  whileTap={{ scale: 0.9 }}
                                  className="p-1.5 hover:bg-red-100 rounded-full transition-colors group"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-600" />
                                </motion.button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            {safeNotifications.length > 0 && (
              <>
                <Separator />
                <div
                  className="p-4"
                  style={{ background: 'linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)' }}
                >
                  <p className="text-xs text-gray-600 text-center flex items-center justify-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#FFD43B]" />
                    {safeNotifications.length} notificación{safeNotifications.length !== 1 ? 'es' : ''} en total
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
