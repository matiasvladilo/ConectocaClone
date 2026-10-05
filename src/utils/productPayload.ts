import type { Product } from './api';

export interface ProductFormData {
  name: string;
  description: string;
  price: string;
  stock: string;
  minStock: string;
  category: string;
  categoryId: string;
  sku: string;
  imageUrl: string;
  productionAreaId: string;
  unlimitedStock: boolean;
  allowDecimal: boolean;
}

interface Params {
  formData: ProductFormData;
  editingProduct: Product | null;
  priceValue: number;
  // true si el producto es de Distribuidora sin receta: el precio lo
  // recalcula el backend según el lote activo, así que no se manda al
  // editar (mismo criterio que ya se usa para `stock`).
  enLotes: boolean;
}

/**
 * Arma el cuerpo del POST/PUT de producto.
 *
 * Deliberadamente NO incluye `ingredients`: el diálogo de producto no edita
 * recetas (son de ProductIngredientConfig), y el backend borra y reinserta
 * product_ingredients con lo que reciba. Mandar la copia que el diálogo tenía
 * al abrirse revierte cualquier cambio hecho mientras tanto.
 */
export function construirPayloadProducto({ formData, editingProduct, priceValue, enLotes }: Params) {
  // El stock viaja SÓLO al crear, donde es el stock inicial y no hay nada que
  // pisar. Al editar nunca: el formulario de edición ya no tiene campo de stock
  // (se cambia por StockAdjustDialog, que confirma en el acto). Mandarlo desde
  // acá pisaría en silencio lo que haya cambiado por otro lado —un ajuste, un
  // pedido, otra sesión— mientras el diálogo estuvo abierto.
  return {
    name: formData.name.trim(),
    description: formData.description.trim(),
    ...(editingProduct && enLotes ? {} : { price: priceValue }),
    minStock: formData.minStock.trim() === '' ? null : (parseInt(formData.minStock) || 0),
    unlimitedStock: formData.unlimitedStock,
    trackStock: !formData.unlimitedStock,
    allowDecimal: formData.allowDecimal,
    category: formData.category.trim() || 'General',
    categoryId: formData.categoryId || undefined,
    sku: formData.sku.trim(),
    imageUrl: formData.imageUrl.trim() || undefined,
    productionAreaId: formData.productionAreaId || undefined,
    ...(editingProduct
      ? {}
      : { stock: formData.unlimitedStock ? 0 : (parseFloat(formData.stock) || 0) })
  };
}
