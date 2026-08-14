# Ajuste Rápido de Stock desde la Tarjeta de Producto — Diseño

**Fecha:** 2026-08-07

## Problema

Hoy, para cambiar el stock de un producto hay que apretar **Editar**, lo que abre el formulario completo del producto (nombre, SKU, descripción, precio, stock, categoría, área de producción, imagen, receta) dentro de un diálogo con scroll. Modificar un solo número obliga a atravesar todo eso, encontrar el campo, y guardar el formulario entero.

Es la operación más frecuente del día a día —llega mercadería, se rompe algo, se cuenta la góndola— y es la que más fricción tiene. El usuario lo describió como "engorroso".

### Alcance

- **En alcance:** un botón "Stock" en la tarjeta de producto de Gestión de Productos, que abre un cuadro chico para ajustar solo el stock, con dos modos: sumar y corregir el total.
- **Fuera de alcance:** historial de movimientos de stock (quién sumó qué y cuándo). No hay tabla ni endpoint para eso hoy, y agregarlo es un trabajo aparte.
- **Fuera de alcance:** inventario masivo (una pantalla para cargar el conteo de todos los productos de una vez). Se evaluó explícitamente y se decidió dejarlo para otra iteración.
- **Fuera de alcance:** ajustar stock desde otras pantallas (Nuevo Pedido, Despacho). Este cambio es solo en Gestión de Productos.

## Enfoque elegido

**Un diálogo dedicado, chico, con dos modos de ajuste, disparado desde un botón nuevo en la tarjeta.**

Enfoques descartados:

- **Botones `+` / `−` directos en la tarjeta, sin diálogo:** muy rápido para sumar 2 o 3 unidades, pero tedioso para 50 y no permite corregir un total. El caso real de esta app son cajas de distribución (30, 50, 100 unidades), así que la mayoría de los ajustes serían decenas de toques. Descartado por el usuario.
- **Un solo modo (solo sumar):** era la propuesta inicial y el usuario la aprobó, pero al repreguntar surgió que también necesita corregir el total tras un conteo. Un solo modo obligaría a calcular la diferencia de cabeza (tengo 30, conté 47, sumo 17), que es exactamente la fricción que esta feature busca eliminar.
- **Edición en línea del número dentro de la tarjeta:** ahorra el diálogo, pero no deja espacio para mostrar el resultado antes de confirmar ni para elegir el modo, y las tarjetas ya están densas.

El diálogo gana porque muestra el cálculo antes de confirmar —lo que previene el error más caro de esta operación, que es dejar mal el stock sin darse cuenta— y porque escala igual para 5 que para 500 unidades.

## Diseño

### Componente 1 — Botón "Stock" en la tarjeta

Archivo: [`src/components/ProductManagement.tsx`](../../../src/components/ProductManagement.tsx), fila de acciones (~línea 777-795).

Hoy la fila tiene **Editar** (`flex-1`) y un botón de borrar solo con ícono. Pasa a tener tres: **Editar**, **Stock** y borrar. Editar y Stock comparten el ancho por igual (`flex-1` cada uno); el de borrar queda como está.

El botón usa el ícono `BoxIcon` (ya importado en el archivo, y es el que la app ya asocia a stock: se usa en la tarjeta de estadística "Stock Bajo" y en el campo Stock del formulario).

**No se renderiza** cuando el producto tiene stock ilimitado (`product.unlimitedStock === true || product.stock === -1`): no hay nada que ajustar, y mostrarlo invitaría a un error. La tarjeta de esos productos muestra "∞ Ilimitado" donde iría el número.

### Componente 2 — `StockAdjustDialog` (componente nuevo)

Archivo nuevo: `src/components/StockAdjustDialog.tsx`

Una sola responsabilidad: **tomar un producto y una cantidad, y devolver el stock final que corresponde**. No guarda nada ni conoce la API — de eso se encarga quien lo usa, igual que hace `BarcodeScannerDialog` con el código escaneado.

```ts
interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onConfirm: (nuevoStock: number) => Promise<void>; // recibe el TOTAL final, no la diferencia
  saving?: boolean;
}
```

`onConfirm` recibe el **total final ya calculado**, no la diferencia. Así el componente concentra toda la aritmética y quien lo consume solo persiste un número — no hay que replicar la lógica de los dos modos en el llamador.

Contenido del diálogo:

- **Nombre del producto** en el encabezado, para que no haya duda de cuál se está tocando.
- **Selector de modo**, dos opciones, `Sumar` elegido por defecto:
  - `Sumar` — la cantidad se agrega al stock actual.
  - `Corregir total` — la cantidad reemplaza el stock actual.
- **Stock actual** visible siempre.
- **Campo numérico** con `inputMode="numeric"` (abre el teclado numérico en celular). Se autoenfoca al abrir para poder tipear de una.
- **Resultado en vivo**, que cambia según el modo:
  - Sumar: `30 + 20 = 50 unidades`
  - Corregir total: `30 → 50 unidades`
