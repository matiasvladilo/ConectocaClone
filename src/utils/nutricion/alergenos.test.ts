import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consolidarAlergenos, unirEnFrase } from './alergenos.ts';
import type { AlergenoCatalogo, AlergenosDeIngrediente } from './alergenos.ts';

const CAT: Record<string, AlergenoCatalogo> = {
  gluten: { id: '1', codigo: 'gluten_trigo', nombre: 'Trigo (gluten)', nombreEtiqueta: 'trigo (gluten)', orden: 10 },
  huevo: { id: '2', codigo: 'huevo', nombre: 'Huevo', nombreEtiqueta: 'huevos', orden: 20 },
  leche: { id: '3', codigo: 'leche', nombre: 'Leche', nombreEtiqueta: 'leche', orden: 30 },
  soya: { id: '4', codigo: 'soya', nombre: 'Soya', nombreEtiqueta: 'soya', orden: 40 },
  mani: { id: '5', codigo: 'mani', nombre: 'Maní', nombreEtiqueta: 'maní', orden: 50 },
  frutosSecos: { id: '6', codigo: 'frutos_secos', nombre: 'Frutos secos', nombreEtiqueta: 'frutos secos', orden: 60 },
};

// El mix aporta gluten y leche; los huevos aportan huevo. La planta declara
// trazas de soya, frutos secos y maní.
const marmolado: AlergenosDeIngrediente[] = [
  {
    ingredienteId: 'mix',
    contiene: [CAT.gluten, CAT.leche],
    trazas: [CAT.soya, CAT.frutosSecos, CAT.mani],
  },
  { ingredienteId: 'cacao', contiene: [], trazas: [CAT.frutosSecos] },
  { ingredienteId: 'huevo', contiene: [CAT.huevo], trazas: [] },
  { ingredienteId: 'aceite', contiene: [], trazas: [] },
];

test('une en frase con coma y "y" antes del último', () => {
  assert.equal(unirEnFrase([]), '');
  assert.equal(unirEnFrase(['a']), 'a');
  assert.equal(unirEnFrase(['a', 'b']), 'a y b');
  assert.equal(unirEnFrase(['a', 'b', 'c']), 'a, b y c');
});

test('consolida los alérgenos de toda la receta', () => {
  const r = consolidarAlergenos(marmolado);
  assert.deepEqual(r.contiene.map((a) => a.codigo), ['gluten_trigo', 'huevo', 'leche']);
  assert.equal(r.textoContiene, 'Contiene trigo (gluten), huevos y leche.');
});

test('las trazas van en frase aparte de los presentes', () => {
  const r = consolidarAlergenos(marmolado);
  assert.equal(r.textoTrazas, 'Puede contener trazas de soya, maní y frutos secos.');
});

test('deduplica cuando dos materias primas declaran lo mismo', () => {
  const r = consolidarAlergenos([
    { ingredienteId: 'a', contiene: [CAT.leche], trazas: [] },
    { ingredienteId: 'b', contiene: [CAT.leche], trazas: [] },
  ]);
  assert.equal(r.contiene.length, 1);
  assert.equal(r.textoContiene, 'Contiene leche.');
});

test('respeta el orden del catálogo, no el de la receta ni el alfabético', () => {
  const r = consolidarAlergenos([
    { ingredienteId: 'a', contiene: [CAT.leche, CAT.gluten], trazas: [] },
    { ingredienteId: 'b', contiene: [CAT.huevo], trazas: [] },
  ]);
  assert.deepEqual(r.contiene.map((a) => a.codigo), ['gluten_trigo', 'huevo', 'leche']);
});

test('un alérgeno presente no se repite como traza', () => {
  const r = consolidarAlergenos([
    { ingredienteId: 'a', contiene: [CAT.leche], trazas: [] },
    { ingredienteId: 'b', contiene: [], trazas: [CAT.leche, CAT.soya] },
  ]);
  assert.deepEqual(r.contiene.map((a) => a.codigo), ['leche']);
  assert.deepEqual(r.trazas.map((a) => a.codigo), ['soya']);
  assert.equal(r.textoTrazas, 'Puede contener trazas de soya.');
});

test('sin alérgenos declarados no se inventa ninguna frase', () => {
  const r = consolidarAlergenos([{ ingredienteId: 'a', contiene: [], trazas: [] }]);
  assert.equal(r.textoContiene, '');
  assert.equal(r.textoTrazas, '');
  assert.deepEqual(r.contiene, []);
  assert.deepEqual(r.trazas, []);
});

test('una receta vacía no produce alérgenos', () => {
  const r = consolidarAlergenos([]);
  assert.equal(r.textoContiene, '');
  assert.equal(r.textoTrazas, '');
});
