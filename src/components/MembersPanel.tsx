import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import { toast } from 'sonner';
import { businessAPI, type BusinessMember } from '../utils/api';

/**
 * Pantalla "Miembros" (solo admin): se apila sobre "Mi cuenta" deslizándose
 * desde la derecha, como una pantalla de Ajustes de iOS.
 *
 * Es la contraparte de A-02: al registrarse solo se pueden elegir roles de
 * autoservicio (usuario, local, trabajador). Los elevados se otorgan acá. El
 * servidor valida todo de nuevo (solo admin del mismo negocio, nadie cambia su
 * propio rol, el propietario no deja de ser admin), así que la UI no es la
 * defensa: solo evita ofrecer lo que de todos modos se rechazaría.
 */

const IOS = {
  fondo: '#F2F2F7',
  texto: '#1C1C1E',
  secundario: '#8E8E93',
  separador: '#E5E5EA',
  chevron: '#C7C7CC',
  azul: '#007AFF',
  rojo: '#FF3B30',
};

type Rol = 'admin' | 'production' | 'dispatch' | 'pastry' | 'local' | 'worker' | 'user';

// Orden de la hoja de selección: de más a menos acceso.
// `asignable: false` = rol en desuso: se muestra a quien todavía lo tiene, pero
// no se ofrece en la hoja. Trabajador (asistencia) se deshabilitó en nov. 2026.
const ROLES: { valor: Rol; nombre: string; descripcion: string; color: string; asignable?: false }[] = [
  { valor: 'admin', nombre: 'Administración', descripcion: 'Acceso completo al negocio', color: '#FF3B30' },
  { valor: 'production', nombre: 'Producción', descripcion: 'Prepara pedidos y órdenes de producción', color: '#FF9500' },
  { valor: 'dispatch', nombre: 'Despacho', descripcion: 'Despacha y entrega pedidos', color: '#5856D6' },
  { valor: 'pastry', nombre: 'Pastelería', descripcion: 'Pantalla de cocina de pastelería', color: '#FF2D55' },
  { valor: 'local', nombre: 'Local', descripcion: 'Hace y sigue los pedidos de su local', color: '#34C759' },
  { valor: 'worker', nombre: 'Trabajador (en desuso)', descripcion: 'Módulo de asistencia deshabilitado', color: '#C7C7CC', asignable: false },
  { valor: 'user', nombre: 'Usuario', descripcion: 'Acceso básico', color: '#8E8E93' },
];

const infoRol = (rol: string) => ROLES.find((r) => r.valor === rol) ?? ROLES[ROLES.length - 1];

const iniciales = (texto: string) =>
  (texto || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

interface MembersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken?: string;
  currentUserId: string;
}

