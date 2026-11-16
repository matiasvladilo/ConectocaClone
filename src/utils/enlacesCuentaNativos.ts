/**
 * Enlaces de los correos de cuenta dentro de la app nativa.
 *
 * En el navegador el enlace llega por window.location.search y main.tsx lo lee
 * directo. En la app empaquetada no: el WebView siempre arranca en
 * capacitor://localhost (iOS) / https://localhost (Android), y la URL del
 * enlace llega aparte, por @capacitor/app:
 *  - en frío (la app estaba cerrada): App.getLaunchUrl();
 *  - en caliente (la app estaba abierta o en segundo plano): evento appUrlOpen.
 *
 * Esto solo pasa si el sistema decide abrir la app con el enlace: Universal
 * Links en iOS / App Links en Android (ver docs/enlaces-app.md), o el esquema
 * propio `info.laoca.app://`. Sin eso el enlace abre el navegador, como hasta
 * ahora, y todo sigue funcionando por la vía web.
 *
 * En el navegador estas funciones no hacen nada y no importan ningún plugin.
 */

import { isNativePlatform } from './platform.ts';
import { accionDesdeUrl, type DatosAccionCuenta } from './accionCuenta.ts';

// getLaunchUrl() sigue devolviendo la misma URL después de recargar el WebView
// (AccionCuenta vuelve al inicio con window.location.replace('/')). Sin esto,
// al volver al inicio se reabriría el enlace ya usado y mostraría "Enlace no
// válido". sessionStorage sobrevive a esa recarga y se borra al cerrar la app.
const CLAVE_ATENDIDO = 'cuenta:enlace-atendido';

function yaAtendido(datos: DatosAccionCuenta): boolean {
  try {
    return sessionStorage.getItem(CLAVE_ATENDIDO) === datos.tokenHash;
  } catch {
    return false;
  }
}

export function marcarEnlaceAtendido(datos: DatosAccionCuenta): void {
  try {
    sessionStorage.setItem(CLAVE_ATENDIDO, datos.tokenHash);
  } catch { /* sin storage: en el peor caso se ve "Enlace no válido" */ }
}

function nuevo(datos: DatosAccionCuenta | null): DatosAccionCuenta | null {
  return datos && !yaAtendido(datos) ? datos : null;
}

/** El enlace con el que se abrió la app en frío, si es de cuenta y no se usó. */
export async function accionDeArranqueNativo(): Promise<DatosAccionCuenta | null> {
  if (!isNativePlatform()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const lanzamiento = await App.getLaunchUrl();
    return lanzamiento?.url ? nuevo(accionDesdeUrl(lanzamiento.url)) : null;
  } catch {
    return null;
  }
}

/**
 * Avisa cada vez que la app (ya abierta) recibe un enlace de cuenta.
 * Devuelve una función para dejar de escuchar.
 */
export function escucharEnlacesCuenta(alRecibir: (datos: DatosAccionCuenta) => void): () => void {
  if (!isNativePlatform()) return () => {};
  let cancelado = false;
  let quitar: (() => void) | undefined;
  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        const datos = nuevo(accionDesdeUrl(url));
        if (datos) alRecibir(datos);
      });
      if (cancelado) void handle.remove();
      else quitar = () => void handle.remove();
    } catch { /* plugin ausente: los enlaces abren el navegador */ }
  })();
  return () => {
    cancelado = true;
    quitar?.();
  };
}
