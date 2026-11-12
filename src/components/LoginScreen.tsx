import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronsUpDown, Eye, EyeOff } from 'lucide-react';
import logo from '../assets/logo-icon.png';
import { toast } from 'sonner';
import { authAPI } from '../utils/api';
import { estiloBarraDeEstado } from '../utils/initNative';

interface LoginScreenProps {
  onLogin: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
}

// Paleta iOS compartida con el resto de las pantallas rediseñadas.
const IOS = {
  fondo: '#F2F2F7',
  tarjeta: '#FFFFFF',
  texto: '#000000',
  secundario: 'rgba(60,60,67,0.6)',
  separador: 'rgba(60,60,67,0.18)',
  azul: '#007AFF',
};

const estiloInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 44,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  // 17px: tamaño de texto de iOS y, al ser ≥16px, Safari no hace zoom al enfocar.
  fontSize: 17,
  color: IOS.texto,
  padding: 0,
};

/** Una fila de un grupo estilo Ajustes. `separador` dibuja la línea inferior con sangría. */
function Fila({ children, separador }: { children: React.ReactNode; separador?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 16, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, paddingRight: 16, minHeight: 44 }}>{children}</div>
      {separador && (
        <div style={{ position: 'absolute', left: 16, right: 0, bottom: 0, height: 0.5, background: IOS.separador }} />
      )}
    </div>
  );
}

function Grupo({ children, pie }: { children: React.ReactNode; pie?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: IOS.tarjeta, borderRadius: 12, overflow: 'hidden' }}>{children}</div>
      {pie && (
        <p style={{ fontSize: 13, lineHeight: '18px', color: IOS.secundario, margin: '6px 16px 0' }}>{pie}</p>
      )}
    </div>
  );
}

function Interruptor({ activo, onCambio, etiqueta }: { activo: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onCambio(!activo)}
      style={{
        width: 51, height: 31, borderRadius: 999, border: 'none', padding: 2, flexShrink: 0,
        background: activo ? '#34C759' : 'rgba(120,120,128,0.16)',
        transition: 'background 0.2s', cursor: 'pointer',
      }}
    >
      <span
        style={{
          display: 'block', width: 27, height: 27, borderRadius: 999, background: '#fff',
          boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)',
          transform: activo ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s',
        }}
      />
    </button>
  );
}

