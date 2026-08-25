# Catálogo compacto y filtro de categoría más claro — Diseño

**Fecha:** 2026-08-24

## Problema

Tres cosas de interfaz que aparecieron **usando** lo que se implementó el 2026-08-23. La
funcionalidad quedó correcta; esto es cómo se ve y cómo se maneja.

### 1. La opción "un" en Presentación no se entiende

El formulario de alta de producto tiene un campo **Presentación** (número + unidad) y otro
separado **Unidades por paquete**. La lista de unidades incluye `un`, pensada para productos
que se miden en unidades sueltas en vez de ml/kg. En la práctica nadie entiende para qué está
ahí: el usuario la describió como *"un no tiene sentido ese un"*.

Y tiene razón — es redundante. Un producto sin medida física ya se resuelve dejando
Presentación vacía y cargando solo Unidades por paquete. Los nombres reales del catálogo lo
confirman: `Encendedor RONSON 20 unidades`, `NESCAFE CAPPUCCINO CAJA (8 UNIDADES)`. Ninguno
necesita `un` en Presentación.

### 2. El filtro de categoría no se anuncia como tal

En Gestión de Productos el filtro es un `<Select>` angosto (`w-[130px] sm:w-[180px]`) al lado
del buscador, cuyo disparador muestra un ícono de embudo y el texto `nombreDelFiltro`, que
vale **"Filtrar"** cuando no hay filtro y el nombre de la categoría cuando sí lo hay.

Dos problemas confirmados por el usuario: no se nota que filtra **por categoría** (dice
"Filtrar" a secas), y el texto se corta porque el control es angosto y comparte fila con el
buscador incluso en celular (`flex flex-row` fijo, sin variante mobile).

### 3. Las tarjetas del catálogo ocupan toda la pantalla en celular

Cada producto se dibuja como una tarjeta con imagen de 160–192px de alto, badge de categoría,
nombre, SKU, descripción, precio, stock, costo y tres botones — cerca de **520px de alto**. Con
**249 productos** y uso mayoritariamente desde celular, revisar el catálogo es scroll infinito:
entra un producto por pantalla.

El usuario pidió explícitamente una grilla de cuadrados en vez de filas horizontales, y tras
ver mockups eligió **2 por fila conservando las fotos**.

## Alcance

**En alcance:** los tres puntos de arriba, todos en la pantalla de Gestión de Productos y el
módulo de nombres.

**Fuera de alcance:**

- Rediseñar el formulario de alta/edición más allá de sacar `un` y sumarle dos botones.
- Tocar el listado de Armar Pedido, el Panel de Distribuidora o Gestión de Categorías.
- Cambiar cualquier lógica de filtrado, de stock o de nombres. Este trabajo es visual y de
  reubicación de controles; el comportamiento de datos no cambia.

---

## Restricción que gobierna todo el diseño

**Tailwind está precompilado.** No hay `tailwind.config`, ni PostCSS, ni la dependencia.
[`src/index.css`](../../../src/index.css) es un CSS estático, y **una clase que no esté ahí no
hace nada y no da ningún error**.

Verificado para este trabajo:

| Clase | ¿Existe? |
|---|---|
| `grid-cols-2`, `sm:grid-cols-3`, `md:grid-cols-4`, `lg:grid-cols-6` | **sí** |
| `line-clamp-2`, `gap-2`, `gap-3`, `h-16`…`h-32`, `w-16` | **sí** |
| `w-full`, `flex-col`, `sm:flex-row`, `cursor-pointer`, `object-contain`, `text-[10px]` | **sí** |
| `aspect-square` | **NO** |
| `grid-cols-3`, `md:grid-cols-3` (base), `xl:grid-cols-6` | **NO** |
| `text-[11px]` | **NO** |
| **`w-[130px]`, `sm:w-[180px]`** — las que el código ya usa hoy | **NO** |

Por eso la grilla usa exactamente `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6`
—los cuatro confirmados— y el área de imagen usa una **altura fija** (`h-28`) en vez de
`aspect-square`. Antes de escribir cualquier clase que no esté en esa tabla:
`grep -F ".mi-clase" src/index.css`.

**Las clases de valor arbitrario (`w-[...]`, `text-[...]`) casi nunca están.** Solo existen las
pocas que quedaron horneadas en el CSS; una nueva no se genera. Cualquier medida a mano va por
`style={{ ... }}` inline.

