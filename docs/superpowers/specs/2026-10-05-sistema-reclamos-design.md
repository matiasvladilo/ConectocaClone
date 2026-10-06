# Sistema de reclamos con QR global — Diseño

**Fecha:** 2026-10-05

## Problema

Conectoca no tiene un canal público para recibir reclamos de clientes ni una bandeja interna para que administración pueda ordenarlos. Hoy se necesita un flujo simple: un único código QR para todas las sucursales, un formulario móvil sin inicio de sesión, aviso por correo a un destinatario central, confirmación automática al cliente y una bandeja exclusiva para administradores.

El seguimiento posterior no será un chat ni un portal de consulta. El administrador abrirá su cliente de correo desde Conectoca mediante un enlace `mailto:` prellenado, enviará la respuesta desde su casilla habitual y marcará manualmente el caso como atendido.

### Decisión sobre el QR universal

Habrá una sola URL pública, `/reclamos`, y un solo QR para todas las sucursales. Conectoca ya es multiempresa internamente, por lo que el backend asociará el formulario automáticamente con la organización definida en su configuración privada. Esa asociación es invisible: el cliente no elige empresa, no ve un `businessId` y no existen QR distintos dentro de este alcance.

Flujo visible para el cliente:

```text
QR único → elegir sucursal o área → completar reclamo → recibir número de caso
```

## Alcance

### Incluido

- Página pública `/reclamos`, optimizada para celular y accesible sin sesión.
- Origen del reclamo: una cuenta existente con rol `local`, `Producción/producto` u `Otro/no sabe`.
- Correo obligatorio; nombre y teléfono opcionales.
- Descripción obligatoria y evidencias opcionales.
- Hasta cinco archivos JPG, PNG, WebP o PDF, con un máximo de 10 MB por archivo.
- Número de caso único con formato `REC-AAAA-NNNNNN`.
- Confirmación por correo al cliente.
- Notificación de todos los casos a un único correo central.
- Almacenamiento privado de reclamos y evidencias en Supabase.
- Panel interno visible y utilizable solo por usuarios con rol `admin`.
- Búsqueda, filtros, detalle, evidencias, botón `Responder por correo`, reintento de correos fallidos y cambio manual entre `Pendiente` y `Atendido`.
- Enlace del correo central al caso interno, conservado durante el inicio de sesión si el administrador todavía no está autenticado.
- Descarga del QR que apunta a la URL pública permanente.
- Controles básicos contra abuso sin CAPTCHA en la primera versión.

### No incluido

- Portal público para consultar el estado de un caso.
- Respuestas enviadas directamente por Conectoca.
- Conversación o historial de mensajes dentro del panel.
- Asignación de casos a administradores individuales.
- Correos diferentes por sucursal.
- Estados adicionales, prioridades, SLA, etiquetas o escalamiento automático.
- Notificaciones por WhatsApp, SMS o push.
- CAPTCHA, salvo que el uso real demuestre que los controles iniciales son insuficientes.
- Configuración del correo central desde la interfaz; será un secreto de despliegue.
- Eliminación automática por una política de retención en esta primera versión.

## Enfoques considerados

### 1. Supabase integrado — elegido

Postgres conserva los casos, Storage guarda los archivos privados y una Edge Function independiente valida solicitudes, aplica permisos y envía correos mediante Resend. Reutiliza la plataforma actual, mantiene un solo origen de datos y deja el módulo aislado del backend grande de pedidos.

### 2. Netlify Functions con Supabase

Es viable, pero dividiría la lógica de servidor entre Netlify y Supabase, agregaría otro lugar de despliegue y duplicaría configuración de secretos y observabilidad.

### 3. Servicio externo de formularios

Simplificaría la recepción inicial, pero dificultaría el panel, la búsqueda, los estados, los adjuntos privados y el control de acceso. No resuelve el flujo completo.

## Arquitectura

### Componentes

1. **Formulario público:** vista React separada del flujo autenticado. Consulta nombres públicos de sucursales y envía un formulario `multipart/form-data`.
2. **Edge Function `complaints`:** función Supabase independiente de `make-server-6d979413`. Expone rutas públicas y administrativas, aplica validación, rate limiting, autenticación y autorización.
3. **Postgres:** tablas de reclamos, adjuntos y límites de envío.
4. **Storage:** bucket privado `complaint-evidence`; ningún objeto tendrá URL pública permanente.
5. **Resend:** envío de confirmación al cliente y aviso al correo central mediante API HTTP.
6. **Panel administrativo:** bandeja, filtros y detalle dentro de la aplicación autenticada.

