import { useEffect, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import {
  Bell,
  X,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  LogIn,
  LogOut,
  Tag,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';

import { Notification } from '../utils/api';
import { estiloBarraDeEstado } from '../utils/initNative';

/**
 * Panel de notificaciones, con el mismo lenguaje que "Mi cuenta"
 * (UserProfile.tsx): se desliza desde la derecha sobre fondo gris de iOS, con
 * listas agrupadas por fecha (Hoy, Ayer, Esta semana, Anteriores).
 *
 * - Se cierra con la ✕, tocando el fondo, deslizando a la derecha o con Escape.
 * - Cada fila se desliza a la izquierda para mostrar "Borrar" (como en Mail);
 *   un deslizamiento largo borra directo.
 * - Tocar una fila la marca como leída y, si es de un pedido, lo abre.
 *
 * Estilos inline: Tailwind está precompilado (src/index.css).
 */

interface NotificationsPanelProps {
  notifications: Notification[];
  isOpen: boolean;
  onClose: () => void;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (notificationId: string) => void;
  onNotificationClick?: (notification: Notification) => void;
  /** Total real de no leídas (la lista trae solo las más recientes). */
  unreadCount?: number;
}

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
  amarillo: '#FFCC00',
  gris: '#8E8E93',
};

const ANCHO_BORRAR = 84;

function estiloTipo(type: Notification['type']): { icono: LucideIcon; color: string } {
  switch (type) {
    case 'order_created': return { icono: Package, color: IOS.azul };
    case 'order_updated': return { icono: Clock, color: IOS.naranja };
    case 'order_completed': return { icono: CheckCircle2, color: IOS.verde };
    case 'order_cancelled': return { icono: XCircle, color: IOS.rojo };
    case 'warning': return { icono: AlertTriangle, color: IOS.naranja };
    case 'error': return { icono: AlertTriangle, color: IOS.rojo };
    case 'attendance_check_in': return { icono: LogIn, color: IOS.verde };
    case 'attendance_check_out': return { icono: LogOut, color: IOS.morado };
    case 'product_created':
    case 'product_updated': return { icono: Tag, color: IOS.indigo };
    case 'info': return { icono: Info, color: IOS.gris };
    default: return { icono: Bell, color: IOS.gris };
  }
}

// Los títulos guardados traen emoji al inicio ("🎉 Nuevo Pedido"); el ícono de
// color ya cumple ese papel.
const limpiarTitulo = (t: string) => t.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function grupoDeFecha(fecha: Date, hoy: number): string {
  const dia = inicioDelDia(fecha);
  if (dia >= hoy) return 'Hoy';
  if (dia >= hoy - 86400000) return 'Ayer';
  if (dia >= hoy - 6 * 86400000) return 'Esta semana';
  return 'Anteriores';
}

function horaCorta(fecha: Date, grupo: string): string {
  const mins = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (grupo === 'Hoy') {
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
  }
  if (grupo === 'Hoy' || grupo === 'Ayer') {
    return fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }
  if (grupo === 'Esta semana') {
    return fecha.toLocaleDateString('es-CL', { weekday: 'long' });
  }
  return fecha.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

interface FilaProps {
  n: Notification;
  grupo: string;
  abierta: boolean;
  primera: boolean;
  onAbrir: (id: string | null) => void;
  onTocar: (n: Notification) => void;
  onBorrar: (id: string) => void;
  /** La fila captura el arrastre horizontal: el gesto a la derecha se le
   *  devuelve al panel para cerrarlo, igual que fuera de las filas. */
  onCerrarPanel: () => void;
}

function FilaNotificacion({ n, grupo, abierta, primera, onAbrir, onTocar, onBorrar, onCerrarPanel }: FilaProps) {
  const { icono: Icono, color } = estiloTipo(n.type);
  const fecha = new Date(n.createdAt);
  // El botón rojo solo existe mientras se desliza o está abierta: si queda
  // siempre debajo, asoma un filo rojo por el antialias de la esquina.
  const [arrastrando, setArrastrando] = useState(false);

  const alSoltar = (_e: unknown, info: PanInfo) => {
    setArrastrando(false);
    if (!abierta && (info.offset.x > 100 || info.velocity.x > 500)) onCerrarPanel();
    else if (info.offset.x < -160) onBorrar(n.id);
    else if (info.offset.x < -40 || info.velocity.x < -400) onAbrir(n.id);
    else onAbrir(null);
  };

  return (
    <motion.div
      layout
      initial={false}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {!primera && <div style={{ height: 1, background: IOS.separador, marginLeft: 58 }} />}
      {/* Acción "Borrar" detrás de la fila */}
      {(arrastrando || abierta) && <button
        type="button"
        onClick={() => onBorrar(n.id)}
        aria-label="Borrar notificación"
        style={{
          position: 'absolute',
          top: primera ? 0 : 1,
          right: 0,
          bottom: 0,
          width: ANCHO_BORRAR,
          background: IOS.rojo,
          color: '#fff',
          fontSize: 15,
          fontWeight: 500,
        }}
      >
        Borrar
      </button>}
      <motion.button
        type="button"
        className="fila-ios"
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ANCHO_BORRAR, right: 0 }}
        dragElastic={{ left: 0.5, right: 0 }}
        dragMomentum={false}
        onDragStart={() => setArrastrando(true)}
        onDragEnd={alSoltar}
        animate={{ x: abierta ? -ANCHO_BORRAR : 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 400 }}
        onClick={() => (abierta ? onAbrir(null) : onTocar(n))}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          width: '100%',
          padding: '11px 14px 11px 14px',
          textAlign: 'left',
          touchAction: 'pan-y',
        }}
      >
        {/* Punto de no leída, como en Mail */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 4,
            top: 24,
            width: 7,
            height: 7,
            borderRadius: 4,
            background: n.read ? 'transparent' : IOS.azul,
          }}
        />
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
            marginTop: 1,
          }}
        >
          <Icono style={{ width: 17, height: 17, color: '#fff' }} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 15,
                fontWeight: n.read ? 400 : 600,
                color: IOS.texto,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {limpiarTitulo(n.title)}
            </span>
            <span style={{ fontSize: 13, color: IOS.secundario, flexShrink: 0 }}>{horaCorta(fecha, grupo)}</span>
          </span>
          <span
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontSize: 14,
              lineHeight: 1.35,
              color: n.read ? IOS.secundario : '#3C3C43',
              marginTop: 2,
            } as CSSProperties}
          >
            {n.message}
          </span>
        </span>
        {n.orderId && (
          <ChevronRight style={{ width: 18, height: 18, color: IOS.chevron, flexShrink: 0, alignSelf: 'center' }} />
        )}
      </motion.button>
    </motion.div>
  );
}

