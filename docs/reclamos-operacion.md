# Reclamos — guía de operación

Cómo desplegar, configurar y mantener el sistema de reclamos con QR único.
Diseño: [`docs/superpowers/specs/2026-10-05-sistema-reclamos-design.md`](superpowers/specs/2026-10-05-sistema-reclamos-design.md).

## Piezas

| Pieza | Dónde vive | Cómo se despliega |
|---|---|---|
| Tablas `complaints`, `complaint_attachments`, `complaint_rate_limits`, RPCs | `supabase/migrations/20261005_a_*.sql`, `20261005_b_*.sql` | `supabase db push` (a mano) |
| Bucket privado `complaint-evidence` | misma migración `_a_` | idem |
| Edge Function `complaints` | `supabase/functions/complaints/` | `supabase functions deploy` (a mano) |
| Formulario `/reclamos` y panel admin | `src/features/complaints/` | Netlify, al mergear a `main` |

> Mergear a `main` **no** despliega la base de datos ni la Edge Function. Netlify solo publica el frontend.

El proyecto Supabase vivo es **conectocadev** (`xxmiujtywnnlqmekakzq`), el que tienen linkeado `.env.local` y `supabase/.temp`. El nombre "conectoca" corresponde al proyecto abandonado.

## Configuración

### Secretos de la Edge Function

La función lee estos valores **al arrancar**. `COMPLAINTS_BUSINESS_ID`, `APP_PUBLIC_URL` y `COMPLAINTS_RATE_LIMIT_SECRET` son obligatorios: si falta uno, cada request —incluido el formulario público— responde 500.

Los tres de correo (`COMPLAINTS_RECIPIENT_EMAIL`, `COMPLAINTS_FROM_EMAIL`, `RESEND_API_KEY`) son opcionales y van juntos. Mientras falte cualquiera, los reclamos se guardan y aparecen en el panel, pero no se envía ningún correo: ambos quedan como **Sin enviar** (`pending`). Al activar el correo, solo los casos nuevos lo reciben; los anteriores siguen sin enviar y no tienen botón de reintento.

| Secreto | Valor |
|---|---|
| `COMPLAINTS_BUSINESS_ID` | `business_id` de La Oca en `businesses`: `d1fa7f40-c5e1-4bc2-9ffc-c8483950b758` |
| `COMPLAINTS_RECIPIENT_EMAIL` | Casilla central que recibe todos los avisos |
| `COMPLAINTS_FROM_EMAIL` | Remitente en un dominio verificado en Resend, p. ej. `Reclamos La Oca <reclamos@tu-dominio.cl>` |
| `RESEND_API_KEY` | API key de Resend con permiso de envío |
| `APP_PUBLIC_URL` | Origen público de Conectoca, sin barra final: `https://conectocadev.netlify.app` |
| `COMPLAINTS_RATE_LIMIT_SECRET` | Cadena aleatoria larga (`openssl rand -hex 32`) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase.

`APP_PUBLIC_URL` define dos cosas: el enlace al caso dentro del correo central y el único origen web aceptado por CORS (además de `localhost`/`127.0.0.1` en los puertos 3000, 3010 y 5173).

### Variable del frontend

| Variable (Netlify y `.env.local`) | Valor |
|---|---|
| `VITE_APP_PUBLIC_URL` | El mismo valor que `APP_PUBLIC_URL` |

El botón **Descargar QR** genera `<VITE_APP_PUBLIC_URL>/reclamos`. Si la variable falta, usa el dominio desde donde el admin abrió el panel, y el QR impreso podría apuntar a una URL equivocada. Es una variable de build: después de cambiarla en Netlify hay que volver a desplegar.

## Primer despliegue

Ejecutar desde la raíz del repo, con el CLI linkeado a conectocadev.

1. **Migraciones.**

   ```bash
   npx supabase db push
   ```

   Verificar en el SQL editor:

   ```sql
   select id, public from storage.buckets where id = 'complaint-evidence';  -- public = false
   select relname, relrowsecurity from pg_class
    where relname in ('complaints','complaint_attachments','complaint_rate_limits');  -- todas true
   select policyname from pg_policies
    where tablename in ('complaints','complaint_attachments','complaint_rate_limits');  -- sin filas
   ```

2. **Dominio remitente en Resend.** En Resend → *Domains*, agregar el dominio de `COMPLAINTS_FROM_EMAIL`, cargar en el DNS los registros SPF/DKIM que indique y esperar el estado *Verified*. Si el dominio no está verificado, Resend solo permite enviar a la casilla de la cuenta y los demás correos quedan en `failed`.

