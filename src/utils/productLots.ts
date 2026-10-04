import type { Product, Category } from './api';
import { elegirCategoriaInicial, idsDeCategoriaConHijas } from './categoryTree.ts';

/**
 * Mismo criterio que usa el backend en producto_usa_lotes(): sin receta, sin
 * allowDecimal (que usa cantidades no enteras), y en la categoría Distribuidora
 * o una subcategoría directa suya. Reutiliza la misma detección por nombre que ya
 * usa DistributionPanel, para que mover un producto de categoría cambie su
 * comportamiento sin que haga falta ningún flag nuevo.
 */
export function productoUsaLotes(product: Product, categories: Category[]): boolean {
  if (!product.categoryId) return false;
  if ((product.ingredients?.length ?? 0) > 0) return false;
  // Los lotes FIFO trabajan con cantidades enteras; productos con allowDecimal
  // se excluyen del alcance como en el backend.
  if (product.allowDecimal) return false;

  const distribuidoraId = elegirCategoriaInicial(categories);
  if (distribuidoraId === 'all') return false; // no existe la categoría Distribuidora

  const idsValidos = idsDeCategoriaConHijas(categories, distribuidoraId);
  return idsValidos.has(product.categoryId);
}
