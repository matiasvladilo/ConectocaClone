# Stock: una sola vía, y que nadie pise a nadie — Diseño

**Fecha:** 2026-09-07

## Problema

Los usuarios reportan que el stock "se coloca y después desaparece", o que "hay que colocarlo de nuevo".

El bug es real y está reproducido en producción. La tabla `stock_events` (kardex) guarda cada movimiento, lo que permitió reconstruir tres casos con la misma firma: una escritura que **revierte exactamente** a un valor anterior, segundos después de un cambio legítimo.

**Aceite Natura — 7/sep**

```
19:21:56  ajuste         → stock 8
19:23:14  reposición +8  → stock 16
19:24:03  ajuste         → stock 0     (49 s después)
```

**SCORE ENERGY DRINK 473ml — 4/sep, mismo usuario**

```
17:52:23  ajuste +26 → stock 34
17:52:52  ajuste −26 → stock 8        (29 s después, vuelve exacto al valor previo)
```

**SCORE GORILLA — 6/sep, dos usuarios**

```
16:46:49  ajuste                      → stock 4    (usuario A)
16:48:55  devolución +24 de un pedido → stock 28   (usuario B)
16:51:37  ajuste −24                  → stock 4    (usuario A: la devolución desaparece)
```

No son correcciones de inventario. Son reversiones exactas a un valor viejo.

### Causa raíz

**Toda escritura manual de stock manda un valor absoluto calculado en el navegador.** El backend lo aplica a ciegas (`updateData.stock = stockVal`, `index.ts:892`): no hay comparación con el valor previo ni control de versión. El último que escribe gana.

Lo decisivo es que ni siquiera el botón "Sumar" es una suma real. `StockAdjustDialog.tsx:45` hace la aritmética en el cliente:

```
nuevoStock = stockActual + cantidad   // stockActual sale de la lista cargada en el navegador
```

y manda el resultado como total. Si entre que se abrió la pantalla y se apretó Confirmar entró un pedido, ese "+8" pisa la venta.

El contraste es lo que confirma el diagnóstico: **la venta de un pedido sí está bien hecha.** La RPC `create_order_with_stock` hace `UPDATE products SET stock = stock - qty` — relativo, atómico, en el servidor. El camino automático es correcto y los caminos manuales lo sobrescriben.

### Esto ya estaba anticipado

El diseño del 7/ago (`2026-08-07-ajuste-rapido-de-stock-design.md`) lo listó como riesgo aceptado:

> "Sin bloqueo de concurrencia. Si dos usuarios abren el diálogo del mismo producto a la vez y ambos suman 10 sobre un stock de 30, el segundo en confirmar deja 40, no 50 (...) resolverlo bien requeriría un endpoint de incremento atómico en el servidor, que está fuera de alcance."

Este spec construye ese endpoint. No es un hallazgo nuevo: es una deuda que venció.

También ayudó a que el bug sea invisible que el "Componente 3" del spec del 29/jun (refrescar productos en el polling de `App.tsx`) nunca se implementó: el `setInterval` de `App.tsx:320` refresca pedidos y notificaciones, no productos.

### Un segundo bug, independiente y determinista

El checkbox "∞ Stock Ilimitado" (`ProductManagement.tsx:1043`):

```js
stock: checked === true ? '0' : formData.stock
```

Al marcarlo pone el campo en `'0'`. Al desmarcarlo lo deja en `'0'`, porque `formData.stock` ya vale `'0'`. **Marcar + desmarcar + Guardar escribe stock 0.** Es reproducible al 100 % y no depende de concurrencia.

### Fricción de UI que agrava todo

Tocar una tarjeta de producto abre directamente el formulario de edición con el nombre seleccionado (`ProductManagement.tsx:793`). Fue una decisión deliberada del rediseño compacto del 24/ago (tres botones no entraban en 150 px), pero deja al usuario parado sobre un formulario editable cuando solo quería mirar. Un toque en falso guarda.

Y hay **dos vías** para cambiar el stock, con calidad distinta:

