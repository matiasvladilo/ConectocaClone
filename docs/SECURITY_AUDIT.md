# Auditoría de seguridad — Conectoca

| Campo | Valor |
|---|---|
| Fecha | 2026-11-03 |
| Rama auditada | `main` (`fd233128`) |
| Proyecto Supabase evaluado | `conectocadev` (`xxmiujtywnnlqmekakzq`) — **es el entorno en producción** |
| Alcance | Repositorio completo, Edge Functions, esquema y políticas de la base real, dependencias |
| Método | Revisión de código + inspección de solo lectura del catálogo de Postgres (`pg_policies`, grants, `pg_proc`) + lints de Supabase + una prueba de caja negra con la clave anónima pública |

**Ningún valor de secreto se reproduce en este documento.** Donde hace falta señalar una credencial se indica el archivo y la línea.

## Cómo se verificó cada cosa

No se dio por buena ninguna defensa sin comprobarla contra la base real:

- **Políticas RLS y grants**: consultados en vivo (`pg_policies`, `information_schema.role_table_grants`). Hay **12 políticas en total** sobre 28 tablas.
- **Funciones `SECURITY DEFINER`**: se consultó `has_function_privilege('anon'|'authenticated', …, 'EXECUTE')` y el cuerpo real con `pg_get_functiondef`, no la migración del repo (el repo y la base divergen).
- **Tablas sin RLS**: comprobadas con una petición `GET` real a PostgREST usando únicamente la clave anónima (la que viaja en el bundle JS). Devolvió **HTTP 200 con datos de negocio**.
- **Cuentas demo**: se confirmó que existen en `profiles` de la base real.
- **No se ejecutó ninguna escritura, migración ni explotación destructiva contra producción.** Los hallazgos que implicarían escribir (C-01, C-02) están probados por la combinación de política + grant + cuerpo de la función, que es concluyente, y se dejan sin explotar a propósito.

## Resumen

| Severidad | Cantidad |
|---|---|
| Crítica | 3 |
| Alta | 8 |
| Media | 9 |
| Baja | 6 |

El patrón de fondo es uno solo: **toda la autorización vive en el Edge Function `make-server-6d979413`, y la API REST de Supabase está expuesta en paralelo sin equivalente.** El Edge Function hace chequeos razonables y bastante consistentes (rol + `business_id` en casi todas las rutas), pero cualquier cliente con la clave anónima — que es pública por diseño y está en el bundle — puede ir directo a `/rest/v1/` y a `/rest/v1/rpc/` y saltarse ese código por completo. Las tres críticas son instancias de eso.

Como contraste: la Edge Function `complaints` está construida con el criterio correcto (middleware `requireAdmin` único, CORS restringido al origen propio, versión de Hono pineada, `REVOKE` explícito de las RPC, rate limit con HMAC, saneado de nombres de archivo, honeypot). Sirve de modelo para la Fase 2; el problema no es falta de criterio en el proyecto, es que ese criterio no se aplicó hacia atrás sobre `make-server`.

### Cadena de ataque completa (de cero conocimiento a admin del negocio real)

Las críticas se componen. Partiendo solo de la clave anónima extraída del bundle:

1. **C-03** → `GET /rest/v1/backup_ingredients_20260629` devuelve, sin autenticar, costos y proveedores **y el `business_id` del negocio real** (`La Oca`: 468 productos, 6.003 pedidos).
2. **A-01 / A-02** → se obtiene una sesión autenticada: con las credenciales demo del repo, o registrando una cuenta nueva por el endpoint público de signup.
3. **C-02** → `PATCH /rest/v1/profiles?id=eq.<uno mismo>` con `{"role":"admin","business_id":"<el de La Oca>"}`. La política `profiles_update_own` autoriza el `UPDATE` por fila y **no restringe columnas**, y `authenticated` tiene el grant de `UPDATE`.
4. Resultado: administrador del negocio real, con acceso a productos, costos, proveedores, recetas, pedidos, nombres y direcciones de locales.

Y en paralelo, **C-01** permite alterar pedidos y destruir el stock de cualquier negocio **sin siquiera autenticarse**.

---

# Críticas

## C-01 — Dos RPC `SECURITY DEFINER` sin autorización, ejecutables por `anon`

**Evidencia**

```
proname                  | anon_exec | auth_exec
create_order_kv          | true      | true
create_order_with_stock  | true      | true
```

