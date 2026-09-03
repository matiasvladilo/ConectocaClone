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
}

/**
 * Arma el cuerpo del POST/PUT de producto.
 *
 * Deliberadamente NO incluye `ingredients`: el diálogo de producto no edita
 * recetas (son de ProductIngredientConfig), y el backend borra y reinserta
 * product_ingredients con lo que reciba. Mandar la copia que el diálogo tenía
 * al abrirse revierte cualquier cambio hecho mientras tanto.
 */
export function construirPayloadProducto({ formData, editingProduct, priceValue }: Params) {
  const eraIlimitadoAntes = editingProduct
    ? (editingProduct.unlimitedStock === true || editingProduct.stock === -1)
    : false;

  // parseFloat y no parseInt: `stock` es numeric en Postgres y un producto con
  // allowDecimal se queda en valores fraccionados (los pedidos le restan 0.5).
  const stockSeToco = !editingProduct
    || formData.unlimitedStock !== eraIlimitadoAntes
    || parseFloat(formData.stock) !== editingProduct.stock;

  return {
    name: formData.name.trim(),
    description: formData.description.trim(),
    price: priceValue,
    minStock: formData.minStock.trim() === '' ? null : (parseInt(formData.minStock) || 0),
    unlimitedStock: formData.unlimitedStock,
    trackStock: !formData.unlimitedStock,
    allowDecimal: formData.allowDecimal,
    category: formData.category.trim() || 'General',
    categoryId: formData.categoryId || undefined,
    sku: formData.sku.trim(),
    imageUrl: formData.imageUrl.trim() || undefined,
    productionAreaId: formData.productionAreaId || undefined,
    ...(stockSeToco
      ? { stock: formData.unlimitedStock ? 0 : (parseFloat(formData.stock) || 0) }
      : {})
  };
}
