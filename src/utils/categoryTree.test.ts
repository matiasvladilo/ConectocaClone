import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esRaiz, raicesDe, hijasDe, tieneHijas,
  idsDeCategoriaConHijas, posiblesPadres, puedeTenerPadre, agruparPorPadre,
  nombreCategoriaRaiz,
} from './categoryTree.ts';

// Categorías de prueba: "distri" es raíz con dos hijas; "postres" es raíz sola.
const cats: any[] = [
  { id: 'distri', name: 'Distribuidora', parentId: null },
  { id: 'bebidas', name: 'Bebidas', parentId: 'distri' },
  { id: 'abarrotes', name: 'Abarrotes', parentId: 'distri' },
  { id: 'postres', name: 'Postres', parentId: null },
];

test('esRaiz distingue raices de subcategorias', () => {
  assert.equal(esRaiz(cats[0]), true);
  assert.equal(esRaiz(cats[1]), false);
});

test('raicesDe devuelve solo las de primer nivel', () => {
  assert.deepEqual(raicesDe(cats).map(c => c.id), ['distri', 'postres']);
});

test('hijasDe devuelve las subcategorias de un padre', () => {
  assert.deepEqual(hijasDe(cats, 'distri').map(c => c.id), ['bebidas', 'abarrotes']);
  assert.deepEqual(hijasDe(cats, 'postres'), []);
});

test('tieneHijas detecta si se puede borrar', () => {
  assert.equal(tieneHijas(cats, 'distri'), true);
  assert.equal(tieneHijas(cats, 'postres'), false);
});

// Este es el que evita que un producto etiquetado "Bebidas" desaparezca del
// Panel de Distribuidora cuando el filtro esta en "Distribuidora".
test('idsDeCategoriaConHijas incluye la categoria y sus hijas', () => {
  assert.deepEqual([...idsDeCategoriaConHijas(cats, 'distri')].sort(),
    ['abarrotes', 'bebidas', 'distri']);
});

test('idsDeCategoriaConHijas de una hoja es solo ella', () => {
  assert.deepEqual([...idsDeCategoriaConHijas(cats, 'postres')], ['postres']);
});

test('posiblesPadres solo ofrece raices', () => {
  assert.deepEqual(posiblesPadres(cats).map(c => c.id), ['distri', 'postres']);
});

test('posiblesPadres excluye la categoria que se esta editando', () => {
  assert.deepEqual(posiblesPadres(cats, 'distri').map(c => c.id), ['postres']);
});

// Convertir en subcategoria algo que ya tiene hijas crearia un segundo nivel.
test('puedeTenerPadre es falso si la categoria tiene hijas', () => {
  assert.equal(puedeTenerPadre(cats, 'distri'), false);
  assert.equal(puedeTenerPadre(cats, 'postres'), true);
  assert.equal(puedeTenerPadre(cats, undefined), true);
});

test('agruparPorPadre arma el arbol de dos niveles', () => {
  const grupos = agruparPorPadre(cats);
  assert.deepEqual(grupos.map(g => g.categoria.id), ['distri', 'postres']);
  assert.deepEqual(grupos[0].hijas.map(c => c.id), ['bebidas', 'abarrotes']);
  assert.deepEqual(grupos[1].hijas, []);
});

// Si el padre no esta en la lista, la hija tiene que seguir siendo visible.
// Ocultarla en silencio es la clase de bug que hace pensar que se borro sola.
test('agruparPorPadre trata como raiz a una hija huerfana', () => {
  const huerfana: any[] = [{ id: 'x', name: 'X', parentId: 'no-existe' }];
  const grupos = agruparPorPadre(huerfana);
  assert.deepEqual(grupos.map(g => g.categoria.id), ['x']);
});

// Usado para agregaciones (desglose de totales, etiqueta de categoria en la
// tarjeta de pedido): una subcategoria siempre resuelve al nombre de su padre.
test('nombreCategoriaRaiz de una subcategoria devuelve el nombre del padre', () => {
  assert.equal(nombreCategoriaRaiz(cats, 'bebidas'), 'Distribuidora');
});

test('nombreCategoriaRaiz de una categoria raiz devuelve su propio nombre', () => {
  assert.equal(nombreCategoriaRaiz(cats, 'postres'), 'Postres');
});

test('nombreCategoriaRaiz sin categoryId devuelve "Sin categoria"', () => {
  assert.equal(nombreCategoriaRaiz(cats, undefined), 'Sin categoría');
});

test('nombreCategoriaRaiz de un id que no existe (producto/categoria borrada) devuelve "Sin categoria"', () => {
  assert.equal(nombreCategoriaRaiz(cats, 'no-existe'), 'Sin categoría');
});

// Si el padre referenciado ya no esta en la lista (borrado), no debe explotar:
// cae al nombre de la propia subcategoria en vez de "Sin categoria", porque
// sigue siendo mas informativo que perder el dato por completo.
test('nombreCategoriaRaiz con padre huerfano usa el nombre de la propia categoria', () => {
  const huerfana: any[] = [{ id: 'x', name: 'X', parentId: 'no-existe' }];
  assert.equal(nombreCategoriaRaiz(huerfana, 'x'), 'X');
});