| | Campo "Stock *" del formulario | Botón "Ajustar Stock" |
|---|---|---|
| Rastro en el kardex | `ajuste` genérico | distingue reposición / merma / corrección |
| Muestra el stock actual | no | sí |
| Se puede pisar sin querer | sí | sí (pero con intención explícita) |

### Alcance

**En alcance**

- Escritura atómica de stock en el servidor (delta) y compare-and-swap para el conteo físico.
- Una sola vía de edición de stock: `StockAdjustDialog`.
- Ficha de producto de solo lectura al tocar una tarjeta, con acciones explícitas.
- Corrección del trap del checkbox de stock ilimitado.
- Abrir el kardex al personal interno.

**Fuera de alcance**

- **Decimales.** `products.stock` es `integer`, no `numeric` — pese a que los comentarios del código y el spec del 29/jun afirman lo contrario. Restar 0,5 a un entero redondea: `10 − 0.5` guarda `10` (no descuenta nada) y `10 − 1.5` guarda `9`. Hay 16 productos con `allow_decimal`, pero **14 son de panadería y están en stock ilimitado**, así que no descuentan nada; los otros 2 están en 0. No se registró nunca un movimiento con cantidad fraccionada. Es un bug latente, no activo. Se trata aparte.
- **El escalado de privilegios de `App.tsx:1344-1420`** (ante un 403 se auto-asciende a rol `dispatch` y vuelve a `local`). Grave, pero no tiene relación con el stock; va en su propia tarea.
- **Polling de productos.** Con 331 productos cada 5 s el costo de egress es real (ya hubo un commit reduciendo paginación por ese motivo). El compare-and-swap resuelve el mismo problema detectando el conflicto en vez de previniéndolo, sin costo recurrente.
- **Inventario masivo** (cargar el conteo de todos los productos de una vez). Sigue fuera de alcance, como en el spec del 7/ago.

## Enfoque elegido

**Mover la aritmética del stock al servidor, y hacer que el conteo físico falle ruidosamente en vez de pisar en silencio.**

Enfoques descartados:

- **Solo arreglar la UI (sacar el campo del formulario), sin tocar el backend.** Reduce mucho la superficie, pero "Sumar" sigue calculando en el navegador y sigue pudiendo pisar una venta. Trata el síntoma más visible y deja la causa.
- **Que el conteo físico siempre gane, sin avisar.** Es el comportamiento de hoy. Simple, y es exactamente el bug reportado.
- **Eliminar "Corregir total" y dejar solo sumar/restar.** Cierra el problema por construcción — todo pasa a ser relativo y atómico. Pero un conteo de góndola obliga a calcular la diferencia de cabeza, que es precisamente la fricción que el diseño del 7/ago buscaba eliminar. Retrocede en usabilidad para ganar correctitud que el compare-and-swap ya da.

## Diseño

### Componente 1 — RPCs de stock (migración nueva)

Archivo nuevo: `supabase/migrations/20260907_stock_atomico.sql`

Se necesitan RPCs porque supabase-js no sabe expresar `stock = stock + N`; tiene que ser SQL para ser atómico.

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
-- Corrección por conteo físico. Solo escribe si nadie tocó el stock mientras tanto.
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

### Componente 2 — `PUT /products/:id` acepta tres formas

Archivo: `supabase/functions/make-server-6d979413/index.ts`

| Body | Semántica | Quién lo usa |
|---|---|---|
| `{ stockDelta: N, modo }` | `stock = stock + N`, atómico | Sumar, pedidos, reposición rápida |
| `{ stock: N, stockEsperado: M, modo: 'total' }` | compare-and-swap | Corregir total |
| `{ stock: N }` | escritura directa | **solo al crear** un producto |

La tercera forma se mantiene porque Netlify y la edge function se despliegan por separado: durante la transición el backend tiene que entender los dos contratos. Una vez que el frontend nuevo esté en producción, se restringe a `POST /products`.

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

### Componente 3 — `StockAdjustDialog`

Archivo: `src/components/StockAdjustDialog.tsx`

El componente deja de calcular el total y pasa a reportar la **intención**:

