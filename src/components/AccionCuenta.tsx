import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { createClient } from '../utils/supabase/client';

/**
 * Pantalla a la que llevan los enlaces de los correos de cuenta
 * (?cuenta=verificar|nueva-clave&token_hash=...&type=...), armados por el Edge
 * Function en correosCuenta.ts.
 *
 * - verificar: canjea el token (verifyOtp) y con eso la cuenta queda
 *   confirmada. Se cierra la sesión que crea verifyOtp para que la persona
 *   entre con su contraseña como siempre (y en la app nativa, si abrió el
 *   correo en el teléfono, el enlace abre el navegador).
 * - nueva-clave: canjea el token y pide la contraseña nueva (updateUser).
 *
 * Se monta en main.tsx ANTES que <App/>, para que la app no intente restaurar
 * una sesión ni redirigir mientras se procesa el enlace.
 */

type Accion = 'verificar' | 'nueva-clave';
type TipoOtp = 'signup' | 'magiclink' | 'recovery';

export function leerAccionCuenta(search: string): { accion: Accion; tokenHash: string; tipo: TipoOtp } | null {
  const q = new URLSearchParams(search);
  const accion = q.get('cuenta');
  const tokenHash = q.get('token_hash');
  const tipo = q.get('type');
  if ((accion !== 'verificar' && accion !== 'nueva-clave') || !tokenHash) return null;
  if (tipo !== 'signup' && tipo !== 'magiclink' && tipo !== 'recovery') return null;
  return { accion, tokenHash, tipo };
}

const IOS = { fondo: '#F2F2F7', texto: '#000', secundario: 'rgba(60,60,67,0.6)', azul: '#007AFF', rojo: '#FF3B30' };

export function AccionCuenta({ accion, tokenHash, tipo }: { accion: Accion; tokenHash: string; tipo: TipoOtp }) {
  const [estado, setEstado] = useState<'procesando' | 'pedir-clave' | 'listo' | 'error'>('procesando');
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensajeError, setMensajeError] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
      if (!vivo) return;
      if (error) {
        setMensajeError(
          /expired|invalid/i.test(error.message)
            ? 'El enlace venció o ya se usó. Pide uno nuevo desde la pantalla de inicio de sesión.'
            : 'No se pudo validar el enlace. Pide uno nuevo desde la pantalla de inicio de sesión.',
        );
        setEstado('error');
        return;
      }
      if (accion === 'verificar') {
        await supabase.auth.signOut({ scope: 'local' });
        setEstado('listo');
      } else {
        setEstado('pedir-clave');
      }
    })();
    return () => { vivo = false; };
  }, [accion, tokenHash, tipo]);

  const guardarClave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clave.length < 8) { setMensajeError('La contraseña debe tener al menos 8 caracteres'); return; }
    if (clave !== clave2) { setMensajeError('Las contraseñas no coinciden'); return; }
    setMensajeError('');
    setGuardando(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: clave });
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'local' });
      setEstado('listo');
    } catch (err: any) {
      setMensajeError(/different from the old/i.test(err?.message || '')
        ? 'La contraseña nueva tiene que ser distinta de la anterior'
        : 'No se pudo guardar la contraseña. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const irAlInicio = () => window.location.replace('/');

  const contenedor: React.CSSProperties = {
    minHeight: '100dvh', background: IOS.fondo, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 24px)',
  };
  const columna: React.CSSProperties = { width: '100%', maxWidth: 400, textAlign: 'center' };
  const boton: React.CSSProperties = {
    width: '100%', height: 50, borderRadius: 12, border: 'none', background: IOS.azul, color: '#fff', fontSize: 17, fontWeight: 600,
  };
  const campo: React.CSSProperties = {
    flex: 1, minWidth: 0, height: 44, border: 'none', outline: 'none', background: 'transparent', fontSize: 17, color: IOS.texto, padding: 0,
  };

  if (estado === 'procesando') {
    return (
      <div style={contenedor}>
        <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: IOS.secundario }} />
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div style={contenedor}>
        <div style={columna}>
          <AlertCircle style={{ width: 52, height: 52, color: IOS.rojo, margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: 26, fontWeight: 700, color: IOS.texto, margin: '0 0 10px' }}>Enlace no válido</h1>
          <p style={{ fontSize: 16, color: IOS.secundario, lineHeight: 1.45, margin: '0 0 28px' }}>{mensajeError}</p>
          <button type="button" onClick={irAlInicio} className="boton-ios" style={boton}>Ir a iniciar sesión</button>
        </div>
      </div>
    );
  }

  if (estado === 'listo') {
    return (
      <div style={contenedor}>
        <div style={columna}>
          <CheckCircle2 style={{ width: 56, height: 56, color: '#34C759', margin: '0 auto 16px' }} />
          <h1 style={{ fontSize: 26, fontWeight: 700, color: IOS.texto, margin: '0 0 10px' }}>
            {accion === 'verificar' ? 'Correo confirmado' : 'Contraseña actualizada'}
          </h1>
          <p style={{ fontSize: 16, color: IOS.secundario, lineHeight: 1.45, margin: '0 0 28px' }}>
            {accion === 'verificar'
              ? 'Tu cuenta está activa. Ya puedes iniciar sesión en la app.'
              : 'Ya puedes iniciar sesión con tu nueva contraseña.'}
          </p>
          <button type="button" onClick={irAlInicio} className="boton-ios" style={boton}>Ir a iniciar sesión</button>
        </div>
      </div>
    );
  }

  // pedir-clave
  return (
    <div style={contenedor}>
      <form onSubmit={guardarClave} style={{ ...columna, textAlign: 'left' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: IOS.texto, margin: '0 0 8px' }}>Nueva contraseña</h1>
        <p style={{ fontSize: 15, color: IOS.secundario, margin: '0 0 24px' }}>Elige una contraseña de al menos 8 caracteres.</p>
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <input
              type={verClave ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Contraseña nueva"
              aria-label="Contraseña nueva"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoFocus
              style={campo}
            />
            <button type="button" onClick={() => setVerClave((v) => !v)} aria-label={verClave ? 'Ocultar' : 'Mostrar'}
              style={{ background: 'none', border: 'none', padding: 8, color: 'rgba(60,60,67,0.3)' }}>
              {verClave ? <EyeOff style={{ width: 20, height: 20 }} /> : <Eye style={{ width: 20, height: 20 }} />}
            </button>
          </div>
          <div style={{ height: 0.5, background: 'rgba(60,60,67,0.18)', marginLeft: 16 }} />
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <input
              type={verClave ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              aria-label="Repite la contraseña"
              value={clave2}
              onChange={(e) => setClave2(e.target.value)}
              style={campo}
            />
          </div>
        </div>
        <p style={{ fontSize: 13, color: IOS.rojo, minHeight: 18, margin: '0 16px 16px' }}>{mensajeError}</p>
        <button type="submit" disabled={guardando} className="boton-ios" style={{ ...boton, opacity: guardando ? 0.5 : undefined }}>
          {guardando ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  );
}
