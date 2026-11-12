# Publicación móvil — Conectoca (La Oca)

Guía reproducible para compilar, probar y publicar la app en App Store y Google
Play. La PWA en Netlify **no cambia**: es la misma base de código, empaquetada
con Capacitor.

> Estado al 2026-11-03: `ios/` y `android/` generados y funcionando. La app
> **compila y corre en el simulador de iPhone** (verificado abajo). Falta lo que
> solo se puede hacer con cuentas y hardware del dueño: firma, iconos de marca,
> y la primera subida a cada tienda.

---

## 1. Identidad de la app

| Dato | Valor | Dónde se cambia |
|---|---|---|
| Nombre visible | **La Oca** | `capacitor.config.ts` (`appName`), ya propagado |
| App ID / Bundle ID | **`info.laoca.app`** | `capacitor.config.ts` (`appId`), iOS `project.pbxproj`, Android `build.gradle` |
| Versión | 0.1.0 | `package.json`; ver §6 para versionado nativo |

**El App ID es definitivo una vez publicado** (no se puede cambiar sin crear una
ficha nueva y perder reseñas/instalaciones). Se decidió `info.laoca.app` el
2026-11-12, a partir del dominio propio laoca.info (antes era `cl.conectoca.app`,
que no correspondía a ningún dominio registrado).

---

## 2. Entorno necesario

| Herramienta | Versión usada | Para |
|---|---|---|
| Node | 24.x | build web y CLI de Capacitor |
| Capacitor | 7.6.10 | puente nativo |
| Xcode | 26.x | compilar iOS (incluye Swift Package Manager) |
| Android Studio + JDK 17 | — | compilar Android |
| Android SDK | compile/target 35, min 23 | — |

**iOS usa Swift Package Manager, NO CocoaPods.** El Ruby del sistema de macOS
(2.6) no soporta CocoaPods moderno. SPM viene integrado en Xcode y no necesita
instalar nada extra — Xcode resuelve los paquetes solo al abrir o compilar. Si
en algún equipo se prefiere CocoaPods, cambiar `ios.packageManager` a
`'Cocoapods'` en `capacitor.config.ts` y regenerar `ios/` con CocoaPods en el
PATH.

> **Obstáculo documentado (Android):** este entorno de desarrollo no tenía Java
> ni Android SDK, así que `android/` se generó y se validó con `cap doctor`
> ("Android looking great!"), pero **no se compiló un APK/AAB acá**. Los pasos de
> §4 son los estándar de Capacitor/Gradle y se ejecutan en una máquina con
> Android Studio instalado.

---

## 3. Flujo de build (ambas plataformas)

El paso que no hay que olvidar: **el bundle web se copia dentro del binario
nativo**, así que siempre hay que compilar la web antes de sincronizar. Los
scripts de `package.json` lo encadenan:

```bash
npm run cap:sync      # build web + copia a ios/ y android/ + actualiza plugins
npm run cap:ios       # cap:sync + abre Xcode
npm run cap:android   # cap:sync + abre Android Studio
npm run cap:doctor    # diagnóstico del entorno nativo
```

`cap:sync` por dentro: `npm run build` (Vite → `build/`) y `npx cap sync`.

Variables de entorno: el build web toma `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` y `VITE_APP_PUBLIC_URL` del `.env.local` (las mismas que
usa Netlify). Sin ellas el build **falla en el arranque a propósito** (ya no hay
fallback a un proyecto viejo — ver auditoría M-05). Asegurarse de tener
`.env.local` antes de `cap:sync`.

---

## 4. Android — del código al .aab

```bash
# 1. Sincronizar el bundle web
npm run cap:sync

# 2. Abrir el proyecto en Android Studio
npx cap open android

# 3. En Android Studio: Build > Generate Signed Bundle / APK > Android App Bundle
#    - Crear un keystore la primera vez y GUARDARLO (sin él no se puede volver a
#      actualizar la app nunca más). NO versionar el keystore en git — ya está
#      en .gitignore.
#    - El .aab resultante es lo que se sube a Google Play Console.
```

Compilación por línea de comandos (equivalente, sin abrir el IDE):

```bash
cd android
./gradlew bundleRelease     # genera app/build/outputs/bundle/release/app-release.aab
```

La firma por línea de comandos requiere configurar `signingConfigs` en
`android/app/build.gradle` con el keystore; documentarlo aparte cuando exista el
keystore.

---

## 5. iOS — del código al build de App Store

