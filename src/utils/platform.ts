/**
 * Detección de la plataforma de ejecución.
 *
 * La MISMA base de código corre en tres sitios: la PWA en el navegador, y el
 * contenedor nativo de Capacitor en iOS y Android. Algunas cosas tienen que
 * comportarse distinto en el contenedor (el service worker, el botón atrás de
 * Android, las áreas seguras), y este módulo es el único lugar que decide
 * dónde estamos — para no repetir el chequeo con criterios distintos.
 *
 * No importa `@capacitor/core` a propósito: en el navegador ese import es peso
 * muerto, y lo único que hace falta es leer el global que Capacitor inyecta en
 * el WebView. Así la PWA no carga nada extra.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function cap(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** ¿Corremos dentro del contenedor nativo (iOS/Android), no en el navegador? */
export function isNativePlatform(): boolean {
  const c = cap();
  return Boolean(c?.isNativePlatform?.());
}

/** 'ios' | 'android' | 'web'. 'web' cubre tanto la PWA como el navegador normal. */
export function getPlatform(): 'ios' | 'android' | 'web' {
  const p = cap()?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
}

export function isAndroid(): boolean {
  return getPlatform() === 'android';
}

export function isIOS(): boolean {
  return getPlatform() === 'ios';
}
