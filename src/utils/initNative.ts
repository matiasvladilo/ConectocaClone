/**
 * Arranque específico del contenedor nativo (Capacitor).
 *
 * Todo lo que solo tiene sentido dentro de la app empaquetada —ocultar la
 * splash cuando la UI ya montó, el botón atrás de Android, la barra de estado,
 * el teclado, las áreas seguras— vive acá, detrás de un único punto de entrada.
 * En el navegador `initNative()` no hace nada y ninguno de los plugins se
 * importa (los `await import` se evalúan solo en la rama nativa), así que la PWA
 * no carga peso de más.
 *
 * Se llama desde main.tsx, después de montar React.
 */

import { isNativePlatform, getPlatform } from './platform.ts';

// true en cuanto alguna pantalla fija el estilo de la barra de estado con
// estiloBarraDeEstado(); initNative() corre después de montar React y no debe
// pisarlo con el default.
let estiloPedido = false;

export async function initNative(): Promise<void> {
  if (!isNativePlatform()) return;

  // Marca para el CSS de áreas seguras (src/styles/globals.css, bloque
  // `.cap-native`). Se pone cuanto antes para que el primer paint ya respete
  // los insets.
  document.documentElement.classList.add('cap-native');
  document.documentElement.classList.add(`cap-${getPlatform()}`);

  // Cada bloque va en su propio try/catch: que falte o falle un plugin no debe
  // tumbar el arranque de la app. Un plugin ausente es un no-op, no un crash.

  // ── Splash screen ──────────────────────────────────────────────────────────
  // launchAutoHide está en false (capacitor.config.ts): la ocultamos acá, recién
  // cuando la UI ya está montada, para que no se vea el salto de una pantalla en
  // blanco entre la splash y la app.
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch { /* plugin ausente: la splash se oculta sola */ }

  // ── Barra de estado ────────────────────────────────────────────────────────
  // El theme de la app es azul oscuro (#0c3c84). Texto claro encima.
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Si una pantalla ya pidió su estilo (p. ej. AccionCuenta al abrir la app
    // desde un enlace), no se lo pisamos con el default.
    if (!estiloPedido) await StatusBar.setStyle({ style: Style.Dark }); // 'Dark' = contenido claro
    if (getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0c3c84' });
    }
  } catch { /* plugin ausente */ }

  // ── Teclado ────────────────────────────────────────────────────────────────
  // Al abrir el teclado, agrega al <html> la clase `cap-keyboard-open` con la
  // altura real como custom property, para que el CSS pueda levantar barras
  // fijas al fondo (si las hubiera) y no queden tapadas.
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty(
        '--cap-keyboard-height',
        `${info.keyboardHeight}px`,
      );
      document.documentElement.classList.add('cap-keyboard-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--cap-keyboard-height', '0px');
      document.documentElement.classList.remove('cap-keyboard-open');
    });
  } catch { /* plugin ausente */ }

  // El botón atrás de Android se maneja en registerAndroidBackButton(), que se
  // llama desde App.tsx porque necesita el estado de navegación de React.
}

/**
 * Cambia el color del contenido de la barra de estado (hora, batería) en la
 * app nativa. `claro` = texto blanco para fondos oscuros (el azul de marca,
 * default de la app); `oscuro` = texto negro para fondos claros, p. ej. el
 * panel "Mi cuenta". En la PWA no hace nada.
 */
export async function estiloBarraDeEstado(contenido: 'claro' | 'oscuro'): Promise<void> {
  if (!isNativePlatform()) return;
  estiloPedido = true;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style.Dark = contenido claro (texto blanco); Style.Light = contenido oscuro.
    await StatusBar.setStyle({ style: contenido === 'claro' ? Style.Dark : Style.Light });
  } catch {
    // Sin plugin o plataforma sin soporte: no es crítico.
  }
}
