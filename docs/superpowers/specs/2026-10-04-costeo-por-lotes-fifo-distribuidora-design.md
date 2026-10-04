# Costeo por lotes (FIFO) para productos de Distribuidora — Diseño

**Fecha:** 2026-10-04

## Problema

`products.price` es un solo número por producto y cumple dos roles a la vez: es lo que le cobrás al local cuando pide (`NewOrderForm`) y es lo que usa `DistributionPanel` para calcular "Valor del inventario" (`price × stock`). No existe ningún concepto de costo separado ni de lote de compra.

El caso real: comprás un producto a un proveedor a un precio, y después lo volvés a comprar más caro (o más barato). El stock viejo y el nuevo conviven físicamente, pero el sistema no puede distinguirlos — son el mismo campo `price`. Si lo editás para reflejar la compra nueva, el cambio se aplica retroactivamente a unidades que en realidad costaron lo viejo.

Lo que el usuario quiere, con sus propias palabras y ejemplo: tenía 3 unidades a un precio, entraron 5 más a otro precio, y **mientras no se agoten esas 3 viejas, el precio no tiene que cambiar — recién cuando se agotan, el precio sube solo**. Es costeo FIFO (primero que entra, primero que sale), no promedio ponderado.

### Alcance

**En alcance**

- Productos sin receta (`product_ingredients` vacío) que pertenecen a la categoría "Distribuidora" o a una de sus subcategorías — mismo criterio de detección que ya usa `DistributionPanel` (`elegirCategoriaInicial`, `idsDeCategoriaConHijas`).
- Carga de costo al reponer stock (`StockAdjustDialog`, modo "Sumar").
- Consumo en orden de llegada (FIFO) al despachar un pedido, registrar una merma, o corregir el conteo a la baja.
- El precio que ve el local (`products.price`) se recalcula solo = costo del lote FIFO activo, para estos productos.
- "Valor del inventario" en `DistributionPanel` pasa a sumar `cantidad_restante × costo_unitario` de los lotes vivos.
- Migración: lote inicial automático para el stock que ya existe hoy.
- Devolución de stock (se borra un pedido) revierte a los lotes originales que consumió.

**Fuera de alcance**

- Productos con receta (`product_ingredients`): su costo se calcula desde los ingredientes, no desde compras. No llevan lotes.
- Productos fuera de la categoría Distribuidora: `price` sigue siendo 100% manual, como hoy.
- Reportes de margen o ganancia por lote. Los datos van a estar disponibles (`product_lots`, `order_item_lots`), pero la pantalla no se construye en esta v1.
- Edición o borrado manual de un lote después de creado. Si se cargó mal un costo, se corrige con otro movimiento (una reposición o un ajuste), no editando el registro.
- Tocar el flujo de stock de productos con receta o de los que no son de Distribuidora: ese camino queda exactamente igual que hoy.

## Enfoques considerados

- **Costo promedio ponderado** (cada reposición recalcula un promedio): descartado. Mezcla el costo apenas entra mercadería nueva — el usuario pidió explícitamente que el precio viejo se mantenga firme hasta agotar esas unidades, no un promedio que empieza a moverse de entrada.
- **Campo de costo manual, editado a mano**: descartado. No sube solo cuando se agota el lote viejo, que es el comportamiento pedido. Además perpetúa el problema actual: alguien tiene que acordarse de tocarlo.
- **Lotes FIFO con precio de venta derivado automáticamente** (elegido): cada reposición es una fila propia con su costo. El consumo (despacho, merma, ajuste a la baja) se descuenta en orden de llegada. El precio que ve el local es, siempre, el costo del lote más viejo que todavía tiene unidades. Es el único enfoque de los tres que reproduce el comportamiento que el usuario describió con su ejemplo de 3+5 unidades.

## Diseño

### Modelo de datos