export function NotificationsPanel({
  notifications,
  isOpen,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onNotificationClick,
  unreadCount,
}: NotificationsPanelProps) {
  const lista = Array.isArray(notifications) ? notifications : [];
  const noLeidas = unreadCount ?? lista.filter((n) => !n.read).length;
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFilaAbierta(null);
      return;
    }
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [isOpen, onClose]);

  // Panel claro: hora y batería en oscuro mientras está abierto.
  useEffect(() => {
    void estiloBarraDeEstado(isOpen ? 'oscuro' : 'claro');
  }, [isOpen]);

  const hoy = inicioDelDia(new Date());
  const grupos: { titulo: string; items: Notification[] }[] = [];
  for (const n of lista) {
    const titulo = grupoDeFecha(new Date(n.createdAt), hoy);
    const g = grupos.find((x) => x.titulo === titulo);
    if (g) g.items.push(n);
    else grupos.push({ titulo, items: [n] });
  }

  const tocar = (n: Notification) => {
    if (!n.read) onMarkAsRead(n.id);
    onNotificationClick?.(n);
  };

  const borrar = (id: string) => {
    setFilaAbierta(null);
    onDelete(id);
  };

  const alSoltarPanel = (_e: unknown, info: PanInfo) => {
    if (info.offset.x > 100 || info.velocity.x > 500) onClose();
  };

  return (
    <>
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

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Notificaciones"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.6 }}
            onDragEnd={alSoltarPanel}
            className="fixed top-0 right-0 h-full shadow-2xl z-50 flex flex-col"
            style={{ width: 'min(100%, 420px)', background: IOS.fondo, touchAction: 'pan-y' }}
          >
            {/* Encabezado */}
            <div style={{ padding: '0 16px 4px 20px', paddingTop: 'max(env(safe-area-inset-top), 20px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 30, fontWeight: 700, color: IOS.texto, letterSpacing: '-0.01em' }}>
                  Notificaciones
                </h2>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 }}>
                <span style={{ fontSize: 15, color: IOS.secundario }}>
                  {noLeidas > 0 ? `${noLeidas} sin leer` : lista.length > 0 ? 'Todo al día' : ''}
                </span>
                {noLeidas > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllAsRead}
                    style={{ fontSize: 15, color: IOS.azul, padding: '4px 0' }}
                  >
                    Marcar todo como leído
                  </button>
                )}
              </div>
            </div>

            {/* Contenido desplazable */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ paddingTop: 8, paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            >
              {lista.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '96px 32px 0' }}>
                  <Bell style={{ width: 44, height: 44, color: IOS.chevron, margin: '0 auto 14px' }} />
                  <p style={{ fontSize: 20, fontWeight: 600, color: IOS.texto }}>Sin notificaciones</p>
                  <p style={{ fontSize: 15, color: IOS.secundario, marginTop: 6, lineHeight: 1.4 }}>
                    Aquí verás los cambios de tus pedidos y los avisos importantes.
                  </p>
                </div>
              ) : (
                <>
                  {grupos.map((g) => (
                    <section key={g.titulo} style={{ margin: '0 16px 24px' }}>
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
                        {g.titulo}
                      </h3>
                      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                        <AnimatePresence initial={false}>
                          {g.items.map((n, i) => (
                            <FilaNotificacion
                              key={n.id}
                              n={n}
                              grupo={g.titulo}
                              primera={i === 0}
                              abierta={filaAbierta === n.id}
                              onAbrir={setFilaAbierta}
                              onTocar={tocar}
                              onBorrar={borrar}
                              onCerrarPanel={onClose}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </section>
                  ))}
                  <p style={{ textAlign: 'center', fontSize: 13, color: IOS.secundario, padding: '0 32px', lineHeight: 1.4 }}>
                    Desliza una notificación a la izquierda para borrarla.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
