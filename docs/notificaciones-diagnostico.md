# Notificaciones — diagnóstico y propuesta (2026-11-11)

Alcance: `NotificationsPanel.tsx`, campana flotante y lógica en `App.tsx`,
`utils/notificationSound.ts`, `notificationsAPI` (`utils/api.tsx`), rutas
`/notifications` del Edge Function y "Preferencias" en `UserProfile.tsx`.

## 1. Lo que funciona

- Bandeja en base de datos (`notifications`): crear, listar, marcar leída,
  marcar todas, borrar. El servidor valida dueño y que no se pueda escribir en la
  bandeja de otro negocio (A-05).
- Sonido (Web Audio, beeps generados) y su switch "Sonido" (localStorage).
- Notificaciones de stock bajo/agotado y de asistencia: las crea el servidor.

## 2. Lo que no funciona o está mal

### Graves

1. **La bandeja nunca se limpia y se descarga entera cada 5 s.** En la base viva
   hay 20.984 notificaciones (15.524 sin leer); un usuario tiene 4.770. `GET
   /notifications` no tiene límite y el polling la pide cada 5 segundos. El panel
   las dibuja todas con una animación escalonada de `index * 0.05 s` (la número
   1.000 aparece a los 50 s). Por rol: los locales tienen 10.953 sin leer → el
   badge vive en "9+" y deja de significar algo.
2. **Spam de catálogo:** cada producto creado o con precio cambiado manda una
   notificación a *todos* los miembros (`ProductManagement.tsx`), una petición
   por persona desde el navegador. Son 5.465 de las 20.984.
3. **Los avisos de pedidos dependen de que alguien tenga la app abierta.**
   - "Nuevo pedido": lo detecta el *teléfono de despacho* comparando listas en el
     polling y se crea la notificación a sí mismo. Si despacho tiene la app
     cerrada, el pedido nunca genera aviso. Solo mira la página de pedidos que
     está viendo.
   - "Cambio de estado": lo crea el navegador de quien cambia el estado. Si eso
     falla (403), no hay aviso.
   Esto además impide push real: el servidor no sabe cuándo avisar.
4. **"Notificaciones del sistema" no funcionan en ningún teléfono:**
   - En la app iOS/Android (WKWebView/WebView) no existe `window.Notification`:
     el switch muestra activado pero no hace nada.
   - En Chrome Android `new Notification()` lanza "Illegal constructor" (hay que
     usar `registration.showNotification` del service worker).
   - En iPhone (PWA) solo existen con la app instalada en inicio + Web Push.
   - El service worker (`public/service-worker.js`, registrado por
     `utils/registerServiceWorker.ts`) ya tiene un manejador `push`, pero nadie
     se suscribe a Web Push.
   - El ícono apunta a `/icons/icon-192x192.png`, que no existe.

### Preferencias falsas (`UserProfile.tsx`)

- **Correo**, **Notificaciones push** y **Estado de pedidos**: estado local, no
  se guardan ni hacen nada. Se reinician cada vez que se abre el panel.
- **Notificaciones del sistema**: arranca en "activado" aunque nunca se dio
  permiso; en la app nativa no puede funcionar.

### Bugs menores

- Tocar una notificación de un pedido que no está en la página cargada no hace
  nada (ni navega ni avisa).
- Borrar muestra "Notificación eliminada" antes de saber si funcionó.
- Campana: `bottom-6` sin safe-area (choca con la barra de inicio del iPhone),
  arrastrable (se puede perder detrás de contenido), animación de sacudida
  infinita mientras haya no leídas (siempre, con 10.000 sin leer).
- Panel: sin Escape, sin deslizar para cerrar, sin `role="dialog"`; la barra de
  estado no se ajusta si el panel pasa a ser claro.
- Prompt naranja "ACTIVAR AUDIO" + toast insistente solo para despacho; en la
  app nativa el audio ya queda desbloqueado con el primer toque.

## 3. Propuesta priorizada

### Fase 1 — ordenar lo que hay (sin servicios nuevos) — recomendada ahora

1. **Servidor:** `GET /notifications` devuelve las últimas 50 + el total sin
   leer real; borrar automáticamente las leídas de más de 30 días y todas las de
   más de 90 (limpieza una vez, con confirmación, y luego en cada consulta).
2. **Quitar el spam de catálogo** (producto nuevo / cambio de precio) o dejarlo
   solo para admin.
3. **Panel estilo "Mi cuenta":** fondo #F2F2F7, título grande "Notificaciones",
   ✕ gris, cerrar tocando fondo / deslizando / Escape, barra de estado oscura.
   Lista agrupada por "Hoy", "Ayer", "Anteriores"; filas blancas con ícono en
   cuadradito de color, punto azul de no leída, hora a la derecha, deslizar a la
   izquierda para borrar (como Mail) y "Marcar todo como leído" arriba.
4. **Campana:** fija (no arrastrable) con safe-area, badge rojo estático, sin
   sacudida infinita. (Alternativa: moverla al encabezado del inicio, junto a ☰.)
5. **Preferencias honestas:** dejar solo "Sonido" y (solo en PWA donde se puede)
   "Avisos del navegador" que refleje el permiso real. Quitar Correo, Push y
   Estado de pedidos hasta que existan.
