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
  Users,
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
  FileText,
  Printer,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import { version as versionApp } from '../../package.json';
import { estiloBarraDeEstado } from '../utils/initNative';
import { isNativePlatform } from '../utils/platform';
import { seccionesParaRol } from '../utils/preferenciasNotificaciones';
import { impresionAutomaticaActiva, guardarImpresionAutomatica } from '../utils/impresionAutomatica';
import { MembersPanel } from './MembersPanel';
import { PrivacidadPanel } from './PrivacidadPanel';
import { cuentaAPI } from '../utils/api';

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
  /** Categorías de notificación apagadas (ver utils/preferenciasNotificaciones). */
  notificacionesSilenciadas?: string[];
  onCambiarNotificacionesSilenciadas?: (lista: string[]) => void;
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

export function UserProfile({ user, isOpen, onClose, onLogout, onUpdateProfile, onViewAnalytics, onViewDispatch, onViewDistribution, onViewComplaints, pendingComplaintsCount, onManageAttendance, onManageProducts, onManageProductionAreas, onManageIngredients, onManageProductIngredients, accessToken, notificacionesSilenciadas = [], onCambiarNotificacionesSilenciadas }: UserProfileProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [soundNotifications, setSoundNotifications] = useState(() => {
    // Load from localStorage
    const saved = localStorage.getItem('soundNotifications');
    return saved !== null ? JSON.parse(saved) : true;
  });
  // Los avisos del navegador solo existen en la PWA/web (en la app nativa no hay
  // `window.Notification`; el push nativo es otra fase). El switch refleja el
  // permiso real: encendido solo si hay permiso Y el usuario no lo apagó.
  const avisosDisponibles = !isNativePlatform() && typeof window !== 'undefined' && 'Notification' in window;
  const [browserNotifications, setBrowserNotifications] = useState(() => {
    if (!avisosDisponibles || Notification.permission !== 'granted') return false;
    const saved = localStorage.getItem('browserNotifications');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  // Impresión automática: preferencia de ESTE equipo (localStorage), no de la
  // cuenta, porque la impresora está enchufada a un computador concreto.
  const [imprimirSolo, setImprimirSolo] = useState(() => impresionAutomaticaActiva());
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressValue, setAddressValue] = useState(user.address || '');
  const [isSaving, setIsSaving] = useState(false);
  const [miembrosAbierto, setMiembrosAbierto] = useState(false);
  const [privacidadAbierta, setPrivacidadAbierta] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');

  const eliminarCuenta = async () => {
    if (!accessToken) return;
    setEliminando(true);
    setErrorEliminar('');
    try {
      await cuentaAPI.eliminar(accessToken);
      toast.success('Tu cuenta fue eliminada');
      setConfirmandoEliminar(false);
      await onLogout();
    } catch (e: any) {
      setErrorEliminar(e?.message || 'No se pudo eliminar la cuenta. Intenta de nuevo.');
    } finally {
      setEliminando(false);
    }
  };

  // Escape cierra el panel (teclado físico / web de escritorio).
  useEffect(() => {
    if (!isOpen || miembrosAbierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [isOpen, onClose, miembrosAbierto]);

  // El panel es claro: la hora/batería pasan a texto oscuro mientras está
  // abierto y vuelven a blanco (sobre el azul de la app) al cerrarse.
  useEffect(() => {
    void estiloBarraDeEstado(isOpen ? 'oscuro' : 'claro');
  }, [isOpen]);

  // Al cerrar, descartar una edición de dirección a medio hacer.
  useEffect(() => {
    if (!isOpen) {
      setMiembrosAbierto(false);
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
          toast.success('Avisos activados');
        } else {
          toast.error('El navegador bloqueó los avisos', {
            description: 'Actívalos en los ajustes del sitio de tu navegador.',
          });
        }
      } else {
        toast.error('Tu navegador no soporta notificaciones');
      }
    } else {
      setBrowserNotifications(false);
      localStorage.setItem('browserNotifications', JSON.stringify(false));
      toast.success('Avisos desactivados');
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
      worker: 'Trabajador',
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

  // Solo despacho y admin ven los pedidos que entran, así que son los únicos
  // que pueden imprimirlos al llegar.
  const puedeImprimirSolo = user.role === 'dispatch' || user.role === 'admin';

  const alternarImprimirSolo = (activa: boolean) => {
    setImprimirSolo(activa);
    guardarImpresionAutomatica(activa);
    toast.success(
      activa
        ? 'Este equipo va a imprimir la guía al llegar un pedido'
        : 'Impresión automática desactivada en este equipo',
    );
  };

  const seccionesAvisos = onCambiarNotificacionesSilenciadas ? seccionesParaRol(user.role) : [];
  const alternarCategoria = (clave: string, activa: boolean) => {
    if (!onCambiarNotificacionesSilenciadas) return;
    const resto = notificacionesSilenciadas.filter((c) => c !== clave);
    onCambiarNotificacionesSilenciadas(activa ? resto : [...resto, clave]);
  };

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

              {/* Miembros: se abre encima, sin cerrar "Mi cuenta". */}
              {esAdmin && accessToken && (
                <Grupo>
                  <Fila icono={Users} color={IOS.azul} label="Miembros e invitaciones" onClick={() => setMiembrosAbierto(true)} />
                </Grupo>
              )}

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
              </Grupo>

              {/* Notificaciones: plegado por defecto. Solo ajustes que funcionan
                  de verdad (ver docs/notificaciones-diagnostico.md). */}
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
                    {avisosDisponibles && <Separador />}
                    {avisosDisponibles && (
                      <>
                        {filaInterruptor('browser-notifications', 'Avisos del navegador', browserNotifications, handleBrowserNotificationsChange, Monitor, IOS.azul)}
                      </>
                    )}
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

              {/* Qué avisos recibir, por categoría. Van como listas propias
                  (estilo Ajustes) debajo de Preferencias cuando está abierto. */}
              {showNotificationSettings && seccionesAvisos.map((seccion) => (
                <Grupo key={seccion.titulo} titulo={seccion.titulo} pie={seccion.pie}>
                  {seccion.opciones.map((op, i) => (
                    <div key={op.clave}>
                      {i > 0 && <div style={{ height: 1, background: IOS.separador, marginLeft: 16 }} />}
                      <label
                        htmlFor={`aviso-${op.clave}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '9px 16px', cursor: 'pointer' }}
                      >
                        <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>{op.label}</span>
                        <Switch
                          id={`aviso-${op.clave}`}
                          checked={!notificacionesSilenciadas.includes(op.clave)}
                          onCheckedChange={(v) => alternarCategoria(op.clave, v)}
                        />
                      </label>
                    </div>
                  ))}
                </Grupo>
              ))}

              {/* Impresión automática de la guía al llegar un pedido. La
                  preferencia es de este equipo, no de la cuenta. */}
              {puedeImprimirSolo && (
                <Grupo
                  titulo="Impresión"
                  pie={
                    imprimirSolo
                      ? 'Al llegar un pedido se arma la guía y se abre el diálogo de impresión. El navegador no permite imprimir sin mostrarlo: para que salga sin ningún click, hay que abrir Chrome con la opción --kiosk-printing. Vale solo para este equipo.'
                      : 'Imprime la guía de despacho sola cada vez que entra un pedido nuevo. Se activa por equipo: actívalo en el computador que tiene la impresora.'
                  }
                >
                  {filaInterruptor(
                    'impresion-automatica',
                    'Imprimir al llegar un pedido',
                    imprimirSolo,
                    alternarImprimirSolo,
                    Printer,
                    IOS.turquesa,
                  )}
                </Grupo>
              )}

              {/* Legal */}
              <Grupo>
                <Fila icono={FileText} color={IOS.secundario} label="Política de privacidad" onClick={() => setPrivacidadAbierta(true)} />
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

              {/* Eliminar cuenta (Apple 5.1.1(v)): aparte, en rojo, con confirmación. */}
              <Grupo pie="Se borran tu cuenta y tus datos personales. Los pedidos quedan en el negocio, sin tu usuario.">
                <button
                  type="button"
                  className="fila-ios"
                  onClick={() => { setErrorEliminar(''); setConfirmandoEliminar(true); }}
                  style={{ width: '100%', minHeight: 48, fontSize: 16, color: IOS.rojo }}
                >
                  Eliminar cuenta
                </button>
              </Grupo>

              <p style={{ textAlign: 'center', fontSize: 12, color: IOS.secundario, paddingBottom: 8 }}>
                La Oca · versión {versionApp}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <PrivacidadPanel abierto={isOpen && privacidadAbierta} onCerrar={() => setPrivacidadAbierta(false)} />

      {/* Confirmación de eliminar cuenta */}
      <AnimatePresence>
        {isOpen && confirmandoEliminar && (
          <>
            <motion.div key="fondo-eliminar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !eliminando && setConfirmandoEliminar(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 70 }} />
            <motion.div key="hoja-eliminar" role="alertdialog" aria-modal="true" aria-label="Eliminar cuenta"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 71, margin: '0 auto', maxWidth: 520, background: IOS.fondo, borderRadius: '14px 14px 0 0', padding: '22px 16px max(env(safe-area-inset-bottom), 20px)' }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: IOS.texto, textAlign: 'center' }}>¿Eliminar tu cuenta?</p>
              <p style={{ fontSize: 15, color: IOS.secundario, textAlign: 'center', lineHeight: 1.45, margin: '8px 4px 0' }}>
                Se borran tu cuenta ({user.email}) y tus datos personales. Los pedidos que hiciste quedan en el negocio sin tu usuario. <strong style={{ color: IOS.texto }}>No se puede deshacer.</strong>
              </p>
              {errorEliminar && (
                <p style={{ fontSize: 14, color: IOS.rojo, textAlign: 'center', margin: '12px 4px 0', lineHeight: 1.4 }}>{errorEliminar}</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                <button type="button" onClick={() => void eliminarCuenta()} disabled={eliminando} className="boton-ios"
                  style={{ height: 50, borderRadius: 12, border: 'none', background: IOS.rojo, color: '#fff', fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {eliminando && <Loader2 className="animate-spin" style={{ width: 17, height: 17 }} />}
                  {eliminando ? 'Eliminando…' : 'Eliminar mi cuenta'}
                </button>
                <button type="button" onClick={() => setConfirmandoEliminar(false)} disabled={eliminando}
                  style={{ height: 50, borderRadius: 12, border: 'none', background: '#fff', color: IOS.azul, fontSize: 17, fontWeight: 600 }}>
                  Cancelar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <MembersPanel
        isOpen={isOpen && miembrosAbierto}
        onClose={() => setMiembrosAbierto(false)}
        accessToken={accessToken}
        currentUserId={user.id}
      />
    </>
  );
}