La función se desplegará admitiendo llamadas sin JWT porque contiene rutas públicas. Las rutas `/admin/*` verificarán explícitamente el `Bearer token` con Supabase Auth, cargarán el perfil y exigirán `role = 'admin'` y el `business_id` configurado. Que el frontend oculte el botón no sustituye este control de servidor.

### Configuración privada

La función usará secretos de entorno, nunca valores embebidos en el frontend:

- `COMPLAINTS_BUSINESS_ID`: organización a la que pertenece el QR universal.
- `COMPLAINTS_RECIPIENT_EMAIL`: única casilla central que recibe todos los avisos.
- `COMPLAINTS_FROM_EMAIL`: remitente verificado para mensajes transaccionales.
- `RESEND_API_KEY`: credencial del proveedor de correo.
- `APP_PUBLIC_URL`: origen canónico de Conectoca para enlaces y QR.
- `COMPLAINTS_RATE_LIMIT_SECRET`: sal para derivar identificadores efímeros contra abuso sin conservar la dirección IP en texto plano.

Los secretos reservados que Supabase ya inyecta (`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`) se reutilizan según corresponda.

## Modelo de datos

### Tabla `complaints`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` |
| `case_serial` | bigint identity | Secuencia atómica usada para el número legible |
| `case_number` | text, unique | Trigger: `REC-<año>-<case_serial con 6 dígitos>` |
| `business_id` | uuid, index | Siempre igual a `COMPLAINTS_BUSINESS_ID` en el flujo público |
| `origin_type` | text | `branch`, `production` u `other` |
| `branch_profile_id` | uuid, nullable | Referencia a `profiles.id`; solo para `branch`, `ON DELETE SET NULL` |
| `branch_name_snapshot` | text, nullable | Nombre conservado aunque la cuenta cambie o se elimine |
| `customer_email` | text | Obligatorio, normalizado en minúsculas |
| `customer_name` | text, nullable | Opcional |
| `customer_phone` | text, nullable | Opcional |
| `description` | text | Entre 20 y 5.000 caracteres |
| `status` | text | `pending` o `attended`; comienza en `pending` |
| `confirmation_email_status` | text | `pending`, `sending`, `sent` o `failed` |
| `notification_email_status` | text | `pending`, `sending`, `sent` o `failed` |
| `confirmation_sent_at` | timestamptz, nullable | Último envío exitoso al cliente |
| `notification_sent_at` | timestamptz, nullable | Último aviso exitoso al correo central |
| `confirmation_email_error` | text, nullable | Último error reducido del mensaje al cliente |
| `notification_email_error` | text, nullable | Último error reducido del aviso central |
| `attended_at` | timestamptz, nullable | Se limpia al reabrir |
| `attended_by` | uuid, nullable | Administrador que realizó el último cambio a atendido |
| `created_at` | timestamptz | Fecha de recepción |
| `updated_at` | timestamptz | Actualizado por trigger |

Restricciones de consistencia:

- `origin_type = 'branch'` exige `branch_name_snapshot`; `branch_profile_id` puede quedar nulo posteriormente si se elimina el perfil.
- Los otros orígenes exigen que ambos campos de sucursal sean nulos.
- `status = 'attended'` exige `attended_at` y `attended_by`.
- El número se genera en Postgres, no contando filas en TypeScript; dos envíos simultáneos nunca reciben el mismo caso.

Índices iniciales:

- `(business_id, status, created_at desc)` para la bandeja.
- `(business_id, origin_type, created_at desc)` para filtros.
- `(business_id, branch_profile_id, created_at desc)` para sucursal.
- Índices GIN con `pg_trgm` sobre número, correo, nombre y descripción; la migración habilita la extensión si todavía no está disponible.

### Tabla `complaint_attachments`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` |
| `complaint_id` | uuid, FK | `ON DELETE CASCADE` |
| `storage_path` | text, unique | Ruta privada, no una URL firmada |
| `original_name` | text | Nombre saneado solo para presentación |
| `mime_type` | text | Tipo detectado y permitido |
| `size_bytes` | bigint | Entre 1 byte y 10 MB |
| `created_at` | timestamptz | Fecha de carga |

Los objetos se guardan bajo `<business_id>/<complaint_id>/<attachment_id>-<safe-name>`. El panel pide una URL firmada de corta duración cuando el administrador abre o descarga una evidencia.