Cuerpo real en producción (`pg_get_functiondef`): `create_order_with_stock(order_id text, new_data jsonb)` no consulta `auth.uid()` para autorizar en ningún punto. Toma `business_id` y `user_id` directamente del JSONB del cliente:

```sql
NULLIF(new_data->>'businessId', '')::UUID,
NULLIF(new_data->>'userId', '')::UUID,
```

y descuenta stock buscando el producto solo por id, sin filtrar por negocio:

```sql
SELECT id, name, stock, ... FROM products WHERE id = pid FOR UPDATE;
...
UPDATE products SET stock = stock - qty WHERE id = pid;
```

`create_order_kv` además hace `ON CONFLICT (id) DO UPDATE` sobre `orders` y `DELETE FROM order_items WHERE order_id = v_order_id`.

**Impacto**

Sin autenticación alguna, con la clave anónima:
- Crear pedidos en cualquier negocio con `business_id` y `user_id` arbitrarios.
- **Sobrescribir cualquier pedido existente** por UUID (estado, total, `customer_name`, `delivery_address`) y **borrar sus líneas** — 6.040 pedidos y 34.705 líneas expuestas a manipulación y borrado.
- **Vaciar el stock de cualquier producto** por UUID y consumir sus lotes FIFO, corrompiendo el costeo y el kardex (`created_by` queda en `NULL`).

Es pérdida de integridad sobre los datos operativos centrales, y es la clase de daño que no se detecta a tiempo ni se reconstruye.

**Nota sobre la inconsistencia**: el proyecto ya aplicó exactamente el arreglo correcto a la función hermana. `20261004_j_update_order_with_stock_autorizacion.sql` le agregó autorización a `update_order_with_stock` y hizo `REVOKE … FROM PUBLIC, anon`; `previsualizar_precio_lotes*` también están revocadas de `anon`. `create_order_with_stock` y `create_order_kv` quedaron fuera de ese barrido.

**Solución**

1. `REVOKE EXECUTE ON FUNCTION public.create_order_with_stock(text, jsonb) FROM PUBLIC, anon;` e ídem para `create_order_kv`. `create_order_kv` no debería ser invocable por `authenticated` en absoluto: es una subrutina interna de la otra.
2. Añadir autorización dentro de `create_order_with_stock`, con el mismo criterio que ya usa `update_order_with_stock`: derivar `business_id` y `user_id` de `auth.uid()` **ignorando lo que manda el cliente**, y rechazar con `NO_AUTORIZADO` si algún `productId` del payload no pertenece a ese negocio.
3. Derivar también el `total` del servidor (ya se recalcula en el paso 4 de la función; conviene no aceptar el del cliente ni como valor inicial).

## C-02 — Escalada de privilegios a admin vía PostgREST sobre `profiles`

**Evidencia**

```
tbl             | policyname          | cmd    | qual                  | with_check
public.profiles | profiles_update_own | UPDATE | (auth.uid() = id)     | null
```

```
table_name | grantee       | privs
profiles   | authenticated | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

La política autoriza el `UPDATE` de la propia fila y **no limita qué columnas** se pueden escribir. `role` y `business_id` viven en esa misma fila.

**Impacto**

Cualquier usuario autenticado, con cualquier rol, puede ejecutar un `PATCH` contra `/rest/v1/profiles?id=eq.<su id>` y asignarse `role = 'admin'` y `business_id = <cualquier negocio>`. Esto concede admin del negocio real (`La Oca`) a cualquiera que consiga una sesión, incluida una cuenta recién registrada por el signup público.

El Edge Function hace lo correcto —`PUT /profile` (índice.ts:569-577) tiene una lista blanca estricta de `name`, `address` y `notificationPrefs`, y no toca `role` ni `business_id`— pero esa lista blanca es irrelevante mientras exista la ruta REST paralela.

> Verificado por inspección de política y grants. **No se ejecutó la escritura**: habría modificado el rol de un usuario en producción.

**Solución**

Sustituir la política por una que fije las columnas sensibles, y revocar el grant de columna:

```sql
-- Opción A (recomendada): quitar el UPDATE directo y dejar que todo pase por el Edge Function
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- Opción B: si se quiere conservar el UPDATE directo, limitarlo por columna
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (name, address, notification_pref_order_status, notification_pref_production)
  ON public.profiles TO authenticated;
