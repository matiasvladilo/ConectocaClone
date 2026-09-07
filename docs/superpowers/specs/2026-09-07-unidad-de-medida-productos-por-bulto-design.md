# Unidad de medida en productos por bulto — Nota de investigación

**Fecha:** 2026-09-07
**Estado:** cerrado como investigación. Queda una corrección de dato y una mejora opcional.

Apareció investigando el bug de stock y se trató aparte porque no es un problema de software. Ver `2026-09-07-stock-una-sola-via-design.md`.

## Resumen

Un producto —**uno solo**— tuvo el stock cargado en una unidad distinta a la que usa para venderse. No es un problema sistémico del modelo de datos, como se sospechó al principio: se verificó contra todo el catálogo y no se repite.

## El hallazgo

`SCORE GORILLA 473, POR MALETA`, el 6/09:

```
04/09 17:51  ajuste        → 96
06/09 13:51  despacho 24   → 72
06/09 16:46  ajuste        → 4     (usuario 817bb042)
06/09 16:48  devolución 24 → 28
06/09 16:51  ajuste        → 4     (mismo usuario)
```

A primera vista parece que alguien destruyó el stock dos veces. Es al revés.

**La unidad de ese producto es la maleta**, y está probado por los pedidos, no por deducción:

| producto | precio | cantidad pedida (histórico) |
|---|---|---|
| SCORE GORILLA 473, **POR MALETA** | **$19.200** | siempre **1 o 2** — 8 líneas, promedio 1,13 |
| SCORE ENERGY DRINK 473ml | $800 | 2 a 10, promedio 5,9 |
| SCORE GORILLA ZERO | $800 | 2 a 12, promedio 7,5 |
| SCORE RADICAL WHITE 473ml | $800 | 2 a 10, promedio 6 |

$19.200 ÷ $800 = 24. Una maleta son 24 botellas, y en toda la historia del sistema nadie pidió más de 2 maletas de una vez. El `min_stock` lo confirma desde otro ángulo: el GORILLA tiene umbral 2, los otros SCORE tienen 24.

Entonces:

- El **96** del viernes está cargado en **botellas** (96 ÷ 24 = 4 maletas). Leído en maletas serían 2.304 botellas: **$1.843.200** inmovilizados en un solo SKU. No es plausible.
- El **4** del domingo son 4 maletas. **El usuario no rompió el stock: lo estaba corrigiendo.**
- El segundo **4** fue volver a corregirlo después de que una devolución lo empujara a 28.

El despacho de 24 del 6/09 no tiene línea de pedido sobreviviente: ese pedido se anuló a las 16:48 (de ahí la devolución). O sea que alguien cargó un pedido de 24 maletas — $460.800, 24 veces lo normal — y después se dio de baja.

## Se verificó que no es sistémico

21 productos llevan la unidad escrita en el nombre como texto libre. Comparando la cantidad típica de pedido contra la carga manual de stock más alta de cada uno:

**9 son ilimitados** (Alfajor Mendocino, Alfajor de Maicena, Brownie, Cocadas, Trufa, barquillo de nutella, Chilenito, Galleta conchitas, Merenguitos). No llevan inventario, así que no pueden tener este problema.

**12 llevan stock controlado**, y sólo uno desentona:

| producto | máx. pedido | máx. carga manual | lectura |
|---|---|---|---|
| **SCORE GORILLA POR MALETA** | 2 | **96** | **48× — anomalía** |
| SIXPACK COCACOLA ZERO | 4 | 69 | 17×, $262.890 — plausible para distribuidora |
| SIXPACK COCACOLA ORIGINAL | 4 | 23 | normal |
| NESCAFE CAPPUCCINO | 1 | 6 | normal |
| NESCAFE VAINILLA LATE | 1 | 3 | normal |
| otros 7 | — | nunca se cargó | sin datos, sin riesgo activo |

También se descartó el riesgo peor —el mismo inventario físico duplicado en dos productos—: existen los tres sixpacks de Coca Cola y ninguna lata suelta equivalente.

**Conclusión: es un error de carga en un producto, no una falla del modelo.**

## Qué hacer

**1. Corregir el dato.** El stock del GORILLA hoy es 0 y su historia está contaminada por el 96. Cuando se haga el recuento físico, cargarlo en maletas. No hace falta migración ni código.

**2. Opcional — un aviso de cordura al ajustar stock.** Si un ajuste manual deja un valor muy fuera de lo que ese producto mueve (por ejemplo, más de 20× la cantidad máxima que se pidió alguna vez, o un valor de inventario por encima de cierto monto), mostrar una advertencia antes de confirmar. No bloquea: avisa.

Esto encaja naturalmente en `StockAdjustDialog`, que con el otro spec ya va a tener un estado de advertencia para los conflictos de concurrencia. Sería el mismo lugar, distinto motivo.

**Descartado: agregar un campo `unidades_por_bulto` al modelo.** Era la inclinación inicial cuando parecía sistémico. Con un solo producto afectado y ninguna evidencia de que se repita, cambiar el modelo de datos, la UI de productos, pedidos y despacho no se justifica. Si en el futuro aparecen más casos, se reevalúa.

## Riesgos / notas

- **Ningún arreglo de software detecta este error con certeza.** No hay forma de distinguir 4 maletas de 4 botellas si el sistema no sabe que las maletas existen. El aviso de cordura es heurístico: detecta valores raros, no unidades equivocadas.
- **El compare-and-swap del otro spec no arregla esto, pero ayuda.** En el evento de las 16:51 el usuario pisó una devolución de 24 sin enterarse. Con el aviso de conflicto habría visto "entró una devolución de 24" — el dato que le faltaba para notar que los números no cerraban.
- **El SIXPACK COCACOLA ZERO conviene mirarlo en el recuento.** 69 sixpacks es plausible pero es el segundo más alto de la lista; vale confirmarlo con mercadería a la vista.
- **Corrección respecto del análisis inicial del bug de stock.** El caso SCORE GORILLA se presentó como uno de los tres ejemplos de "escritura vieja que pisa movimientos reales". Con el dato del precio, ese caso es mitad y mitad: la corrección a 4 era correcta y deliberada, y lo único defectuoso fue pisar la devolución sin enterarse. Los otros dos casos (Aceite Natura y SCORE ENERGY DRINK) siguen siendo válidos tal como se describieron.
