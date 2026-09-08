import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarFicha } from './estado.ts';
import { calcular } from './calculadora.ts';
import { FICHA_ACEITE, FICHA_MIX } from './fixtures.ts';
import type { FichaNutricional } from './tipos.ts';

test('sin ficha es "sin datos" y lista los 11 nutrientes como faltantes', () => {
  const d = diagnosticarFicha('kg', null);
  assert.equal(d.estado, 'sin_datos');
  assert.equal(d.nutrientesCargados, 0);
  assert.equal(d.faltantes.length, 11);
});

test('una ficha completa en kg queda en verde', () => {
  const d = diagnosticarFicha('kg', FICHA_MIX);
  assert.equal(d.estado, 'completa');
  assert.equal(d.nutrientesCargados, 11);
  assert.deepEqual(d.pendientes, []);
});

test('el aceite en litros con densidad queda en verde', () => {
  const d = diagnosticarFicha('l', FICHA_ACEITE);
  assert.equal(d.estado, 'completa');
  assert.equal(d.necesitaDensidad, false);
});

test('un nutriente faltante baja a parcial y dice cuántos faltan', () => {
  const ficha: FichaNutricional = {
    ...FICHA_MIX,
    valores: { ...FICHA_MIX.valores, colesterol_mg: null },
  };
  const d = diagnosticarFicha('kg', ficha);
  assert.equal(d.estado, 'parcial');
  assert.equal(d.nutrientesCargados, 10);
  assert.deepEqual(d.faltantes, ['colesterol_mg']);
  assert.match(d.pendientes[0], /Faltan 1 de 11/);
});

test('un cero declarado cuenta como dato cargado', () => {
  const ficha: FichaNutricional = {
    ...FICHA_MIX,
    valores: { ...FICHA_MIX.valores, grasas_trans_g: 0 },
  };
  assert.equal(diagnosticarFicha('kg', ficha).nutrientesCargados, 11);
});

test('materia prima en litros sin densidad queda parcial aunque tenga los 11 nutrientes', () => {
  const sinDensidad: FichaNutricional = { ...FICHA_ACEITE, densidadGMl: null, baseUnidad: 'g' };
  const d = diagnosticarFicha('l', sinDensidad);
  assert.equal(d.estado, 'parcial');
  assert.equal(d.necesitaDensidad, true);
  assert.ok(d.pendientes.some((p) => /densidad/i.test(p)));
});

test('una ficha con base en ml necesita densidad aunque la materia prima se mida en kg', () => {
  // Caso fácil de pasar por alto: la conversión que falta no es la de la receta
  // sino la de la BASE del proveedor.
  const baseEnMl: FichaNutricional = { ...FICHA_MIX, baseUnidad: 'ml', densidadGMl: null };
  const d = diagnosticarFicha('kg', baseEnMl);
  assert.equal(d.estado, 'parcial');
  assert.equal(d.necesitaDensidad, true);
});

test('unidad de conteo sin peso por unidad queda parcial', () => {
  const d = diagnosticarFicha('unidades', FICHA_MIX);
  assert.equal(d.estado, 'parcial');
  assert.equal(d.necesitaPesoPorUnidad, true);
  assert.ok(d.pendientes.some((p) => /peso por unidad/i.test(p)));
});

test('unidad de conteo CON peso por unidad queda completa', () => {
  const d = diagnosticarFicha('unidades', { ...FICHA_MIX, pesoPorUnidadG: 55 });
  assert.equal(d.estado, 'completa');
});

test('una ficha creada pero vacía es "sin datos", no parcial', () => {
  const vacia: FichaNutricional = {
    baseCantidad: 100,
    baseUnidad: 'g',
    valores: {},
    aportaAzucaresAnadidos: false,
    aportaSodioAnadido: false,
    aportaGrasasSaturadasAnadidas: false,
  };
  assert.equal(diagnosticarFicha('kg', vacia).estado, 'sin_datos');
});

// La razón de ser de este módulo: el semáforo tiene que predecir al motor.
test('verde implica que el cálculo no se bloquea por esa materia prima', () => {
  const fichas: Array<[string, FichaNutricional]> = [
    ['kg', FICHA_MIX],
    ['l', FICHA_ACEITE],
    ['unidades', { ...FICHA_MIX, pesoPorUnidadG: 55 }],
  ];

  for (const [unidad, ficha] of fichas) {
    assert.equal(diagnosticarFicha(unidad, ficha).estado, 'completa', `${unidad} debería ser verde`);

    const r = calcular({
      lineas: [{ ingredienteId: 'x', nombre: 'X', cantidad: 1, unidad, ficha }],
      pesoFinalG: 1000,
      pesoPorcionG: 1000,
      porcionesPorEnvase: 1,
    });

    assert.deepEqual(r.nutrientesIncompletos, [], `${unidad} no debería tener nutrientes incompletos`);
    const culpaDeLaFicha = r.bloqueos.filter(
      (b) => b.codigo === 'sin_ficha' || b.codigo === 'sin_densidad' || b.codigo === 'sin_peso_por_unidad',
    );
    assert.deepEqual(culpaDeLaFicha, [], `${unidad} no debería bloquear el cálculo`);
  }
});

test('cualquier cosa que NO sea verde produce un bloqueo en el motor', () => {
  const casos: Array<[string, FichaNutricional | null]> = [
    ['kg', null],
    ['l', { ...FICHA_ACEITE, densidadGMl: null, baseUnidad: 'g' }],
    ['unidades', FICHA_MIX],
  ];

  for (const [unidad, ficha] of casos) {
    assert.notEqual(diagnosticarFicha(unidad, ficha).estado, 'completa');

    const r = calcular({
      lineas: [{ ingredienteId: 'x', nombre: 'X', cantidad: 1, unidad, ficha }],
      pesoFinalG: 1000,
      pesoPorcionG: 1000,
      porcionesPorEnvase: 1,
    });
    assert.ok(r.bloqueos.length > 0, `${unidad} debería bloquear`);
  }
});
