# Stock: una sola vía, y que nadie pise a nadie — Diseño

**Fecha:** 2026-09-07

## Problema

Los usuarios reportan que el stock "se coloca y después desaparece", o que "hay que colocarlo de nuevo". El reporte concreto: *"el viernes dejó todo listo stockeado, jugo Jumex, y hoy está todo sin stock."*

La investigación encontró **dos defectos distintos**. El que más duele es el que no deja rastro.

### Problema A — El guardado fantasma (principal)

El campo "Stock \*" del formulario de edición sólo se persiste si el usuario llega hasta el botón **"Guardar Cambios"**. El diálogo se declara así (`ProductManagement.tsx:888`):

```jsx
<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
```

Sin guarda de cambios sin guardar. Radix lo cierra con **Escape, con un clic afuera, o con la X**, y las tres descartan `formData` en silencio. En un teléfono, "Guardar Cambios" queda debajo de Categoría, Área de Producción, Imagen del Producto y Receta: un scroll largo.

Alguien que carga stock de veinte productos —tocar tarjeta, escribir el número, cerrar con la X, siguiente— **no guarda nada, y la app nunca se lo dice**.

**Evidencia.** El viernes 4/09 no hay un solo evento de stock de ningún Jumex. Ninguno. Y el `updated_at` de cada producto Jumex coincide exactamente con su último evento del kardex, así que tampoco hubo escrituras invisibles: simplemente no llegó nada al servidor. Hoy 7/09 a las 19:21 alguien puso el Jumex Piña-coco en 48 — el "colocarlo de nuevo" del reporte.

La correlación que lo confirma: el viernes **sí** se guardaron 25 movimientos manuales. El lote de las 23:27-23:41 es entero de tipo `reposicion`, o sea que salió de `StockAdjustDialog`, donde el botón **Confirmar** está a la vista sin scroll. Ninguno de esos se perdió. **El camino con el botón visible funciona; el camino con el botón debajo del scroll se pierde.**

Este defecto es invisible por construcción: el kardex registra escrituras que llegaron, no intenciones. Un stock tipeado y descartado es indistinguible de un stock que nadie tocó. Por eso no se puede reconstruir lo perdido — sólo evitar que se repita.

### Problema B — La escritura vieja pisa movimientos reales

**Toda escritura manual de stock manda un valor absoluto calculado en el navegador.** El backend lo aplica a ciegas (`index.ts:892`): no compara con el valor previo ni controla versiones. El último que escribe gana.

Ni siquiera el botón "Sumar" es una suma real. `StockAdjustDialog.tsx:45` hace la aritmética en el cliente:

```
nuevoStock = stockActual + cantidad   // stockActual sale de la lista cargada en el navegador
```

y manda el resultado como total. Si entre que se abrió la pantalla y se apretó Confirmar entró un pedido, ese "+8" pisa la venta.

El contraste confirma el diagnóstico: **la venta de un pedido sí está bien hecha.** La RPC `create_order_with_stock` hace `UPDATE products SET stock = stock - qty` — relativo, atómico, en el servidor. El camino automático es correcto y los manuales lo sobrescriben.

Tres casos reproducidos en producción:

```
Aceite Natura — 7/sep (un solo usuario)
  19:21:56  ajuste        → 8
  19:23:14  reposición +8 → 16
  19:24:03  ajuste        → 0      (49 s después)

SCORE ENERGY DRINK — 4/sep (un solo usuario)
  17:52:23  ajuste +26 → 34
  17:52:52  ajuste −26 → 8         (29 s después, vuelve exacto al valor previo)

SCORE GORILLA — 6/sep (dos usuarios)
  16:46:49  ajuste                      → 4    (usuario A)
  16:48:55  devolución +24 de un pedido → 28   (usuario B)
  16:51:37  ajuste −24                  → 4    (usuario A: la devolución desaparece)
```