function BotonPrincipal({ children, cargando }: { children: React.ReactNode; cargando: boolean }) {
  return (
    <button
      type="submit"
      disabled={cargando}
      className="boton-ios"
      style={{
        width: '100%', height: 50, borderRadius: 12, border: 'none',
        background: IOS.azul, color: '#fff', fontSize: 17, fontWeight: 600,
        opacity: cargando ? 0.5 : undefined, cursor: cargando ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const estiloEnlace: React.CSSProperties = {
  background: 'none', border: 'none', padding: 8, color: IOS.azul, fontSize: 15, cursor: 'pointer',
};

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  // A-02: el tipo se acota a los roles de autoservicio. Los elevados los
  // otorga un admin después del alta, no el propio usuario al registrarse.
  const [role, setRole] = useState<'local' | 'user'>('user');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(true); // Remember session by default

  // Business fields
  const [businessAction, setBusinessAction] = useState<'create' | 'join'>('create');
  const [businessName, setBusinessName] = useState('');
  const [businessCode, setBusinessCode] = useState('');


  // La pantalla es clara: la hora y la batería van en negro mientras se ve, y
  // vuelven a blanco (el azul de marca del resto de la app) al salir.
  useEffect(() => {
    void estiloBarraDeEstado('oscuro');
    return () => { void estiloBarraDeEstado('claro'); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    if (isCreatingAccount && !name) {
      toast.error('Por favor ingresa tu nombre');
      return;
    }

    // M-06: el servidor ahora exige 8 caracteres. Validarlo también acá es para
    // que el aviso llegue antes de la ida y vuelta, no en lugar del chequeo del
    // servidor: el minLength del input se saltea mandando el request a mano.
    if (isCreatingAccount && password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    if (isCreatingAccount && businessAction === 'create' && (!businessName || businessName.trim().length < 3)) {
      toast.error('El nombre del negocio debe tener al menos 3 caracteres');
      return;
    }

    if (isCreatingAccount && businessAction === 'join' && (!businessCode || businessCode.trim().length === 0)) {
      toast.error('Debes ingresar un código de invitación');
      return;
    }

    setIsLoading(true);

    try {
      if (isCreatingAccount) {
        // Sign up
        await authAPI.signup(
          email,
          password,
          name,
          role,
          businessAction,
          businessAction === 'create' ? businessName : undefined,
          businessAction === 'join' ? businessCode : undefined
        );

        if (businessAction === 'create') {
          toast.success(`¡Negocio "${businessName}" creado exitosamente! Iniciando sesión...`);
        } else {
          toast.success('¡Te has unido al negocio exitosamente! Iniciando sesión...');
        }

        // Automatically log in after signup (nueva cuenta: mantener sesión por defecto)
        await onLogin(email, password, true);
      } else {
        // Login
        await onLogin(email, password, rememberMe);
      }
    } catch (error: any) {
      console.error('Auth error:', error);

      // Provide more helpful error messages
      let errorMessage = 'Error en la autenticación';
      if (error.message?.includes('Invalid login credentials')) {
        errorMessage = isCreatingAccount
          ? 'Error al crear la cuenta. Por favor intenta de nuevo.'
          // Ya no hay "credenciales de demo" que sugerir: las cuentas demo se
          // retiraron junto con sus contraseñas en claro (A-01).
          : 'Correo o contraseña incorrectos.';
      } else if (error.message?.includes('already registered') || error.message?.includes('ya está registrado')) {
        errorMessage = 'Este email ya está registrado. Por favor inicia sesión.';
        setIsCreatingAccount(false);
      } else {
        errorMessage = error.message || errorMessage;
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMode = () => {
    setIsCreatingAccount(!isCreatingAccount);
    setPassword('');
    setName('');
  };

  const handlePasswordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recoveryEmail) {
      toast.error('Por favor ingresa tu correo electrónico');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recoveryEmail)) {
      toast.error('Por favor ingresa un correo electrónico válido');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authAPI.resetPassword(recoveryEmail);

      if (response.success) {
        toast.success(response.message || 'Se ha enviado un enlace de recuperación a tu correo');
        setRecoveryEmail('');

        // Wait a bit before returning to login
        setTimeout(() => {
          setShowPasswordRecovery(false);
        }, 1500);
      } else {
        toast.error('Error al enviar el enlace de recuperación');
      }
    } catch (error: any) {
      console.error('Password recovery error:', error);

      // Show generic success message for security (don't reveal if email exists)
      toast.success('Si el correo existe en nuestro sistema, recibirás un enlace de recuperación');
      setRecoveryEmail('');

      setTimeout(() => {
        setShowPasswordRecovery(false);
      }, 1500);
    } finally {
      setIsLoading(false);
    }
  };


  const contenedor: React.CSSProperties = {
    minHeight: '100dvh',
    background: IOS.fondo,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 24px)',
  };
  const columna: React.CSSProperties = { width: '100%', maxWidth: 400, margin: 'auto 0' };

  // ── Recuperar contraseña ──────────────────────────────────────────────────
  if (showPasswordRecovery) {
    return (
      <div style={contenedor}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <button
            type="button"
            onClick={() => setShowPasswordRecovery(false)}
            disabled={isLoading}
            style={{ ...estiloEnlace, display: 'flex', alignItems: 'center', gap: 2, padding: '8px 0', fontSize: 17 }}
          >
            <ChevronLeft style={{ width: 24, height: 24, marginLeft: -6 }} />
            Iniciar sesión
          </button>
        </div>

        <div style={{ width: '100%', maxWidth: 400, marginTop: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: IOS.texto, margin: '0 0 8px', letterSpacing: 0.2 }}>
            Recuperar contraseña
          </h1>
          <p style={{ fontSize: 15, color: IOS.secundario, margin: '0 0 24px' }}>
            Te enviaremos un enlace a tu correo para crear una nueva.
          </p>

          <form onSubmit={handlePasswordRecovery}>
            <Grupo pie="El enlace vence en 1 hora. Si no lo ves, revisa la carpeta de spam.">
              <Fila>
                <input
                  id="recovery-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  placeholder="Correo electrónico"
                  aria-label="Correo electrónico"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  required
                  style={estiloInput}
                />
              </Fila>
            </Grupo>
            <BotonPrincipal cargando={isLoading}>{isLoading ? 'Enviando…' : 'Enviar enlace'}</BotonPrincipal>
          </form>
        </div>
      </div>
    );
  }

  // ── Iniciar sesión / Crear cuenta ─────────────────────────────────────────
  const segmento = (valor: 'create' | 'join', texto: string) => {
    const activo = businessAction === valor;
    return (
      <button
        type="button"
        onClick={() => setBusinessAction(valor)}
        aria-pressed={activo}
        style={{
          flex: 1, height: 28, border: 'none', borderRadius: 7, fontSize: 13,
          fontWeight: activo ? 600 : 500, color: IOS.texto, cursor: 'pointer',
          background: activo ? '#fff' : 'transparent',
          boxShadow: activo ? '0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04)' : 'none',
        }}
      >
        {texto}
      </button>
    );
  };

  const campoPassword = (
    <Fila>
      <input
        id="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
        placeholder={isCreatingAccount ? 'Contraseña (mín. 8 caracteres)' : 'Contraseña'}
        aria-label="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        style={estiloInput}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        tabIndex={-1}
        style={{ background: 'none', border: 'none', padding: '8px 0 8px 8px', color: 'rgba(60,60,67,0.3)', cursor: 'pointer' }}
      >
        {showPassword ? <EyeOff style={{ width: 20, height: 20 }} /> : <Eye style={{ width: 20, height: 20 }} />}
      </button>
    </Fila>
  );

  const tamLogo = isCreatingAccount ? 88 : 132;

  return (
    <div style={contenedor}>
      <div style={columna}>
        <div style={{ textAlign: 'center', marginBottom: isCreatingAccount ? 28 : 40 }}>
          {/* El logo manda: grande como ícono de app (radio ≈22% del lado, la
              proporción de iOS). Al crear cuenta se achica para dejar lugar al formulario. */}
          <div
            style={{
              width: tamLogo, height: tamLogo, borderRadius: tamLogo * 0.225, background: '#0c3c84',
              margin: `0 auto ${isCreatingAccount ? 16 : 20}px`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(12,60,132,0.25)',
              transition: 'width 0.25s, height 0.25s, border-radius 0.25s',
            }}
          >
            <img src={logo} alt="La Oca" style={{ width: '78%', height: '78%', objectFit: 'contain' }} />
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: '#0c3c84', margin: 0, letterSpacing: -0.5 }}>
            {isCreatingAccount ? 'Crear cuenta' : 'Conectoca'}
          </h1>
          <p style={{ fontSize: 17, color: IOS.secundario, margin: '4px 0 0' }}>
            {isCreatingAccount ? 'Crea un negocio o únete a uno existente' : 'Pedidos de La Oca'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isCreatingAccount && (
            <>
              <div
                role="group"
                aria-label="Negocio"
                style={{ display: 'flex', background: 'rgba(118,118,128,0.12)', borderRadius: 9, padding: 2, marginBottom: 20 }}
              >
                {segmento('create', 'Crear negocio')}
                {segmento('join', 'Unirme a uno')}
              </div>

              {businessAction === 'create' ? (
                <Grupo pie="Serás el administrador del negocio.">
                  <Fila>
                    <input
                      id="businessName"
                      type="text"
                      autoComplete="organization"
                      placeholder="Nombre del negocio"
                      aria-label="Nombre del negocio"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                      minLength={3}
                      style={estiloInput}
                    />
                  </Fila>
                </Grupo>
              ) : (
                <Grupo pie="Pide el código al administrador del negocio. Los roles de producción, despacho y administración se asignan después.">
                  <Fila separador>
                    <input
                      id="businessCode"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder="Código de invitación"
                      aria-label="Código de invitación"
                      value={businessCode}
                      onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
                      required
                      style={{ ...estiloInput, letterSpacing: businessCode ? 1 : 0 }}
                    />
                  </Fila>
                  {/*
                    A-02: solo roles de autoservicio. Los elevados los otorga un
                    admin desde el panel de miembros; el servidor ignora cualquier
                    otro valor (ROLES_AUTOSERVICIO en el Edge Function).
                  */}
                  <Fila>
                    <label htmlFor="role" style={{ fontSize: 17, color: IOS.texto, flex: 1 }}>Rol</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, color: IOS.secundario, fontSize: 17 }}>
                      {role === 'local' ? 'Local' : 'Usuario'}
                      <ChevronsUpDown aria-hidden="true" style={{ width: 16, height: 16 }} />
                      <select
                        id="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value as 'local' | 'user')}
                        style={{ position: 'absolute', inset: 0, opacity: 0, fontSize: 17 }}
                      >
                        <option value="user">Usuario</option>
                        <option value="local">Local</option>
                      </select>
                    </div>
                  </Fila>
                </Grupo>
              )}
            </>
          )}

          <Grupo>
            {isCreatingAccount && (
              <Fila separador>
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Nombre completo"
                  aria-label="Nombre completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  style={estiloInput}
                />
              </Fila>
            )}
            <Fila separador>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete={isCreatingAccount ? 'email' : 'username'}
                autoCapitalize="none"
                placeholder="Correo electrónico"
                aria-label="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={estiloInput}
              />
            </Fila>
            {campoPassword}
          </Grupo>

          {!isCreatingAccount && (
            <Grupo>
              <Fila>
                <span id="remember-me-label" style={{ fontSize: 17, color: IOS.texto, flex: 1 }}>Mantener sesión iniciada</span>
                <Interruptor activo={rememberMe} onCambio={setRememberMe} etiqueta="Mantener sesión iniciada" />
              </Fila>
            </Grupo>
          )}

          <BotonPrincipal cargando={isLoading}>
            {isLoading ? (isCreatingAccount ? 'Creando cuenta…' : 'Ingresando…') : (isCreatingAccount ? 'Crear cuenta' : 'Iniciar sesión')}
          </BotonPrincipal>
        </form>

        {!isCreatingAccount && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button type="button" onClick={() => setShowPasswordRecovery(true)} style={estiloEnlace}>
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 15, color: IOS.secundario }}>
        {isCreatingAccount ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
        <button type="button" onClick={handleToggleMode} disabled={isLoading} style={{ ...estiloEnlace, padding: '8px 4px', fontWeight: 600 }}>
          {isCreatingAccount ? 'Iniciar sesión' : 'Crear una'}
        </button>
      </div>
    </div>
  );
}
