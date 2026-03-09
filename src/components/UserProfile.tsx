import { User } from '../App';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import {
  ArrowLeft,
  User as UserIcon,
  Mail,
  Bell,
  Shield,
  LogOut,
  Package,
  MapPin,
  Edit,
  Check,
  X,
  BarChart3,
  Sparkles,
  Settings,
  Clock,
  Share2,
  Copy,
  Volume2,
  Monitor,
  Factory,
  Warehouse,
  ChefHat,
  Loader2
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { motion } from 'motion/react';

interface UserProfileProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
  onUpdateProfile?: (updates: Partial<User>) => void;
  onViewAnalytics?: () => void;
  onManageAttendance?: () => void;
  onManageProducts?: () => void;
  onManageProductionAreas?: () => void;
  onManageIngredients?: () => void;
  onManageProductIngredients?: () => void;
  accessToken?: string;
}

export function UserProfile({ user, onBack, onLogout, onUpdateProfile, onViewAnalytics, onManageAttendance, onManageProducts, onManageProductionAreas, onManageIngredients, onManageProductIngredients, accessToken }: UserProfileProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [soundNotifications, setSoundNotifications] = useState(() => {
    // Load from localStorage
    const saved = localStorage.getItem('soundNotifications');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [browserNotifications, setBrowserNotifications] = useState(() => {
    const saved = localStorage.getItem('browserNotifications');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressValue, setAddressValue] = useState(user.address || '');
  const [isSaving, setIsSaving] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [loadingInviteCode, setLoadingInviteCode] = useState(false);

  const handleSaveAddress = async () => {
    if (!onUpdateProfile) return;

    setIsSaving(true);
    try {
      await onUpdateProfile({ address: addressValue });
      setIsEditingAddress(false);
      toast.success('Dirección actualizada correctamente');
    } catch (error) {
      toast.error('Error al actualizar la dirección');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setAddressValue(user.address || '');
    setIsEditingAddress(false);
  };

  const handleSoundNotificationsChange = (checked: boolean) => {
    setSoundNotifications(checked);
    localStorage.setItem('soundNotifications', JSON.stringify(checked));
    toast.success(checked ? 'Notificaciones sonoras activadas' : 'Notificaciones sonoras desactivadas');
  };

  const handleBrowserNotificationsChange = async (checked: boolean) => {
    if (checked) {
      // Request permission
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setBrowserNotifications(true);
          localStorage.setItem('browserNotifications', JSON.stringify(true));
          toast.success('Notificaciones del navegador activadas');
        } else {
          toast.error('Permiso de notificaciones denegado');
        }
      } else {
        toast.error('Tu navegador no soporta notificaciones');
      }
    } else {
      setBrowserNotifications(false);
      localStorage.setItem('browserNotifications', JSON.stringify(false));
      toast.success('Notificaciones del navegador desactivadas');
    }
  };

  const handleGenerateInviteCode = async () => {
    if (!accessToken) {
      toast.error('No se pudo obtener el token de acceso');
      return;
    }

    setLoadingInviteCode(true);
    try {
      const { businessAPI } = await import('../utils/api');
      const businessData = await businessAPI.get(accessToken);

      if (businessData.inviteCode) {
        setInviteCode(businessData.inviteCode);
        setShowInviteCode(true);
        toast.success('Código de invitación obtenido');
      } else {
        toast.error('No se encontró código de invitación');
      }
    } catch (error: any) {
      console.error('Error getting invite code:', error);
      toast.error('Error al obtener el código de invitación');
    } finally {
      setLoadingInviteCode(false);
    }
  };

  const handleCopyInviteCode = async () => {
    try {
      // Try modern clipboard API first
      await navigator.clipboard.writeText(inviteCode);
      toast.success('Código copiado al portapapeles');
    } catch (err) {
      // Fallback for browsers that don't support clipboard API or have it blocked
      try {
        const textArea = document.createElement('textarea');
        textArea.value = inviteCode;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        textArea.remove();

        if (successful) {
          toast.success('Código copiado al portapapeles');
        } else {
          // Show the code in an alert as final fallback
          alert(`Tu código de invitación es: ${inviteCode}`);
          toast.info('Selecciona y copia el código manualmente');
        }
      } catch (fallbackErr) {
        // Last resort: show in alert
        alert(`Tu código de invitación es: ${inviteCode}`);
        toast.info('Copia el código manualmente');
      }
    }
  };

  const getRoleLabel = (role: string) => {
    const roleLabels: Record<string, string> = {
      admin: 'Administración',
      production: 'Producción',
      local: 'Local',
      pastry: 'Pastelería',
      user: 'Usuario'
    };
    return roleLabels[role] || 'Usuario';
  };

  const getRoleBadgeClass = (role: string) => {
    const roleClasses: Record<string, string> = {
      admin: 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-200',
      production: 'bg-gradient-to-r from-orange-50 to-amber-50 text-orange-700 border-orange-200',
      local: 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border-green-200',
      pastry: 'bg-gradient-to-r from-pink-50 to-fuchsia-50 text-pink-700 border-pink-200',
      user: 'bg-gradient-to-r from-gray-50 to-slate-50 text-gray-700 border-gray-200'
    };
    return roleClasses[role] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return '👑';
      case 'production': return '🏭';
      case 'local': return '🏪';
      default: return '👤';
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
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

      {/* Header */}
      <div
        className="relative z-10 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #0047BA 0%, #0078FF 100%)',
          borderBottom: '3px solid #FFD43B'
        }}
      >
        <div className="max-w-md mx-auto px-6 py-5">
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
                <Settings className="w-5 h-5" />
                Mi Perfil
              </h1>
              <p className="text-blue-100 text-xs">
                Administra tu cuenta
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 py-6 space-y-5 relative z-10">
        {/* User Info Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card
            className="border-2 shadow-lg"
            style={{ borderRadius: '16px', borderColor: '#E0EDFF' }}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className="w-20 h-20 rounded-full flex items-center justify-center relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #0059FF 0%, #0047BA 100%)',
                      boxShadow: '0 8px 24px rgba(0, 89, 255, 0.3)'
                    }}
                  >
                    <UserIcon className="w-10 h-10 text-white relative z-10" />
                    <div className="absolute inset-0 bg-white/10 animate-pulse" />
                  </div>
                  <div
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center text-lg"
                    style={{
                      background: 'linear-gradient(135deg, #FFD43B 0%, #FFC700 100%)',
                      border: '2px solid white',
                      boxShadow: '0 2px 8px rgba(255, 212, 59, 0.4)'
                    }}
                  >
                    {getRoleIcon(user.role)}
                  </div>
                </motion.div>
                <div className="flex-1">
                  <h2 className="text-[#0047BA]" style={{ fontSize: '20px', fontWeight: 600 }}>
                    {user.name}
                  </h2>
                  <p className="text-gray-600 text-sm mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    {user.email}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Email info */}
                <div
                  className="flex items-center gap-3 p-3.5 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #F0F7FF 0%, #E8F2FF 100%)' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0, 89, 255, 0.1)' }}
                  >
                    <Mail className="w-5 h-5 text-[#0059FF]" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600" style={{ fontWeight: 500 }}>Correo electrónico</p>
                    <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>{user.email}</p>
                  </div>
                </div>

                {/* Address editing */}
                <div
                  className="flex items-center gap-3 p-3.5 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #F0F7FF 0%, #E8F2FF 100%)' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(0, 89, 255, 0.1)' }}
                  >
                    <MapPin className="w-5 h-5 text-[#0059FF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 mb-1" style={{ fontWeight: 500 }}>
                      Dirección de Despacho
                    </p>
                    {isEditingAddress ? (
                      <Input
                        type="text"
                        value={addressValue}
                        onChange={(e) => setAddressValue(e.target.value)}
                        placeholder="Ingresa tu dirección completa"
                        className="h-9 bg-white border-[#CBD5E1] focus:border-[#2563EB] text-sm"
                        style={{ borderRadius: '8px' }}
                        disabled={isSaving}
                      />
                    ) : (
                      <p className={`text-sm ${!user.address ? 'text-gray-400' : 'text-gray-800'}`} style={{ fontWeight: 500 }}>
                        {user.address || 'Sin dirección registrada'}
                      </p>
                    )}
                  </div>
                  {isEditingAddress ? (
                    <div className="flex gap-1">
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-9 h-9 flex items-center justify-center rounded-full"
                        style={{ background: 'rgba(16, 185, 129, 0.1)' }}
                        onClick={handleSaveAddress}
                        disabled={isSaving}
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-9 h-9 flex items-center justify-center rounded-full"
                        style={{ background: 'rgba(239, 68, 68, 0.1)' }}
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-9 h-9 flex items-center justify-center rounded-full"
                      style={{ background: 'rgba(0, 89, 255, 0.1)' }}
                      onClick={() => setIsEditingAddress(true)}
                    >
                      <Edit className="w-4 h-4 text-[#0059FF]" />
                    </motion.button>
                  )}
                </div>

                {/* Role badge */}
                <div
                  className="flex items-center gap-3 p-3.5 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #F0F7FF 0%, #E8F2FF 100%)' }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0, 89, 255, 0.1)' }}
                  >
                    <Shield className="w-5 h-5 text-[#0059FF]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-600 mb-1.5" style={{ fontWeight: 500 }}>Rol del usuario</p>
                    <Badge
                      className={`${getRoleBadgeClass(user.role)} border px-3 py-1 flex items-center gap-2 w-fit`}
                      style={{ fontSize: '12px', fontWeight: 500 }}
                    >
                      <span>{getRoleIcon(user.role)}</span>
                      <span>{getRoleLabel(user.role)}</span>
                    </Badge>
                  </div>
                </div>

                {/* Production special access */}
                {user.role === 'production' && (
                  <motion.div
                    className="flex items-center gap-3 p-3.5 rounded-xl border-2"
                    style={{
                      background: 'linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)',
                      borderColor: '#FB923C'
                    }}
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(251, 146, 60, 0.2)' }}
                    >
                      <Package className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-orange-700" style={{ fontWeight: 600 }}>
                        Acceso especial
                      </p>
                      <p className="text-sm text-orange-800" style={{ fontWeight: 500 }}>
                        Panel de producción activado
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Notifications Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card
            className="border-2 shadow-lg"
            style={{ borderRadius: '16px', borderColor: '#E0EDFF' }}
          >
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0, 89, 255, 0.1)' }}
                >
                  <Bell className="w-5 h-5 text-[#0059FF]" />
                </div>
                <div>
                  <CardTitle className="text-[#0047BA]" style={{ fontSize: '16px', fontWeight: 600 }}>
                    Preferencias de Notificaciones
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Configura cómo deseas recibir actualizaciones
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <Label htmlFor="email-notifications" className="cursor-pointer flex-1">
                  <div>
                    <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>
                      Notificaciones por correo
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Recibe actualizaciones por email
                    </p>
                  </div>
                </Label>
                <Switch
                  id="email-notifications"
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <Label htmlFor="push-notifications" className="cursor-pointer flex-1">
                  <div>
                    <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>
                      Notificaciones push
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Alertas en tiempo real
                    </p>
                  </div>
                </Label>
                <Switch
                  id="push-notifications"
                  checked={pushNotifications}
                  onCheckedChange={setPushNotifications}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 transition-colors border border-blue-100">
                <Label htmlFor="sound-notifications" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>
                        Notificaciones sonoras
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Sonido al recibir pedidos nuevos
                      </p>
                    </div>
                  </div>
                </Label>
                <Switch
                  id="sound-notifications"
                  checked={soundNotifications}
                  onCheckedChange={handleSoundNotificationsChange}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-blue-50 transition-colors border border-blue-100">
                <Label htmlFor="browser-notifications" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>
                        Notificaciones del navegador
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Notificaciones incluso con la app minimizada
                      </p>
                    </div>
                  </div>
                </Label>
                <Switch
                  id="browser-notifications"
                  checked={browserNotifications}
                  onCheckedChange={handleBrowserNotificationsChange}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                <Label htmlFor="order-updates" className="cursor-pointer flex-1">
                  <div>
                    <p className="text-sm text-gray-800" style={{ fontWeight: 500 }}>
                      Actualizaciones de pedidos
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Cambios en el estado de tus pedidos
                    </p>
                  </div>
                </Label>
                <Switch
                  id="order-updates"
                  checked={orderUpdates}
                  onCheckedChange={setOrderUpdates}
                />
              </div>

              {/* Test Notification Button */}
              {(user.role === 'production' || user.role === 'admin') && (
                <div className="pt-2">
                  <Button
                    onClick={async () => {
                      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: purple; font-size: 14px; font-weight: bold');
                      console.log('%c🎵 PRUEBA DE SONIDO MANUAL', 'background: purple; color: white; font-size: 20px; font-weight: bold; padding: 10px');
                      console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: purple; font-size: 14px; font-weight: bold');

                      const { playNotificationSound, notifyNewOrder, initializeAudio } = await import('../utils/notificationSound');

                      // Initialize audio first
                      console.log('[TEST] Inicializando audio...');
                      await initializeAudio();

                      // Play sound and show notification
                      console.log('[TEST] Reproduciendo sonido...');
                      await playNotificationSound('new_order');

                      console.log('[TEST] Mostrando notificación del navegador...');
                      await notifyNewOrder('TEST-001', 'Cliente de Prueba');

                      toast.success('🔊 Notificación de prueba enviada - ¿Escuchaste el sonido?', {
                        duration: 5000
                      });
                    }}
                    variant="outline"
                    className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                  >
                    <Bell className="w-4 h-4 mr-2" />
                    🔊 Probar notificaciones AHORA
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Admin Invite Code Card */}
        {user.role === 'admin' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <Card
              className="border-2 shadow-lg"
              style={{ borderRadius: '16px', borderColor: '#E0EDFF' }}
            >
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(139, 92, 246, 0.1)' }}
                  >
                    <Share2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-[#0047BA]" style={{ fontSize: '16px', fontWeight: 600 }}>
                      Código de Invitación
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Comparte este código para agregar miembros
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!showInviteCode ? (
                  <Button
                    onClick={handleGenerateInviteCode}
                    disabled={loadingInviteCode}
                    className="w-full h-11"
                    style={{
                      background: 'linear-gradient(90deg, #8B5CF6 0%, #7C3AED 100%)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 600
                    }}
                  >
                    <div className="flex items-center gap-2 text-white">
                      <Share2 className="w-4 h-4" />
                      {loadingInviteCode ? 'Obteniendo...' : 'Mostrar Código de Invitación'}
                    </div>
                  </Button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div
                      className="p-4 rounded-xl border-2"
                      style={{
                        background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
                        borderColor: '#C4B5FD'
                      }}
                    >
                      <p className="text-xs text-purple-700 mb-2" style={{ fontWeight: 600 }}>
                        Tu código de invitación:
                      </p>
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 px-4 py-3 rounded-lg text-center"
                          style={{
                            background: 'white',
                            border: '2px dashed #8B5CF6'
                          }}
                        >
                          <p className="text-purple-700 tracking-widest" style={{ fontSize: '20px', fontWeight: 700 }}>
                            {inviteCode}
                          </p>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleCopyInviteCode}
                          className="w-11 h-11 flex items-center justify-center rounded-lg"
                          style={{ background: 'rgba(139, 92, 246, 0.1)' }}
                        >
                          <Copy className="w-5 h-5 text-purple-600" />
                        </motion.button>
                      </div>
                      <p className="text-xs text-purple-600 mt-3 text-center">
                        Los nuevos miembros pueden usar este código para unirse a tu negocio
                      </p>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Analytics button (Admin and Production) */}
        {(user.role === 'admin' || user.role === 'production') && onViewAnalytics && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            whileTap={{ scale: 0.98 }}
            className={user.role === 'production' ? '' : 'mb-4'}
          >
            <Button
              onClick={onViewAnalytics}
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
                <BarChart3 className="w-5 h-5" />
                Ver Panel de Analíticas
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-[#006DFF] to-[#0059FF] opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </motion.div>
        )}

        {/* Admin actions */}
        {user.role === 'admin' && (
          <>
            {/* Attendance Management button */}
            {onManageAttendance && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={onManageAttendance}
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
                    <Clock className="w-5 h-5" />
                    Gestión de Asistencia
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#059669] to-[#047857] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </motion.div>
            )}

            {/* Production Areas Management button */}
            {onManageProductionAreas && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={onManageProductionAreas}
                  className="w-full h-12 relative overflow-hidden group"
                  style={{
                    background: 'linear-gradient(90deg, #FB923C 0%, #F97316 100%)',
                    borderRadius: '12px',
                    fontSize: '15px',
                    fontWeight: 600,
                    boxShadow: '0 4px 14px rgba(251, 146, 60, 0.3)'
                  }}
                >
                  <div className="flex items-center gap-2 relative z-10 text-white">
                    <Factory className="w-5 h-5" />
                    Áreas de Producción
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#FB923C] to-[#F97316] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </motion.div>
            )}
          </>
        )}

        {/* Producción y Admin actions */}
        {(user.role === 'admin' || user.role === 'production') && (
          <>
            {/* Product Management button */}
            {onManageProducts && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={onManageProducts}
                  className="w-full h-12 relative overflow-hidden group"
                  style={{
                    background: 'linear-gradient(90deg, #FFD43B 0%, #FFC700 100%)',
                    borderRadius: '12px',
                    fontSize: '15px',
                    fontWeight: 600,
                    boxShadow: '0 4px 14px rgba(255, 212, 59, 0.3)',
                    color: '#0047BA'
                  }}
                >
                  <div className="flex items-center gap-2 relative z-10">
                    <Package className="w-5 h-5" />
                    Gestionar Productos
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#FFC700] to-[#FFB800] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </motion.div>
            )}

            {/* Ingredients Management button */}
            {onManageIngredients && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={onManageIngredients}
                  className="w-full h-12 relative overflow-hidden group"
                  style={{
                    background: 'linear-gradient(90deg, #8B5CF6 0%, #7C3AED 100%)',
                    borderRadius: '12px',
                    fontSize: '15px',
                    fontWeight: 600,
                    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)'
                  }}
                >
                  <div className="flex items-center gap-2 relative z-10 text-white">
                    <Warehouse className="w-5 h-5" />
                    Stock de Materia Prima
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </motion.div>
            )}

            {/* Product Ingredients Management button */}
            {onManageProductIngredients && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  onClick={onManageProductIngredients}
                  className="w-full h-12 relative overflow-hidden group"
                  style={{
                    background: 'linear-gradient(90deg, #EC4899 0%, #DB2777 100%)',
                    borderRadius: '12px',
                    fontSize: '15px',
                    fontWeight: 600,
                    boxShadow: '0 4px 14px rgba(236, 72, 153, 0.3)'
                  }}
                >
                  <div className="flex items-center gap-2 relative z-10 text-white">
                    <ChefHat className="w-5 h-5" />
                    Recetas e Ingredientes
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#DB2777] to-[#BE185D] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
              </motion.div>
            )}
          </>
        )}

        {/* Logout Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: user.role === 'admin' ? 0.4 : 0.2 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button
            onClick={async () => {
              setIsLoggingOut(true);
              await onLogout();
            }}
            disabled={isLoggingOut}
            variant="outline"
            className="w-full h-12 border-2 hover:bg-red-50 hover:border-red-300 transition-colors group"
            style={{
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 600,
              borderColor: '#E5E7EB'
            }}
          >
            <div className="flex items-center gap-2 text-gray-700 group-hover:text-red-600 transition-colors">
              {isLoggingOut
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <LogOut className="w-5 h-5" />
              }
              {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar Sesión'}
            </div>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}