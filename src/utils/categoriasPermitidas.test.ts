import test from 'node:test';
import assert from 'node:assert/strict';
import { idsPermitidos, recortarCatalogo } from './categoryTree.ts';

const cats: any[] = [
  { id: 'pan', name: 'Panadería' },
  { id: 'pas', name: 'Pastelería' },
  { id: 'dis', name: 'Distribuidora' },
  { id: 'beb', name: 'Bebidas', parentId: 'dis' },
  { id: 'sna', name: 'Snacks', parentId: 'dis' },
];
const prods = [
  { id: 1, categoryId: 'pan' }, { id: 2, categoryId: 'pas' },
  { id: 3, categoryId: 'beb' }, { id: 4, categoryId: 'sna' }, { id: 5, categoryId: null },
];

test('sin restricción se ve todo', () => {
  assert.equal(idsPermitidos(cats, null), null);
  assert.equal(idsPermitidos(cats, []), null);
  const r = recortarCatalogo(prods, cats, []);
  assert.equal(r.products.length, 5);
});

test('solo Panadería: solo sus productos y su categoría', () => {
  const r = recortarCatalogo(prods, cats, ['pan']);
  assert.deepEqual(r.products.map(p => p.id), [1]);
  assert.deepEqual(r.categories.map(c => c.id), ['pan']);
});

test('una categoría padre trae sus subcategorías', () => {
  const r = recortarCatalogo(prods, cats, ['dis']);
  assert.deepEqual(r.products.map(p => p.id), [3, 4]);
});

test('una subcategoría suelta deja visible al padre, pero solo con ella', () => {
  const r = recortarCatalogo(prods, cats, ['beb']);
  assert.deepEqual(r.products.map(p => p.id), [3]);
  assert.deepEqual(r.categories.map(c => c.id).sort(), ['beb', 'dis']);
});

test('los productos sin categoría no se ven si hay restricción', () => {
  const r = recortarCatalogo(prods, cats, ['pan', 'pas']);
  assert.ok(!r.products.some(p => p.categoryId === null));
});
