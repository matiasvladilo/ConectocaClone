import { useEffect } from 'react';
import { isAndroid } from './platform.ts';

/**
 * Botón atrás físico/gestual de Android.
 *
 * Android dispara un evento de hardware que, sin manejar, cierra la app de
 * golpe desde cualquier pantalla — un comportamiento que en una app de gestión
 * se siente como una pérdida de trabajo. Este hook lo intercepta:
 *
 *   - Si hay a dónde volver (`onBack` definido para la pantalla actual), navega
 *     hacia atrás dentro de la app, como el botón "volver" de la UI.
 *   - Si ya está en la pantalla raíz (`canExit`), deja salir: minimiza la app,
 *     que es lo que el usuario de Android espera del back en la pantalla inicial.
 *
 * Solo hace algo en Android nativo. En iOS no hay botón atrás de hardware, y en
 * el navegador el back del navegador ya funciona por su cuenta.
 *
 * El listener se registra con `await import` para no cargar @capacitor/app en la
 * PWA, y se limpia al desmontar o al cambiar las dependencias.
 */
export function useAndroidBackButton(options: {
  /** Qué hacer para "ir atrás". Null/undefined = esta pantalla no retrocede. */
  onBack?: (() => void) | null;
  /** True si estamos en la raíz: el back debe salir/minimizar la app. */
  canExit: boolean;
}): void {
  const { onBack, canExit } = options;

  useEffect(() => {
    if (!isAndroid()) return;

    let remove: (() => void) | undefined;
    let cancelado = false;

    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', () => {
        if (onBack) {
          onBack();
        } else if (canExit) {
          // minimizeApp manda la app al fondo en vez de matarla (exitApp),
          // que es el gesto correcto del back en la pantalla raíz: la sesión
          // y el estado quedan vivos al volver.
          App.minimizeApp();
        }
        // Si no hay onBack y no se puede salir, se ignora: mejor no hacer nada
        // que cerrar la app desde una pantalla intermedia.
      });

      if (cancelado) {
        handle.remove();
      } else {
        remove = () => handle.remove();
      }
    })();

    return () => {
      cancelado = true;
      remove?.();
    };
  }, [onBack, canExit]);
}
