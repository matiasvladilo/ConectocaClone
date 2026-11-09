# Export de Analíticas por categoría — diseño

Fecha: 2026-11-09
Estado: aprobado, pendiente de plan de implementación

## Problema

El Excel que genera Analíticas no permite seguir los montos por categoría ni verificar que
coincidan con las planillas manuales de administración.

Hoy hay dos agujeros concretos:

1. La hoja **"Por Local"** es una matriz producto × local. Mezcla todas las categorías, así
   que para saber cuánto salió de Distribuidora a un local hay que filtrar los productos a
   mano dentro del Excel, uno por uno.
2. La hoja **"Detalle Ventas"** tiene una fila por pedido, pero los productos van amontonados
   en una sola celda de texto (`"Pan francés (x100); Coca 500ml (x24)"`) y hay un único
   `Total ($)`. No se puede sumar por categoría ni cruzar con nada.

El jefe de administración cuadra las planillas de Distribución / Panadería / Pastelería
**pedido por pedido** contra la app. Con la planilla actual no tiene por dónde empezar: puede
ver el total de un pedido, pero no cómo se reparte entre las categorías que él revisa por
separado.

## Alcance

Las dos hojas cambian en **ambos** botones de export de Analíticas (**Excel** y
**Google Drive**), que generan el mismo contenido.

Fuera de alcance en esta vuelta:

- El selector de categoría en pantalla (filtra KPIs, gráficos y export). Va en una segunda
  iteración, con su propio spec.
- Las hojas **Resumen** y **Productos**, los KPIs, los gráficos y el nombre del archivo. No
  se tocan.

## Decisiones tomadas

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Excel siempre agrupado por categoría | Selector en pantalla que filtra el export | Un solo export sirve para todo y no hay que acordarse de poner un filtro. El selector llega después, además de esto, no en lugar de esto. |
| Columnas `Categoría`/`Subcategoría` + filas de subtotal | Una hoja por categoría raíz | El número de hojas crecería con las categorías y comparar entre categorías costaría más. Con columnas se puede además pivotear en Excel. |
| Monto por categoría = Σ precio × cantidad, con fila de control | Prorratear `order.total` entre categorías | Prorratear siempre cuadra, pero el monto de cada categoría deja de ser el precio real de esos productos y pasa a ser una estimación. Se prefiere el precio real + la diferencia visible. |
| Columnas nuevas en "Detalle Ventas" | Hoja nueva "Auditoría por Pedido" | "Detalle Ventas" ya tiene exactamente una fila por pedido: es su lugar natural. Dos hojas con una fila por pedido obligan a saber cuál mirar. |

## Contexto técnico verificado

- Cada ítem de pedido guarda `productId` ([`src/App.tsx:80`](../../../src/App.tsx)), así que se
  puede cruzar con el catálogo para resolver categoría y subcategoría.
- Analíticas carga productos pero **no** carga categorías
  ([`src/components/Analytics.tsx:106`](../../../src/components/Analytics.tsx)). Hay que agregar
  `categoriesAPI.getAll`, igual que hace Historial de Pedidos.
- La jerarquía de categorías es de **un solo nivel**: una raíz puede tener subcategorías, una
  subcategoría no ([`src/utils/categoryTree.ts:4`](../../../src/utils/categoryTree.ts)).
- `order.total` **no siempre** es Σ(precio × cantidad) de los ítems: cuando el producto es de
  Distribuidora sin receta, el total sale del costeo por lotes FIFO, mientras que el ítem
  guarda el precio de catálogo
  ([`src/components/NewOrderForm.tsx:580`](../../../src/components/NewOrderForm.tsx) y
  [`src/components/NewOrderForm.tsx:613`](../../../src/components/NewOrderForm.tsx)). Esta
  diferencia es la razón de ser de las filas y columnas de control.
- Las dos hojas están **duplicadas** entre `handleExport`
  ([`Analytics.tsx:655`](../../../src/components/Analytics.tsx)) y `handleExportDrive`
  ([`Analytics.tsx:830`](../../../src/components/Analytics.tsx)): unas 140 líneas repetidas.

## Hoja 1 — "Por Local"

Pasa de matriz producto × local a matriz agrupada por categoría.

