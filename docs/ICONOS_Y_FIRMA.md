# Íconos / Splash y firma de Android

## Íconos y splash (iOS + Android)

Se generan con [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets)
a partir de un solo logo, sobre el azul de marca (`#0c3c84`, el mismo
`theme-color` de la PWA).

**Fuente:** `assets/logo.png` y `assets/logo-dark.png` (1024×1024, con
transparencia). Derivados de `src/assets/icono.png`. Para cambiar el ícono,
reemplazá estos dos archivos (mismo tamaño) y regenerá.

**Regenerar:**

```bash
npm run generate:assets
```

El script pasa `--ios --android` a propósito: **no** toca los íconos de la PWA
(`public/icon-192.png`, `public/icon-512.png` y `public/manifest.json`), que
tienen su propio pipeline. Genera íconos de app, adaptive icons de Android y
splash (claro/oscuro) para iOS y Android.

Tras regenerar, recompilá la app nativa para ver los cambios (los íconos se
hornean en el binario; `cap copy` no alcanza).

## Firma de release de Android (`signingConfigs`)

`android/app/build.gradle` firma el build de release leyendo las credenciales
de `android/keystore.properties`, que **no** está en el repo. Si el archivo no
existe (CI sin secretos, clon recién hecho), la app igual compila: el release
simplemente queda **sin firmar**.

### Puesta a punto (una sola vez)

1. Crear la keystore (elegí vos las contraseñas; guardalas en un gestor de
   secretos — si las perdés no podés volver a publicar actualizaciones):

   ```bash
   keytool -genkey -v -keystore android/app/conectoca-release.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias conectoca
   ```

2. Copiar la plantilla y completarla con los valores reales:

   ```bash
   cp android/keystore.properties.example android/keystore.properties
   ```

3. Editar `android/keystore.properties` con `storeFile`, `storePassword`,
   `keyAlias` y `keyPassword`.

`keystore.properties` y `*.jks` están en `.gitignore`: nunca se commitean. El
`.example` sí se versiona como plantilla.

### Build firmado

```bash
cd android && ./gradlew bundleRelease   # .aab para Google Play
# o ./gradlew assembleRelease            # .apk
```
