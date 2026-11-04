import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor para empaquetar la PWA como app nativa iOS/Android
 * sin tocar el código web: una sola base de código, la PWA sigue publicándose
 * en Netlify igual que antes.
 *
 * ── appId ──────────────────────────────────────────────────────────────────
 * `cl.conectoca.app` — identificador reverse-DNS, el formato que exigen App
 * Store (Bundle ID) y Google Play (applicationId).
 *   - `cl`        el negocio opera en Chile (index.html declara lang="es-CL").
 *   - `conectoca` el nombre del producto.
 *   - `app`       segmento final; el id debe tener al menos dos puntos.
 *
 * DECISIÓN QUE HAY QUE CONFIRMAR ANTES DE PUBLICAR: este id es definitivo una
 * vez que la app está en las tiendas — no se puede cambiar sin crear una ficha
 * nueva y perder reseñas e instalaciones. Si existe un dominio propio (p. ej.
 * conectoca.cl), lo idiomático sería `cl.conectoca.app` igual, pero conviene
 * registrarlo a nombre de ese dominio. Cambiarlo ahora es `npx cap add` de
 * nuevo; cambiarlo después de publicar, no.
 *
 * ── appName ────────────────────────────────────────────────────────────────
 * "La Oca" — es el nombre que ya usa la PWA (index.html <title>, manifest).
 *
 * ── webDir ─────────────────────────────────────────────────────────────────
 * "build" — la salida real de Vite (vite.config.ts: build.outDir='build').
 * Capacitor copia ESTE directorio dentro del binario, así que hay que correr
 * `npm run build` antes de `npx cap sync`. El script `cap:sync` lo encadena.
 */
const config: CapacitorConfig = {
  appId: 'cl.conectoca.app',
  appName: 'La Oca',
  webDir: 'build',

  // Esquema del servidor local embebido. En iOS el default ya es
  // `capacitor://localhost`; en Android se fija https para que el origen sea
  // `https://localhost` y no `http://localhost`. Esto importa por dos motivos:
  //  1. El service worker y varias APIs del navegador (cámara, etc.) exigen un
  //     contexto seguro; `https` lo garantiza dentro del contenedor.
  //  2. El CORS del Edge Function (corregido en la Fase 2, M-01) tiene en su
  //     allowlist `capacitor://localhost` y `http://localhost`. Ver nota abajo.
  server: {
    androidScheme: 'https',
  },

  ios: {
    // Swift Package Manager en vez de CocoaPods para resolver las dependencias
    // nativas. SPM viene integrado en Xcode (no hace falta instalar ni mantener
    // la toolchain de Ruby/CocoaPods, que en máquinas con el Ruby del sistema
    // —2.6— ni siquiera instala). Capacitor 7 lo soporta de forma estable.
    // Si en algún equipo se prefiere CocoaPods, cambiar a 'Cocoapods' y correr
    // `npx cap add ios` de nuevo con `pod` disponible en el PATH.
    packageManager: 'SPM',
  },

  plugins: {
    SplashScreen: {
      // La splash se oculta por código cuando la app terminó de montar
      // (src/main.tsx), no por un timer fijo: así no parpadea en arranques
      // rápidos ni se corta en los lentos.
      launchAutoHide: false,
      backgroundColor: '#0c3c84', // theme-color de la PWA (index.html)
      showSpinner: false,
    },
    Keyboard: {
      // El layout se ajusta con el teclado sin tapar el campo con foco.
      resize: 'native' as any,
    },
  },
};

export default config;
