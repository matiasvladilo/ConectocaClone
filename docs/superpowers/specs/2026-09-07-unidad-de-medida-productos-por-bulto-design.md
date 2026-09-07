# Unidad de medida en productos por bulto — Nota de investigación

**Fecha:** 2026-09-07
**Estado:** preliminar. **Bloqueado** hasta confirmar dos datos con el equipo (ver "Qué falta saber").

Esto no es un diseño aprobado. Es el registro de un hallazgo que apareció investigando el bug de stock, y que se decidió tratar como trabajo aparte. Ver `2026-09-07-stock-una-sola-via-design.md`.

## Problema

Un mismo producto se está contando en dos unidades distintas —a veces en bultos, a veces en unidades sueltas— y nada en el sistema distingue una de otra. Cuando eso pasa, **ninguna cantidad de ese producto significa nada**: ni el stock, ni el mínimo, ni lo que se despacha.

Es más grave que un bug de software, porque el software no puede detectarlo. Todas las escrituras son válidas: un `4` y un `96` son ambos enteros positivos perfectamente legales. No hay error que loguear ni validación que agregar.

## Evidencia

El caso que lo destapó, `SCORE GORILLA 473, POR MALETA`:

```
04/09 17:51  ajuste        → 96
06/09 13:51  despacho 24   → 72
06/09 16:46  ajuste        → 4     (usuario 817bb042)
06/09 16:48  devolución 24 → 28
06/09 16:51  ajuste        → 4     (mismo usuario)
```

El precio dice cuál es la unidad real:

| producto | precio |
|---|---|
| SCORE GORILLA 473, **POR MALETA** | **$19.200** |
| SCORE GORILLA ZERO | $800 |
| SCORE ENERGY DRINK 473ml | $800 |
| SCORE RADICAL WHITE 473ml | $800 |

$19.200 ÷ $800 = **24**. La unidad de ese producto es la maleta, y una maleta son 24 botellas.

Con eso, la historia se lee distinta:

- El **96** del viernes, leído en maletas, serían 2.304 botellas — alrededor de $1,8 millones inmovilizados en un solo SKU. No es plausible. Ese 96 está cargado **en botellas** en un producto cuya unidad es la maleta (96 ÷ 24 = 4).
- El **4** del domingo son 4 maletas. El usuario **no estaba rompiendo el stock: lo estaba corrigiendo.**

El `min_stock` confirma la lectura desde otro ángulo: el GORILLA POR MALETA tiene umbral **2**, y los otros SCORE tienen **24**. Alguien configuró el umbral pensando en maletas.

### Alcance del problema

21 productos llevan la unidad escrita en el nombre, como texto libre:

`SCORE GORILLA 473, POR MALETA` · `SIXPACK COCACOLA ORIGINAL LATA 350ml` (stock 8) · `SIXPACK COCACOLA ZERO LATA 350ml` (29) · `COCA COLA LIGHT LATA SIXPACK 350ml` (4) · `Encendedor RONSON 20 unidades` · `NESCAFE CAPPUCCINO CAJA (8 UNIDADES)` · `Alfajor Mendocino caja 12 unidades` · `Brownie 6 unidades` · y 13 más, la mayoría hoy en 0.

La unidad vive **sólo en el nombre**. No hay ningún campo en `products` que diga "esto es un pack de N". El modelo de datos no sabe que existe el concepto.

### Lo que sí está bien

Se verificó el riesgo peor —que el mismo inventario físico esté duplicado en dos productos— y **no ocurre** con las latas de Coca Cola: existen los tres sixpacks y ninguna lata suelta equivalente. El sixpack es la única representación de ese producto. No hay doble conteo.

Conviene repetir esa verificación para el resto de los 21 antes de tocar nada.

## Qué falta saber

Dos preguntas al equipo. Sin estas respuestas, cualquier diseño es adivinanza:

1. **El SCORE GORILLA POR MALETA, ¿se cuenta en maletas o en botellas?** Y el despacho de 24 del 6/09, ¿fueron 24 maletas o 24 botellas? Si fueron botellas, el descuento está mal por un factor de 24.
2. **¿Hay más productos donde la gente cuenta distinto según quién?** El GORILLA apareció por casualidad; puede no ser el único.

## Opciones de diseño

Sin decidir. Se anotan para cuando lleguen las respuestas.

**A. Campo `unidades_por_bulto` en `products`.** El producto declara que es un bulto de N. La UI muestra "4 maletas (96 unidades)" y los formularios dicen en qué unidad se está escribiendo. Es lo más honesto con la realidad del negocio, y el cambio más grande: toca modelo, UI de productos, pedidos y despacho.

**B. Un solo producto por artículo, siempre en unidades sueltas.** La maleta deja de ser un producto y pasa a ser una cantidad (pedir 24). Simplifica el inventario a una sola unidad y elimina la clase de error entera. Requiere migrar los 21 productos y reeducar cómo se cargan los pedidos; y pierde el precio por bulto, que hoy es distinto al unitario × 24.

**C. Sólo convención de nombres y capacitación.** Cero código. No resuelve nada estructuralmente: el próximo producto por bulto reintroduce el problema.

La inclinación inicial es **A**, porque respeta cómo trabaja la distribuidora (se compra por maleta y se vende de las dos formas) sin obligar a rehacer el catálogo. Pero depende por completo de la respuesta a la pregunta 1.

## Fuera de alcance

- **El bug de stock.** Va en `2026-09-07-stock-una-sola-via-design.md`. Son problemas independientes: aquel es de software, éste es de modelo de datos.
- **Corregir los stocks históricos mal cargados.** No se puede deducir desde la base cuál número estaba en qué unidad. Requiere recuento físico.

## Riesgos / notas

- **El compare-and-swap del otro spec no arregla esto, pero ayuda.** En el evento del 6/09 a las 16:51, el usuario pisó una devolución de 24 sin enterarse. Con el aviso de conflicto habría visto "entró una devolución de 24" — que es exactamente el dato que necesitaba para darse cuenta de que las unidades no cuadraban. No lo resuelve; lo hace visible.
- **Ningún arreglo de software detecta este error.** Vale insistir: no hay validación posible que distinga 4 maletas de 4 botellas si el sistema no sabe que existen las maletas. Por eso B o A, y no una regla de validación.
- **Puede ser más caro que el bug de stock.** Un producto de $19.200 contado con un factor de error de 24 distorsiona el valor del inventario, los umbrales de reposición y lo que se le cobra al cliente.
