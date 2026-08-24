import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarNombre, distanciaEdicion, distanciaMaximaPara,
  buscarSimilares, LARGO_MINIMO_BUSQUEDA,
} from './productSimilarity.ts';

test('normaliza tildes, mayusculas y puntuacion', () => {
  assert.equal(normalizarNombre('Coca-Cola Lata 350cc'), 'cocacolalata350cc');
  assert.equal(normalizarNombre('  Té  Verde  '), 'teverde');
  assert.equal(normalizarNombre('Jamón Serrano'), 'jamonserrano');
});

test('distanciaEdicion cuenta las ediciones minimas', () => {
  assert.equal(distanciaEdicion('cocacola', 'cocacola'), 0);
  assert.equal(distanciaEdicion('cocakola', 'cocacola'), 1);
  assert.equal(distanciaEdicion('', 'abc'), 3);
  assert.equal(distanciaEdicion('abc', ''), 3);
});

// La tolerancia escala con el largo: con 3 caracteres, permitir 2 ediciones
// haria que "pan" se parezca a casi todo.
test('distanciaMaximaPara escala con el largo', () => {
  assert.equal(distanciaMaximaPara(3), 0);
  assert.equal(distanciaMaximaPara(5), 1);
  assert.equal(distanciaMaximaPara(8), 2);
});

const productos: any[] = [
  { id: '1', name: 'Coca-Cola Lata 350cc' },
  { id: '2', name: 'Coca Cola 1.5L' },
  { id: '3', name: 'Pan hallulla' },
  { id: '4', name: 'Arroz Tucapel 1kg' },
];

// El caso frecuente: misma base, distinto sufijo.
test('encuentra por coincidencia de prefijo', () => {
  assert.deepEqual(buscarSimilares('coca cola', productos).map(p => p.id), ['1', '2']);
});

// El caso de tipeo, que la coincidencia de texto sola no detecta.
test('encuentra pese a un error de tipeo', () => {
  assert.deepEqual(buscarSimilares('Coca Kola', productos).map(p => p.id), ['1', '2']);
});

test('no devuelve nada si no hay parecidos', () => {
  assert.deepEqual(buscarSimilares('Detergente', productos), []);
});

test('no busca con menos del largo minimo', () => {
  assert.equal(LARGO_MINIMO_BUSQUEDA, 3);
  assert.deepEqual(buscarSimilares('co', productos), []);
});

test('respeta el limite de resultados', () => {
  const muchos: any[] = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Coca Cola ${i}` }));
  assert.equal(buscarSimilares('coca cola', muchos).length, 5);
  assert.equal(buscarSimilares('coca cola', muchos, 2).length, 2);
});

test('ignora productos con nombre vacio', () => {
  const conVacio: any[] = [{ id: 'x', name: '' }, { id: 'y', name: '---' }];
  assert.deepEqual(buscarSimilares('coca cola', conVacio), []);
});

// Caso crítico: la búsqueda está en el MEDIO del nombre, no como prefijo.
// Solo la rama de substring (includes) lo detecta; el prefijo tiene distancia
// de edición muy alta. Si se elimina la rama includes, este test falla.
test('encuentra consulta en el medio del nombre (solo substring)', () => {
  assert.deepEqual(buscarSimilares('coca cola', [{ id: 'x', name: 'Bebida Coca Cola Fria' }]).map(p => p.id), ['x']);
});
