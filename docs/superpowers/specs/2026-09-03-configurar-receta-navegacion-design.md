# Navegación de "Configurar receta" desde Gestión de Productos

**Fecha:** 2026-09-03
**Rama:** main
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Contexto y problema

Desde el diálogo de edición de un producto, el bloque "Receta" muestra cuántos
ingredientes tiene configurados y ofrece un botón "Configurar receta". Al pulsarlo,
el usuario aterriza en una pantalla que no reconoce y, al volver, pierde todo lo
que estaba haciendo.

Tres causas encadenadas:

1. **El botón no lleva el producto consigo.** `ProductManagement.tsx:1241` llama a
   `onManageRecipe()` sin argumentos, y `App.tsx:1791` lo traduce en un simple
   `irAPantalla("productIngredients")`.

2. **La pantalla de destino preselecciona el producto equivocado.**
   `ProductIngredientConfig` solo recibe `onBack` y `accessToken`, así que no tiene
   forma de saber de qué producto vienes. Tras cargar la lista hace
   `setSelectedProduct(productsData[0])` (`ProductIngredientConfig.tsx:98`), y el
   listado viene ordenado alfabéticamente (`index.ts:745`). Resultado: al pulsar
   "Configurar receta" sobre cualquier producto, aterrizas en la receta del primer
   producto del abecedario — hoy "Aceite Natura", que tiene 0 ingredientes.

   No es solo confuso. Es peligroso: agregar ingredientes ahí se los asigna al
   producto equivocado, sin ninguna señal de que estás en otro sitio.

3. **La vuelta atrás resetea todo.** El render de App es condicional, así que
   `ProductManagement` se desmonta al salir y se monta de cero al volver: se pierde
   el diálogo abierto, la búsqueda, el filtro de categoría y el scroll.

Los datos nunca estuvieron en riesgo ni se perdieron: ambas pantallas leen la misma
tabla `product_ingredients`, una embebida en el listado
(`index.ts:740`) y la otra por producto (`index.ts:1067`). El problema es
exclusivamente de navegación.

### Hallazgo adicional: el diálogo reescribe la receta en cada guardado

El spec [2026-06-29-rediseno-materias-primas-recetas](2026-06-29-rediseno-materias-primas-recetas-design.md)
decidió que "el formulario de producto deja de editar ingredientes". La UI de edición
se quitó y el bloque quedó marcado como read-only, pero **el payload nunca se eliminó**:

- `formData.ingredients` solo se llena al abrir el diálogo (`ProductManagement.tsx:215`)
  y no tiene ninguna UI que lo modifique.
- `handleSubmit` lo sigue mandando en el PUT (`ProductManagement.tsx:290`).
- El backend, al recibir `ingredients`, borra todas las filas del producto y las
  reinserta (`index.ts:992`).

Hoy es inofensivo porque el diálogo se destruye al salir y nunca sostiene una copia
vieja. Pero cualquier arreglo que reabra el diálogo al volver del configurador lo
convierte en pérdida de datos real: el diálogo quedaría con la foto vieja de la
receta y guardar un cambio de precio revertiría lo recién editado.

Por eso el arreglo de navegación **no puede ir solo**.

## Objetivo

Que "Configurar receta" lleve al usuario directo a la receta del producto que está
editando, y que volver lo deje exactamente donde estaba, sin riesgo de pisar datos.

## Decisiones tomadas

- **Dueño de la receta:** `ProductIngredientConfig` es el único que escribe en
  `product_ingredients`. El diálogo de producto deja de mandar `ingredients`.
- **Columna de productos:** se mantiene visible en el configurador incluso al entrar
  desde un producto puntual. Un solo layout que mantener.
- **Al volver:** el diálogo del producto se reabre tal como se dejó, con el contador
  de ingredientes ya actualizado.
- **Mecanismo:** capa a pantalla completa dentro de `ProductManagement`, que nunca
  se desmonta. No se toca la ruta `productIngredients` de App ni los otros tres
  accesos al configurador.