Las tres escrituras anómalas son de tipo `ajuste` — es decir, sin `modo`, o con `modo: 'total'`. Ninguna `reposicion` causó una anomalía.

**Frecuencia relativa:** A es alto y silencioso; B son 3 casos en dos semanas, pero deja rastro. La investigación encontró B primero justamente porque es el único que deja evidencia.

### Esto ya estaba anticipado

El diseño del 7/ago (`2026-08-07-ajuste-rapido-de-stock-design.md`) listó el problema B como riesgo aceptado:

> "Sin bloqueo de concurrencia. (...) resolverlo bien requeriría un endpoint de incremento atómico en el servidor, que está fuera de alcance."

Este spec construye ese endpoint. No es un hallazgo nuevo: es una deuda que venció.

También contribuye a la invisibilidad que el "Componente 3" del spec del 29/jun (refrescar productos en el polling de `App.tsx`) nunca se implementó: el `setInterval` de `App.tsx:320` refresca pedidos y notificaciones, no productos.

### Un tercer defecto, chico y determinista

El checkbox "∞ Stock Ilimitado" (`ProductManagement.tsx:1043`):

```js
stock: checked === true ? '0' : formData.stock
```

Al marcarlo pone el campo en `'0'`. Al desmarcarlo lo deja en `'0'`, porque `formData.stock` ya vale `'0'`. **Marcar + desmarcar + Guardar escribe stock 0.** Reproducible al 100 %.

### Fricción de UI que habilita todo

Tocar una tarjeta abre directamente el formulario de edición con el nombre seleccionado (`ProductManagement.tsx:793`). Fue una decisión deliberada del rediseño compacto del 24/ago (tres botones no entraban en 150 px), pero deja al usuario parado sobre un formulario editable cuando sólo quería mirar, y es lo que pone el campo de stock en el camino de la operación más frecuente del día.

Hay **dos vías** para cambiar el stock, con calidad muy distinta:

| | Campo "Stock \*" del formulario | Botón "Ajustar Stock" |
|---|---|---|
| Se guarda al cerrar el diálogo | **no, se descarta** | sí, botón a la vista |
| Rastro en el kardex | `ajuste` genérico | reposición / merma / corrección |
| Muestra el stock actual | no | sí |

### Alcance

**En alcance**

- Sacar el stock de los formularios de edición: una sola vía real.
- Ficha de producto de solo lectura al tocar una tarjeta, con acciones explícitas.
- Corrección del trap del checkbox de stock ilimitado.
- Escritura atómica de stock en el servidor (delta) y compare-and-swap para el conteo físico.

**Fuera de alcance**

- **Permisos del kardex.** Se evaluó abrirlo a más roles y **se decidió dejarlo como está: sólo `admin`** (`index.ts:1250`). No se toca el backend de seguridad en este trabajo. La fila "Movimientos de stock" se renderiza únicamente para admin.
- **Instrumentar el backend** para registrar la forma de cada request de stock. Se propuso y se descartó: el problema A nunca llega al servidor, así que un log del backend no lo vería. Aportaría sólo para B, y el compare-and-swap ya rechaza esas escrituras por diseño.
- **Decimales.** `products.stock` es `integer`, no `numeric` — pese a que los comentarios del código y el spec del 29/jun afirman lo contrario. Restar 0,5 a un entero redondea: `10 − 0.5` guarda `10` (no descuenta nada) y `10 − 1.5` guarda `9`. Hay 16 productos con `allow_decimal`, pero **14 son de panadería y están en stock ilimitado**, así que no descuentan nada; los otros 2 están en 0. Nunca se registró un movimiento con cantidad fraccionada. Bug latente, no activo. Va aparte.
- **El escalado de privilegios de `App.tsx:1344-1420`** (ante un 403 se auto-asciende a rol `dispatch` y vuelve a `local`). Grave, pero sin relación con el stock; tiene su propia tarea.
- **Polling de productos.** Con 331 productos cada 5 s el costo de egress es real (ya hubo un commit reduciendo paginación por ese motivo). El compare-and-swap resuelve lo mismo detectando el conflicto en vez de previniéndolo, sin costo recurrente.
- **Recuperar el stock perdido.** No es posible desde la base: los valores nunca se escribieron. Sólo se recupera contando la mercadería.