```

Con cualquiera de las dos, añadir además `WITH CHECK` explícito a la política para que el cambio de `role`/`business_id` quede imposible incluso si alguien reinstaura el grant:

```sql
ALTER POLICY profiles_update_own ON public.profiles
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND business_id = (SELECT business_id FROM profiles WHERE id = auth.uid())
  );
```

El mismo razonamiento aplica a `notifications_update_own`, que también carece de `WITH CHECK` y de restricción de columnas (impacto menor: solo afecta filas propias).

## C-03 — Tres tablas de respaldo sin RLS, con lectura y escritura anónimas

**Evidencia** — lint `rls_disabled_in_public` (nivel ERROR) más los grants:

```
backup_ingredients_20260629         | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
backup_product_ingredients_20260629 | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
backup_products_labor_20260629      | anon | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

**Probado en vivo** contra producción, únicamente con la clave anónima pública, sin sesión:

```
GET /rest/v1/backup_ingredients_20260629?select=*&limit=2          → HTTP 200
GET /rest/v1/backup_products_labor_20260629?select=*&limit=2       → HTTP 200
GET /rest/v1/backup_product_ingredients_20260629?select=*&limit=2  → HTTP 200
```

La primera respuesta incluye `business_id`, `name`, `unit`, `current_stock`, `min_stock`, `cost_per_unit` y `supplier` de materias primas reales.

**Impacto**

- Fuga sin autenticar de **91 materias primas** con costo unitario y proveedor, **305 líneas de receta** y **95 costos de mano de obra**. Es información comercial sensible: estructura de costos y lista de proveedores.
- Filtra el `business_id` del negocio real, que es el punto de partida de la cadena de C-02.
- Los grants incluyen `UPDATE`, `DELETE` y `TRUNCATE`: cualquiera puede **borrar los respaldos**, que es justamente lo que se usaría para recuperarse de un incidente como C-01.

**Solución**

Son respaldos puntuales del 2026-06-29 de una migración ya aplicada (`20260629_migrate_labor_cost.sql`). No deberían estar en el esquema `public`, que PostgREST expone.

```sql
-- Preferido: sacarlas de la API
CREATE SCHEMA IF NOT EXISTS backups;
ALTER TABLE public.backup_ingredients_20260629         SET SCHEMA backups;
ALTER TABLE public.backup_product_ingredients_20260629 SET SCHEMA backups;
ALTER TABLE public.backup_products_labor_20260629      SET SCHEMA backups;
REVOKE ALL ON ALL TABLES IN SCHEMA backups FROM anon, authenticated;
```

Mínimo inmediato si mover el esquema se posterga: `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` en las tres (sin políticas queda en denegar-todo, que es lo correcto para un respaldo) **y** `REVOKE ALL … FROM anon, authenticated;`. Evaluar luego si conviene eliminarlas: tras cuatro meses de la migración, el respaldo probablemente ya no aporta y sí suma superficie. **Esa decisión es del dueño del dato, no de la auditoría.**

---

# Altas

## A-01 — Credenciales demo en el repositorio, con la cuenta activa en la base real

**Evidencia** — `src/App.tsx:446-472` define cuatro cuentas demo con la contraseña en claro (misma para las cuatro), y `src/App.tsx:563-566` la vuelve a usar en un `signInWithPassword`. En la base real:

```
email                | role       | tiene_negocio
admin@demo.com       | admin      | true
despacho@demo.com    | dispatch   | true
local@demo.com       | local      | true
produccion@demo.com  | production | false
```

**Impacto** — Cualquiera que lea el repositorio obtiene una sesión con rol `admin`. El negocio demo (`Negocio Demo - La Oca`) está vacío (0 productos, 0 pedidos), así que el daño directo es acotado, pero **la sesión es el eslabón 2 de la cadena hacia C-02**, que sí llega al negocio real.

Atenuante parcial: `initializeDemoUsers()` está comentado en `src/App.tsx:317`, y se verificó que el literal fue eliminado por tree-shaking del bundle actual (`grep` sobre `build/assets/*.js`: 0 coincidencias). La credencial sigue estando en el código fuente y en el historial de git, y la cuenta sigue viva.

