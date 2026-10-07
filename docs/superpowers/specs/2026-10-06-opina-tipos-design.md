# Opina: reclamos, sugerencias y felicitaciones — Diseño

**Fecha:** 2026-10-06
**Base:** sistema de reclamos con QR único ([diseño original](2026-10-05-sistema-reclamos-design.md)), ya desplegado en conectocadev.

## Problema

El formulario público solo admite reclamos. La Oca quiere que el mismo QR sirva también para sugerencias y felicitaciones, de modo que el canal no se perciba como algo solamente negativo.

## Decisiones

| Tema | Decisión |
|---|---|
| Dirección pública | `/opina`. `/reclamos` sigue funcionando y muestra el mismo formulario. |
| Tipos | `complaint` (reclamo), `suggestion` (sugerencia), `compliment` (felicitación). |
| Flujo en el panel | Igual para los tres: Pendiente → Atendido y "Responder por correo". |
| Número de caso | Prefijo por tipo con una sola numeración compartida: `REC-`, `SUG-`, `FEL-`. |
| Implementación | Se agrega la columna `kind` al modelo existente. Tablas, Edge Function (`complaints`), rutas de API y módulos internos conservan sus nombres actuales. |

Se descartó renombrar todo a "feedback" (mucho cambio sin diferencia visible) y separar tablas por tipo (el panel tendría que unir tres fuentes).

## Datos

Migración `20261006_a_complaint_kind.sql`:

- `complaints.kind text NOT NULL DEFAULT 'complaint' CHECK (kind IN ('complaint','suggestion','compliment'))`. El default asigna `complaint` a los casos existentes (hoy solo `REC-2026-000001`); después de la migración, el servidor envía siempre el tipo explícitamente.
- `set_complaint_case_number()` usa el prefijo según `NEW.kind`: `REC`, `SUG` o `FEL`. La numeración sigue saliendo de `case_serial`, así que dos casos nunca comparten número aunque sean de tipos distintos. Los números existentes no cambian.
- `insert_complaint_with_attachments` recibe el parámetro nuevo `p_kind text` y lo inserta. La firma anterior se elimina (`DROP FUNCTION`) para que no queden dos versiones.
- Índice `(business_id, kind, created_at DESC)` para el filtro del panel.
- El mínimo de la descripción baja de 20 a 10 caracteres: se reemplaza el `CHECK` de longitud.

## API (Edge Function `complaints`)

- `POST /public/complaints` acepta el campo `kind`. Es obligatorio y se valida contra los tres valores; uno inválido o ausente responde `400` con error en el campo `kind`.
- `GET /admin/complaints` acepta el filtro `kind` y devuelve `kind` en cada fila. `GET /admin/complaints/:id` también lo incluye.
- La validación de la descripción pasa a 10–5.000 caracteres, en servidor y cliente.

## Formulario público

- Ruta: `/opina` y `/reclamos` (`isPublicComplaintPath`).
- Encabezado: "Cuéntanos tu experiencia".
- **Paso 1 nuevo — "¿Qué quieres contarnos?"**: tres botones grandes (Reclamo, Sugerencia, Felicitación) con ícono y una línea de ayuda. Ninguno viene marcado; si se envía sin elegir, aparece el error "Elige qué quieres contarnos".
- Los pasos siguientes no cambian (origen, contacto, descripción, evidencias). El placeholder de la descripción se adapta al tipo elegido.
- **Pantalla final según el tipo:**

| Tipo | Título | Texto |
|---|---|---|
| Reclamo | Recibimos tu reclamo | Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo. |
| Sugerencia | Gracias por tu sugerencia | Ya la estamos revisando con el equipo para seguir mejorando. |
| Felicitación | ¡Gracias por felicitarnos! | Le haremos llegar tus palabras al equipo. |

En los tres casos se muestra el número de caso.

## Panel

- El botón del perfil y el encabezado pasan a "Reclamos y sugerencias". El contador del botón sigue sumando los pendientes de los tres tipos.
- Etiqueta de tipo en cada fila y en el detalle: reclamo en rojo, sugerencia en azul, felicitación en verde.
- Selector "Tipo: todos" junto a estado y origen.
- Las tarjetas Pendientes / Atendidos / Total no cambian.
- `Responder por correo` usa el asunto según el tipo: "Respuesta a tu reclamo/sugerencia/felicitación <número>".
- El QR apunta a `<VITE_APP_PUBLIC_URL>/opina`.

## Correos (cuando se activen)

- Confirmación al cliente: mismo título y texto que la pantalla final, con asunto "<Título> — <número>".
- Aviso central: "Nuevo reclamo/Nueva sugerencia/Nueva felicitación <número> — <origen>".

## Compatibilidad y despliegue

El frontend nuevo envía `kind`, pero la función actual lo ignoraría, y la función nueva lo exige. El orden de despliegue evita que se rompa:

1. Aplicar la migración. La columna tiene default, así que la función actual sigue insertando casos como `complaint` sin cambios.
2. Desplegar la Edge Function nueva. A partir de aquí el frontend publicado todavía no envía `kind`: para no romper ese intervalo, el servidor acepta `kind` ausente como `complaint` **solo durante la transición** y se marca para eliminarse después del deploy de Netlify.
3. Mergear a `main` (Netlify publica el frontend nuevo).
4. Quitar la tolerancia del paso 2 y volver a desplegar la función.

## Pruebas

- Dominio: validación de `kind` (los tres valores, inválido, ausente) y del nuevo mínimo de descripción.
- Plantillas: título, texto y asunto correctos por tipo, con escape de HTML.
- Frontend: `isPublicComplaintPath` acepta `/opina` y `/reclamos`; validación exige tipo; texto de confirmación por tipo; asunto del `mailto` por tipo; filtro `kind` en la consulta.
- Base de datos (tras aplicar): `REC-2026-000001` conserva número y queda como `complaint`. Los prefijos `SUG-`/`FEL-` se verifican con los envíos de prueba del recorrido en navegador. No se usan inserciones revertidas: la columna identity consume el número aunque la transacción se revierta.
- Navegador: `/opina` en ancho móvil; envío de cada tipo muestra su mensaje; el panel muestra etiquetas y filtra por tipo.
