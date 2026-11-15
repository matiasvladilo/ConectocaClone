import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaMotivo, filtrarReposicion, textoListaCompra } from './listaCompra.ts';
import type { FilaReposicion } from './api.tsx';

const fila = (productId: string, extra: Partial<FilaReposicion> = {}): FilaReposicion => ({
  productId, name: `Producto ${productId}`, categoryId: 'bebidas', stock: 4, minStock: null,
  rotacionDiaria: 2, diasQueAlcanza: 2, comprar: 10, motivo: 'pocos_dias', ...extra,
});

test('filtra por categoría (con subcategorías ya resueltas) y por búsqueda', () => {
  const filas = [fila('a', { name: 'Coca-Cola 591' }), fila('b', { name: 'Fanta 591', categoryId: 'otra' }), fila('c', { name: 'Agua', categoryId: null })];
  assert.deepEqual(filtrarReposicion(filas, new Set(['bebidas']), '').map(f => f.productId), ['a']);
  assert.deepEqual(filtrarReposicion(filas, null, 'fanta').map(f => f.productId), ['b']);
  assert.deepEqual(filtrarReposicion(filas, null, '').length, 3);
});

test('texto para WhatsApp: título con fecha y una línea por producto', () => {
  const texto = textoListaCompra([fila('a', { name: 'Coca-Cola 591', comprar: 48 }), fila('b', { name: 'Fanta 591', comprar: 1.5 })], new Date('2026-11-15T12:00:00'));
  assert.equal(texto, 'Para comprar — 15-11-2026\n• Coca-Cola 591: 48\n• Fanta 591: 1,5');
});

test('etiqueta del motivo', () => {
  assert.equal(etiquetaMotivo(fila('a', { motivo: 'agotado' })), 'Agotado');
  assert.equal(etiquetaMotivo(fila('a', { diasQueAlcanza: 1.5 })), 'Alcanza 1,5 días');
  assert.equal(etiquetaMotivo(fila('a', { diasQueAlcanza: 1 })), 'Alcanza 1 día');
  assert.equal(etiquetaMotivo(fila('a', { motivo: 'bajo_minimo', minStock: 24 })), 'Bajo el mínimo (24)');
  assert.equal(etiquetaMotivo(fila('a', { motivo: 'sin_ventas_recientes', minStock: 5 })), 'Sin ventas recientes · mín. 5');
});
