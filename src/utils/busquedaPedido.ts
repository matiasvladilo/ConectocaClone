/**
 * Búsqueda de pedidos por id.
 *
 * El id real es un UUID (`4210c619-a845-4dcb-...`), pero en pantalla y en los
 * papeles siempre se muestra recortado y decorado: la app escribe
 * `Pedido #4210C619` y la guía de despacho `ID Despacho: #4210C619`.
 *
 * Quien busca un pedido copia lo que tiene a la vista, con el `#` incluido, y
 * antes eso no encontraba nada: el filtro comparaba el texto tal cual contra el
 * UUID, que no contiene ningún `#`. Acá se limpia lo decorativo antes de
 * comparar.
 *
 * El prefijo `D-` se contempla porque las guías impresas hasta noviembre 2026
 * lo usaban (ver el historial de ThermalReceiptTemplate.tsx): esos papeles
 * siguen circulando, y además el `D-` venía con solo 4 caracteres del id, que
 * no alcanzan para identificar un pedido — con 6.558 pedidos había 607 que
 * compartían esos 4 caracteres con algún otro.
 */

/** Deja solo los caracteres del id, sin `#`, sin `D-` y sin espacios. */
export function normalizarIdPedido(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/^d-/, '')
    .replace(/\s+/g, '');
}

/**
 * ¿El pedido coincide con lo que se escribió en el buscador?
 *
 * Compara contra el UUID completo, así que sirve tanto el id recortado que sale
 * impreso como el UUID entero pegado desde la base.
 */
export function idPedidoCoincide(orderId: string, consulta: string): boolean {
  const q = normalizarIdPedido(consulta);
  if (!q) return false;
  return orderId.toLowerCase().includes(q);
}
