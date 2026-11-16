# Enlaces de los correos de cuenta que abren la app

Los correos de **verificar correo** y **recuperar contraseña** llevan un enlace
`https://<dominio>/?cuenta=verificar|nueva-clave&token_hash=…&type=…`
(armado en `supabase/functions/make-server-6d979413/correosCuenta.ts`; el
dominio sale del secreto `CUENTA_PUBLIC_URL`, o de `APP_PUBLIC_URL` si no está).

- **Sin lo de esta guía:** en el teléfono el enlace abre el navegador, la acción
  se completa en la web y la persona vuelve a la app a iniciar sesión.
- **Con lo de esta guía:** el enlace abre la app directo en la pantalla de
  verificar o de clave nueva. Si la app no está instalada, sigue abriendo la web.

## Ya está hecho (código)

| Pieza | Dónde |
|---|---|
| Leer la acción desde la URL completa | `src/utils/accionCuenta.ts` (+ test) |
| Escuchar el enlace en la app (en frío con `App.getLaunchUrl()`, en caliente con `appUrlOpen`) y mostrar `AccionCuenta` | `src/utils/enlacesCuentaNativos.ts`, `src/main.tsx` |
| No reabrir un enlace ya usado al volver al inicio | `sessionStorage` en `enlacesCuentaNativos.ts` |
| Android App Links, solo para la raíz `/` (los QR de `/opina` y `/reclamos` siguen abriendo la web) | `android/app/src/main/AndroidManifest.xml` |
| Dominio de los App Links | `android/app/build.gradle` → `manifestPlaceholders.appLinksHost` |
| Esquema propio `info.laoca.app://` (iOS y Android), para probar sin dominio verificado | `Info.plist`, `AndroidManifest.xml` |
| Manejadores nativos de Capacitor | ya estaban en `ios/App/App/AppDelegate.swift` |

## Falta (necesita cuentas o decisiones)

### 1. Dominio definitivo

Hoy el dominio configurado es `conectocadev.netlify.app` (el de la PWA). Tiene
que ser el mismo en tres lugares:

- secreto `CUENTA_PUBLIC_URL` del Edge Function (hoy apunta al borrador
  `cuenta-prueba--conectocadev.netlify.app`; al publicar el front nuevo en la
  PWA se borra el secreto y queda `APP_PUBLIC_URL`);
- `appLinksHost` en `android/app/build.gradle`;
- el entitlement de iOS (paso 2).

Universal Links y App Links funcionan por **host exacto**: el borrador
`cuenta-prueba--…` no abre la app a menos que también se declare.

### 2. iOS — Universal Links (necesita la cuenta de Apple Developer)

1. En Xcode → target App → Signing & Capabilities → **+ Associated Domains** →
   `applinks:conectocadev.netlify.app`. Esto crea `App.entitlements`.
2. Anotar el **Team ID** (developer.apple.com → Membership).
3. Publicar en el sitio `/.well-known/apple-app-site-association` (sin
   extensión), con `TEAMID` reemplazado:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.info.laoca.app"],
        "components": [
          { "/": "/", "?": { "cuenta": "?*" }, "comment": "Correos de cuenta" }
        ]
      }
    ]
  }
}
```

### 3. Android — App Links (necesita la llave de firma)

1. Crear la keystore de release (`android/keystore.properties`, ver
   `keystore.properties.example`). Si se usa Play App Signing, la huella es la
   de la llave de **Google Play** (Play Console → Integridad de la app).
2. Sacar la huella SHA-256:
   `keytool -list -v -keystore <archivo>.jks -alias <alias>`.
3. Publicar `/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "info.laoca.app",
      "sha256_cert_fingerprints": ["AA:BB:…:FF"]
    }
  }
]
```

### 4. Publicar los dos archivos en Netlify

Ponerlos en `public/.well-known/` (Vite los copia a `build/`) y agregar en
`netlify.toml`, para que iOS acepte el archivo:

```toml
[[headers]]
  for = "/.well-known/apple-app-site-association"
  [headers.values]
    Content-Type = "application/json"
```

No se suben antes porque llevan valores que todavía no existen (Team ID y
huella). Van en el mismo deploy que la PWA nueva, o en un deploy aparte del
dominio que se elija.

## Probar

- **Esquema propio (sin cuentas), simulador iOS:**
  `xcrun simctl openurl booted 'info.laoca.app://cuenta?cuenta=verificar&token_hash=x&type=signup'`
  → la app abre la pantalla de verificar (con un token falso muestra
  "Enlace no válido", que es lo esperado).
- **Android:** `adb shell am start -a android.intent.action.VIEW -d '<url>'`.
- **Universal / App Links reales:** solo con la app firmada por la cuenta y los
  archivos publicados. En Android se revisa con
  `adb shell pm get-app-links info.laoca.app`.