> Esto no es teórico: `w-[130px] sm:w-[180px]` está escrito hoy en el `SelectTrigger` del
> filtro ([`ProductManagement.tsx:663`](../../../src/components/ProductManagement.tsx)) y **no
> hace nada** — el ancho real sale del estilo por defecto del componente. Es decir que el ancho
> que alguien creyó fijar nunca se aplicó, y eso es parte de por qué el texto se corta. Ver
> punto 2.

---

## 1. Sacar `un` de Presentación

Archivo: [`src/utils/productName.ts`](../../../src/utils/productName.ts)

`UNIDADES_PRESENTACION` pasa de `['ml','L','g','kg','un','otro']` a
`['ml','L','g','kg','otro']`. Nada más cambia: `componerNombre` ya ignora la presentación
cuando falta cantidad o unidad, así que un producto sin medida física sale correcto con solo
la marca y las unidades por paquete.

El test existente `'la lista de unidades es cerrada y no incluye cc'`
([`productName.test.ts:63`](../../../src/utils/productName.test.ts)) hace `deepEqual` contra la
lista completa, así que se actualiza al array nuevo. Ese test ya cumple doble función: sigue
garantizando que no vuelva `cc`, y ahora también que no vuelva `un`.

**Productos ya creados con `un`:** ninguno se rompe. La unidad se usa solo al *componer* el
nombre en el alta; el nombre resultante ya está guardado como texto plano en `products.name`.
Sacar la opción no reescribe nada existente.

---

## 2. Filtro de categoría con etiqueta fija

Archivo: [`src/components/ProductManagement.tsx`](../../../src/components/ProductManagement.tsx)

### Etiqueta que no desaparece

Hoy `nombreDelFiltro` **reemplaza** la palabra "Filtrar" por el nombre de la categoría. El
resultado es que el control nunca dice qué filtra: o dice "Filtrar" (vago) o dice "Bebidas"
(sin contexto).

Pasa a mostrar las dos cosas: la palabra **"Categoría"** siempre visible, y al lado el valor
elegido, separados por un punto medio:

| Estado | Texto del disparador |
|---|---|
| Sin filtro | `Categoría · Todas` |
| Filtrado | `Categoría · Bebidas` |

`nombreDelFiltro` deja de devolver `'Filtrar'` como fallback y devuelve `'Todas'`; la palabra
"Categoría" se renderiza aparte, fija, y **no** se trunca — solo se trunca el valor.

### Que no compartan fila en celular

El contenedor es hoy `className="p-4 flex flex-row gap-3"`, con `flex-row` fijo. En un celular
angosto el buscador y el filtro se aprietan, y de ahí sale el corte de texto.

Pasa a `flex flex-col sm:flex-row gap-3`: apilados en celular (cada uno a lo ancho completo),
en línea desde tablet. Con el filtro a lo ancho completo en mobile, el nombre de una
subcategoría indentada entra sin cortarse.

### El ancho, esta vez de verdad

Las clases `w-[130px] sm:w-[180px]` que hay hoy en el `SelectTrigger` **no existen en el CSS
precompilado**, así que nunca hicieron nada. Se eliminan —tenerlas ahí sugiere un ancho que no
está pasando— y se reemplazan por:

- `w-full` en mobile (clase confirmada), para que ocupe la fila entera; y
- un ancho mínimo desde tablet vía `style={{ ... }}` inline, no por clase arbitraria, para que
  entre `Categoría · <nombre>` sin cortarse.

La regla general del proyecto aplica: medidas a mano por `style`, nunca por `w-[...]`.

**No se toca la lógica de filtrado** — `idsDelFiltro` con `idsDeCategoriaConHijas` y el
`<SelectContent>` agrupado por `agruparPorPadre` quedan como están.

---

## 3. Grilla compacta de 2 por fila

Archivo: [`src/components/ProductManagement.tsx`](../../../src/components/ProductManagement.tsx)

### Enfoque elegido

**Cuadrados en grilla, con la foto real del producto, y toda la acción concentrada en el
diálogo de Editar que ya existe.**

Descartado — **fila horizontal tipo lista** (con miniatura al costado, o sin imagen): fue la
primera propuesta y el usuario la rechazó explícitamente; quiere ver los productos como
cuadrados uno al lado del otro.

