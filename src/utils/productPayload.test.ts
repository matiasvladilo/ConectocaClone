import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirPayloadProducto, type ProductFormData } from './productPayload.ts';

const formBase: ProductFormData = {
  name: '  Queque Vainilla 500 grs  ',
  description: '  rico  ',
  price: '2.500',
  stock: '10',
  minStock: '3',
  category: 'Pastelería',
  categoryId: 'cat-1',
  sku: 'QV500',
  imageUrl: 'https://ejemplo/queque.png',
  productionAreaId: 'area-1',
  unlimitedStock: false,
  allowDecimal: false,
};

const productoBase = {
  id: 'p-1',
  stock: 10,
  unlimitedStock: false,
} as any;

// La razón de ser de este archivo: el diálogo de producto no edita recetas, así
// que mandar `ingredients` haría que el backend borre y reinserte la receta con
// una copia potencialmente vieja.
test('nunca incluye ingredients', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal('ingredients' in payload, false);
});

test('recorta los campos de texto', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.name, 'Queque Vainilla 500 grs');
  assert.equal(payload.description, 'rico');
});

// Si el stock no se tocó, mandarlo pisaría lo que haya cambiado por otro lado
// (un ajuste de stock, un pedido, otra sesión) mientras el diálogo estaba abierto.
test('omite stock cuando no se tocó', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal('stock' in payload, false);
});

test('incluye stock cuando cambió', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, stock: '25' },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.stock, 25);
});

// Con parseInt, parseInt("9.5") = 9 nunca coincidía con 9.5: todo producto por
// peso daba "se tocó" y además mandaba el 9 truncado, comiéndose media unidad.
test('no considera tocado un stock decimal sin cambios', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, stock: '9.5', allowDecimal: true },
    editingProduct: { ...productoBase, stock: 9.5 },
    priceValue: 2500,
  });
  assert.equal('stock' in payload, false);
});

test('al crear siempre manda stock', () => {
  const payload = construirPayloadProducto({
    formData: formBase,
    editingProduct: null,
    priceValue: 2500,
  });
  assert.equal(payload.stock, 10);
});

test('stock ilimitado manda 0 y trackStock false', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, unlimitedStock: true },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.stock, 0);
  assert.equal(payload.trackStock, false);
  assert.equal(payload.unlimitedStock, true);
});

test('minStock vacío viaja como null', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, minStock: '   ' },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.minStock, null);
});

test('categoría vacía cae en General', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, category: '   ' },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.category, 'General');
});

// Pasar de ilimitado a limitado toca el stock aunque el número en formData.stock
// sea el mismo que ya traía el producto: eraIlimitadoAntes !== formData.unlimitedStock
// debe alcanzar para disparar stockSeToco por sí solo.
test('pasar de stock ilimitado a limitado incluye stock', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, unlimitedStock: false, stock: '10' },
    editingProduct: { ...productoBase, unlimitedStock: true, stock: 10 },
    priceValue: 2500,
  });
  assert.equal('stock' in payload, true);
  assert.equal(payload.stock, 10);
});

// Quirk preexistente, no comportamiento nuevo: categoryId: '' viaja como
// `undefined` (no como '' ni null), así que este formulario nunca puede
// mandar "sin categoría" para BORRAR la categoría de un producto existente
// (el backend, al recibir undefined, no toca el campo). Este test solo deja
// documentado el estado actual.
test('categoryId vacío viaja como undefined (no borra la categoría)', () => {
  const payload = construirPayloadProducto({
    formData: { ...formBase, categoryId: '' },
    editingProduct: productoBase,
    priceValue: 2500,
  });
  assert.equal(payload.categoryId, undefined);
});
