import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexarCategorias, SIN_CATEGORIA } from './reporteAnaliticas.ts';
import type { Product, Category } from './api';

const categorias: Category[] = [
  { id: 'distri', name: 'Distribuidora', createdAt: '' },
  { id: 'bebidas', name: 'Bebidas', parentId: 'distri', createdAt: '' },
  { id: 'pan', name: 'Panadería', createdAt: '' },
  { id: 'huerfana', name: 'Huérfana', parentId: 'no-existe', createdAt: '' },
];

function producto(overrides: Partial<Product>): Product {
  return { id: 'p1', name: 'Test', description: '', price: 100, stock: 1, ...overrides } as Product;
}

test('un producto en una categoría raíz queda con esa raíz y sin subcategoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p1', name: 'Fideos', categoryId: 'distri' })], categorias);
  assert.deepEqual(mapa.get('p1'), { raiz: 'Distribuidora', sub: '', nombre: 'Fideos' });
});

test('un producto en una subcategoría queda con la raíz del padre y el nombre de la subcategoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p2', name: 'Coca 500ml', categoryId: 'bebidas' })], categorias);
  assert.deepEqual(mapa.get('p2'), { raiz: 'Distribuidora', sub: 'Bebidas', nombre: 'Coca 500ml' });
});

test('un producto sin categoryId cae en Sin categoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p3', name: 'Suelto' })], categorias);
  assert.deepEqual(mapa.get('p3'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Suelto' });
});

test('un producto con una categoría que ya no existe cae en Sin categoría', () => {
  const mapa = indexarCategorias([producto({ id: 'p4', name: 'Borrada', categoryId: 'se-borro' })], categorias);
  assert.deepEqual(mapa.get('p4'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Borrada' });
});

test('una subcategoría cuyo padre no está en la lista se trata como raíz, sin duplicar el nombre', () => {
  const mapa = indexarCategorias([producto({ id: 'p5', name: 'Rara', categoryId: 'huerfana' })], categorias);
  assert.deepEqual(mapa.get('p5'), { raiz: 'Huérfana', sub: '', nombre: 'Rara' });
});

test('sin categorías cargadas, todo cae en Sin categoría pero el nombre se conserva', () => {
  const mapa = indexarCategorias([producto({ id: 'p6', name: 'Pan', categoryId: 'pan' })], []);
  assert.deepEqual(mapa.get('p6'), { raiz: SIN_CATEGORIA, sub: '', nombre: 'Pan' });
});