3. **Secretos.**

   ```bash
   npx supabase secrets set \
     COMPLAINTS_BUSINESS_ID="$COMPLAINTS_BUSINESS_ID" \
     COMPLAINTS_RECIPIENT_EMAIL="$COMPLAINTS_RECIPIENT_EMAIL" \
     COMPLAINTS_FROM_EMAIL="$COMPLAINTS_FROM_EMAIL" \
     RESEND_API_KEY="$RESEND_API_KEY" \
     APP_PUBLIC_URL="$APP_PUBLIC_URL" \
     COMPLAINTS_RATE_LIMIT_SECRET="$COMPLAINTS_RATE_LIMIT_SECRET"
   ```

4. **Edge Function.** La función tiene rutas públicas, así que se despliega sin verificación JWT de plataforma (también declarado en `supabase/config.toml`). Las rutas `/admin/*` validan el token y el rol dentro del handler.

   ```bash
   npx supabase functions deploy complaints --no-verify-jwt
   ```

5. **Frontend.** Configurar `VITE_APP_PUBLIC_URL` en Netlify → *Site configuration → Environment variables*, mergear a `main` y esperar el deploy. `netlify.toml` ya redirige `/*` a `index.html`, así que `/reclamos` lo sirve el SPA.

6. **Humo rápido.**

   ```bash
   curl -s "$SUPABASE_URL/functions/v1/complaints/public/branches" | head -c 300
   ```

   Debe devolver `branches` (solo `id` y `name`) y un `formToken`.