Descartado — **3 por fila en celular**: se mockeó y el usuario prefirió 2. Con 3 columnas en
una pantalla de 320px cada cuadrado queda en ~100px de ancho, donde el nombre no se lee y el
stock no entra como texto (habría que reducirlo a un número dentro de una pastilla de color).

### La tarjeta nueva

De ~520px de alto a un cuadrado. Contenido, de arriba a abajo:

1. **Imagen** — `product.imageUrl` si existe, si no el ícono `Package` como hoy. Área de
   **altura fija `h-28`** (no `aspect-square`, que no existe en el CSS), con `object-contain`
   para no deformar fotos de proporciones distintas.
2. **Nombre** — `line-clamp-2`, tipografía chica.
3. **Precio** y **stock** en una línea, con el stock manteniendo el código de color actual
   (gris ilimitado / rojo agotado / ámbar bajo / verde ok) y sus mismos textos
   (`∞ Ilimitado`, `Sin stock`, o el número).

El borde superior de color según estado de stock **se conserva** — es el mismo indicador que ya
existe y funciona.

**Se sacan de la vista de lista:** badge de categoría, SKU, descripción y costo. Los cuatro
siguen existiendo y editándose en el diálogo de Editar. El listado pasa a servir para escanear
rápido (qué es, cuánto sale, cuánto queda) y el detalle se abre cuando hace falta.

> Nota sobre el SKU: el buscador **sigue** matcheando por SKU, categoría y descripción aunque
> ya no se muestren en la tarjeta. Se puede seguir buscando y escaneando un código de barras
> igual que hoy.

### Columnas por tamaño de pantalla

```
grid-cols-2  sm:grid-cols-3  md:grid-cols-4  lg:grid-cols-6
```

Las cuatro clases están confirmadas en `index.css`. En desktop se pasa de 4 tarjetas gigantes
a 6 cuadrados por fila.

### Qué pasa al tocar un cuadrado

Los tres botones (Editar / Stock / Borrar) no entran en un cuadrado de ~150px. Decisión del
usuario: **tocar el cuadrado entero abre el diálogo de Editar**, y las otras dos acciones se
mudan adentro de ese diálogo.

El cuadrado entero es el área clickeable (`onClick={() => handleOpenDialog(product)}`), con
`cursor-pointer` y el `hover:shadow` que ya tenía la tarjeta.

### Dos botones nuevos dentro del diálogo de Editar

Solo cuando `editingProduct` existe (al crear no hay nada que ajustar ni borrar):

- **Ajustar Stock** — abre `StockAdjustDialog`, el mismo componente y el mismo flujo de
  siempre. No se muestra en productos de stock ilimitado, igual que hoy no se mostraba el
  botón en la tarjeta.
- **Eliminar** — dispara la misma `AlertDialog` de confirmación que ya existe.

Van en el `<DialogFooter>`, separados de Cancelar/Guardar. **Los dos con `type="button"`**: el
contenido del diálogo es un `<form>` y sin eso dispararían un submit. Este archivo ya tiene el
precedente y el motivo documentado en el botón del escáner
([`ProductManagement.tsx:960`](../../../src/components/ProductManagement.tsx)).

**Anidar diálogos es un patrón ya probado en este archivo:** el `BarcodeScannerDialog` se abre
desde un botón dentro del formulario de edición y se monta como hermano, fuera de `</Dialog>`
([`ProductManagement.tsx:1249`](../../../src/components/ProductManagement.tsx)). `StockAdjustDialog`
y la `AlertDialog` de borrado ya se montan igual, así que no hace falta reestructurar nada.

### Dos consecuencias del anidamiento que hay que resolver

Estas no son opcionales — sin ellas la reubicación de botones introduce bugs reales:

**a. El formulario queda mostrando un stock viejo.** Si desde el diálogo de Editar se ajusta el
stock de 10 a 50, `handleAjustarStock` actualiza el array `products`, pero `formData.stock` y
`editingProduct` siguen con 10. El valor guardado *no* se pierde —gracias al arreglo de
sobrescritura del 2026-08-23, `stock` solo viaja si el usuario lo tocó, y ahí `formData.stock`
(10) coincide con `editingProduct.stock` (10), así que no se manda— pero el formulario
**muestra 10 cuando el stock real es 50**, y alguien podría "corregirlo" a mano y pisar el
ajuste.