- **Cancelar** y **Confirmar**.

Reglas de cálculo y validación:

| Situación | Comportamiento |
|---|---|
| Modo Sumar, cantidad positiva | `nuevo = actual + cantidad` |
| Modo Sumar, cantidad negativa (ej. `-5`) | `nuevo = actual - 5`. Permitido a propósito: cubre mermas y roturas sin necesitar otro modo. |
| Modo Corregir total, cantidad `n` | `nuevo = n` |
| El resultado daría negativo | Se muestra el motivo y **Confirmar queda deshabilitado**. Nunca se guarda un stock negativo. |
| Campo vacío o no numérico | Confirmar deshabilitado, sin mensaje de error (todavía no hizo nada mal). |
| Modo Corregir total con número negativo | Confirmar deshabilitado: un total no puede ser negativo. |
| El resultado es igual al stock actual | Confirmar habilitado. No es un error; guardar el mismo número es inocuo. |

Al cerrarse (por Cancelar, Escape o clic afuera), el estado se resetea: al reabrir siempre arranca en modo `Sumar` con el campo vacío. Un valor heredado de un producto anterior es la clase de error que deja stock mal cargado sin que nadie lo note.

Mientras `saving` es `true`, Confirmar muestra "Guardando..." y el diálogo **no se puede cerrar** — el mismo criterio que ya usa `ImageCropDialog` mientras procesa, para que no se pierda una operación a mitad de camino.

### Componente 3 — Guardado

En `ProductManagement.tsx`, el handler que recibe el `nuevoStock`:

```
llama productsAPI.update(accessToken, product.id, { stock: nuevoStock })
actualiza el producto en el estado local con lo que devuelve el servidor
muestra un toast de éxito indicando el producto y el stock nuevo
cierra el diálogo
```

Usa `productsAPI.update` mandando **solo** el campo `stock`, que es exactamente lo que ya hacen `EditOrderDialog` y `NewOrderForm` para descontar stock. El backend actualiza solo los campos presentes en el body, así que el resto del producto no se toca — y en particular **no manda `ingredients`**, lo que significa que la receta queda intacta y no se dispara el chequeo de permisos de recetas.

Ante un error de red o del servidor, se muestra el mensaje en un toast y el diálogo **queda abierto con lo que el usuario había cargado**, para que pueda reintentar sin volver a tipear.

No hay cambios en el backend, la base de datos ni la Edge Function.

## Testing

Este proyecto no tiene framework de tests; la verificación es typecheck + navegador, con evidencia.

**Cálculo y validación**
1. Sumar `20` a un producto con 30 → el resultado en vivo dice `50`, y tras confirmar la tarjeta muestra 30 + 20 = 50.
2. Sumar `-5` a un producto con 30 → resultado `25`, se guarda.
3. Sumar `-100` a un producto con 30 → Confirmar deshabilitado, se explica por qué.
4. Corregir total a `47` en un producto con 30 → resultado `47`, se guarda.
5. Corregir total a `-1` → Confirmar deshabilitado.
6. Campo vacío → Confirmar deshabilitado.

**Interfaz**
7. El botón Stock **no aparece** en un producto de stock ilimitado.
8. Abrir el diálogo en un producto, cancelar, abrirlo en otro → arranca en modo Sumar y con el campo vacío, sin arrastrar nada del anterior.
9. En celular, el campo abre el teclado numérico.
10. Los tres botones de la tarjeta (Editar, Stock, borrar) entran bien en el ancho de una tarjeta en pantalla angosta.

**Persistencia**
11. Tras confirmar, recargar la página: el stock nuevo persiste.
12. Confirmar en un producto que tiene receta configurada y verificar que la receta sigue intacta (se manda solo `stock`).

## Riesgos / notas

- **Sin registro de quién ajustó.** Si dos personas ajustan el mismo producto con minutos de diferencia, no queda rastro de quién hizo qué. Es una limitación existente de toda la app (editar un producto tampoco deja rastro), no algo que introduzca esta feature, pero esta la hace más frecuente y por lo tanto más visible.
- **Sin bloqueo de concurrencia.** Si dos usuarios abren el diálogo del mismo producto a la vez y ambos suman 10 sobre un stock de 30, el segundo en confirmar deja 40, no 50: el cálculo se hace sobre el stock que cada uno tenía cargado en pantalla. Para el volumen de esta operación es un riesgo aceptable; resolverlo bien requeriría un endpoint de incremento atómico en el servidor, que está fuera de alcance.
- **La lista de productos no se auto-refresca.** Si otro usuario cambió el stock desde otra pantalla, el número en la tarjeta puede estar desactualizado y el cálculo partiría de ese valor viejo. Es el comportamiento actual de esta pantalla (carga los productos al montar), no algo nuevo.