### Tabla `complaint_rate_limits`

Contiene una clave HMAC efímera derivada de la red del solicitante, inicio de ventana, contador y expiración. No almacena la IP original. La función incrementa el contador atómicamente y elimina registros vencidos de forma oportunista. La primera versión admite hasta cinco reclamos por clave durante una hora; la respuesta pública es genérica cuando se excede el límite.

### Seguridad de datos

- Las tres tablas tendrán RLS habilitado sin políticas públicas de lectura o escritura.
- El bucket será privado y no aceptará cargas directas anónimas.
- Solo la Edge Function, usando `service_role`, escribe o consulta estos recursos.
- Las rutas administrativas siempre reducen las consultas por `business_id`, incluso después de validar el rol.
- Las respuestas públicas nunca incluyen correos de sucursales, identificadores internos, estados de otros casos ni rutas de Storage.

## API

Base: `/functions/v1/complaints`.

### Rutas públicas

**`GET /public/branches`**

- Devuelve solo `id` y `name` de perfiles existentes con `role = 'local'` y el `business_id` configurado.
- Orden alfabético y respuesta cacheable durante cinco minutos.
- Incluye un `formToken` firmado con hora de emisión, que el formulario debe devolver al enviar.

**`POST /public/complaints`**

- Recibe `multipart/form-data`.
- Valida honeypot, `formToken`, al menos dos segundos desde la emisión del token, un máximo de dos horas para completarlo, rate limit, correo, origen, sucursal, descripción y archivos.
- Si el origen es sucursal, vuelve a consultar el perfil y toma el nombre desde la base; no confía en el nombre enviado por el navegador.
- Valida extensión, MIME real reconocido, cantidad y tamaño antes de persistir.
- Genera el identificador UUID, sube evidencias, crea las filas de caso y adjuntos y, si falla la escritura, intenta limpiar los objetos ya subidos.
- Intenta ambos correos después de guardar el caso y registra sus resultados por separado.
- Devuelve `201` con `caseNumber` y `receivedAt`. Nunca devuelve detalles técnicos del correo.

### Rutas administrativas

**`GET /admin/complaints`**

- Paginación de servidor.
- Parámetros: texto, estado, origen, sucursal, fecha desde/hasta, página y límite.
- Orden predeterminado: más recientes primero.
- Devuelve resumen, no rutas de archivos.

**`GET /admin/complaints/:id`**

- Devuelve detalle y metadatos de evidencias dentro del mismo negocio.

**`PATCH /admin/complaints/:id/status`**

- Acepta solo `pending` o `attended`.
- Al atender registra actor y fecha; al reabrir los limpia.

**`POST /admin/complaints/:id/retry-emails`**

- Reintenta únicamente los mensajes solicitados que estén fallidos.
- Registra el nuevo resultado y evita envíos concurrentes duplicados mediante actualización condicional.

**`POST /admin/attachments/:id/signed-url`**

- Verifica caso, negocio y rol antes de generar una URL temporal.

Todas las respuestas de error tienen un código estable para la UI y un mensaje seguro para mostrar. Los detalles se registran solo en servidor.

## Flujo público

1. Netlify redirige `/reclamos` al SPA.
2. Antes de iniciar la restauración de sesión o mostrar `LoginScreen`, `App.tsx` detecta esa ruta y renderiza `PublicComplaintForm`.
3. La pantalla carga las sucursales públicas y ofrece tres orígenes: sucursal, producción/producto u otro/no sabe.
4. El cliente completa contacto, descripción y evidencias.
5. La UI valida lo evidente, pero el servidor repite toda validación.
6. Al enviar, el botón queda bloqueado y muestra progreso para evitar dobles clics.
7. Al recibir `201`, la vista reemplaza el formulario por una confirmación con el número de caso y la indicación de revisar el correo.
8. Si hay un error recuperable, los campos permanecen cargados; nunca se pide al usuario reescribir el reclamo por un fallo de red.

No habrá consulta pública de estado ni acceso al caso después de esta pantalla.

## Correos

### Confirmación al cliente

Contenido mínimo:

- Asunto: `Recibimos tu reclamo — <case_number>`.
- Número, fecha, origen y nombre de sucursal cuando corresponda.
- Mensaje claro de recepción y aviso de que la respuesta llegará por correo.
- Sin enlaces públicos a adjuntos y sin promesas de un plazo no definido.

### Aviso al correo central

Contenido mínimo:

