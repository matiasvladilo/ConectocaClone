import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productoUsaLotes } from './productLots.ts';
import type { Product, Category } from './api';

const categorias: Category[] = [
  { id: 'cat-distri', name: 'Distribuidora', createdAt: '' },
  { id: 'cat-lacteos', name: 'Lácteos', parentId: 'cat-distri', createdAt: '' },
  { id: 'cat-nietos', name: 'Sub de lácteos', parentId: 'cat-lacteos', createdAt: '' },
  { id: 'cat-otra', name: 'Panadería', createdAt: '' },
];

function producto(overrides: Partial<Product>): Product {
  return {
    id: 'p1', name: 'Test', description: '', price: 100, stock: 1,
    ...overrides,
  } as Product;
}

test('producto sin receta en la categoría Distribuidora directa usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-distri' }), categorias), true);
});

test('producto sin receta en una subcategoría directa de Distribuidora usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-lacteos' }), categorias), true);
});

test('una subcategoría de segundo nivel NO entra (el criterio es un solo nivel)', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-nietos' }), categorias), false);
});

test('producto con receta no usa lotes aunque esté en Distribuidora', () => {
  assert.equal(
    productoUsaLotes(producto({ categoryId: 'cat-distri', ingredients: [{ ingredientId: 'i1', quantity: 1 }] }), categorias),
    false
  );
});

test('producto fuera de Distribuidora no usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-otra' }), categorias), false);
});

test('producto sin categoría no usa lotes', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: undefined }), categorias), false);
});

test('si no existe ninguna categoría Distribuidora, nada usa lotes', () => {
  const sinDistribuidora = categorias.filter(c => c.id !== 'cat-distri' && c.id !== 'cat-lacteos' && c.id !== 'cat-nietos');
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-otra' }), sinDistribuidora), false);
});

test('producto con allowDecimal no usa lotes aunque esté en Distribuidora sin receta', () => {
  assert.equal(productoUsaLotes(producto({ categoryId: 'cat-distri', allowDecimal: true }), categorias), false);
});
