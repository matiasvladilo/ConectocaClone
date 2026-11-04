# Informe final — Endurecimiento y preparación para stores

Rama `seguridad/endurecimiento-pre-stores`. Tres commits sobre `main`.

Documentos de respaldo:
- `docs/SECURITY_AUDIT.md` — auditoría completa con evidencia y severidades.
- `docs/PUBLICACION_MOVIL.md` — guía reproducible de build y publicación.

---

## Lo que se hizo, por fase

**Fase 1 — Auditoría.** Se revisó el repo, las dependencias, la autenticación,
los roles, las Edge Functions, las políticas RLS reales (consultadas en vivo, no
asumidas) y la configuración. 3 críticas, 8 altas, 9 medias, 6 bajas. El patrón
de fondo: la autorización vivía en el Edge Function, pero la API REST de Supabase
estaba expuesta en paralelo sin equivalente. Cadena de ataque verificada de punta
a punta: de la clave anónima pública a admin del negocio real.

**Fase 2 — Correcciones.** Autorización centralizada en un módulo con matriz
rol→permiso única (19 pruebas nuevas). Cerrados todos los cruces entre negocios
(IDOR), la escalada de rol en el registro, las credenciales demo, el CORS
abierto, la validación de imágenes y el fallback a un proyecto abandonado.
Dependencias: **de 14 vulnerabilidades (1 crítica) a 0.** Migraciones SQL
entregadas versionadas; `_c` y `_d` (C-02, C-03, A-08) **aplicadas a producción**
con verificación empírica; `_a` y `_b` (C-01) pendientes de aplicar junto con el
deploy del Edge Function.

**Fase 3 — Capacitor.** Capacitor 7 (estable). `ios/` y `android/` generados,
`capacitor.config.ts` con `webDir: build`, App ID `cl.conectoca.app` documentado.
iOS con Swift Package Manager (sin CocoaPods, que el Ruby del sistema no soporta).
Scripts de build/sync/open. La PWA sigue intacta.

**Fase 4 — Compatibilidad móvil.** Exportación de PDF/Excel/PNG adaptada al
WebView (antes el "exportar" no hacía nada en nativo). Botón atrás de Android,
splash, barra de estado, teclado, safe areas, permisos de cámara. Detección de
plataforma centralizada; todo es no-op en la PWA.

**Fase 5 — Calidad y publicación.** Build, tests y audit en verde. Guía de
publicación reproducible. iOS verificado corriendo en el simulador.

---

## Funcionalidades verificadas

| Qué | Cómo | Resultado |
|---|---|---|
| Suite de pruebas | `npm test` | 366/366 |
| Build web | `npm run build` | OK |
| Typecheck | `tsc --noEmit` | sin errores nuevos (4 previos en `src/_redirects`) |
| Dependencias | `npm audit` | 0 vulnerabilidades (eran 14) |
| C-02 cerrado en prod | PATCH role sobre profiles | 200 → **403** |
| C-03 cerrado en prod | GET backups con anon key | 200 → **404** |
| A-08 cerrado en prod | GET invite_code por PostgREST | devolvía → **403** |
| Sin regresión en prod | /profile, /products (468), /orders (6003) | OK |
| PWA en navegador | preview + consola | sin errores; camino web idéntico |
| iOS nativo | build SPM + simulador iPhone 17 | compila y corre; splash, safe areas, teclado, login desde Supabase |
| `cap doctor` | ambas plataformas | OK |

## Riesgos y pendientes

**Backend (del dueño, tocan producción):**
- Aplicar `20261103_a` y `_b` (C-01) **con** `supabase functions deploy
  make-server-6d979413`. Hoy `create_order_with_stock`/`create_order_kv` siguen
  ejecutables por `anon` — es la única crítica aún abierta. Ningún cambio de
  código del Edge Function de la Fase 2 surte efecto hasta ese deploy.
- Rotar/eliminar cuentas `@demo.com` (A-01).
- Activar protección de contraseñas filtradas en Auth (M-06).

**Publicación (del dueño, requieren cuentas/hardware):**
- Reemplazar íconos y splash placeholder por la marca La Oca.
- Cuenta Apple Developer y Google Play Console; fichas, capturas, política de
  privacidad.
- Compilar `.aab` de Android (este entorno no tenía JDK/Android SDK).
- Firma de código y primera subida a cada tienda.
- Prueba en dispositivo físico.

**Mejoras futuras anotadas en código:**
- URL firmada de imágenes de producto a un año (M-04): acortarla requiere guardar
  `storage_path` y firmar a demanda. Documentado en el Edge Function.
- Versionado nativo derivado de `package.json` en vez de a mano.

## Reglas respetadas

- La PWA publicada no se rompió (verificado en el navegador).
- No se expusieron credenciales ni claves en ningún informe.
- No se reescribió lo que ya funcionaba: los cambios son incrementales.
- Producción solo se modificó con autorización explícita (migraciones `_c`/`_d`),
  y nunca de forma destructiva.
- No se afirmó ninguna prueba que no se haya ejecutado; lo no verificado está
  listado como tal.