**Tabla nueva `product_lots`**

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | `gen_random_uuid()` |
| `business_id` | uuid | igual criterio que `stock_events`: no es FK a nada de RLS, se usa para scoping |
| `product_id` | uuid, FK `products.id` | a diferencia de `stock_events`, acá sí puede ser FK real: un lote no tiene sentido sin su producto, y si el producto se borra, el lote se borra con él (`ON DELETE CASCADE`) |
| `costo_unitario` | numeric, `CHECK >= 0` | lo que costó esa compra, por unidad |
| `cantidad_inicial` | integer, `CHECK >= 0` | lo que entró |
| `cantidad_restante` | integer, `CHECK >= 0` | lo que queda sin consumir; arranca igual a `cantidad_inicial` |
| `origen` | text, `CHECK IN ('reposicion', 'ajuste', 'migracion')` | de dónde salió este lote — ver "Ajuste al alza" y "Migración" más abajo |
| `stock_event_id` | uuid, nullable, FK `stock_events.id` | referencia a la reposición que lo originó, para poder cruzar el kardex con el lote exacto |
| `created_at` | timestamptz | define el orden FIFO — **es la columna que decide qué lote se consume primero** |

Va en tabla aparte y no como columnas de `products` porque un producto puede tener varios lotes vivos a la vez (el viejo todavía no se vació cuando entra el nuevo) — exactamente el caso que dispara todo esto.

**Tabla nueva `order_item_lots`**

| columna | tipo | notas |
|---|---|---|
| `id` | uuid, PK | |
| `order_item_id` | uuid, FK `order_items.id` | `ON DELETE CASCADE` — si se borra el pedido, se borra junto (la tabla `orders`/`order_items` ya se borra entera al eliminar un pedido) |
| `lot_id` | uuid, FK `product_lots.id` | de qué lote salió |
| `cantidad` | integer, `CHECK > 0` | cuántas unidades de esa línea salieron de ese lote |
| `costo_unitario` | numeric | snapshot del costo al momento — aunque ya está en el lote, se copia acá por la misma razón que `order_items.product_name`/`price` son snapshots: la historia no se tiene que mover si el lote cambia después |

Por qué hace falta esta tabla: `order_items` tiene **una fila por producto por pedido**, con un único `price` por unidad (es el mismo esquema que usan `itemStatuses`/`areaStatuses`, que indexan por `productId`). Cuando un pedido cruza dos lotes — el ejemplo del usuario: queda 1 unidad a $1000, el local pide 3, las otras 2 salen a $1200 — **no hay un único precio unitario real**, hay un total exacto ($3400) repartido en dos costos distintos.

La resolución: `order_items.price` para esa línea se guarda como el **promedio ponderado de esa compra puntual** ($3400 / 3 ≈ $1133,33), así que `order_items.price × quantity` sigue dando el total exacto y nada del resto del sistema (recibos, `orders.total`, `NewOrderForm`) necesita enterarse de que hubo dos lotes. `order_item_lots` es la que guarda la verdad fina — de qué lote salió cada unidad — y es la que se usa para la devolución exacta.

**`products.price`** se mantiene como columna (sigue siendo la fuente de verdad para productos fuera de alcance), pero para un producto de Distribuidora deja de ser editable a mano: el backend la recalcula automáticamente = `costo_unitario` del lote con `cantidad_restante > 0` más antiguo, cada vez que el consumo de lotes cambia ese lote activo. Si un producto de Distribuidora no tiene ningún lote vivo (recién creado, o se vendió todo y nunca más entró mercadería), `price` conserva el último valor conocido como referencia, pero no hay de dónde recalcularlo — es un estado posible, no un error.

### Alcance: qué productos usan lotes

Un producto usa costeo por lotes si y solo si: pertenece a la categoría Distribuidora o una subcategoría suya (mismo cálculo que ya hace `DistributionPanel.elegirCategoriaInicial`/`idsDeCategoriaConHijas` sobre `categories`), **y** no tiene receta (`product_ingredients` vacío para ese `product_id`).

Esto se evalúa en el momento de cada operación (reposición, despacho, etc.), no es un flag guardado en `products` — así que mover un producto dentro o fuera de la categoría Distribuidora cambia su comportamiento automáticamente, sin migración manual. (Si un producto sale de la categoría con lotes vivos, esos lotes quedan huérfanos pero inertes: dejan de consumirse porque el chequeo de alcance ya no lo incluye, y `price` vuelve a ser editable a mano desde donde haya quedado.)

### Flujo de reposición (entra mercadería)

`StockAdjustDialog`, modo "Sumar": si el producto está en alcance (ver arriba), el diálogo pide un campo nuevo y obligatorio — **costo de esta compra** — además de la cantidad. Para productos fuera de alcance, el diálogo queda idéntico al actual (sin el campo).