```ts
type AjusteStock =
  | { modo: 'sumar'; delta: number }
  | { modo: 'total'; stock: number; stockEsperado: number };

onConfirm: (ajuste: AjusteStock) => Promise<void>;
```

Esto invierte una decisión del spec del 7/ago, que decía "`onConfirm` recibe el total final ya calculado, no la diferencia". Ese razonamiento —concentrar la aritmética en un lugar— era bueno, pero la aritmética correcta no puede vivir en el cliente: el cliente no sabe cuál es el stock real. Se mueve al servidor.

El resultado en vivo (`30 + 20 = 50`) se conserva: es una previsualización, no la fuente de verdad. En modo "Sumar" ahora se muestra como estimación, porque el total final lo decide el servidor.

**Estado nuevo: conflicto.** Cuando el guardado devuelve 409, el diálogo no se cierra. Muestra un bloque de advertencia con el stock que había al abrir, el stock real, y la causa. Dos salidas:

- **Volver a contar** — refresca el stock actual en el diálogo y limpia el campo. El usuario cuenta de nuevo sobre la base correcta.
- **Sí, guardar N** — reintenta con `stockEsperado` actualizado al valor real. Se guarda, pero el usuario está enterado.

En modo "Sumar" el 409 no puede ocurrir: no hay baseline que validar.

### Componente 4 — `ProductDetailDialog` (componente nuevo)

Archivo nuevo: `src/components/ProductDetailDialog.tsx`

Es un `Dialog` de Radix, como el resto de la app: sin routing propio, y no se pierde el scroll de la grilla al cerrar.

Tocar una tarjeta abre esto en vez del formulario. Contenido, de arriba a abajo:

1. Nombre, imagen, descripción, categoría y precio — **solo lectura**.
2. Bloque de stock destacado, con el número grande y un único botón **Ajustar**.
3. Lista de acciones: **Editar producto**, **Receta** (con el conteo de ingredientes), **Movimientos de stock**, **Eliminar**.

El bloque de stock y la fila "Ajustar" no se renderizan si el producto es de stock ilimitado — mismo criterio que ya usa la tarjeta.

**"Movimientos de stock"** reutiliza `stockEventsAPI.getByProduct`, que ya existe y ya está en uso en `DistributionPanel.tsx:192`. No es código nuevo: es exponer en una segunda pantalla algo que ya funciona. Es la mitad del arreglo del problema reportado — cuando alguien dice "puse 16 y desapareció", hoy no tiene forma de averiguar por qué; con el kardex a un toque ve "reposición +8 · despacho −24 · ajuste", con hora.

### Componente 5 — El stock sale de los formularios de edición

Dos formularios distintos tienen hoy un campo de stock editable. Los dos pasan a solo lectura **al editar**; al **crear** un producto el campo sigue editable, porque ahí es el stock inicial y no hay nada que pisar.

- `ProductManagement.tsx` (~línea 999): el input se reemplaza por el stock como dato, con un botón "Ajustar" al lado que abre `StockAdjustDialog`.
- `NewOrderForm.tsx` (~línea 524): el editor rápido de producto de la pantalla de pedidos. Si se deja como está, siguen existiendo dos vías y el trabajo no cumple su objetivo.

Los botones "Ajustar Stock" y "Eliminar" del pie del formulario de `ProductManagement` se mudan a la ficha.

Con el campo fuera del formulario, `stockSeToco` (`src/utils/productPayload.ts`) deja de tener sentido en la rama de edición: el payload de edición nunca incluye `stock`. Se simplifica en vez de mantenerse por inercia.

### Componente 6 — El trap del checkbox

`ProductManagement.tsx:1043`. El arreglo es **no tocar `stock` al alternar el checkbox**:

```js
onCheckedChange={(checked) => setFormData(prev => ({
  ...prev,
  unlimitedStock: checked === true
}))}
```

Blanquear el campo nunca hizo falta: ya está deshabilitado mientras el checkbox está marcado, y el 0 que corresponde mandar al servidor cuando `unlimitedStock` es `true` se fuerza aparte, tanto en el payload como en el backend (`index.ts:901`). Lo único que lograba era destruir el valor del usuario.