```
Categoría     | Subcategoría | Producto    | LA OCA PV | Pedro T. | Total Unidades
Distribuidora |              | Fideos 500g |     5     |     5    |      10
Distribuidora | Bebidas      | Coca 500ml  |    24     |    12    |      36
Distribuidora | Lácteos      | Leche 1L    |    10     |          |      10
>> Distribuidora — unidades                |    39     |    17    |      56
>> Distribuidora — monto $                 |  38.400   |  13.200  |   51.600

Panadería     |              | Pan francés |   100     |    50    |     150
>> Panadería — unidades                    |   100     |    50    |     150
>> Panadería — monto $                     |  90.000   |  45.000  |  135.000

Total Unidades                             |   139     |    67    |     206
Venta Total (ítems)                        | 128.400   |  58.200  |  186.600
Venta Total (del pedido)                   | 129.100   |  58.200  |  187.300
```

Reglas:

- **Columnas**: `Categoría | Subcategoría | Producto`, después una columna por local (orden
  alfabético, como hoy), y `Total Unidades` al final. En las filas de subtotal y de total, esa
  última columna acumula el total de la fila: unidades en las filas de unidades, monto en las
  de monto (es el comportamiento actual de la fila `Venta Total`).
- **Subcategorías**: un producto cargado directo en la raíz deja `Subcategoría` vacía; uno en
  subcategoría muestra el nombre de la subcategoría y **suma al subtotal de su padre**. La
  raíz se resuelve con `nombreCategoriaRaiz`
  ([`categoryTree.ts:79`](../../../src/utils/categoryTree.ts)), la misma función que usa el
  desglose de Historial, para que los dos lugares no se contradigan.
- **Orden**: categorías raíz alfabéticas, con el bloque `Sin categoría` siempre al final.
  Dentro de cada categoría, las filas se ordenan por subcategoría y después por producto;
  los productos sin subcategoría van primero.
- **Celdas vacías**: si un local no compró ese producto la celda queda vacía (comportamiento
  actual), no `0`. Un `0` sugiere "se pidió y salió cero".
- **Subtotales**: después de cada categoría, dos filas con la etiqueta en la primera columna y
  las otras dos vacías:
  - `>> <Categoría> — unidades`: suma de unidades de esa categoría por local.
  - `>> <Categoría> — monto $`: suma de precio × cantidad de esa categoría por local.
- **Fila vacía** entre bloques de categoría, y antes de los totales globales.
- **Totales globales** al final:
  - `Total Unidades`: unidades de todas las categorías por local (fila que ya existe).
  - `Venta Total (ítems)`: Σ precio × cantidad por local. Es lo que suman los subtotales de
    categoría, y por eso reemplaza a la fila `Venta Total` actual.
  - `Venta Total (del pedido)`: Σ `order.total` por local. Fila de control: si difiere de la
    anterior, hubo costeo por lotes y se ve de inmediato en vez de quedar escondido.

## Hoja 2 — "Detalle Ventas"

Las columnas actuales (`Fecha Creación`, `Hora Creación`, `Fecha Entrega (Deadline)`,
`ID Pedido`, `Cliente/Local`, `Estado`, `Total ($)`, `Productos`, `Notas`) quedan **en el
mismo orden**. Al final se agregan:

1. Una columna por categoría raíz, alfabéticas, con `Sin categoría` al final. El valor es el
   monto (precio × cantidad) de los ítems de ese pedido que caen en esa categoría.
2. `Total Ítems ($)`: Σ precio × cantidad de todos los ítems del pedido.
3. `Diferencia ($)`: `Total ($) − Total Ítems ($)`.

```
Fecha | ID Pedido | Local     | ... | Distribuidora | Panadería | Pastelería | Total Ítems ($) | Diferencia ($)
05/11 | a1b2c3d4  | LA OCA PV | ... |    38.400     |  90.000   |     0      |    128.400      |      700
05/11 | e5f6g7h8  | Pedro T.  | ... |    13.200     |  45.000   |     0      |     58.200      |        0
```

No se agrega una columna "Total Pedido": `Total ($)` ya **es** `order.total`.

`Diferencia` vale 0 en los pedidos normales y distinta de 0 cuando el pedido se cobró por
lotes FIFO. Filtrando `Diferencia ≠ 0` el jefe de administración aísla los pedidos a revisar
en vez de recorrerlos todos.

**Toda fila lleva todas las columnas de categoría**, con `0` donde el pedido no tiene nada de
esa categoría. `XLSX.utils.json_to_sheet` arma las columnas a partir de las claves de los
objetos: si una fila omitiera una categoría, las columnas se desalinearían y la planilla
quedaría corrida sin ningún aviso. Es el riesgo principal de esta hoja y por eso tiene su
propio test.