## Enfoque elegido

**Que el stock no se pueda tocar desde un formulario que se descarta, y que la aritmética viva en el servidor.**

Los dos problemas tienen el mismo arreglo de fondo: el stock deja de ser un campo más de un formulario largo y pasa a ser una operación con su propio botón y su propia semántica.

Enfoques descartados:

- **Sólo agregar un aviso de "tenés cambios sin guardar" al cerrar el diálogo.** Arregla A sin rediseñar nada, pero agrega fricción a cada cierre de diálogo, no arregla B, y deja las dos vías conviviendo con el kardex mal clasificado.
- **Sólo arreglar el backend, sin tocar la UI.** Cierra B y no toca A — que es el que está costando plata ahora.
- **Que el conteo físico siempre gane, sin avisar.** Es el comportamiento de hoy para B.
- **Eliminar "Corregir total" y dejar sólo sumar/restar.** Cierra B por construcción, pero un conteo de góndola obliga a calcular la diferencia de cabeza, que es justo la fricción que el diseño del 7/ago buscaba eliminar. Retrocede en usabilidad para ganar correctitud que el compare-and-swap ya da.

## Diseño

### Componente 1 — `ProductDetailDialog` (componente nuevo)

Archivo nuevo: `src/components/ProductDetailDialog.tsx`

Un `Dialog` de Radix, como el resto de la app: sin routing propio, y no se pierde el scroll de la grilla al cerrar.

Tocar una tarjeta abre esto en vez del formulario. Contenido, de arriba a abajo:

1. Nombre, imagen, descripción, categoría y precio — **solo lectura**.
2. Bloque de stock destacado, con el número grande y un único botón **Ajustar**.
3. Lista de acciones: **Editar producto**, **Receta** (con el conteo de ingredientes), **Movimientos de stock**, **Eliminar**.

El bloque de stock y el botón Ajustar no se renderizan si el producto es de stock ilimitado — mismo criterio que ya usa la tarjeta.

**"Movimientos de stock" sólo se renderiza para `admin`**, porque el endpoint que consume ya es admin-only y no se va a relajar. Reutiliza `stockEventsAPI.getByProduct`, que existe y está en uso en `DistributionPanel.tsx:192`: no es código nuevo, es exponerlo en una segunda pantalla. Para un admin, es la forma de responder "¿por qué bajó esto?" sin adivinar.

Como todo acá es solo lectura, cerrar la ficha por cualquier vía no descarta nada. Ése es el punto.

### Componente 2 — El stock sale de los formularios de edición

Es el arreglo del problema A.

Dos formularios distintos tienen hoy un campo de stock editable. Los dos pasan a solo lectura **al editar**. Al **crear** un producto el campo sigue editable: ahí es el stock inicial, el formulario es corto, y no hay nada que pisar.

- **`ProductManagement.tsx` (~línea 999).** El input se reemplaza por el stock como dato, con un botón "Ajustar" al lado que abre `StockAdjustDialog`. Los botones "Ajustar Stock" y "Eliminar" del pie del formulario se mudan a la ficha.
- **`NewOrderForm.tsx` (~línea 524).** El editor rápido de producto de la pantalla de pedidos, con su propio estado y su propio campo de stock. Si se deja como está, siguen existiendo dos vías y el trabajo no cumple su objetivo.

Con el campo fuera del formulario, `stockSeToco` (`src/utils/productPayload.ts`) deja de tener sentido en la rama de edición: el payload de edición nunca incluye `stock`. Se simplifica en vez de mantenerse por inercia.