Al confirmar un ajuste con el diálogo de edición abierto, hay que sincronizar **las dos cosas**:
`formData.stock` y `editingProduct`, con el valor que devolvió el servidor. Así lo que se ve es
lo que hay, y la comparación de "¿tocó el stock?" sigue siendo correcta.

**b. Borrar deja abierto un formulario sobre un producto que ya no existe.** Si se confirma el
borrado desde adentro del diálogo de Editar, `handleDelete` saca el producto de la lista y
cierra la `AlertDialog`, pero el diálogo de edición queda abierto editando un producto
borrado — y guardar ahí daría un error del servidor.

`handleDelete` tiene que cerrar también el diálogo de edición cuando estaba abierto.

---

## Testing

El proyecto tiene 31 tests de lógica pura (`npm test`) y ninguno de interfaz. Este trabajo es
casi todo visual, así que la verificación es typecheck + build + navegador con evidencia.

**Automático**
1. `npm test` — el test de `UNIDADES_PRESENTACION` refleja la lista de 5 y sigue fallando si
   alguien agrega `cc` o `un`.
2. `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v _redirects` sin salida.
3. `npm run build` exitoso.

**Clases de Tailwind (el riesgo específico de este proyecto)**
4. Toda clase nueva verificada con `grep -F ".clase" src/index.css` antes de escribirla.
5. En el navegador: confirmar que la grilla **realmente** muestra 2 columnas en celular. Si se
   ve una sola columna, la clase no existe y falló en silencio.

**Formulario de nombre**
6. Al crear un producto, el selector de unidad ofrece ml / L / g / kg / Otro — sin `un`.
7. Un producto sin presentación (solo marca + unidades por paquete) sigue componiendo bien:
   `Encendedor RONSON 20 unidades`.

**Filtro**
8. Sin filtro el control dice `Categoría · Todas`; con filtro, `Categoría · Bebidas`.
9. En pantalla angosta, buscador y filtro quedan en filas separadas y no se corta el texto.
10. Filtrar por una categoría padre sigue trayendo los productos de sus subcategorías
    (regresión del arreglo del 2026-08-23).

**Grilla**
11. En celular se ven 2 cuadrados por fila; en desktop, 6.
12. Un producto con foto la muestra sin deformarse; uno sin foto muestra el ícono.
13. El código de color del stock (ilimitado / agotado / bajo / ok) se sigue distinguiendo.
14. Tocar cualquier parte del cuadrado abre Editar con los datos correctos.
15. Buscar por SKU sigue encontrando productos aunque el SKU ya no se muestre en la tarjeta.

**Las dos consecuencias del anidamiento**
16. Abrir Editar → Ajustar Stock → poner 50 → confirmar → **el campo Stock del formulario
    muestra 50**, no el valor viejo.
17. Seguido de lo anterior, guardar el formulario sin tocar nada más → el stock sigue en 50.
18. Abrir Editar → Eliminar → confirmar → se cierran **los dos** diálogos y el producto
    desaparece de la grilla.
19. En un producto de stock ilimitado, el botón Ajustar Stock no aparece.
20. Al **crear** un producto nuevo, no aparecen ni Ajustar Stock ni Eliminar.

## Riesgos / notas

- **El SKU deja de ser visible de un vistazo.** Hoy se ve en la tarjeta. Para quien lo usa para
  cotejar contra una factura en papel, esto es un paso atrás: hay que abrir el producto. Se
  acepta a cambio de la densidad, y el buscador por SKU y el escáner siguen funcionando. Si
  molesta en el uso real, la vuelta atrás barata es mostrarlo bajo el nombre en `text-xs`.

- **El costo desaparece del listado.** Solo estaba poblado en algunos productos (la mayoría
  mostraba `$0`) y se calcula sumando ingredientes de la receta. Sigue en el formulario.

- **La densidad depende de fotos consistentes.** Con altura fija y `object-contain`, fotos muy
  apaisadas van a dejar franjas vacías. Es el mismo comportamiento que hoy, solo que en menos
  espacio.

- **`aspect-square` no existe y no hay que agregarlo.** Cualquier intento de "mejorar" el
  cuadrado con esa clase va a fallar sin dar error. La altura fija es deliberada.

- **No se toca el orden de la grilla.** Sigue siendo el que devuelve el servidor
  (`created_at DESC`). Con 249 productos y 6 por fila, ordenar por nombre o por stock sería una
  mejora natural, pero es otra feature.
