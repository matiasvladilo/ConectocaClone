# Impresión automática de la guía de despacho

Cómo queda configurado el PC de despacho para que la guía salga sola cuando
entra un pedido.

## Qué hace la app

En **Mi cuenta → Impresión** hay un interruptor *"Imprimir al llegar un
pedido"*. Lo ven los roles `dispatch` y `admin`, que son los que reciben los
pedidos.

La preferencia se guarda en `localStorage` de **ese equipo**, no en la cuenta
(`src/utils/impresionAutomatica.ts`). Es a propósito: la impresora está
enchufada a un computador concreto y no tiene sentido que al mismo usuario le
salte el diálogo de impresión en el celular.

Cuando el polling de pedidos detecta uno nuevo (`src/App.tsx`), si el
interruptor está activo el pedido entra a una cola y
`src/components/ImpresionAutomatica.tsx` lo dibuja en `#print-root` y llama a
`window.print()`. Los pedidos se imprimen de a uno: `window.print()` es
bloqueante hasta que se cierra el diálogo, así que al volver avanza la cola.

Es independiente de las notificaciones: se puede imprimir sin sonido, o sonar
sin imprimir.

## El límite del navegador

**Ningún navegador permite imprimir sin mostrar el diálogo de impresión.** No
existe API para eso, y es una decisión de seguridad de los navegadores (si no,
cualquier página podría gastar el papel y la tinta de quien la visita).

Con el interruptor activado, entonces, el comportamiento por defecto es:
llega el pedido → la guía queda armada → se abre el diálogo → **un Enter y
sale**.

## Para que salga sin ningún click (Chrome en el PC de despacho)

Chrome tiene un modo en el que `window.print()` manda directo a la impresora
predeterminada, sin diálogo: `--kiosk-printing`. Hay que arrancar Chrome con
ese flag.

**Windows** — crear un acceso directo a Chrome, botón derecho → Propiedades, y
en *Destino* dejar:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --app=https://TU-DOMINIO
```

**macOS** — abrir Chrome desde la Terminal:

```bash
open -na "Google Chrome" --args --kiosk-printing --app=https://TU-DOMINIO
```

Notas:

- `--kiosk-printing` aplica a **toda** esa ventana de Chrome: todo lo que se
  imprima desde ahí sale sin preguntar. Conviene dedicar esa ventana (o ese
  perfil) solo a la app.
- La impresora térmica tiene que estar como **predeterminada** del sistema, y
  su tamaño de papel configurado en el driver (el rollo). El CSS a propósito no
  fija `size` para la térmica: el largo real solo lo conoce el driver (ver
  `@page termica` en `src/styles/globals.css`).
- Si Chrome se abre normal (sin el flag), el interruptor sigue sirviendo: solo
  que hay que apretar Enter en el diálogo.

## Por qué los pedidos largos se cortaban

Hasta el arreglo de noviembre 2026, el CSS de impresión ocultaba la app con
`visibility: hidden` y sacaba la guía del flujo con `position: absolute`. Una
caja fuera de flujo no pagina de forma confiable entre hojas: en un pedido de
97 productos la guía salía hasta el ítem ~88 y el resto no se imprimía.

Ahora la app se oculta con `display: none` y la guía queda en flujo normal
dentro de `#print-root`, que es lo único que sobrevive al imprimir. Además el
encabezado de la tabla se repite en cada hoja y las filas no se parten.

Como control, la guía termina con el conteo de productos y un `— FIN DE GUÍA —`:
si el papel no llega hasta ahí, se cortó.