**Solución** — Rotar o eliminar las cuatro cuentas demo en Supabase Auth; borrar el bloque de `App.tsx` junto con `initializeDemoProducts`, que es código muerto. Si se quiere conservar un entorno de demostración, debe vivir en un proyecto Supabase aparte (ver Fase 5, separación de entornos), nunca en el que tiene los datos reales.

## A-02 — El cliente elige su propio rol al registrarse

**Evidencia** — `supabase/functions/make-server-6d979413/index.ts:458`:

```ts
const userRole = businessAction === 'create' ? 'admin' : (role || 'user');
```

`role` viene sin validar del cuerpo de la petición (línea 375). La UI expone el selector completo, incluido `admin — Acceso completo al sistema` (`src/components/LoginScreen.tsx:469-528`).

**Impacto** — El flujo previsto es que un admin comparta el código de invitación para que el personal se registre como `local` o `worker`. Cualquiera que reciba ese código puede en cambio elegir `admin` desde el desplegable y queda con acceso completo al negocio. No hace falta ninguna herramienta: está en el formulario.

Agravantes en el mismo endpoint:
- `email_confirm: true` (línea 464) — el correo nunca se verifica, así que el registro no requiere acceso a la casilla.
- `DEMOCODE` está hardcodeado como código de invitación (líneas 393-397) y reutiliza un negocio existente.
- Los códigos de invitación se generan con `Math.random().toString(36)` (líneas 395 y 646), que no es un PRNG criptográfico.
- No hay rate limit, así que el endpoint admite fuerza bruta sobre códigos.

**Solución** — Decidir el rol en el servidor, no en el cliente: en la vía `join`, asignar siempre el rol mínimo (`user`) y que un admin del negocio promueva después desde el panel de miembros. Si se quiere preservar la comodidad de elegir rol al entrar, emitir invitaciones con rol embebido (un token firmado de un solo uso por persona) en lugar de un código compartido. Eliminar el caso `DEMOCODE`. Generar los códigos con `crypto.getRandomValues`. Añadir rate limit por IP.

## A-03 — IDOR multi-tenant en las cuatro rutas de recetas

**Evidencia** — ninguna de las cuatro compara el `business_id` del producto con el del perfil:

| Ruta | Línea | Rol | `business_id` |
|---|---|---|---|
| `GET /products/:id/ingredients` | 1161 | **sin chequeo** | **sin chequeo** |
| `PUT /products/:id/ingredients` | 1199 | admin/production | **sin chequeo** |
| `POST /products/:id/ingredients` | 1253 | admin/production | **sin chequeo** |
| `DELETE /products/:productId/ingredients/:ingredientId` | 1314 | admin/production | **sin chequeo** |

La consulta es siempre `.eq('id', productId).maybeSingle()` sin filtro de negocio, y corre con `supabaseAdmin` (service role), que salta RLS.

**Impacto** — Con el UUID de un producto ajeno: la `GET` revela la receta completa con costos por unidad y stock de cada materia prima **a cualquier usuario autenticado de cualquier negocio, sin importar su rol**. Las tres de escritura permiten que un admin del negocio A reescriba, amplíe o borre las recetas del negocio B (`PUT` hace `DELETE … WHERE product_id = …` antes de reinsertar), y `POST` admite vincular un ingrediente del negocio A a un producto del negocio B, mezclando datos entre inquilinos.

**Solución** — Añadir a las cuatro el chequeo que el resto del archivo ya aplica (`if (existing.business_id !== profile.businessId) return c.json({ error: 'No tienes permiso' }, 403)`), seleccionando `business_id` en la consulta del producto. Añadir a la `GET` el chequeo de rol `puedeGestionarMateriasPrimas`, que es el criterio que usan sus tres hermanas. Validar también que el `ingredientId` pertenezca al negocio.

## A-04 — IDOR en `GET /orders/:id`

**Evidencia** — `index.ts:1549-1567`. Se busca el pedido por id sin filtro de negocio y la única comprobación es:

```ts
if (order.user_id !== userId && !isStaff) return c.json({ error: 'No autorizado' }, 403);
```

`isStaff` es cierto para `admin`, `production`, `dispatch` y `pastry` **de cualquier negocio**.