export function MembersPanel({ isOpen, onClose, accessToken, currentUserId }: MembersPanelProps) {
  const [miembros, setMiembros] = useState<BusinessMember[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [elegido, setElegido] = useState<BusinessMember | null>(null);
  const [guardando, setGuardando] = useState<Rol | null>(null);

  const cargar = useCallback(async () => {
    if (!accessToken) return;
    setCargando(true);
    setError(null);
    try {
      const [{ members }, negocio] = await Promise.all([
        businessAPI.getMembers(accessToken),
        businessAPI.get(accessToken).catch(() => null),
      ]);
      setMiembros(members);
      setCodigo(negocio?.inviteCode ?? null);
    } catch (e: any) {
      console.error('Error cargando miembros:', e);
      setError('No se pudieron cargar los miembros.');
    } finally {
      setCargando(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isOpen) void cargar();
    else setElegido(null);
  }, [isOpen, cargar]);

  // Escape cierra primero la hoja de roles y después la pantalla.
  useEffect(() => {
    if (!isOpen) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (elegido) setElegido(null);
      else onClose();
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [isOpen, elegido, onClose]);

  const copiarCodigo = async () => {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success('Código copiado');
    } catch {
      toast(`Código de invitación: ${codigo}`);
    }
  };

  const regenerarCodigo = async () => {
    if (!accessToken) return;
    if (!window.confirm('El código actual dejará de funcionar. Quien ya se unió no se ve afectado. ¿Generar uno nuevo?')) return;
    setRegenerando(true);
    try {
      const { inviteCode } = await businessAPI.regenerateCode(accessToken);
      setCodigo(inviteCode);
      toast.success('Código nuevo generado');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo generar un código nuevo');
    } finally {
      setRegenerando(false);
    }
  };

  const cambiarRol = async (rol: Rol) => {
    if (!elegido || !accessToken) return;
    if (rol === elegido.role) {
      setElegido(null);
      return;
    }
    setGuardando(rol);
    try {
      await businessAPI.setMemberRole(accessToken, elegido.id, rol);
      setMiembros((lista) => lista.map((m) => (m.id === elegido.id ? { ...m, role: rol } : m)));
      toast.success(`${elegido.name || elegido.email} ahora es ${infoRol(rol).nombre}`);
      setElegido(null);
    } catch (e: any) {
      const msg = String(e?.message || '');
      // El servidor en producción todavía no tiene esta ruta (llega con el
      // despliegue pendiente del Edge Function): 404 en vez de un error real.
      toast.error(
        /404|not found/i.test(msg)
          ? 'El cambio de rol todavía no está activo en el servidor.'
          : msg || 'No se pudo cambiar el rol',
      );
    } finally {
      setGuardando(null);
    }
  };

  const alSoltar = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 100 || info.velocity.x > 500) onClose();
  };

  // Cada rol con su gente, en el orden de ROLES; dentro, alfabético.
  const grupos = ROLES.map((r) => ({
    rol: r,
    gente: miembros
      .filter((m) => infoRol(m.role).valor === r.valor)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email, 'es')),
  })).filter((g) => g.gente.length > 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Miembros"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          drag={elegido ? false : 'x'}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.6 }}
          onDragEnd={alSoltar}
          className="fixed top-0 right-0 h-full flex flex-col"
          style={{ width: 'min(100%, 420px)', background: IOS.fondo, touchAction: 'pan-y', zIndex: 60 }}
        >
          {/* Barra de navegación */}
          <div style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', color: IOS.azul, fontSize: 17, padding: '8px 12px 4px 8px' }}
            >
              <ChevronLeft style={{ width: 26, height: 26 }} />
              Mi cuenta
            </button>
            <h2 style={{ fontSize: 30, fontWeight: 700, color: IOS.texto, letterSpacing: '-0.01em', padding: '2px 20px 12px' }}>
              Miembros
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
            {/* Invitar */}
            <Seccion
              titulo="Invitar"
              pie="Comparte este código para que alguien se una. Al entrar elige Usuario o Local; los demás roles se asignan aquí."
            >
              <button
                type="button"
                onClick={copiarCodigo}
                disabled={!codigo}
                className="fila-ios"
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '9px 16px', textAlign: 'left' }}
              >
                <span style={{ flex: 1, fontSize: 16, color: IOS.texto }}>Código de invitación</span>
                <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.08em', color: codigo ? IOS.texto : IOS.secundario }}>
                  {codigo ?? (cargando ? '…' : '—')}
                </span>
                {codigo && <Copy style={{ width: 17, height: 17, color: IOS.azul }} />}
              </button>
              <div style={{ height: 1, background: IOS.separador, marginLeft: 16 }} />
              <button
                type="button"
                onClick={regenerarCodigo}
                disabled={regenerando || !codigo}
                className="fila-ios"
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 48, padding: '9px 16px', textAlign: 'left', color: IOS.azul, fontSize: 16, opacity: codigo ? 1 : 0.4 }}
              >
                {regenerando ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <RefreshCw style={{ width: 16, height: 16 }} />}
                Generar código nuevo
              </button>
            </Seccion>

            {/* Lista */}
            {cargando && miembros.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Loader2 className="animate-spin" style={{ width: 22, height: 22, color: IOS.secundario }} />
              </div>
            ) : error ? (
              <div style={{ textAlign: 'center', padding: '24px 32px', color: IOS.secundario, fontSize: 15 }}>
                {error}
                <div>
                  <button type="button" onClick={() => void cargar()} style={{ color: IOS.azul, fontSize: 16, marginTop: 8 }}>
                    Reintentar
                  </button>
                </div>
              </div>
            ) : (
              grupos.map(({ rol, gente }) => (
                <Seccion key={rol.valor} titulo={`${rol.nombre} · ${gente.length}`}>
                  {gente.map((m, i) => {
                    const soyYo = m.id === currentUserId;
                    return (
                      <div key={m.id}>
                        {i > 0 && <div style={{ height: 1, background: IOS.separador, marginLeft: 66 }} />}
                        <button
                          type="button"
                          onClick={soyYo ? undefined : () => setElegido(m)}
                          disabled={soyYo}
                          className="fila-ios"
                          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 60, padding: '8px 16px', textAlign: 'left' }}
                        >
                          <span
                            style={{
                              width: 38, height: 38, borderRadius: 19, flexShrink: 0,
                              background: rol.color, color: '#fff', fontSize: 14, fontWeight: 600,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {iniciales(m.name || m.email)}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 16, color: IOS.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.name || 'Sin nombre'}
                              {soyYo && <span style={{ color: IOS.secundario }}> (tú)</span>}
                            </span>
                            <span style={{ display: 'block', fontSize: 13, color: IOS.secundario, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.email}
                            </span>
                          </span>
                          {!soyYo && <ChevronRight style={{ width: 18, height: 18, color: IOS.chevron, flexShrink: 0 }} />}
                        </button>
                      </div>
                    );
                  })}
                </Seccion>
              ))
            )}
          </div>

          {/* Hoja para elegir el rol */}
          <AnimatePresence>
            {elegido && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !guardando && setElegido(null)}
                  style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }}
                />
                <motion.div
                  role="dialog"
                  aria-label={`Rol de ${elegido.name || elegido.email}`}
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, background: IOS.fondo,
                    borderRadius: '14px 14px 0 0', maxHeight: '85%', display: 'flex', flexDirection: 'column',
                    paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px' }}>
                    <span style={{ width: 36, height: 5, borderRadius: 3, background: '#C7C7CC' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 17, fontWeight: 600, color: IOS.texto, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {elegido.name || elegido.email}
                      </p>
                      <p style={{ fontSize: 13, color: IOS.secundario }}>Elige su rol</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setElegido(null)}
                      disabled={!!guardando}
                      style={{ color: IOS.azul, fontSize: 17, padding: 4 }}
                    >
                      Cancelar
                    </button>
                  </div>
                  <div style={{ overflowY: 'auto', padding: '0 16px' }}>
                    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                      {ROLES.filter((r) => r.asignable !== false).map((r, i) => {
                        const actual = infoRol(elegido.role).valor === r.valor;
                        return (
                          <div key={r.valor}>
                            {i > 0 && <div style={{ height: 1, background: IOS.separador, marginLeft: 16 }} />}
                            <button
                              type="button"
                              onClick={() => void cambiarRol(r.valor)}
                              disabled={!!guardando}
                              className="fila-ios"
                              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '8px 16px', textAlign: 'left' }}
                            >
                              <span style={{ flex: 1 }}>
                                <span style={{ display: 'block', fontSize: 16, color: IOS.texto }}>{r.nombre}</span>
                                <span style={{ display: 'block', fontSize: 13, color: IOS.secundario }}>{r.descripcion}</span>
                              </span>
                              {guardando === r.valor ? (
                                <Loader2 className="animate-spin" style={{ width: 18, height: 18, color: IOS.secundario }} />
                              ) : actual ? (
                                <Check style={{ width: 20, height: 20, color: IOS.azul }} />
                              ) : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Seccion({ titulo, pie, children }: { titulo?: string; pie?: string; children: React.ReactNode }) {
  return (
    <section style={{ margin: '0 16px 24px' }}>
      {titulo && (
        <h3 style={{ fontSize: 13, color: IOS.secundario, textTransform: 'uppercase', letterSpacing: '0.02em', padding: '0 16px 6px', fontWeight: 400 }}>
          {titulo}
        </h3>
      )}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>{children}</div>
      {pie && <p style={{ fontSize: 13, color: IOS.secundario, padding: '6px 16px 0', lineHeight: 1.35 }}>{pie}</p>}
    </section>
  );
}