Backend (mismo endpoint `PATCH /products/:id` que ya arma el stock event `reposicion`, `index.ts` alrededor de la línica 958-981): además de sumar al `stock` del producto y registrar el `stock_event`, si el producto está en alcance inserta una fila en `product_lots` con `cantidad_inicial = cantidad_restante = cantidad sumada`, `costo_unitario = lo cargado`, `origen = 'reposicion'`, y recalcula `products.price` (que en este caso en particular no cambia si ya había un lote más viejo con stock — el lote nuevo se va al final de la fila, no se activa todavía).

### Flujo de consumo (despacho, merma, ajuste a la baja)

Una función SQL compartida, `consumir_lotes_fifo(p_product_id uuid, p_cantidad integer)`, hace el trabajo pesado: toma los lotes del producto con `cantidad_restante > 0` ordenados por `created_at ASC`, va descontando hasta cubrir `p_cantidad`, actualiza `cantidad_restante` de cada lote tocado, recalcula `products.price` al costo del lote que quedó activo al final, y devuelve el detalle (qué lote, cuánto, a qué costo) para que el llamador arme `order_item_lots` o lo que necesite.

**Por qué tiene que ser una función SQL y no TypeScript:** el despacho real (crear un pedido) no pasa por el Edge Function — pasa por la RPC de Postgres `create_order_with_stock` (`supabase/migrations/20260819_stock_events_on_order.sql`), que hace `UPDATE products SET stock = stock - qty` **dentro de la misma transacción** que crea el pedido, con el producto bloqueado (`FOR UPDATE`) para que dos pedidos simultáneos no se pisen. Si el consumo de lotes viviera en TypeScript, quedaría fuera de esa transacción y fuera de ese lock — dos despachos a la vez podrían leer el mismo lote como disponible y dejarlo negativo. `consumir_lotes_fifo` se escribe en PL/pgSQL precisamente para que la RPC la pueda llamar dentro de su propia transacción, con el mismo `FOR UPDATE` protegiendo la fila del lote.

Esa misma función la llaman, vía `supabaseAdmin.rpc(...)`, los otros dos caminos que bajan stock de un producto en alcance:

- **Merma** (`StockAdjustDialog`, modo "Sumar" con número negativo).
- **Ajuste a la baja** (`StockAdjustDialog`, modo "Corregir total", cuando el nuevo total es menor al actual).

**Secuencia dentro de `create_order_with_stock`:** hoy el loop de descuento de stock corre *antes* de crear el pedido (`create_order_kv`), porque todavía no existen filas en `order_items` a las que referenciar. Pasa a ser: 1) correr `consumir_lotes_fifo` por cada producto en alcance, guardando el detalle devuelto en una variable temporal (arreglo en memoria de la función, no una tabla); 2) crear el pedido (`create_order_kv`), que ya inserta `order_items`; 3) con los `order_items.id` ya generados, insertar las filas de `order_item_lots` correspondientes, cruzando por `product_id` (dentro de un mismo pedido nuevo hay a lo sumo un `order_item` por producto, así que el cruce es inambiguo) y recalcular `order_items.price` de esa línea como el promedio ponderado exacto.

**Cuando un pedido cruza dos lotes** (ejemplo del usuario): el total que cobra esa línea es exacto — `1 × $1000 + 2 × $1200 = $3400` — repartido como se explicó arriba en `order_items.price = $1133,33` más el detalle fino en `order_item_lots`.

### Ajuste al alza (aparece stock no registrado)

Si el conteo real da más que el total de lotes vivos, no hay forma de saber a qué costo entró esa mercadería "fantasma" — nunca se registró una compra. Se crea un lote con `cantidad = la diferencia`, `costo_unitario = el costo del lote más reciente conocido` (el de `created_at` más nuevo, tenga o no stock restante), y `origen = 'ajuste'`. Si el producto nunca tuvo ningún lote, se usa el `products.price` actual como costo de ese lote fantasma.

### Devoluciones (se borra un pedido)

`DELETE /orders/:id` (`index.ts`, línea ~1739) ya recorre `order_items` para restaurar stock. Se extiende: para cada `order_item` de un producto en alcance, se traen sus filas de `order_item_lots` y se suma `cantidad` de vuelta a `cantidad_restante` de cada `lot_id` referenciado — **aunque ese lote esté en 0**, se reabre. No hace falta lógica especial para decidir a qué lote va la devolución: como el consumo FIFO siempre toma primero el lote más viejo con `cantidad_restante > 0`, un lote reabierto automáticamente vuelve a ser el primero en consumirse la próxima vez, que es el comportamiento correcto. Al final se recalcula `products.price` del producto, por si la devolución reactivó un lote más viejo y más barato que el que estaba activo.