### Alternativas descartadas

- **Desmontar y reabrir por id.** Recupera el diálogo pero pierde igual búsqueda,
  filtro y scroll, y vuelve a disparar todas las cargas de red.
- **Levantar el estado de vista a App.** Preserva todo, pero mete detalles internos
  de `ProductManagement` en un `App.tsx` de ~1900 líneas y tampoco evita el remonte.
- **Hacer el diálogo editable de verdad.** Revierte la decisión del 29-jun y rompe
  los tres accesos restantes al configurador.

## Arquitectura

`ProductIngredientConfig` pasa a tener dos modos de uso, con el mismo componente:

| | Modo pantalla (existente) | Modo capa (nuevo) |
|---|---|---|
| Entrada | Perfil, Área de Producción, Dashboard | Botón "Configurar receta" |
| Montaje | Ruta `productIngredients` en App | Dentro de `ProductManagement` |
| Producto inicial | ninguno, se elige de la lista | el que se está editando |

La única diferencia en el componente es una prop nueva, `initialProduct?: Product`.
El resto —columna de productos, header, lógica de guardado— es idéntico.

## Cambios

### a) `ProductIngredientConfig` acepta un producto inicial

Prop opcional `initialProduct?: Product`. En `loadInitialData`, tras cargar la lista
de productos, si viene `initialProduct` se hace `setSelectedProduct` con el elemento
**de la lista recién cargada** que coincida por id — no con el objeto recibido por
prop, que puede ser una copia desactualizada.

El fallback a `productsData[0]` se mantiene **solo en modo pantalla**. Cuando llega
un `initialProduct` cuyo id no está en la lista, no se preselecciona nada y se avisa
con un toast: caer en la receta de otro producto es justamente el bug que se está
arreglando.

La columna izquierda hace scroll hasta el elemento seleccionado con `scrollIntoView`
sobre un ref del botón correspondiente, disparado una sola vez cuando la
preselección ocurre. No debe re-dispararse cuando el usuario elige otro producto
manualmente: ya está a la vista y el salto sería molesto.

### b) `ProductManagement` renderiza la capa en vez de navegar

Estado local `recetaDe: Product | null`. El botón hace `setRecetaDe(editingProduct)`
en lugar de llamar a `onManageRecipe`.

```
abrirReceta:  setRecetaDe(editingProduct); setIsDialogOpen(false);
cerrarReceta: setRecetaDe(null); setIsDialogOpen(true); loadProducts(true);
```

`abrirReceta` **no** debe llamar a `handleCloseDialog()`, que además borra
`editingProduct`, `formData` y `nameParts` (`ProductManagement.tsx:224`). Solo baja
la bandera `isDialogOpen`. Radix desmonta el contenido del diálogo, pero el estado
vive en `ProductManagement`, que sigue montado: al reabrir vuelve todo tal cual,
incluidos los campos a medio escribir.

`loadProducts(true)` es la recarga silenciosa que ya existe
(`ProductManagement.tsx:127`), escrita justamente para no perder el scroll.

Cuando `recetaDe` no es null se renderiza:

```jsx
<div className="fixed inset-0 z-50 overflow-y-auto bg-white">
  <ProductIngredientConfig
    initialProduct={recetaDe}
    onBack={cerrarReceta}
    accessToken={accessToken}
  />
</div>
```

**Por qué se cierra el diálogo en vez de apilar la capa encima:** el `DialogContent`
de Radix se monta en un portal colgado de `<body>` con `z-50`
(`src/components/ui/dialog.tsx:62`). La capa vive dentro de `#root`. A igual
`z-index` gana el que va después en el DOM, o sea el portal, y la capa quedaría
detrás del diálogo. Subir el z-index no es opción: el CSS está precompilado y `z-50`
es el máximo que existe — `z-[60]` no compila y se ignoraría en silencio.

Con el diálogo cerrado, el `z-50` de la capa no compite con nada y basta para tapar
la grilla.

