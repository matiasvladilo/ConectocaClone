/**
 * Lectura de los enlaces de los correos de cuenta
 * (?cuenta=verificar|nueva-clave&token_hash=...&type=...), que arma el Edge
 * Function en correosCuenta.ts.
 *
 * Vive aparte de AccionCuenta.tsx para poder probarlo sin React y para que la
 * app nativa lo use con la URL completa con la que se abre (Universal Link /
 * App Link, o el esquema propio `info.laoca.app://`).
 */

export type Accion = 'verificar' | 'nueva-clave';
export type TipoOtp = 'signup' | 'magiclink' | 'recovery';
export type DatosAccionCuenta = { accion: Accion; tokenHash: string; tipo: TipoOtp };

export function leerAccionCuenta(search: string): DatosAccionCuenta | null {
  const q = new URLSearchParams(search);
  const accion = q.get('cuenta');
  const tokenHash = q.get('token_hash');
  const tipo = q.get('type');
  if ((accion !== 'verificar' && accion !== 'nueva-clave') || !tokenHash) return null;
  if (tipo !== 'signup' && tipo !== 'magiclink' && tipo !== 'recovery') return null;
  return { accion, tokenHash, tipo };
}

/** Igual que leerAccionCuenta, pero a partir de una URL completa. */
export function accionDesdeUrl(url: string): DatosAccionCuenta | null {
  try {
    return leerAccionCuenta(new URL(url).search);
  } catch {
    return null;
  }
}