7. Ejecutar la [verificación de aceptación](#verificación-de-aceptación) completa.

## Sucursales del formulario

El selector muestra las cuentas `role = 'local'` cuyo `business_id` coincide con `COMPLAINTS_BUSINESS_ID`. En conectocadev hoy son:

- `LA OCA BILBAO`
- `LA OCA LA REINA ` (el nombre tiene un espacio al final; se ve igual, pero conviene limpiarlo)
- `LA OCA PV`
- `Pedro Torres`: es una cuenta de cliente, no una sucursal; aparecerá en el selector

Para agregar, quitar o renombrar una sucursal se edita la cuenta en Conectoca; no hay otro mantenedor. La lista pública queda en caché hasta 5 minutos. Los reclamos antiguos conservan el nombre que tenía la sucursal al recibirse (`branch_name_snapshot`).

## Operación diaria

### Correos fallidos

Cada caso registra por separado la confirmación al cliente y el aviso central (`pending` → `sending` → `sent` | `failed`). Guardar el caso tiene prioridad: si Resend falla, el cliente igual ve su número.

- En el panel, un caso con un correo `failed` muestra una advertencia y el botón para reintentarlo. Reintentar no crea otro caso ni cambia el número.
- Para encontrarlos todos:

  ```sql
  select case_number, created_at,
         confirmation_email_status, confirmation_email_error,
         notification_email_status, notification_email_error
    from complaints
   where business_id = 'd1fa7f40-c5e1-4bc2-9ffc-c8483950b758'
     and (confirmation_email_status = 'failed' or notification_email_status = 'failed')
   order by created_at desc;
  ```

- Si todos fallan a la vez, revisar en este orden: API key revocada, dominio des-verificado en Resend y logs de la función (*Edge Functions → complaints → Logs*).
- No hay reintento automático ni cola.
- **Correos trabados.** El panel solo reintenta correos en `failed`. Si la función se corta entre guardar el caso y registrar el resultado (timeout o reinicio), el correo queda en `pending` o `sending` para siempre y no aparece el botón de reintento. Si lleva más de unos minutos así, pasarlo a `failed` y reintentar desde el panel:

  ```sql
  update complaints
     set confirmation_email_status = 'failed',
         confirmation_email_error = 'destrabado manualmente'
   where case_number = 'REC-2026-000123'
     and confirmation_email_status in ('pending', 'sending')
     and updated_at < now() - interval '10 minutes';
  -- igual con notification_email_status / notification_email_error
  ```

### Responder y cerrar

`Responder por correo` abre el cliente de correo con destinatario, asunto y cuerpo prellenados, y no cambia el estado. Una vez enviada la respuesta, marcar el caso como **Atendido**. Se puede volver a **Pendiente**.

### Evidencias

Los archivos solo se abren desde el panel, mediante URLs firmadas que duran 5 minutos. Nunca compartir esas URLs como enlace permanente.

## Mantener privado el bucket

- No cambiar `complaint-evidence` a público ni agregarle policies de Storage desde el dashboard. Solo la Edge Function (con `service_role`) lee y escribe.
- La migración `_a_` fuerza `public = false` al re-ejecutarse, pero no elimina policies agregadas a mano. Para revisarlas:

  ```sql
  select policyname, cmd, qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (qual ilike '%complaint-evidence%' or with_check ilike '%complaint-evidence%');  -- sin filas
  ```

## Rotar secretos

Después de `supabase secrets set`, volver a desplegar la función: el valor se lee al arrancar.

| Secreto | Efecto de rotarlo |
|---|---|
| `RESEND_API_KEY` | Crear la nueva key, actualizar el secreto, desplegar y recién entonces revocar la anterior. |
| `COMPLAINTS_RATE_LIMIT_SECRET` | Reinicia los contadores anti-abuso e invalida los formularios abiertos: quien envíe uno cargado con el secreto anterior verá "recarga el formulario" sin perder lo escrito. Conviene rotarlo en un horario sin tráfico. |
| `COMPLAINTS_RECIPIENT_EMAIL` / `COMPLAINTS_FROM_EMAIL` | Aplica a casos nuevos y a reintentos. El remitente debe pertenecer a un dominio verificado. |
| `APP_PUBLIC_URL` | Ver la sección siguiente. |

## Cambio de dominio

Los QR impresos apuntan a una URL fija. Si cambia el dominio público de Conectoca:

1. Mantener el dominio anterior respondiendo, o redirigiendo `/reclamos` al nuevo, mientras existan QR impresos.
2. Actualizar `APP_PUBLIC_URL` (secreto) y `VITE_APP_PUBLIC_URL` (Netlify) con el mismo valor; volver a desplegar la función y el sitio.
3. Descargar el QR desde el panel en producción, escanearlo con un teléfono y confirmar que abre `<nuevo dominio>/reclamos` sin pedir login **antes** de imprimir.
4. Comprobar que el enlace del correo central abre el caso en el nuevo dominio.

Repetir el paso 3 después de cualquier cambio de dominio o de `VITE_APP_PUBLIC_URL`.

## Límites y anti-abuso

- Hasta 5 archivos JPG, PNG, WebP o PDF, de 10 MB cada uno como máximo. El tipo se valida en el servidor.
- Descripción de 20 a 5.000 caracteres; correo obligatorio.
- Hasta 5 reclamos por hora por red de origen. La IP no se guarda: solo un HMAC efímero. Al superar el límite se responde `429` con un mensaje genérico.
- El formulario se rechaza si se envía en menos de 2 segundos o después de 2 horas de abierto, o si trae el honeypot lleno.
- Pendiente de comprobar en el entorno real: que la función acepte un envío con 5 archivos de 10 MB (≈50 MB). Si falla, el diseño contempla migrar a cargas firmadas de un solo uso, sin hacer público el bucket.

## Verificación de aceptación

Hacerla en conectocadev después del primer despliegue y de cada cambio relevante. Marcar el resultado de cada fila.

### Local

```bash
npm test
npm run build
git diff --check
```

### Matriz de seguridad

Con `BASE="$SUPABASE_URL/functions/v1/complaints"` y un token de sesión real para cada rol (copiarlo del `access_token` de la sesión en DevTools):

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/public/branches"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/admin/complaints"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" "$BASE/admin/complaints"
```

| Caso | Esperado | Resultado |
|---|---|---|
| Sin token → `public/branches` | 200 | |
| Sin token → `admin/complaints` | 401 | |
| Token `local` → `admin/complaints` | 403 | |
| Token `production` → `admin/complaints` | 403 | |
| Token admin de **otro** negocio → `admin/complaints` | 403 | |
| Token admin de La Oca → `admin/complaints` | 200 | |
| URL firmada de evidencia abierta después de 5 min | Storage la rechaza | |
| `GET` directo a `storage/v1/object/public/complaint-evidence/...` | 400/404 | |

### Recorrido completo

| # | Paso | Resultado |
|---|---|---|
| 1 | Descargar el QR desde el panel en producción y escanearlo con un teléfono: abre `/reclamos` sin login. | |
| 2 | Enviar un reclamo de sucursal con una imagen y un PDF. | |
| 3 | La pantalla, el correo del cliente y el correo central muestran el mismo `REC-AAAA-NNNNNN`. | |
| 4 | Con la sesión cerrada, abrir el enlace del correo central, iniciar sesión como admin: se abre ese caso. | |
| 5 | Abrir ambas evidencias desde el panel. | |
| 6 | `Responder por correo`: destinatario, asunto y cuerpo correctos. | |
| 7 | Volver sin enviar: el caso sigue `Pendiente`. | |
| 8 | Marcar `Atendido`, recargar: persiste. | |
| 9 | Reabrir: vuelve a `Pendiente`. | |
| 10 | Con `RESEND_API_KEY` inválida temporalmente, crear un caso: se guarda, el panel muestra `failed`; restaurar la key y reintentar: pasa a `sent` sin duplicar el caso. | |
| 11 | Enviar un reclamo con 5 archivos cercanos a 10 MB. | |
| 12 | Con un usuario no admin: el perfil no muestra `Panel de Reclamos` y el enlace profundo muestra acceso denegado. | |
| 13 | Regresión: login, crear un pedido y navegar por las pantallas habituales. | |

El sistema está listo para imprimir el QR cuando todas las filas pasan.