**Impacto** — Cualquier usuario con rol operativo puede leer pedidos de otros inquilinos por UUID: líneas, totales, `customer_name` (que en este sistema es el local) y `delivery_address`. Requiere conocer el UUID, lo que acota la explotación masiva, pero los UUID de pedido aparecen en URLs, guías de despacho y notificaciones. Nótese que `GET /orders` (línea 1495) sí filtra por `business_id`: la omisión es puntual.

**Solución** — Agregar `if (order.business_id !== profile?.businessId) return c.json({ error: 'No autorizado' }, 403);` antes del chequeo de rol.

## A-05 — `POST /notifications` acepta cualquier destinatario

**Evidencia** — `index.ts:1995-2007`:

```ts
const { title, message, type, orderId, targetUserId } = await c.req.json();
...
const targetId = targetUserId || authUserId;
```

`targetUserId` no se valida contra el negocio del emisor ni contra ningún rol.

**Impacto** — Cualquier usuario autenticado puede insertar notificaciones con título y texto arbitrarios en la bandeja de cualquier usuario de cualquier negocio. Es un vector de phishing dentro de la aplicación, en una superficie que el usuario tiene motivos para considerar confiable (y que además dispara notificación sonora). También permite inundar la tabla, que ya tiene 20.605 filas.

**Solución** — Exigir que el emisor tenga rol con permiso para notificar (`admin`, `production`, `dispatch`) y que el perfil de `targetUserId` comparta `business_id` con el emisor. Rechazar con 403 en caso contrario.

## A-06 — Dependencias vulnerables en producción

**Evidencia** — `npm audit`: 14 vulnerabilidades (1 crítica, 11 altas, 1 moderada, 1 baja).

Las que están en el camino de ejecución del cliente:

| Paquete | Severidad | Vía | Nota |
|---|---|---|---|
| `dompurify` 3.4.15 | **crítica** | `jspdf@4.2.1` | 5 avisos, varios de XSS en DOM. Se usa en la exportación de PDF y en el generador de etiquetas |
| `xlsx` 0.18.5 | alta | directa | **`fixAvailable: false`** — la versión corregida no se publica en npm |
| `vite` | alta | directa | Corrige con 6.4.5 (no mayor) |
| `browserslist`, `postcss`, `source-map-js`, `nanoid`, `picomatch`, `form-data`, `lodash`, `ws`, `@babel/core`, `baseline-browser-mapping` | alta/mod/baja | transitivas de build | Mayoría en tiempo de compilación |

`hono` también aparece como alta, pero la copia de `node_modules` no se despliega: las Edge Functions resuelven su propio Hono en Deno (ver A-07).

**Impacto** — `dompurify` crítico en una ruta que procesa nombres de producto y datos de etiqueta controlados por el usuario es el riesgo real de este grupo. `xlsx` 0.18.5 arrastra contaminación de prototipo y ReDoS sin corrección disponible en npm, y procesa archivos en la exportación a Excel.

