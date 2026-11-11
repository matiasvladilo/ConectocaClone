import { User } from '../App';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import {
  Mail,
  Bell,
  LogOut,
  Package,
  MapPin,
  BarChart3,
  Clock,
  Share2,
  Copy,
  Volume2,
  Monitor,
  Factory,
  Warehouse,
  ChefHat,
  Loader2,
  Boxes,
  MessageSquare,
  ChevronRight,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import { version as versionApp } from '../../package.json';
import { estiloBarraDeEstado } from '../utils/initNative';

/**
 * Panel "Mi cuenta": se abre desde el botón ☰ del inicio y se desliza desde la
 * derecha, igual que el de notificaciones. Estilo Ajustes de iOS: listas
 * agrupadas sobre fondo gris, íconos en cuadraditos de color y chevrons.
 *
 * Se cierra con la ✕, tocando el fondo oscurecido, deslizando a la derecha o
 * con Escape. Tocar un acceso cierra el panel y navega a esa sección; al volver
 * de la sección, App reabre el panel (ver `volverAlPerfil`).
 *
 * Nota: Tailwind está precompilado (src/index.css), así que casi todo el estilo
 * nuevo va inline para no depender de clases que podrían no existir.
 */

interface UserProfileProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onUpdateProfile?: (updates: Partial<User>) => void;
  onViewAnalytics?: () => void;
  onViewDispatch?: () => void;
  onViewDistribution?: () => void;
  onViewComplaints?: () => void;
  pendingComplaintsCount?: number;
  onManageAttendance?: () => void;
  onManageProducts?: () => void;
  onManageProductionAreas?: () => void;
  onManageIngredients?: () => void;
  onManageProductIngredients?: () => void;
  accessToken?: string;
}

// Paleta de iOS (colores de sistema), para que los íconos se lean "Apple".
const IOS = {
  fondo: '#F2F2F7',
  texto: '#1C1C1E',
  secundario: '#8E8E93',
  separador: '#E5E5EA',
  chevron: '#C7C7CC',
  azul: '#007AFF',
  rojo: '#FF3B30',
  verde: '#34C759',
  naranja: '#FF9500',
  morado: '#AF52DE',
  indigo: '#5856D6',
  rosa: '#FF2D55',
  amarillo: '#FFCC00',
  turquesa: '#30B0C7',
};

function Grupo({ titulo, pie, children }: { titulo?: string; pie?: string; children: ReactNode }) {
  return (
    <section style={{ margin: '0 16px 24px' }}>
      {titulo && (
        <h3
          style={{
            fontSize: 13,
            color: IOS.secundario,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            padding: '0 16px 6px',
            fontWeight: 400,
          }}
        >
          {titulo}
        </h3>
      )}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>{children}</div>
      {pie && (
        <p style={{ fontSize: 13, color: IOS.secundario, padding: '6px 16px 0', lineHeight: 1.35 }}>{pie}</p>
      )}
    </section>
  );
}

function Separador() {
  return <div style={{ height: 1, background: IOS.separador, marginLeft: 58 }} />;
}

function IconoCuadrado({ icono: Icono, color }: { icono: LucideIcon; color: string }) {
  return (
    <span
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Icono style={{ width: 17, height: 17, color: '#fff' }} />
    </span>
  );
}

interface FilaProps {
  icono: LucideIcon;
  color: string;
  label: string;
  detalle?: ReactNode;
  badge?: number;
  onClick?: () => void;
  chevron?: boolean;
  derecha?: ReactNode;
}

function Fila({ icono, color, label, detalle, badge, onClick, chevron = true, derecha }: FilaProps) {
  const contenido = (
    <>
      <IconoCuadrado icono={icono} color={color} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 16, color: IOS.texto }}>{label}</span>
      {detalle !== undefined && (
        <span
          style={{
            fontSize: 15,
            color: IOS.secundario,
            maxWidth: '50%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {detalle}
        </span>
      )}
      {typeof badge === 'number' && badge > 0 && (
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: '0 7px',
            borderRadius: 11,
            background: IOS.rojo,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {badge}
        </span>
      )}
      {derecha}
      {chevron && onClick && <ChevronRight style={{ width: 18, height: 18, color: IOS.chevron, flexShrink: 0 }} />}
    </>
  );

  const estilo: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minHeight: 48,
    padding: '9px 16px 9px 14px',
    textAlign: 'left',
  };

  // Sin onClick es una fila informativa (fondo blanco fijo); con onClick el
  // fondo lo pone la clase .fila-ios para que :active pueda resaltarla.
  if (!onClick) return <div style={{ ...estilo, background: '#fff' }}>{contenido}</div>;
  return (
    <button type="button" onClick={onClick} className="fila-ios" style={estilo}>
      {contenido}
    </button>
  );
}