- Asunto: `Nuevo reclamo <case_number> — <origen>`.
- Datos de contacto, origen y descripción.
- Cantidad de evidencias, no los archivos adjuntos.
- Enlace profundo `/?screen=complaints&case=<uuid>`.

No se adjuntan evidencias al correo para evitar duplicación de datos sensibles y límites del proveedor.

### Fallos y reintentos

Guardar el caso tiene prioridad sobre enviar correo. Si Resend falla:

- La respuesta pública sigue confirmando el número de caso.
- El estado del mensaje queda en `failed` y se registra un error reducido.
- El panel muestra una advertencia visible y permite reintentar.
- Reintentar no crea otro caso ni cambia el número.

La primera versión no incorpora una cola ni cron automático; el reintento es manual para mantener el sistema pequeño y observable.

## Panel administrativo

### Acceso y navegación

- `complaints` se añade como pantalla interna de `App.tsx`.
- Solo `admin` recibe el acceso `Reclamos` en la pantalla principal.
- El contador muestra casos pendientes del negocio.
- Si un enlace profundo llega sin sesión, se conserva en `sessionStorage`; después del login se abre la bandeja y el caso solicitado.
- Si el usuario autenticado no es administrador, se muestra una respuesta de acceso denegado y no se solicita información del caso.

### Bandeja

- Búsqueda por número, correo, nombre o descripción.
- Filtros por estado, origen, sucursal y fechas.
- Filas con número, origen, resumen, fecha y estado.
- Paginación de servidor; no se descarga toda la tabla al navegador.
- Vacíos diferenciados entre “no hay reclamos” y “ningún resultado coincide con los filtros”.

### Detalle

- Datos del cliente, origen, descripción, fechas, estado de correos y evidencias.
- `Responder por correo` construye un `mailto:` con destinatario, asunto `Respuesta a tu reclamo <case_number>` y cuerpo inicial editable. Abrirlo no modifica el caso.
- `Marcar como atendido` exige confirmación ligera y actualiza el estado.
- Un caso atendido puede volver a `Pendiente`.
- Si un correo automático falló, aparece una acción separada para reintentarlo.

### QR

El panel ofrece `Descargar QR`, que genera un PNG o SVG apuntando exactamente a `<APP_PUBLIC_URL>/reclamos`. Regenerar o descargar el archivo no cambia la URL; los impresos anteriores siguen funcionando.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| No se pueden cargar sucursales | Se mantienen disponibles Producción y Otro; se muestra un reintento para sucursales. |
| Sucursal eliminada entre carga y envío | El servidor rechaza esa selección y pide elegir nuevamente. |
| Campo o archivo inválido | `400` con errores por campo; la UI conserva el formulario. |
| Se excede el rate limit | `429` con mensaje genérico y sin revelar el criterio interno. |
| Falla una carga de archivo | No se crea un caso incompleto; se limpian los objetos parciales en la medida posible. |
| Falla Postgres | No se envían correos; se informa que el envío no pudo completarse y puede reintentarse. |
| Falla uno o ambos correos | El caso queda creado, la UI muestra su número y el panel permite reintentar. |
| Sesión administrativa expirada | El cliente API reutiliza el mecanismo actual de refresh; si falla, vuelve al login conservando el enlace profundo. |
| Rol no autorizado | `403` en servidor; no se filtran datos del caso. |
| Adjunto ausente en Storage | El detalle sigue disponible y la evidencia muestra un error localizado. |

## Validación y prevención de abuso

- Correo con formato válido y máximo de 254 caracteres.
- Nombre máximo de 120 caracteres; teléfono máximo de 40.
- Descripción de 20 a 5.000 caracteres.
- Cinco archivos como máximo y 10 MB por archivo.
- Nombres saneados; no se usa el nombre original como ruta completa.
- Tipos permitidos confirmados en servidor: JPEG, PNG, WebP y PDF.
- Honeypot invisible, marca temporal firmada para detectar envíos instantáneos y rate limit de cinco casos por hora por clave HMAC efímera.
- CORS restringido a `APP_PUBLIC_URL` y orígenes locales de desarrollo configurados explícitamente.
- Sin HTML del usuario en plantillas: todos los valores se escapan.
- Logs sin cuerpo completo del reclamo, correo, teléfono ni nombres de archivo sensibles.

## Cambios previstos en el repositorio