La grilla de productos nunca sale del DOM, así que el scroll se conserva.

**`cerrarReceta` no debe tocar `formData`.** `loadProducts(true)` refresca la lista
de productos —y con ella el contador— pero el formulario conserva a propósito lo que
el usuario había escrito sin guardar. Repoblar `formData` desde el producto recargado
borraría esas ediciones, que es justamente lo que este cambio busca evitar.

### c) El diálogo deja de escribir recetas

`handleSubmit` deja de incluir `ingredients` en el payload. Eso arrastra dos
limpiezas que dejan de tener sentido:

- El bloque de conversión de unidades de `ProductManagement.tsx:177-200` existía solo
  para preparar el round-trip. Se elimina.
- `formData.ingredients` se elimina del estado del formulario. El contador del bloque
  "Receta" pasa a derivarse de la lista viva:

  ```js
  products.find(p => p.id === editingProduct?.id)?.ingredients?.length ?? 0
  ```

  Así el `loadProducts(true)` de (b) refresca el contador sin cablear nada más.

Omitir el campo es seguro en ambas rutas del backend: el create exige
`ingredients.length > 0` (`index.ts:821`) y el update solo entra al bloque si el
campo viene definido (`index.ts:987`). Ninguno de los dos se dispara.

### d) Limpieza de la prop muerta

La prop `onManageRecipe` de `ProductManagement` queda sin uso: se elimina de la
interfaz (`ProductManagement.tsx:55`), de la firma (`:90`) y del sitio de llamada en
`App.tsx:1791`. La ruta `productIngredients` y los otros tres accesos quedan intactos.

## Casos borde

**Producto nuevo.** Hoy el bloque "Receta" se dibuja también al crear un producto,
sin `editingProduct`. Ese botón ya es un bug: saca al usuario del formulario y pierde
lo escrito. Se esconde el botón cuando no hay producto guardado.

**El producto ya no existe.** Si el id de `initialProduct` no aparece en la lista que
carga el configurador (lo borró otra sesión), no se preselecciona nada y se muestra un
toast. No debe caer al `productsData[0]` del modo pantalla.

**Guardar el producto con la receta recién cambiada.** Es el caso que motivó el
cambio (c): con el PUT sin `ingredients`, no hay nada viejo que pisar.

**Roles.** Sin cambios. La pantalla de productos ya está limitada a `admin` y
`production`, que son exactamente los dos de `ROLES_MATERIAS_PRIMAS`
(`index.ts:334`).

## Verificación

El proyecto no tiene infraestructura para tests de componentes: el único script es
`node --test src/utils/*.test.ts`, sobre funciones puras, sin jsdom ni
testing-library. Montar esa infraestructura excede el alcance de este arreglo y
queda fuera.

**Automático:**

- `npm run test` — la suite existente debe seguir verde.
- `tsc --noEmit` — confirma que quitar `formData.ingredients` no deja referencias
  sueltas.

**Manual**, con "Queque Vainilla 500 grs" (receta conocida: Mix Queque Neutro 312 g,
Aceite Vegetal 28,1 ml, Huevos 62,5 g):

1. Filtrar por categoría, buscar, abrir el producto, cambiar el precio sin guardar →
   Configurar receta → volver. El diálogo vuelve con el precio editado; filtro y
   scroll siguen puestos.
2. Agregar un ingrediente en el configurador → volver → el contador dice 4.
3. Guardar el producto → recargar la página → siguen los 4. *(Este paso falla con el
   código actual.)*
4. Entrar al configurador desde Perfil → sigue apareciendo la lista sin
   preselección, como siempre.
5. Crear un producto nuevo → el bloque "Receta" no ofrece el botón.

**En base**, tras el paso 3, confirmar con SQL que las filas de
`product_ingredients` quedaron como corresponde.

## Fuera de alcance

- Infraestructura de tests de componentes.
- Cualquier cambio en el backend o en el esquema de la base.
- Rediseño del configurador de recetas más allá de la preselección.