6. Tocar una notificación de pedido fuera de la página: buscar el pedido por id
   o avisar "Este pedido ya no está disponible".

### Fase 2 — push real (requiere cuentas y trabajo de servidor)

1. Mover la creación de avisos de pedidos al servidor (al crear pedido → despacho
   y admin; al cambiar estado → el local dueño). Prerrequisito de todo push.
2. App nativa: `@capacitor/push-notifications`, tabla `device_tokens`,
   llave APNs (cuenta Apple Developer) y proyecto Firebase (FCM) para Android;
   el Edge Function envía al guardar la notificación.
3. PWA: registrar el service worker, llaves VAPID, Web Push (iPhone solo con la
   app en la pantalla de inicio, iOS 16.4+).
4. Recién entonces volver a mostrar un switch "Notificaciones push" que funcione.

Correo: no recomiendo implementarlo; agrega ruido sin valor claro para esta
operación.

## 4. Fase 1 — implementado (2026-11-11)

Decisiones del usuario: mostrar 50 + borrar viejas; catálogo (precio y
producto nuevo) solo a locales; campana en el encabezado junto a ☰; solo Fase 1.

- **Base de datos (aplicado en vivo):** se borraron 11.778 notificaciones (leídas
  de >30 días y todas las de >90). Respaldo completo en
  `backups.notifications_20261111`. Quedaron 9.206.
- **Servidor** (`make-server-6d979413/index.ts`, GET `/notifications`): trae las
  50 más recientes (`?limit`, máx. 100), devuelve `unreadCount` real y limpia las
  viejas del usuario a lo sumo 1 vez por hora. **Requiere `supabase functions
  deploy`** (va junto con el deploy pendiente de C-01). Hasta entonces el
  cliente funciona igual: recorta a 50 y cuenta él mismo.
- `api.tsx`: `notificationsAPI.getRecent()` reemplaza a `getAll()`.
- `App.tsx`: contador de no leídas desde el servidor; sin campana flotante; el
  botón atrás de Android cierra el panel; tocar un aviso de un pedido no cargado
  avisa en vez de no hacer nada; sin toast al "marcar todo".
- `HomeScreen.tsx`: campana con badge rojo (hasta "99+") junto a ☰.
- `NotificationsPanel.tsx`: rehecho al estilo "Mi cuenta" (agrupado por Hoy /
  Ayer / Esta semana / Anteriores, deslizar a la izquierda para borrar, deslizar
  a la derecha / ✕ / fondo / Escape para cerrar, barra de estado oscura).
- `UserProfile.tsx`: Preferencias solo con "Sonido", "Avisos del navegador"
  (solo en web, refleja el permiso real) y "Probar notificación".
- `notificationSound.ts`: avisos vía service worker (Android Chrome), ícono
  correcto, no pide permiso por sorpresa.
- `ProductManagement.tsx`: avisos de catálogo solo a usuarios `local`.

Verificado en el simulador iPhone 17 y en la PWA local (cuenta admin).

## 5. Avisos por categoría (2026-11-11)

En "Mi cuenta → Notificaciones → Preferencias" cada usuario elige qué avisos
recibe. Ve solo lo que le puede llegar según su rol:

| Rol | Interruptores |
|---|---|
| local | Estado de mis pedidos (En preparación, Listo, Despachado, Recibido, Cancelado) · Catálogo (Cambios de precio, Productos nuevos) |
| admin, user | Estado de mis pedidos · Catálogo · Inventario (Stock bajo, solo admin) |
| dispatch | Pedidos nuevos · Catálogo |
| production, pastry | Catálogo · Inventario (Stock bajo) |

**Valores por defecto** (migración `20261111_b`, aplicada cuando nadie había
elegido nada): de los estados, solo Despachado y Recibido encendidos. Catálogo
encendido solo para locales; el resto lo enciende si quiere. Un trigger en
`profiles` deja el catálogo encendido a los locales nuevos. Los avisos de
catálogo se envían a todos los miembros y cada uno los filtra con su preferencia.

- **Base (aplicado en vivo):** `profiles.notificaciones_silenciadas text[]`
  (migración `20261111_a_notificaciones_silenciadas.sql`), editable por el propio
  usuario vía GRANT por columna + `profiles_update_own`.
- **App (ya activo):** `utils/preferenciasNotificaciones.ts` clasifica cada aviso
  (la etapa del pedido sale del título). La bandeja oculta lo silenciado, el
  contador lo descuenta, y no suena ni avisa por pedidos nuevos o cambios de
  estado silenciados.
- **Servidor (requiere deploy):** `POST /notifications` no crea avisos de una
  categoría silenciada por el destinatario; `GET` los excluye de la lista y del
  contador; las alertas de stock saltan a quien apagó "Stock bajo".

## 6. Deploy (2026-11-11)

`make-server-6d979413` **v25** en producción = v24 + solo los cambios de
notificaciones (GET con límite 50, contador real, limpieza horaria, preferencias
por categoría en GET/POST y en alertas de stock). Se armó sobre el código que ya
estaba desplegado, **no** sobre el `index.ts` local, porque este trae la
auditoría de seguridad completa, que va en su propio deploy junto con las
migraciones de C-01. Verificado: GET devuelve solo lo no silenciado y su total;
POST de una categoría silenciada responde `{silenciada: true}` y no crea nada.