**Solución** — `npm audit fix` cubre todo menos `xlsx`. Para `xlsx`, migrar a la distribución oficial de SheetJS (`npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) o cambiar a `exceljs`. Elevar `jspdf` a la versión que traiga `dompurify >= 3.4.17`. Fijar `npm audit` en el pipeline de la Fase 5.

## A-07 — Dependencias sin versión fija: `npm:hono` y rangos `"*"`

**Evidencia**

- `supabase/functions/make-server-6d979413/index.ts:1-4` importa `npm:hono`, `npm:hono/cors`, `npm:hono/logger` **sin versión**, y `jsr:@supabase/supabase-js@2` (mayor flotante).
- `package.json` declara `"*"` en `@supabase/supabase-js`, `hono`, `vite`, `clsx`, `motion`, `tailwind-merge`, `path`, `@vitejs/plugin-react`.

Comparar con `supabase/functions/complaints/index.ts:1-2`, que pinea `npm:hono@4.12.5`. El criterio correcto ya existe en el repo; no se aplicó al otro function.

**Impacto** — Cada despliegue de `make-server` resuelve la última versión publicada de Hono en ese instante. Una versión comprometida o con una regresión entra en producción sin que medie ningún cambio en el repositorio, y el despliegue no es reproducible: no hay forma de saber qué código corrió. Los `"*"` del `package.json` tienen el mismo efecto sobre el bundle web. `path` además es un shim npm obsoleto e innecesario (`vite.config.ts` usa el `path` de Node).

**Solución** — Pinear Hono en `make-server` a la misma versión que usa `complaints`, y `@supabase/supabase-js` a una menor concreta. Reemplazar cada `"*"` del `package.json` por el rango de la versión instalada (`package-lock.json` la tiene). Eliminar la dependencia `path`.

## A-08 — El código de invitación es legible por cualquier miembro vía PostgREST

**Evidencia** — La política es de fila completa, sin restricción de columnas:

```
public.businesses | businesses_select_member | SELECT | ((id = auth_business_id()) OR (owner_id = auth.uid()))
```

El Edge Function sí oculta el código a quien no es propietario (`index.ts:618`: `inviteCode: isOwner ? biz.invite_code : undefined`), pero `GET /rest/v1/businesses?select=invite_code` devuelve la columna a cualquier miembro.

**Impacto** — Elude el control de la línea 618. Combinado con A-02, cualquier miembro —incluido un `local`— puede leer el código y registrar una cuenta nueva con rol `admin`.

**Solución** — `REVOKE SELECT ON public.businesses FROM anon, authenticated;` y volver a otorgar solo las columnas no sensibles (`GRANT SELECT (id, name, owner_id, created_at) … TO authenticated;`). El código de invitación debe entregarse únicamente por el Edge Function, que ya aplica la regla de propietario.

---

# Medias

## M-01 — CORS abierto en `make-server`

`index.ts:34-43`: `origin: "*"` con `allowHeaders: ["Content-Type", "Authorization"]` y todos los métodos. Cualquier sitio web puede invocar la API desde el navegador de un usuario. No hay cookies de sesión (el token va en la cabecera `Authorization`), así que no es CSRF directo, pero sí habilita que una página maliciosa que logre obtener un token lo use desde el navegador de la víctima, y amplía la superficie de A-02/A-05. `complaints` lo hace bien (`isAllowedComplaintOrigin`). **Solución**: restringir a `VITE_APP_PUBLIC_URL` más los orígenes de Capacitor (`capacitor://localhost`, `http://localhost`) cuando se cierre la Fase 3.

## M-02 — Sin cabeceras de seguridad en Netlify

`netlify.toml` solo define build y el redirect de SPA. No hay `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` ni `Referrer-Policy`, y `index.html` tampoco las aporta. Falta la defensa en profundidad que contendría un XSS (A-06) y el sitio es embebible en un iframe. **Solución**: bloque `[[headers]]` en `netlify.toml` con CSP que permita solo `self` y el host de Supabase, más las otras cuatro cabeceras.

## M-03 — Ruta legacy `POST /orders`: descuento de stock no atómico y total del cliente

`index.ts:1574-1688`. Lee el stock, calcula en el Edge Function y escribe (`1587-1610`), sin `FOR UPDATE` ni transacción: dos pedidos simultáneos del mismo producto pueden sobrevender. Además guarda `total: parseFloat(total)` tal como lo manda el cliente, y no restringe el rol. Es la ruta que la RPC `create_order_with_stock` vino a reemplazar justamente por esto; el cliente (`src/utils/api.tsx:357`) ya usa la RPC, pero el endpoint sigue vivo y accesible. **Solución**: eliminar la ruta, o reescribirla para delegar en la RPC ya endurecida (tras arreglar C-01).

## M-04 — Validación débil en la subida de imágenes

`index.ts:1430-1474`. El tipo se valida con `file.type.startsWith('image/')`, que es la cabecera que declara el cliente y es trivial de falsificar; no se inspeccionan los bytes. La extensión sale de `file.name.split('.').pop()` sin lista blanca ni saneado, y se concatena en la clave del objeto (`${businessId}/${Date.now()}-...${fileExt}`), así que admite caracteres de ruta. Un `image/svg+xml` aceptado y servido desde la URL firmada es un XSS almacenado. La URL firmada dura 31.536.000 s (un año), lo que en la práctica la vuelve pública y permanente. No hay chequeo de rol: cualquier usuario con negocio puede subir. **Solución**: lista blanca de extensión y de MIME (`png`, `jpg`, `jpeg`, `webp`), verificar la firma mágica de los bytes, generar la extensión a partir del MIME validado en lugar del nombre, acortar la vigencia de la URL firmada y renovarla a demanda, y exigir el rol que ya exige la creación de productos. El módulo `complaints` tiene `safeFileName` y `validateAttachments`: reutilizar ese criterio.

## M-05 — Fallback hardcodeado a un proyecto Supabase abandonado

`src/utils/supabase/info.tsx:9-16`: si faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, el código cae a un id de proyecto y una clave anónima embebidos en el fuente, que apuntan a un proyecto distinto del actual y que ya no figura en la organización. Un despliegue con las variables mal configuradas no falla: arranca callado contra un proyecto equivocado, y los usuarios ven una app vacía o escriben datos en el lugar incorrecto. La clave es anónima (pública por diseño), así que no es una fuga de secreto, pero sigue en el historial de git. **Solución**: eliminar el fallback y lanzar un error explícito si las variables no están. Un fallo ruidoso en el arranque es mejor que un entorno silenciosamente equivocado.

## M-06 — Sin política de contraseñas

El endpoint de signup solo comprueba que `password` no esté vacío (`index.ts:377`). La única restricción es un `minLength={6}` en el HTML (`LoginScreen.tsx:665`), que no se aplica del lado del servidor. El lint de Supabase confirma además que **la protección contra contraseñas filtradas (HaveIBeenPwned) está desactivada**. **Solución**: validar longitud y complejidad mínimas en el servidor, y activar la protección de contraseñas filtradas en la configuración de Auth.

## M-07 — El registro no verifica el correo

`index.ts:464`: `email_confirm: true` da la cuenta por verificada sin enviar confirmación. Se puede registrar con una dirección ajena o inexistente. Junto con A-02 y la falta de rate limit, permite crear cuentas en masa. **Solución**: pasar a `email_confirm: false` y apoyarse en el flujo de confirmación de Supabase (hay un documento de configuración de correo en `src/CONFIGURACION_EMAIL_SUPABASE.md`).

## M-08 — `GET /business/members` expone los correos de todo el negocio

`index.ts:659-691`: devuelve nombre, **correo**, rol y fecha de alta de todos los miembros a cualquier usuario del negocio, sin chequeo de rol. Es la base para phishing interno dirigido, y se combina con A-05 (ya se tienen los ids de destino). **Solución**: restringir a `admin`, u omitir el correo para los demás roles.

## M-09 — Sin rate limiting en `make-server`

Ningún endpoint lo tiene. `POST /signup` y `POST /auth/reset-password` son anónimos, y el primero permite probar códigos de invitación en masa (A-02). `complaints` sí implementa rate limit con HMAC y tabla dedicada. **Solución**: aplicar el mismo mecanismo a los endpoints anónimos de `make-server`.

---

# Bajas

## B-01 — El service worker tiene una rama de caché para respuestas de API

`public/service-worker.js:64-81` guarda en `RUNTIME_CACHE` toda respuesta de URLs que contengan `/functions/v1/`. Hoy es inalcanzable: la línea 54 descarta lo que no sea del mismo origen, y la API vive en `*.supabase.co`. Pero el código está armado y se activaría si la API pasara a servirse del mismo origen (un proxy de Netlify) **o bajo Capacitor, donde el origen de la aplicación cambia**. En ese escenario, respuestas autenticadas de pedidos, productos y perfiles quedarían en el almacenamiento del dispositivo y sobrevivirían al cierre de sesión. **Relevante para la Fase 3**: revisar esta rama antes de empaquetar en móvil. **Solución**: eliminar la rama, o excluir explícitamente las respuestas que lleven `Authorization` y limpiar `RUNTIME_CACHE` al cerrar sesión.

## B-02 — Fragmento del JWT en la consola

`src/components/Analytics.tsx:339` registra la longitud del token y sus primeros 30 caracteres. No incluye la firma, así que el token no es reutilizable a partir de ese registro, pero expone el encabezado y el comienzo del payload en la consola del navegador y en cualquier recolector de logs. **Solución**: quitar la línea.

## B-03 — Tres funciones con `search_path` mutable

Lint `function_search_path_mutable`: `_update_updated_at`, `auth_business_id` y `create_order_kv`. `auth_business_id` es la más relevante, porque es `SECURITY DEFINER` y es de quien dependen seis políticas RLS. Explotarlo exige poder crear objetos en un esquema del `search_path`, lo que no está al alcance de `anon` ni `authenticated`, de ahí la severidad baja. **Solución**: `ALTER FUNCTION … SET search_path = public;` en las tres. (El resto del repositorio ya lo hace de forma sistemática.)

## B-04 — Artefactos de compilación versionados

`build/` está en `.gitignore`, pero tres archivos quedaron dentro del índice de git desde antes (`build/index.html`, `build/assets/xlsx-*.js`, `build/assets/logo-*.png`), y `build/index.html` aparece modificado en el árbol de trabajo. Versionar artefactos genera diffs ruidosos y arriesga publicar en el repositorio lo que haya en el bundle del momento. **Solución**: `git rm --cached` de los tres.

## B-05 — Detalle de error interno hacia el cliente

`index.ts:1545` responde `details: err.message` en el 500 de `GET /orders`. Filtra mensajes de Postgres (nombres de columna, constraints) a quien llame. El resto del archivo ya devuelve mensajes genéricos. **Solución**: quitar `details`.

## B-06 — Más de 90 documentos de notas dentro de `src/`

`src/` contiene ~90 archivos `.md` de notas de desarrollo (`BUGFIX_*`, `DEPLOY_*`, `TEST_*`, `SOLUCION_*`). No contienen secretos —se revisaron— pero varios describen la estructura interna y los flujos de autenticación, y `src/CODIGO_INVITACION_ADMIN.md` documenta el mecanismo de invitación. Al estar bajo `src/` corren el riesgo de acabar copiados a un artefacto de publicación. **Solución**: moverlos a `docs/historico/`.

---

# Lo que está bien

Vale dejarlo asentado, porque marca el estándar al que conviene llevar el resto:

- **El módulo `complaints`** es la referencia: middleware `requireAdmin` único en lugar de chequeos repetidos, CORS por origen permitido, Hono pineado, `REVOKE`/`GRANT` explícitos en sus RPC, rate limit con HMAC y tabla propia, honeypot, `safeFileName`, `validateAttachments`, errores tipados que no filtran internals, y cobertura de pruebas.
- **El endurecimiento de `update_order_with_stock`** (migración `…_j_…`) hizo exactamente lo que C-01 pide para su función hermana: autorización dentro de la función más `REVOKE` de `anon`.
- **`PUT /profile`** usa lista blanca de campos y no permite tocar `role` ni `business_id`. El problema de C-02 no es ese código, es la ruta REST paralela.
- **El resto del Edge Function** aplica el par rol + `business_id` de forma bastante consistente; los IDOR de A-03 y A-04 son omisiones puntuales, no ausencia de criterio.
- **`/auth/reset-password`** responde igual exista o no el correo, evitando enumeración de usuarios.
- Las 15 tablas con RLS activada y sin políticas quedan en **denegar todo** para `anon` y `authenticated`, que es el valor correcto para un modelo donde todo pasa por el service role. El lint las marca como INFO; **no son un hallazgo**. El problema real es el inverso: las pocas tablas que sí tienen políticas las tienen demasiado amplias (C-02, A-08).

---

# Orden de corrección sugerido para la Fase 2

Por relación daño/esfuerzo:

1. **C-03** — `REVOKE` más cambio de esquema. Minutos, y corta el punto de entrada de toda la cadena.
2. **C-01** — `REVOKE` inmediato de ambas RPC; después, autorización dentro de `create_order_with_stock` copiando el patrón de `update_order_with_stock`.
3. **C-02** — `REVOKE UPDATE` sobre `profiles` más grant por columna y `WITH CHECK`.
4. **A-01** — rotar o eliminar las cuentas demo; borrar el código muerto.
5. **A-02** — el rol lo decide el servidor en la vía `join`.
6. **A-03, A-04, A-05, A-08** — chequeos faltantes de `business_id` y de rol. Es el momento de **centralizar la autorización** en un middleware al estilo `requireAdmin` de `complaints`, en lugar de repetir el par de condiciones en 60 rutas: la causa raíz de estos cuatro hallazgos es precisamente que el chequeo es copiado a mano y se puede olvidar.
7. **A-06, A-07** — `npm audit fix`, migrar `xlsx`, pinear versiones.
8. Medias y bajas.

**Restricciones asumidas para la Fase 2**: rama de trabajo aparte, sin migraciones destructivas y sin aplicar nada contra la base de producción de forma automática. Los cambios de `REVOKE`/`GRANT`/política se entregarán como migraciones versionadas con el SQL a la vista, para que se apliquen con autorización explícita.