### Migración de datos existentes

Al desplegar, una migración recorre los productos en alcance (categoría Distribuidora/subcategorías, sin receta) con `stock > 0` y crea un lote inicial por cada uno: `cantidad_inicial = cantidad_restante = stock actual`, `costo_unitario = price actual`, `origen = 'migracion'`, `created_at = now()`. No altera `products.stock` ni `products.price` — son el punto de partida, no un cambio.

### UI que cambia

- **`StockAdjustDialog`**: campo "Costo de esta compra" (obligatorio, numérico) en modo "Sumar", condicional a que el producto esté en alcance. El componente necesita recibir si el producto está en alcance — lo más simple es que lo calcule el llamador (`ProductManagement`/`ProductDetailDialog`, que ya tienen `categories` cargadas) y se lo pase como prop, en vez de que el diálogo dependa de categorías.
- **`ProductManagement`** (formulario de edición): el campo "Precio" se muestra de solo lectura para productos en alcance, con una nota ("Se actualiza solo según el costo del lote activo: $X"). Para el resto de productos sigue editable, igual que hoy.
- **`DistributionPanel`**: la tarjeta "Valor del inventario" deja de sumar `price × stock` para los productos en alcance — pasa a sumar, por cada uno, `Σ (cantidad_restante × costo_unitario)` de sus lotes. Para productos fuera de alcance (si los hubiera en el ámbito del panel) se sigue usando `price × stock`.
- **Diálogo de "Movimientos"** (el kardex, ya existente en `DistributionPanel`): sin cambios obligatorios en esta v1. Sería natural mostrar el costo cargado en cada `reposicion`, pero no bloquea el resto del diseño — queda anotado como mejora futura, no como parte de esta entrega.

## Manejo de errores

| Situación | Comportamiento |
|---|---|
| Reponer sin cargar costo (producto en alcance) | El diálogo no deja confirmar — mismo patrón que ya usa el campo de cantidad hoy. |
| Un despacho pide más unidades de las que suman todos los lotes vivos | No debería poder pasar: el chequeo de stock insuficiente (`prod.stock < qty`) ya existe en `create_order_with_stock` y sigue corriendo antes de tocar lotes. Si por algún motivo los lotes sumaran menos que `products.stock` (desincronización), `consumir_lotes_fifo` se queda sin lotes antes de cubrir la cantidad: ese resto se trata igual que un ajuste al alza fantasma sobre la marcha, para no bloquear la venta, y queda logueado para auditar la desincronización. |
| Se borra un producto con lotes vivos | `product_lots` tiene `ON DELETE CASCADE` sobre `product_id` — se borran con el producto, igual que ya pasa con `product_ingredients`. El kardex (`stock_events`) sobrevive porque no tiene FK real, como ya está documentado en esa tabla. |
| Falla el insert de un lote o de `order_item_lots` | A diferencia de `registrarStockEvent` (que traga el error porque es solo historia), acá **sí** tiene que abortar la transacción: un lote que no se creó significa stock sin costo asociado, lo que rompe el cálculo de precio siguiente. Como todo corre dentro de la transacción de `create_order_with_stock` o del `PATCH /products/:id`, un error en el insert revierte todo el movimiento. |

## Testing

Este proyecto no tiene framework de tests de componentes; hay `node --test` para utilidades puras en `src/utils/*.test.ts`, y el resto se verifica en navegador con evidencia (ver baseline en `2026-09-07-stock-una-sola-via-design.md`).

**Verificación en base (SQL directo, antes de tocar el frontend)**

