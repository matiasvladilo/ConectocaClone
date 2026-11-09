# Material para las tiendas (App Store / Google Play)

Capturas e íconos para las fichas de las tiendas, más el versionado de las apps.

## ⚠️ Datos reales en las capturas

Las capturas de `screenshots/` se tomaron con la cuenta real de administración:
muestran **nombres de locales** (LA OCA LA REINA, LA OCA BILBAO…), **montos de
ventas reales** (ingresos, valor de inventario) y el **nombre/email del dueño**.

Antes de subirlas a una ficha pública, decidí si:
- las publicás tal cual (son datos del propio negocio, no de clientes externos), o
- las volvés a tomar con una cuenta demo / datos de ejemplo.

Para re-capturar, seguí "Cómo regenerar las capturas" más abajo.

## Versionado

Fuente de verdad: el campo `version` de `package.json` (el *marketing version*).

| Dónde | Clave | Valor inicial |
|-------|-------|---------------|
| package.json | `version` | `1.0.0` |
| Android (`android/app/build.gradle`) | `versionName` / `versionCode` | `1.0.0` / `1` |
| iOS (`project.pbxproj`) | `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | `1.0.0` / `1` |

`versionName`/`MARKETING_VERSION` es lo que ve el usuario. `versionCode`/
`CURRENT_PROJECT_VERSION` es el *build number* interno que **siempre** debe subir
en cada subida a la tienda, aunque el marketing version no cambie.

**Sincronizar el marketing version** (tras editar `package.json`):

```bash
npm run version:sync
```

**Release** (sincroniza y sube el build number +1 en ambas plataformas):

```bash
npm version patch      # 1.0.0 -> 1.0.1 en package.json (+ git tag)
npm run version:release # escribe versionName/MARKETING_VERSION y sube el build
```

## Íconos de tienda

- `icon-1024.png` (1024×1024, sin transparencia) — ícono general / App Store.
  En iOS el ícono real lo toma el build desde `AppIcon` (generado con
  `npm run generate:assets`); este archivo es por si una ficha lo pide suelto.
- `icon-play-512.png` (512×512, sin transparencia) — ícono de Google Play Store.

Se derivan del ícono de marca (pato sobre `#0c3c84`). Para regenerarlos, primero
`npm run generate:assets` y luego copiar/redimensionar desde
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`.

Falta (diseño, no automatizable acá):
- **Google Play — gráfico de funciones**: 1024×500 PNG/JPG.

## Capturas (`screenshots/`)

Tomadas en iPhone 17 (1206×2622, 6.3"):

| Archivo | Pantalla |
|---------|----------|
| `01-inicio.png` | Panel de inicio / dashboard de administración |
| `02-distribuidora.png` | Distribuidora — stock y reposición |
| `03-analiticas.png` | Dashboard de analíticas |
| `04-despacho.png` | Panel de despacho (vista KDS) |

### Tamaños que exige cada tienda

**App Store (obligatorias, al menos un set de iPhone):**
- 6.9": **1320×2868** (o 2868×1320) — iPhone 16/17 Pro Max.
- 6.5": **1242×2688** o **1284×2778** — iPhone 11 Pro Max / XS Max.
- 1 a 10 capturas por tamaño. Apple reescala a las pantallas más chicas.

> Las capturas actuales (1206×2622, 6.3") sirven directo para Google Play, pero
> **no** son un tamaño aceptado por App Store Connect. Para el set de App Store,
> re-capturá en un simulador **iPhone 17 Pro Max** (6.9", 1320×2868) con los
> mismos pasos.

**Google Play (teléfono):**
- 2 a 8 capturas. Lado mínimo 320 px, máximo 3840 px, ratio máx 2:1.
- Las actuales (1206×2622) cumplen sin cambios.
- Ícono: **512×512** (`icon-play-512.png`). Gráfico de funciones: **1024×500**.

### Cómo regenerar las capturas

Con la app corriendo en el simulador, navegá a cada pantalla y guardá el PNG
apuntando al **UDID del iPhone** (no uses `booted` si hay más de un simulador
abierto — agarra el equivocado):

```bash
# UDID del simulador:  xcrun simctl list devices booted
xcrun simctl io <UDID-iPhone> screenshot docs/store-assets/screenshots/01-inicio.png
```

Para el set 6.9" de App Store, booteá un iPhone 17 Pro Max, instalá el build
(`npm run cap:sync` + build desde Xcode) y repetí.