- Migración SQL para tablas, triggers, índices, RLS y bucket privado.
- Nueva Edge Function `supabase/functions/complaints/` con módulos pequeños para autenticación, validación, correo y persistencia.
- Tipos y cliente API específicos para reclamos.
- `PublicComplaintForm` y su pantalla de éxito.
- `ComplaintsPanel`, lista/filtros y detalle.
- Integración mínima en `App.tsx` y `HomeScreen.tsx`.
- Utilidades puras para validación, formato de número, búsqueda/filtros del cliente y construcción segura de `mailto:`.
- Plantillas HTML/texto de confirmación y aviso central.
- Generación descargable del QR.

No se agregarán rutas al archivo monolítico `make-server-6d979413/index.ts`; el nuevo dominio queda aislado en su propia función.

## Pruebas

### Unitarias

- Validación y normalización de todos los campos.
- Combinaciones válidas e inválidas de origen y sucursal.
- Validación de cantidad, tamaño y MIME de evidencias.
- Construcción y codificación del `mailto:`.
- Conversión de respuestas API a tipos de UI.
- Plantillas de correo escapan datos ingresados por el cliente.

### Base de datos y backend

1. Dos envíos simultáneos producen números diferentes.
2. Un reclamo de sucursal conserva el nombre histórico.
3. Orígenes de producción u otro no aceptan una sucursal residual.
4. La lista pública devuelve solo nombre e ID de perfiles `local` del negocio configurado.
5. Un token ausente, inválido o no administrador no puede acceder a rutas administrativas.
6. Un administrador de otro negocio no puede leer, modificar ni firmar adjuntos.
7. Un cambio a atendido registra actor y fecha; reabrirlos los limpia.
8. Las URLs firmadas expiran y nunca se almacenan en la base.
9. El rate limit incrementa de forma atómica y expira.
10. Un fallo de correo conserva el caso y habilita reintento idempotente.

### Integración y navegador

1. El QR abre `/reclamos` sin mostrar login.
2. El formulario funciona en ancho móvil y conserva datos ante error.
3. Cada origen muestra los campos correctos.
4. Un envío exitoso muestra el mismo número recibido por correo.
5. El correo central enlaza al caso; el login conserva el destino.
6. Solo el administrador ve y puede abrir Reclamos.
7. Búsqueda, filtros, paginación y estados funcionan con datos suficientes para más de una página.
8. Las evidencias se abren con URL temporal.
9. `Responder por correo` abre destinatario, asunto y cuerpo correctos sin cambiar el estado.
10. Reintentar un correo no crea un caso duplicado.

### Regresión

- `npm test`.
- `npm run build`.
- Flujo básico de login, pedidos y navegación existente.
- Verificación de que `/reclamos` no restaura sesión, inicia polling ni registra lógica interna innecesaria.

## Despliegue

1. Aplicar la migración y verificar RLS y bucket privado.
2. Configurar los seis secretos del módulo.
3. Verificar el dominio remitente en Resend.
4. Desplegar `complaints` con las rutas públicas permitidas y autorización administrativa manual.
5. Desplegar el frontend.
6. Ejecutar una prueba completa con una casilla real de cliente y el correo central.
7. Descargar el QR final desde producción y probarlo con un teléfono antes de imprimirlo.

El despliegue se considera listo cuando el caso aparece en el panel, ambos correos llegan, la evidencia solo abre para un administrador y el enlace profundo funciona después de iniciar sesión.

## Riesgos y decisiones conscientes

- **Un solo destinatario central:** simplifica el MVP; la sucursal clasifica, pero no enruta correos.
- **Estado manual:** `mailto:` no permite saber si el usuario realmente envió el correo. Separar `Responder` de `Marcar como atendido` evita afirmar algo que Conectoca no puede comprobar.
- **Reintento manual de correos:** evita introducir una cola o programador en la primera versión. El panel hace visibles los fallos.
- **Sucursales desde perfiles `local`:** evita otro mantenedor, pero el nombre mostrado depende de que esas cuentas representen correctamente las sucursales.
- **Organización configurada en servidor:** preserva un QR verdaderamente único para este despliegue. Si en el futuro distintos negocios de Conectoca quieren su propio formulario, eso requerirá un diseño posterior con identificadores públicos o QR por organización.
- **Archivos a través de la función:** mantiene el bucket cerrado. Durante la implementación se verificará el límite efectivo del entorno con el caso máximo de cinco archivos; si el transporte no admite ese volumen, se conservarán los mismos límites de producto mediante cargas firmadas de un solo uso, sin hacer público el bucket.
