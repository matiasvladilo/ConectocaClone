# Hoja de ruta de publicación — App Store y Google Play

Documento **vivo**: la fuente única de verdad del camino a publicar. Cada cambio
de pre-publicación sale de acá, en vez de reaccionar pantalla por pantalla.

**Última actualización:** 2026-11-09

## Leyenda

- Estado: `[ ]` pendiente · `[~]` en progreso · `[x]` hecho
- Responsable: 👤 **Matías** (requiere tu cuenta/identidad/plata/decisión) ·
  🤖 **Claude** (lo puedo hacer yo) · 🤝 **ambos**

---

## Prioridades

| Prio | Bloque | Por qué |
|------|--------|---------|
| **P0** | Seguridad pendiente + requisitos legales (privacidad, borrado de cuenta) | Hoyos conocidos de la auditoría + gates duros de review: sin esto, rechazo seguro |
| **P1** | Builds de release firmados + cuentas de tienda + prueba en dispositivo real | Sin esto no hay binario que subir |
| **P2** | Material de fichas (textos, gráfico, formularios de datos) y envío a review | Lo último, una vez que hay binario y backend sólido |

---

## P0 — Seguridad pendiente

Ver `docs/SECURITY_AUDIT.md` para el detalle de cada hallazgo.

- [ ] 🤝 **C-01** — RPC ejecutable por anónimos (`create_order_with_stock` /
  `create_order_kv`). Las migraciones `20261103_a/_b` están listas pero **no
  aplicadas**; van **junto** con `supabase functions deploy make-server-6d979413`.
  Yo preparo, el deploy lo corrés vos (no hay CLI de Supabase local).
- [ ] 🤝 **A-01** — Cuentas demo. ⚠️ **CUIDADO CRÍTICO: algunas cuentas que
  parecen demo están EN USO real. NO se borra nada en masa.** Procedimiento:
  1. 🤖 Listar candidatas (p. ej. `@demo.com` o nombres de prueba).
  2. 🤖 Verificar actividad real de cada una (último login, pedidos/datos asociados).
  3. 👤 Confirmás vos la lista exacta antes de tocar nada.
  4. Preferir **desactivar / rotar contraseña** antes que eliminar.
  Claude no ejecuta borrados; a lo sumo deja el listado verificado para que decidas.
- [ ] 👤 **M-06** — Activar "leaked password protection" en Supabase Auth
  (Dashboard → Authentication → Policies). Es un toggle.

## P0 — Requisitos legales / de review (gates duros)

- [ ] 🤝 **Política de privacidad** con URL pública. **Obligatoria** en ambas
  tiendas (la app tiene login y maneja datos personales). Yo redacto un borrador;
  vos lo revisás, lo validás legalmente y lo publicás (p. ej. en el dominio o Netlify).
- [ ] 🤝 **Flujo de borrado de cuenta in-app**. Ambas tiendas lo **exigen** para
  apps con login. Probablemente implica **código** (pantalla + endpoint que borre
  la cuenta y sus datos). Yo lo implemento; definimos juntos qué se borra y qué se
  anonimiza.
- [ ] 👤 **Términos de uso** (recomendado, no siempre bloqueante).

## P1 — Builds de release

- [ ] 👤 **Crear la keystore real de Android** (con tu contraseña). Comando y
  pasos en `docs/ICONOS_Y_FIRMA.md`. Yo no genero credenciales.
- [ ] 👤 **Apple Developer Program** (US$99/año) — inscripción.
- [ ] 👤 **Google Play Console** (US$25 pago único) — alta.
- [ ] 🤝 **Build .aab firmado (Android)** → `cd android && ./gradlew bundleRelease`.
  Requiere la keystore y Java/Android Studio (acá no corre gradle).
- [ ] 🤝 **Archive de iOS** firmado con tu cuenta de Apple (Xcode → Product →
  Archive). Requiere provisioning profiles de tu cuenta.
- [ ] 🤝 **Prueba en dispositivo REAL** (no solo simulador): login/OAuth, scanner,
  cámara, export PDF/Excel, back de Android, teclado, offline. Checklist base en
  `docs/` de la Fase 4.

## P1 — Cuentas de tienda (registros de app)

- [ ] 👤 Crear el **registro de app en App Store Connect** (Bundle ID `info.laoca.app`).
- [ ] 👤 Crear el **registro de app en Google Play Console** (applicationId `info.laoca.app`).

## P2 — Material de fichas

- [x] 🤖 Íconos (iOS/Android) y splash — `npm run generate:assets`.
- [x] 🤖 Ícono de tienda 1024 (App Store) y 512 (Google Play).
- [x] 🤖 Capturas 6.3" (Play) y 6.9" (App Store) — `docs/store-assets/`.
- [ ] 🤝 **Decidir datos reales vs demo en las capturas** (muestran locales,
  montos y tu nombre). Si van demo, re-capturar.
- [ ] 🤝 **Gráfico de funciones 1024×500** (Google Play) — diseño.
- [ ] 🤝 **Textos de ficha**: nombre, subtítulo, descripción, keywords, categoría.
  Yo redacto borradores; vos ajustás.
- [ ] 👤 **Clasificación de edad / content rating** (cuestionario en cada consola).
- [ ] 👤 **Data safety (Play)** / **App Privacy (Apple)**: declarar qué datos
  recolecta la app. Yo te armo el inventario de datos; vos completás el formulario.
- [ ] 👤 **Export compliance** (declaración de cifrado) en App Store Connect.

## P2 — Envío

- [ ] 🤝 Subir binarios a **TestFlight** (iOS) / **pista interna** (Play) y probar.
- [ ] 👤 **Enviar a review** en ambas tiendas.

---

## Versionado (hecho)

- [x] 1.0.0 / build 1 unificado en package.json, Android e iOS.
- [x] `npm run version:release` sube el build number en cada subida.
Detalle en `docs/store-assets/README.md`.

## Ya cerrado antes de esta hoja de ruta

- [x] Auditoría de seguridad (`docs/SECURITY_AUDIT.md`) y correcciones C-02/C-03 + varias.
- [x] Integración de Capacitor (proyectos iOS/Android), compatibilidad móvil, PWA intacta.