**Nota de verificación:** `editingProduct` y `formData.stock` se escriben siempre juntos en `ProductManagement` (líneas 161/163, 178/179, 186/187, 354/355), así que nunca divergen. Eso descarta que el formulario mande un stock viejo por su cuenta: para que `stockSeToco` diera `true`, alguien tenía que tipear en el campo o tocar el checkbox. Sacar el campo cierra las dos puertas.

### Componente 3 — El trap del checkbox

`ProductManagement.tsx:1043`. El arreglo es **no tocar `stock` al alternar el checkbox**:

```js
onCheckedChange={(checked) => setFormData(prev => ({
  ...prev,
  unlimitedStock: checked === true
}))}
```

Blanquear el campo nunca hizo falta: ya está deshabilitado mientras el checkbox está marcado, y el 0 que corresponde mandar al servidor cuando `unlimitedStock` es `true` se fuerza aparte, tanto en el payload como en el backend (`index.ts:901`). Lo único que lograba era destruir el valor del usuario.

Con el Componente 2, el campo ya no es editable al **editar**, así que el trap queda acotado a la **creación**: escribir 50, marcar ilimitado, desmarcarlo y guardar creaba el producto en 0. Sigue valiendo arreglarlo, y es una línea.

### Componente 4 — RPCs de stock (migración nueva)

Archivo nuevo: `supabase/migrations/20260907_stock_atomico.sql`

Hacen falta RPCs porque supabase-js no sabe expresar `stock = stock + N`; tiene que ser SQL para ser atómico.

```sql
-- Suma o resta relativa. Atómica: nunca pisa una escritura concurrente.
CREATE OR REPLACE FUNCTION public.ajustar_stock_producto(pid uuid, delta int)
RETURNS products AS $$
  UPDATE products SET stock = stock + delta
  WHERE id = pid AND stock + delta >= 0
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
```

Si no devuelve fila: el producto no existe o el resultado quedaría negativo. El backend distingue los dos casos con un `SELECT` posterior.

```sql
-- Corrección por conteo físico. Sólo escribe si nadie tocó el stock mientras tanto.
CREATE OR REPLACE FUNCTION public.fijar_stock_producto(pid uuid, nuevo int, esperado int)
RETURNS products AS $$
  UPDATE products SET stock = nuevo
  WHERE id = pid AND stock = esperado
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
```

Si no devuelve fila, el stock cambió desde que el usuario abrió la pantalla. Eso es el 409.

`products.id` es `uuid` y `products.stock` es `integer`; las firmas siguen esos tipos.

Ambas son `SECURITY DEFINER` por el mismo motivo que `create_order_with_stock`: tienen que escribir `products` sin chocar con RLS. `SET search_path = public` es obligatorio en funciones `SECURITY DEFINER` — sin eso, un `search_path` manipulado puede redirigir `products` a otra tabla. La verificación de que el producto pertenece al negocio del usuario se hace en el backend **antes** de invocarlas, igual que hoy.

### Componente 5 — `PUT /products/:id` acepta tres formas

Archivo: `supabase/functions/make-server-6d979413/index.ts`

| Body | Semántica | Quién lo usa |
|---|---|---|
| `{ stockDelta: N, modo }` | `stock = stock + N`, atómico | Sumar, pedidos, reposición rápida |
| `{ stock: N, stockEsperado: M, modo: 'total' }` | compare-and-swap | Corregir total |
| `{ stock: N }` | escritura directa | **sólo al crear** un producto |

La tercera forma se mantiene porque Netlify y la edge function se despliegan por separado: durante la transición el backend tiene que entender los dos contratos. Una vez que el frontend nuevo esté en producción, se restringe a `POST /products`.

Tres llamadores migran a `stockDelta`, y los tres ya tienen el delta calculado a mano:

- `EditOrderDialog.tsx:205` — ya calcula `quantityDiff`
- `NewOrderForm.tsx:271` (`handleRestockProduct`) — es un `+100` fijo
- `StockAdjustDialog` modo "Sumar"

**Respuesta 409 en conflicto.** El cuerpo lleva lo que la UI necesita para escribir un mensaje concreto:

```json
{
  "error": "STOCK_CAMBIO",
  "stockActual": 28,
  "stockEsperado": 4,
  "ultimoMovimiento": { "type": "devolucion", "quantity": 24, "createdAt": "..." }
}
```

`ultimoMovimiento` sale de `stock_events`, que ya guarda exactamente eso. Es lo que permite decir "entró una devolución" en vez de "el valor cambió".

**El kardex no cambia de forma.** `registrarStockEvent` sigue recibiendo el stock previo y el nuevo, y deduciendo el tipo del `modo` más el signo del delta. La lógica de `esAjusteDeStock` se mantiene tal cual.

### Componente 6 — `StockAdjustDialog`

Archivo: `src/components/StockAdjustDialog.tsx`

El componente deja de calcular el total y pasa a reportar la **intención**:

```ts
type AjusteStock =
  | { modo: 'sumar'; delta: number }
  | { modo: 'total'; stock: number; stockEsperado: number };

onConfirm: (ajuste: AjusteStock) => Promise<void>;
```

Esto invierte una decisión del spec del 7/ago, que decía "`onConfirm` recibe el total final ya calculado, no la diferencia". El razonamiento de entonces —concentrar la aritmética en un lugar— era bueno, pero la aritmética correcta no puede vivir en el cliente: el cliente no sabe cuál es el stock real. Se mueve al servidor.

El resultado en vivo (`30 + 20 = 50`) se conserva: es una previsualización, no la fuente de verdad. En modo "Sumar" se muestra como estimación, porque el total final lo decide el servidor.

**Estado nuevo: conflicto.** Cuando el guardado devuelve 409, el diálogo no se cierra. Muestra un bloque de advertencia con el stock que había al abrir, el stock real, y la causa. Dos salidas:

- **Volver a contar** — refresca el stock actual en el diálogo y limpia el campo. El usuario cuenta de nuevo sobre la base correcta.
- **Sí, guardar N** — reintenta con `stockEsperado` actualizado al valor real. Se guarda, pero el usuario está enterado.

En modo "Sumar" el 409 no puede ocurrir: no hay baseline que validar.

## Orden de implementación

Dos bloques, cada uno desplegable por sí solo. **El bloque de UI va primero**: ataca el problema A, que es el que está costando mercadería ahora, y es la parte más simple.

**Bloque 1 — una sola vía** (Componentes 1 → 2 → 3). Ficha de producto, sacar el stock de los dos formularios, arreglar el checkbox. Al terminar, es imposible perder un stock tipeado, porque no hay dónde tipearlo salvo en un diálogo con Confirmar a la vista. No toca el backend.

**Bloque 2 — correctitud** (Componentes 4 → 5 → 6). Migración, backend, `StockAdjustDialog`. Cierra el problema B.

El orden importa dentro del bloque 1: la ficha se construye antes de sacar el campo del formulario, porque hasta que la ficha exista es la única forma de ver el stock al editar.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| `stockDelta` dejaría el stock negativo | 400 con el stock actual. El diálogo lo muestra y no cierra. |
| `stockEsperado` no coincide | 409 con `stockActual` y `ultimoMovimiento`. El diálogo entra en estado de conflicto. |
| Producto de otro negocio | 403, sin cambios. |
| Producto inexistente | 404, sin cambios. |
| Falla el registro en `stock_events` | Se loguea y la operación sigue, como hoy: un kardex incompleto es mejor que un ajuste que no se guarda. |
| El usuario cierra la ficha o el formulario | No hay nada que perder: la ficha es solo lectura y el stock ya no vive en el formulario. |

## Testing

