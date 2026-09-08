import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternarStockIlimitado } from './stockForm.ts';
import type { ProductFormData } from './productPayload.ts';

const form: ProductFormData = {
  name: 'Aceite Natura',
  description: '900ml',
  price: '2.750',
  stock: '50',
  minStock: '10',
  category: 'Abarrotes',
  categoryId: 'cat-1',
  sku: '',
  imageUrl: '',
  productionAreaId: '',
  unlimitedStock: false,
  allowDecimal: false,
};

test('marcar ilimitado NO destruye el stock cargado', () => {
  const r = alternarStockIlimitado(form, true);
  assert.equal(r.unlimitedStock, true);
  assert.equal(r.stock, '50');
});

test('marcar y desmarcar devuelve el stock original', () => {
  const r = alternarStockIlimitado(alternarStockIlimitado(form, true), false);
  assert.equal(r.unlimitedStock, false);
  assert.equal(r.stock, '50');
});

test('no toca ningun otro campo', () => {
  const r = alternarStockIlimitado(form, true);
  assert.equal(r.name, 'Aceite Natura');
  assert.equal(r.price, '2.750');
  assert.equal(r.minStock, '10');
});
