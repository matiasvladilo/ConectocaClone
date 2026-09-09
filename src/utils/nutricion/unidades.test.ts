import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aGramos, baseEnGramos, normalizarUnidad } from './unidades.ts';
import { FICHA_ACEITE, FICHA_MIX } from './fixtures.ts';
import type { FichaNutricional } from './tipos.ts';

function valor(r: ReturnType<typeof aGramos>): number {
  assert.ok(r.ok, `esperaba éxito, vino bloqueo: ${r.ok ? '' : r.bloqueo.detalle}`);
  return r.ok ? r.valor : 0;
}

test('normaliza las unidades que existen en la base y las legacy del formulario', () => {
  assert.equal(normalizarUnidad('kg'), 'kg');
  assert.equal(normalizarUnidad('KG'), 'kg');
  assert.equal(normalizarUnidad('kilos'), 'kg');
  assert.equal(normalizarUnidad('g'), 'g');
  assert.equal(normalizarUnidad('gramos'), 'g');
  assert.equal(normalizarUnidad('l'), 'l');
  assert.equal(normalizarUnidad('litros'), 'l');
  assert.equal(normalizarUnidad('ml'), 'ml');
  assert.equal(normalizarUnidad('cc'), 'ml');
  assert.equal(normalizarUnidad('unidades'), 'conteo');
  assert.equal(normalizarUnidad('bolsas'), 'conteo');
  assert.equal(normalizarUnidad('cajas'), 'conteo');
});

test('una unidad que no se reconoce no se adivina', () => {
  assert.equal(normalizarUnidad('puñado'), null);
  assert.equal(normalizarUnidad(''), null);
});

test('kg -> g multiplica por mil', () => {
  assert.equal(valor(aGramos(0.104, 'kg', null, 'Mix')), 104);
  assert.equal(valor(aGramos(2, 'kg', null, 'Mix')), 2000);
});

test('g -> g no toca el número', () => {
  assert.equal(valor(aGramos(104, 'g', null, 'Mix')), 104);
});

test('kg y g no necesitan ficha: la conversión es puramente aritmética', () => {
  assert.ok(aGramos(1, 'kg', null, 'Sin ficha').ok);
  assert.ok(aGramos(1, 'g', undefined, 'Sin ficha').ok);
});

test('ml -> g usa la densidad configurada, no asume 1:1', () => {
  // 9 ml de aceite a 0.92 g/ml = 8.28 g. Con la suposición 1 ml = 1 g daría 9 g:
  // un 8.7% de error metido en una etiqueta legal.
  const g = valor(aGramos(0.009, 'l', FICHA_ACEITE, 'Aceite Vegetal'));
  assert.ok(Math.abs(g - 8.28) < 1e-9, `esperaba 8.28 g, vino ${g}`);
  assert.notEqual(g, 9);
});

test('l -> g pasa por mil y por densidad', () => {
  const g = valor(aGramos(1, 'l', FICHA_ACEITE, 'Aceite Vegetal'));
  assert.ok(Math.abs(g - 920) < 1e-9);
});

test('volumen sin densidad BLOQUEA en vez de estimar', () => {
  const sinDensidad: FichaNutricional = { ...FICHA_ACEITE, densidadGMl: null };
  const r = aGramos(0.009, 'l', sinDensidad, 'Aceite Vegetal');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.bloqueo.codigo, 'sin_densidad');
    assert.match(r.bloqueo.detalle, /Aceite Vegetal/);
  }
});

test('volumen sin ficha también bloquea', () => {
  const r = aGramos(1, 'ml', null, 'Agua');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.bloqueo.codigo, 'sin_densidad');
});

test('unidad de conteo necesita peso por unidad', () => {
  const sinPeso = aGramos(3, 'unidades', FICHA_MIX, 'Huevo entero');
  assert.equal(sinPeso.ok, false);
  if (!sinPeso.ok) assert.equal(sinPeso.bloqueo.codigo, 'sin_peso_por_unidad');

  const conPeso: FichaNutricional = { ...FICHA_MIX, pesoPorUnidadG: 55 };
  assert.equal(valor(aGramos(3, 'unidades', conPeso, 'Huevo entero')), 165);
});

test('unidad desconocida bloquea con el nombre del ingrediente', () => {
  const r = aGramos(1, 'puñado', FICHA_MIX, 'Sal gruesa');
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.bloqueo.codigo, 'unidad_desconocida');
    assert.match(r.bloqueo.detalle, /Sal gruesa/);
  }
});

test('cantidad no numérica o negativa bloquea', () => {
  assert.equal(aGramos(NaN, 'kg', null, 'X').ok, false);
  assert.equal(aGramos(-1, 'kg', null, 'X').ok, false);
});

test('cantidad cero es válida: cero gramos, no un error', () => {
  assert.equal(valor(aGramos(0, 'kg', null, 'X')), 0);
});

test('la base de la ficha en ml también se convierte con densidad', () => {
  const r = baseEnGramos(FICHA_ACEITE, 'Aceite Vegetal');
  assert.ok(r.ok);
  // 100 ml de base a 0.92 = 92 g. Olvidar este lado de la división es el error
  // silencioso más fácil de cometer en todo el módulo.
  if (r.ok) assert.ok(Math.abs(r.valor - 92) < 1e-9);
});

test('la base en g se usa tal cual', () => {
  const r = baseEnGramos(FICHA_MIX, 'Mix');
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.valor, 100);
});

test('base en ml sin densidad bloquea', () => {
  const r = baseEnGramos({ ...FICHA_ACEITE, densidadGMl: null }, 'Aceite');
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.bloqueo.codigo, 'sin_densidad');
});