```bash
# 1. Sincronizar el bundle web
npm run cap:sync

# 2. Abrir en Xcode
npx cap open ios

# 3. En Xcode:
#    - Signing & Capabilities: elegir el Team (requiere cuenta Apple Developer,
#      USD 99/año). Xcode gestiona el certificado y el provisioning.
#    - Seleccionar "Any iOS Device (arm64)" como destino.
#    - Product > Archive. Al terminar se abre el Organizer.
#    - Distribute App > App Store Connect > Upload.
```

**Verificado en este proyecto** (sin cuenta de desarrollador, build de simulador
sin firma):

```bash
cd ios/App
xcodebuild -project App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ./DerivedData CODE_SIGNING_ALLOWED=NO build
# => ** BUILD SUCCEEDED **  (SPM resuelve los 8 plugins sin CocoaPods)
```

La app arranca en el simulador, oculta la splash, respeta las áreas seguras y
carga el login desde Supabase (ver §8).

---

## 6. Versionado para las tiendas

Cada subida necesita un número de build mayor al anterior.

- **iOS**: en Xcode, target App > General: *Version* (CFBundleShortVersionString,
  visible al usuario, p. ej. `1.0.0`) y *Build* (CFBundleVersion, entero que
  sube en cada upload).
- **Android**: `android/app/build.gradle` → `versionName` (visible) y
  `versionCode` (entero que sube en cada upload).

Conviene derivar ambos de `package.json` para no desincronizar. Hoy se editan a
mano; automatizarlo es una mejora futura.

---

## 7. Pendientes antes de publicar (requieren al dueño)

Ninguno es código: son cuentas, credenciales y activos de marca.

### Íconos y splash
Hoy `ios/` y `android/` tienen los **íconos placeholder de Capacitor** (el logo
azul que se vio en el primer arranque). Reemplazarlos con el logo de La Oca:

```bash
npm i -D @capacitor/assets
# Colocar en resources/: icon.png (1024x1024) y splash.png (2732x2732)
npx capacitor-assets generate   # genera todos los tamaños para iOS y Android
```
Hay un logo en `public/icon-512.png` y `src/assets/logo.png` que sirven de base,
pero conviene un maestro 1024×1024 limpio.

### Cuentas y fichas de tienda
- **Apple Developer Program** (USD 99/año) → certificados, App Store Connect.
- **Google Play Console** (USD 25 único) → keystore, ficha.
- Para cada tienda: descripción, capturas (varios tamaños), política de
  privacidad (URL pública — obligatoria porque la app pide cámara), categoría,
  clasificación de contenido.

### Privacidad (obligatorio)
Ambas tiendas piden declarar qué datos se recogen. Conectoca maneja: email y
nombre (cuenta), datos de pedidos y de negocio. Y pide **permiso de cámara**
(escáner de códigos), ya declarado en `Info.plist`
(`NSCameraUsageDescription`) y `AndroidManifest.xml` (`CAMERA`). La ficha debe
reflejarlo.

### Seguridad del backend (de la auditoría, ver `SECURITY_AUDIT.md`)
Antes de exponer la app a más usuarios:
- Aplicar las migraciones `20261103_a` y `_b` (C-01) **junto con**
  `supabase functions deploy make-server-6d979413`. Las migraciones `_c` y `_d`
  (C-02/C-03) **ya se aplicaron**.
- Rotar/eliminar las cuentas `@demo.com` (A-01).
- Activar "leaked password protection" en Supabase Auth (M-06).

---

## 8. Qué se verificó y qué no

**Verificado:**
- `npm run build`, `npm test` (366/366), typecheck y `npm audit` (0 vulns).
- `cap doctor`: iOS y Android OK.
- iOS compila con SPM (`BUILD SUCCEEDED`) y **corre en el simulador de iPhone**:
  splash que se oculta sola al montar la UI, barra de estado con el azul del
  theme, contenido respetando el notch, teclado que empuja el formulario sin
  taparlo, login cargado desde Supabase.
- La PWA en el navegador sigue intacta (sin errores de consola; los helpers
  nativos son no-op en web).
- Login/lecturas del backend end-to-end por HTTP (profile admin, 468 productos,
  6003 pedidos).

**No verificado (requiere cuentas/hardware del dueño):**
- Compilación de Android (`.aab`): el entorno no tenía JDK ni Android SDK.
- Firma de código y subida a ninguna de las dos tiendas.
- Login tocando "Iniciar sesión" dentro del simulador: el teclado del simulador
  mapea mal el `@`. El POST de login es el mismo fetch a Supabase ya verificado
  por HTTP, así que es una limitación de la prueba, no de la app.
- Prueba en dispositivo físico.