1. Crear un producto de prueba en la categoría Distribuidora, reponer 3 unidades a costo 1000 → se crea un lote, `products.price` pasa a 1000.
2. Reponer 5 unidades más a costo 1200 → se crea un segundo lote, `products.price` sigue en 1000 (el lote viejo todavía tiene stock).
3. Consumir 2 unidades (`consumir_lotes_fifo`) → el lote 1 (costo 1000) queda en `cantidad_restante = 1`, `products.price` sigue en 1000.
4. Consumir 3 unidades más → cruza los dos lotes: 1 unidad sale del lote 1 (deja `cantidad_restante = 0`) y 2 del lote 2 (deja `cantidad_restante = 3`). El total devuelto es exacto: `1 × 1000 + 2 × 1200 = 3400`. `products.price` pasa a 1200.
5. Ajuste al alza sin lotes previos (producto nuevo, stock físico encontrado sin registrar) → crea un lote fantasma al `price` actual.
6. Ajuste al alza con lotes previos → el lote fantasma usa el costo del lote más reciente.
7. Borrar un pedido que consumió de dos lotes → cada lote recupera exactamente la cantidad que le correspondía, incluyendo un lote que había quedado en 0.
8. Un producto con receta en la categoría Distribuidora **no** genera lotes al reponerse (queda fuera de alcance por tener `product_ingredients`).
9. Un producto sin receta fuera de la categoría Distribuidora **no** genera lotes ni cambia su `price` solo.

**Verificación en navegador**

10. `StockAdjustDialog` pide el campo de costo solo para productos de Distribuidora sin receta; para el resto, el diálogo es idéntico al actual.
11. En `ProductManagement`, el precio de un producto en alcance se muestra de solo lectura con la nota de "se actualiza solo"; el resto de productos sigue editable.
12. En `DistributionPanel`, "Valor del inventario" refleja la suma por lotes (verificar con un producto que tenga dos lotes a costos distintos cargados a propósito).
13. Pedido real desde `NewOrderForm` a un producto con dos lotes activos: el total cobrado coincide con el cálculo exacto por lote, no con `cantidad × precio actual`.
14. Migración: correr sobre un producto existente con stock > 0 y confirmar que aparece un lote inicial con el `price` que tenía antes de migrar.

## Riesgos / notas

- **Esta feature toca los mismos puntos críticos que `2026-09-07-stock-una-sola-via-design.md` planeaba rearquitecturar** (RPCs atómicas de delta `ajustar_stock_producto`/`fijar_stock_producto`, contrato `stockDelta`/`stockEsperado` en `StockAdjustDialog`). Se verificó contra el código real: ese "Bloque 2" **nunca se implementó** — el repo sigue en el contrato viejo (`StockAdjustDialog` manda `nuevoStock` final + `modo`, `PATCH /products/:id` escribe `stock` directo). Este diseño se construye sobre lo que existe hoy. Si más adelante se retoma ese rediseño, el consumo FIFO tiene que migrar junto: `consumir_lotes_fifo` necesita vivir donde sea que termine viviendo la escritura atómica de stock.
- **`order_items.price` pasa a ser, para líneas que cruzan lotes, un promedio ponderado en vez de un precio "real" único.** Matemáticamente el total es exacto (`price × quantity` da el total correcto), pero si en algún lugar de la UI se muestra ese `price` como "el precio del producto" en vez de "el precio de esta línea", puede leerse raro (ej. $1133,33 cuando ningún lote costó exactamente eso). No se encontró ningún lugar que haga eso hoy, pero vale tenerlo presente al implementar.
- **Lotes huérfanos si un producto sale de la categoría Distribuidora con stock repartido en varios costos.** El diseño no migra ni consolida esos lotes — simplemente dejan de usarse y `price` vuelve a ser editable desde el último valor calculado. Es una decisión consciente de no sobrediseñar un caso de borde infrecuente (recategorizar productos no es una operación común en este sistema).
- **No hay bloqueo de concurrencia distinto al que ya existe.** El `FOR UPDATE` sobre `products` dentro de `create_order_with_stock` es el mismo mecanismo que protege el stock hoy; `consumir_lotes_fifo` hereda esa protección por correr en la misma transacción, no agrega una nueva.

## Hallazgo de seguridad encontrado durante la exploración (no relacionado con este diseño)

Al inspeccionar el esquema con el MCP de Supabase, el proyecto reportó que **3 tablas tienen Row Level Security deshabilitado** y quedan expuestas con la `anon key`: `backup_product_ingredients_20260629`, `backup_ingredients_20260629`, `backup_products_labor_20260629`. Son backups de una migración de junio, no tablas de esta feature, pero quedan totalmente legibles/escribibles por cualquiera con la clave pública. Lo dejo anotado acá para que lo decidas vos — no apliqué ningún cambio. El SQL de remediación (activar RLS, sin políticas = nadie accede salvo `service_role`) sería:

```sql
ALTER TABLE "public"."backup_product_ingredients_20260629" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."backup_ingredients_20260629" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."backup_products_labor_20260629" ENABLE ROW LEVEL SECURITY;
```
