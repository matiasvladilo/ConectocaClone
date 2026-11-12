import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor para empaquetar la PWA como app nativa iOS/Android
 * sin tocar el código web: una sola base de código, la PWA sigue publicándose
 * en Netlify igual que antes.
 *
 * ── appId ──────────────────────────────────────────────────────────────────
 * `info.laoca.app` — identificador reverse-DNS (Bundle ID en App Store,
 * applicationId en Google Play), armado con el dominio propio laoca.info.
 * Decidido el 2026-11-12 antes de crear la ficha en App Store Connect.
 *
 * Es DEFINITIVO una vez publicada la app: cambiarlo después obliga a crear
 * una ficha nueva y se pierden reseñas e instalaciones.
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
  appId: 'info.laoca.app',
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