Hay suite de tests para utilidades puras; los componentes se verifican en navegador con evidencia.

**Runner:** `npm test`, que es `node --test src/utils/*.test.ts` con `node:test` y `node:assert/strict`. **No hay vitest ni ninguna librería de testing de componentes** en el proyecto. Dos consecuencias para este trabajo:

- Sólo corren archivos en `src/utils/*.test.ts`. Lo que se quiera testear tiene que vivir como función pura en `src/utils/`.
- No se pueden testear componentes React automáticamente sin agregar dependencias, que está fuera de alcance. Por eso la lógica del checkbox se extrae a una función pura: para que sea testeable con el harness que ya existe.

Baseline actual: 57 tests, todos en verde.

**Tests automatizados**

1. `construirPayloadProducto` en edición nunca incluye `stock` ni `stockDelta`.
2. `construirPayloadProducto` al crear sí incluye `stock`.
3. Marcar y desmarcar "ilimitado" deja el stock en su valor original, no en 0.
4. `StockAdjustDialog` en modo "sumar" emite `{ modo: 'sumar', delta }`, con el signo correcto para negativos.
5. `StockAdjustDialog` en modo "total" emite `{ stock, stockEsperado }` con el `stockEsperado` que tenía al abrir.
6. Un 409 pone el diálogo en estado de conflicto sin cerrarlo; reconfirmar reintenta con el `stockEsperado` nuevo.

**Verificación en base (SQL directo, antes de tocar el frontend)**

7. `ajustar_stock_producto(pid, 8)` dos veces seguidas deja +16, no +8.
8. `ajustar_stock_producto(pid, -1000)` sobre stock 10 no devuelve fila y no modifica nada.
9. `fijar_stock_producto(pid, 4, 28)` cuando el stock real es 4 no devuelve fila y no modifica nada.

**Verificación en navegador**

10. **Regresión del problema A:** abrir un producto, intentar cambiar el stock desde el formulario de edición — el campo es solo lectura y la única vía es el diálogo con Confirmar. No queda forma de tipear un stock y perderlo al cerrar.
11. Reproducción del caso SCORE GORILLA: abrir Ajustar Stock, cambiar el stock desde otra sesión, confirmar "Corregir total" → aparece el aviso de conflicto con el valor real y la causa.
12. Con "Sumar", el mismo escenario **no** produce conflicto y el resultado incluye los dos cambios.
13. Tocar una tarjeta abre la ficha, no el formulario. Nada queda editable sin pedirlo.
14. "Movimientos de stock" lista los eventos con tipo y hora para un admin, y **no aparece** para un usuario que no lo es.
15. Un producto con receta configurada mantiene la receta después de un ajuste de stock.
16. Al crear un producto nuevo, el campo de stock sigue editable y el valor se guarda.

## Riesgos / notas

- **Despliegue en dos pasos.** El backend del bloque 2 tiene que salir antes que su frontend y aceptar el contrato viejo mientras tanto. Si sale primero el frontend, los ajustes de stock fallan. El bloque 1 no tiene esta restricción: es sólo frontend.
- **`stock` es `integer`.** Las RPCs nuevas usan `int` a propósito, en línea con la columna real. Si más adelante se migra a `numeric`, hay que actualizarlas — queda anotado en el trabajo de decimales.
- **El conflicto se detecta, no se previene.** Dos personas contando el mismo producto al mismo tiempo siguen pudiendo pisarse; la diferencia es que ahora la segunda se entera y decide. Prevenirlo de verdad requeriría bloqueo pesimista, que para este volumen no se justifica.
- **El stock perdido no se recupera.** Después de este trabajo hay que hacer un recuento físico. Los productos que se están vendiendo pero no reciben una carga manual hace más de una semana son los candidatos; se pueden listar con una consulta sobre `stock_events`.
- **Nadie pierde permisos.** El kardex sigue siendo admin-only; no se toca ninguna regla de acceso.
