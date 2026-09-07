import type { ProductFormData } from './productPayload';

/**
 * Alterna "stock ilimitado" SIN tocar el valor del campo de stock.
 *
 * Antes, marcar la casilla ponía `stock` en '0' y desmarcarla lo dejaba en '0'
 * (porque ya valía '0'): marcar y desmarcar destruía el número del usuario y
 * guardaba el producto en cero, sin aviso.
 *
 * Blanquearlo nunca hizo falta. El input ya se deshabilita mientras la casilla
 * está marcada, y el 0 que corresponde mandar al servidor cuando el producto es
 * ilimitado se fuerza aparte: en construirPayloadProducto y otra vez en el
 * backend (index.ts, `if (unlimitedStock) updateData.stock = 0`).
 */
export function alternarStockIlimitado(
  form: ProductFormData,
  ilimitado: boolean
): ProductFormData {
  return { ...form, unlimitedStock: ilimitado };
}