export function UserProfile({ user, isOpen, onClose, onLogout, onUpdateProfile, onViewAnalytics, onViewDispatch, onViewDistribution, onViewComplaints, pendingComplaintsCount, onManageAttendance, onManageProducts, onManageProductionAreas, onManageIngredients, onManageProductIngredients, accessToken }: UserProfileProps) {
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
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressValue, setAddressValue] = useState(user.address || '');
  const [isSaving, setIsSaving] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [loadingInviteCode, setLoadingInviteCode] = useState(false);

  // Escape cierra el panel (teclado físico / web de escritorio).
  useEffect(() => {
    if (!isOpen) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [isOpen, onClose]);

  // El panel es claro: la hora/batería pasan a texto oscuro mientras está
  // abierto y vuelven a blanco (sobre el azul de la app) al cerrarse.
  useEffect(() => {
    void estiloBarraDeEstado(isOpen ? 'oscuro' : 'claro');
  }, [isOpen]);

  // Al cerrar, descartar una edición de dirección a medio hacer.
  useEffect(() => {
    if (!isOpen) {
      setIsEditingAddress(false);
      setAddressValue(user.address || '');
    }
  }, [isOpen, user.address]);

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

  const handleTestNotification = async () => {
    const { playNotificationSound, notifyNewOrder, initializeAudio } = await import('../utils/notificationSound');
    await initializeAudio();
    await playNotificationSound('new_order');
    await notifyNewOrder('TEST-001', 'Cliente de Prueba');
    toast.success('Notificación de prueba enviada — ¿escuchaste el sonido?', { duration: 5000 });
  };

  const getRoleLabel = (role: string) => {
    const roleLabels: Record<string, string> = {
      admin: 'Administración',
      production: 'Producción',
      dispatch: 'Despacho',
      local: 'Local',
      pastry: 'Pastelería',
      user: 'Usuario'
    };
    return roleLabels[role] || 'Usuario';
  };

  const iniciales = (user.name || user.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  // Accesos a secciones. Permisos por rol idénticos a la versión anterior.
  const esAdmin = user.role === 'admin';
  const esAdminOProduccion = esAdmin || user.role === 'production';
  const accesos = [
    esAdmin && onViewDispatch && { label: 'Despacho', icon: Truck, color: IOS.azul, onClick: onViewDispatch },
    esAdminOProduccion && onViewAnalytics && { label: 'Analíticas', icon: BarChart3, color: IOS.indigo, onClick: onViewAnalytics },
    esAdminOProduccion && onViewDistribution && { label: 'Distribuidora', icon: Boxes, color: IOS.turquesa, onClick: onViewDistribution },
    esAdmin && onViewComplaints && { label: 'Reclamos', icon: MessageSquare, color: IOS.rojo, onClick: onViewComplaints, badge: pendingComplaintsCount },
    esAdmin && onManageAttendance && { label: 'Asistencia', icon: Clock, color: IOS.verde, onClick: onManageAttendance },
  ].filter(Boolean) as { label: string; icon: LucideIcon; color: string; onClick: () => void; badge?: number }[];

  const accesosProduccion = [
    esAdmin && onManageProductionAreas && { label: 'Áreas de producción', icon: Factory, color: IOS.naranja, onClick: onManageProductionAreas },
    esAdminOProduccion && onManageProducts && { label: 'Productos', icon: Package, color: IOS.amarillo, onClick: onManageProducts },
    esAdminOProduccion && onManageIngredients && { label: 'Materia prima', icon: Warehouse, color: IOS.morado, onClick: onManageIngredients },
    esAdminOProduccion && onManageProductIngredients && { label: 'Recetas', icon: ChefHat, color: IOS.rosa, onClick: onManageProductIngredients },
  ].filter(Boolean) as { label: string; icon: LucideIcon; color: string; onClick: () => void }[];

  // Tocar un acceso cierra el panel y navega; App lo reabre al volver.
  const ir = (accion: () => void) => () => {
    onClose();
    accion();
  };

  const alSoltar = (_e: unknown, info: PanInfo) => {
    if (info.offset.x > 100 || info.velocity.x > 500) onClose();
  };

  const filaInterruptor = (id: string, label: string, checked: boolean, onChange: (v: boolean) => void, icono: LucideIcon, color: string) => (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '9px 16px 9px 14px', cursor: 'pointer' }}>
      <IconoCuadrado icono={icono} color={color} />
      <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  );

  return (
    <>
      {/* Fondo oscurecido */}
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
            role="dialog"
            aria-modal="true"
            aria-label="Mi cuenta"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag={isEditingAddress ? false : 'x'}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.6 }}
            onDragEnd={alSoltar}
            className="fixed top-0 right-0 h-full shadow-2xl z-50 flex flex-col"
            style={{ width: 'min(100%, 420px)', background: IOS.fondo, touchAction: 'pan-y' }}
          >
            {/* Encabezado */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px 12px 20px',
                paddingTop: 'max(env(safe-area-inset-top), 20px)',
              }}
            >
              <h2 style={{ fontSize: 30, fontWeight: 700, color: IOS.texto, letterSpacing: '-0.01em' }}>Mi cuenta</h2>
              <motion.button
                type="button"
                onClick={onClose}
                whileTap={{ scale: 0.9 }}
                aria-label="Cerrar"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: '#E3E3E8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X style={{ width: 17, height: 17, color: '#3C3C43' }} />
              </motion.button>
            </div>

            {/* Contenido desplazable */}
            <div className="flex-1 overflow-y-auto" style={{ paddingTop: 8, paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
              {/* Tarjeta de cuenta */}
              <Grupo>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <span
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 30,
                      background: 'linear-gradient(135deg, #0A84FF 0%, #0047BA 100%)',
                      color: '#fff',
                      fontSize: 22,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {iniciales}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 20, fontWeight: 600, color: IOS.texto, lineHeight: 1.2 }}>{user.name}</p>
                    <p
                      style={{
                        fontSize: 14,
                        color: IOS.secundario,
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.email}
                    </p>
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#0047BA',
                        background: '#E5EEFF',
                        borderRadius: 999,
                        padding: '2px 9px',
                      }}
                    >
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                </div>
              </Grupo>

              {/* Accesos */}
              {accesos.length > 0 && (
                <Grupo titulo="Gestión">
                  {accesos.map((a, i) => (
                    <div key={a.label}>
                      {i > 0 && <Separador />}
                      <Fila icono={a.icon} color={a.color} label={a.label} badge={a.badge} onClick={ir(a.onClick)} />
                    </div>
                  ))}
                </Grupo>
              )}

              {accesosProduccion.length > 0 && (
                <Grupo titulo="Producción">
                  {accesosProduccion.map((a, i) => (
                    <div key={a.label}>
                      {i > 0 && <Separador />}
                      <Fila icono={a.icon} color={a.color} label={a.label} onClick={ir(a.onClick)} />
                    </div>
                  ))}
                </Grupo>
              )}

              {/* Cuenta */}
              <Grupo titulo="Cuenta">
                <Fila icono={Mail} color={IOS.azul} label="Correo" detalle={user.email} chevron={false} />
                <Separador />
                {isEditingAddress ? (
                  <div style={{ padding: '10px 16px 12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                      <IconoCuadrado icono={MapPin} color={IOS.verde} />
                      <span style={{ fontSize: 16, color: IOS.texto }}>Dirección de despacho</span>
                    </div>
                    <Input
                      type="text"
                      value={addressValue}
                      onChange={(e) => setAddressValue(e.target.value)}
                      placeholder="Calle, número, comuna"
                      autoFocus
                      disabled={isSaving}
                      style={{ borderRadius: 10, fontSize: 16 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginTop: 10 }}>
                      <button type="button" onClick={handleCancelEdit} disabled={isSaving} style={{ fontSize: 16, color: IOS.azul }}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAddress}
                        disabled={isSaving}
                        style={{ fontSize: 16, color: IOS.azul, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        {isSaving && <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />}
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <Fila
                    icono={MapPin}
                    color={IOS.verde}
                    label="Dirección"
                    detalle={user.address || 'Agregar'}
                    onClick={onUpdateProfile ? () => setIsEditingAddress(true) : undefined}
                  />
                )}
                {esAdmin && (
                  <>
                    <Separador />
                    {showInviteCode ? (
                      <Fila
                        icono={Share2}
                        color={IOS.morado}
                        label="Código de invitación"
                        detalle={
                          <span style={{ color: IOS.texto, fontWeight: 600, letterSpacing: '0.08em' }}>{inviteCode}</span>
                        }
                        chevron={false}
                        derecha={<Copy style={{ width: 17, height: 17, color: IOS.azul }} />}
                        onClick={handleCopyInviteCode}
                      />
                    ) : (
                      <Fila
                        icono={Share2}
                        color={IOS.morado}
                        label="Código de invitación"
                        detalle={loadingInviteCode ? 'Cargando…' : 'Mostrar'}
                        onClick={loadingInviteCode ? undefined : handleGenerateInviteCode}
                      />
                    )}
                  </>
                )}
              </Grupo>

              {/* Notificaciones: plegado por defecto. Los switches conservan el
                  comportamiento anterior (las notificaciones se revisan aparte). */}
              <Grupo titulo="Notificaciones">
                <button
                  type="button"
                  onClick={() => setShowNotificationSettings((v) => !v)}
                  aria-expanded={showNotificationSettings}
                  className="fila-ios"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '9px 16px 9px 14px', textAlign: 'left' }}
                >
                  <IconoCuadrado icono={Bell} color={IOS.rojo} />
                  <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>Preferencias</span>
                  <ChevronRight
                    style={{
                      width: 18,
                      height: 18,
                      color: IOS.chevron,
                      transition: 'transform 0.2s',
                      transform: showNotificationSettings ? 'rotate(90deg)' : undefined,
                    }}
                  />
                </button>
                {showNotificationSettings && (
                  <>
                    <Separador />
                    {filaInterruptor('sound-notifications', 'Sonido', soundNotifications, handleSoundNotificationsChange, Volume2, IOS.rosa)}
                    <Separador />
                    {filaInterruptor('browser-notifications', 'Notificaciones del sistema', browserNotifications, handleBrowserNotificationsChange, Monitor, IOS.azul)}
                    <Separador />
                    {filaInterruptor('push-notifications', 'Notificaciones push', pushNotifications, setPushNotifications, Bell, IOS.naranja)}
                    <Separador />
                    {filaInterruptor('email-notifications', 'Correo', emailNotifications, setEmailNotifications, Mail, IOS.azul)}
                    <Separador />
                    {filaInterruptor('order-updates', 'Estado de pedidos', orderUpdates, setOrderUpdates, Package, IOS.verde)}
                    {(user.role === 'production' || user.role === 'admin') && (
                      <>
                        <Separador />
                        <button
                          type="button"
                          onClick={handleTestNotification}
                          className="fila-ios"
                          style={{ width: '100%', minHeight: 48, padding: '0 16px', fontSize: 16, color: IOS.azul, textAlign: 'left' }}
                        >
                          Probar notificación
                        </button>
                      </>
                    )}
                  </>
                )}
              </Grupo>

              {/* Cerrar sesión */}
              <Grupo>
                <button
                  type="button"
                  className="fila-ios"
                  disabled={isLoggingOut}
                  onClick={async () => {
                    setIsLoggingOut(true);
                    await onLogout();
                  }}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    fontSize: 16,
                    color: IOS.rojo,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {isLoggingOut ? <Loader2 className="animate-spin" style={{ width: 17, height: 17 }} /> : <LogOut style={{ width: 17, height: 17 }} />}
                  {isLoggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
                </button>
              </Grupo>

              <p style={{ textAlign: 'center', fontSize: 12, color: IOS.secundario, paddingBottom: 8 }}>
                La Oca · versión {versionApp}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