Con el Componente 5, el campo de stock ya no es editable al **editar**, así que el trap queda acotado a la **creación** de un producto: escribir 50, marcar ilimitado, desmarcarlo y guardar creaba el producto en 0. Sigue valiendo arreglarlo, y es una línea.

### Componente 7 — Permisos del kardex

`index.ts:1250` restringe `GET /products/:id/stock-events` a `admin`. Se abre al personal interno:

```js
const ROLES_KARDEX = ['admin', 'production', 'dispatch', 'worker', 'pastry'];
```

Quedan afuera `local` (13 usuarios: son los almacenes clientes) y `user` (2). Es deliberado: el kardex expone reposiciones, mermas y quién las hizo — información interna de la distribuidora que un cliente no debe ver.

Se declara una constante nueva en vez de reutilizar `puedeGestionarMateriasPrimas` (`admin` + `production`) porque son permisos distintos con motivos distintos, y acoplarlos haría que ampliar uno amplíe el otro sin querer.

## Orden de implementación

Son dos bloques con propósitos distintos, y conviene que salgan en este orden: primero la correctitud, después lo visual. Cada bloque es desplegable por sí solo.

**Bloque A — correctitud** (1 → 2 → 3 → 6). Migración, backend, `StockAdjustDialog`, checkbox. Al terminar, el bug reportado está cerrado aunque la UI siga igual que hoy.

**Bloque B — una sola vía** (7 → 4 → 5). Permisos del kardex, ficha de producto, y recién entonces sacar el campo de stock de los dos formularios. El campo se saca último a propósito: hasta que la ficha exista y funcione, es la única forma de ver el stock al editar.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| `stockDelta` dejaría el stock negativo | 400 con el stock actual. El diálogo lo muestra y no cierra. |
| `stockEsperado` no coincide | 409 con `stockActual` y `ultimoMovimiento`. El diálogo entra en estado de conflicto. |
| Producto de otro negocio | 403, sin cambios. |
| Producto inexistente | 404, sin cambios. |
| Falla el registro en `stock_events` | Se loguea y la operación sigue, como hoy: un kardex incompleto es mejor que un ajuste que no se guarda. |

## Testing

Hay suite de tests (`vitest`) para utilidades puras; los componentes se verifican en navegador con evidencia.

**Nota de entorno:** `npx vitest run` levanta también los tests de worktrees viejos en `.claude/worktrees/`, que fallan con "No test suite found" y ensucian el resultado. Hay que excluir ese directorio al correr la suite.

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

10. Reproducción del caso SCORE GORILLA: abrir Ajustar Stock, cambiar el stock desde otra sesión, confirmar "Corregir total" → aparece el aviso de conflicto con el valor real y la causa.
11. Con "Sumar", el mismo escenario **no** produce conflicto y el resultado incluye los dos cambios.
12. Tocar una tarjeta abre la ficha, no el formulario. Nada queda editable sin pedirlo.
13. "Movimientos de stock" lista los eventos con tipo y hora; no aparece para un usuario `local`.
14. Un producto con receta configurada mantiene la receta después de un ajuste de stock.

## Riesgos / notas

- **Despliegue en dos pasos.** El backend tiene que salir antes que el frontend y aceptar el contrato viejo mientras tanto. Si sale primero el frontend, los ajustes de stock fallan.
- **`stock` es `integer`.** Las RPCs nuevas usan `int` a propósito, en línea con la columna real. Si más adelante se migra a `numeric`, hay que actualizarlas — queda anotado en el trabajo de decimales.
- **El conflicto se detecta, no se previene.** Dos personas contando el mismo producto al mismo tiempo siguen pudiendo pisarse; la diferencia es que ahora la segunda se entera y decide. Prevenirlo de verdad requeriría bloqueo pesimista, que para este volumen no se justifica.
- **`local` pierde acceso a nada que tuviera hoy.** El endpoint era admin-only, así que abrir a personal interno solo agrega; ningún usuario pierde permisos.