## Arquitectura

Módulo nuevo **`src/utils/reporteAnaliticas.ts`**, con tres funciones puras y sin React:

| Función | Entrada | Salida |
|---|---|---|
| `indexarCategorias(productos, categorias)` | catálogo | `Map<productId, { raiz: string; sub: string }>` |
| `construirMatrizPorLocal(orders, mapa)` | pedidos filtrados + mapa | `any[][]` listo para `aoa_to_sheet` |
| `construirDetalleVentas(orders, mapa)` | pedidos filtrados + mapa | `Record<string, unknown>[]` listo para `json_to_sheet` |

`indexarCategorias` es el **único** lugar donde se cruza con el catálogo. Las otras dos
funciones reciben el mapa ya resuelto, así que no saben nada de `Product` ni de `Category` y
sus tests se escriben con un mapa armado a mano, sin fixtures de catálogo.

Las tres se pueden entender y testear por separado:

- `indexarCategorias` responde "a qué categoría pertenece este producto".
- `construirMatrizPorLocal` responde "cuánto salió de cada producto a cada local".
- `construirDetalleVentas` responde "cómo se reparte cada pedido entre categorías".

### Cambios en `Analytics.tsx`

- Cargar categorías con `categoriesAPI.getAll(accessToken)` en el `useEffect` que ya trae el
  catálogo, y guardarlas en estado.
- `handleExport` y `handleExportDrive` reemplazan sus bloques inline por llamadas al módulo.
  Las ~140 líneas duplicadas se van; el archivo (1773 líneas) adelgaza en vez de engordar.

### Manejo de errores

- **Falla la carga de categorías**: el export sigue funcionando. `indexarCategorias` con una
  lista vacía de categorías devuelve todo como `Sin categoría`, así que se genera un Excel
  completo en montos y unidades, con una sola categoría. Se prefiere eso a romper el export o
  a bloquear el botón.
- **Producto borrado del catálogo** (está en el pedido pero no en `products`): cae en
  `Sin categoría`. No se omite: omitirlo haría que los subtotales no sumen el total y la
  planilla mentiría.
- **Producto con `categoryId` de una categoría borrada**: `nombreCategoriaRaiz` ya devuelve
  `Sin categoría` en ese caso.
- **Pedido sin ítems** (`products` vacío o `undefined`): no aporta filas de producto; su
  `order.total` sí cuenta en `Venta Total (del pedido)` y en `Diferencia`, que queda igual al
  total del pedido. Así un pedido mal cargado aparece como diferencia en vez de desaparecer.

## Tests

`src/utils/reporteAnaliticas.test.ts`, con `node:test` y el mismo patrón que
[`categoryTree.test.ts`](../../../src/utils/categoryTree.test.ts). El script `npm test` ya
levanta `src/utils/*.test.ts`, así que no hay que tocar configuración.

1. Una subcategoría aparece con su nombre en la columna `Subcategoría` y suma al subtotal de
   su categoría padre.
2. Subtotales de unidades y de monto, correctos por categoría y por local.
3. Producto sin categoría, con categoría borrada o fuera del catálogo → bloque
   `Sin categoría`, y el bloque va al final.
4. `Venta Total (del pedido)` sale de `order.total` y queda distinta de `Venta Total (ítems)`
   cuando el pedido se cobró por lotes.
5. Local que no compró un producto → celda vacía, no `0`.
6. Toda fila de `construirDetalleVentas` trae todas las columnas de categoría, con `0` donde
   no aplica (protege la alineación de columnas).
7. `Diferencia` = total del pedido − suma de ítems, y 0 cuando coinciden.
8. Pedido sin ítems: montos por categoría en 0 y `Diferencia` igual al total del pedido.

## Verificación manual

Con el código listo, exportar un rango real y confirmar en el archivo:

- La hoja "Por Local" tiene un bloque por categoría, con sus dos filas de subtotal.
- La suma de los subtotales de unidades de todas las categorías, para un local, coincide con
  la fila `Total Unidades` de ese local.
- La suma de los subtotales de monto coincide con `Venta Total (ítems)`.
- En "Detalle Ventas", la suma de las columnas de categoría de una fila coincide con el
  `Total Ítems ($)` de esa fila.
- Filtrar `Diferencia ($) ≠ 0` devuelve solo pedidos con productos de Distribuidora por lotes.
