import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from './calculadora.ts';
import { validarEtiqueta } from './validacion.ts';
import { REDONDEO_CONFIRMADO } from './reglasChile.ts';
import { PESO_FINAL_G, recetaMarmolado } from './fixtures.ts';

const datosOk = {
  denominacion: 'Bizcocho Marmolado',
  textoIngredientes: 'Mix queque neutro, cacao amargo, huevos, aceite vegetal.',
  elaborador: 'La Oca SpA',
};

const calculoCompleto = () =>
  calcular({
    lineas: recetaMarmolado(),
    pesoFinalG: PESO_FINAL_G,
    pesoPorcionG: 160,
    porcionesPorEnvase: 1,
  });

test('sin peso final la etiqueta queda en borrador', () => {
  const r = calcular({ lineas: recetaMarmolado(), pesoFinalG: null });
  const v = validarEtiqueta(r, datosOk);
  assert.equal(v.estado, 'borrador');
  assert.ok(v.bloqueos.some((b) => b.codigo === 'sin_peso_final'));
});

test('sin porción queda en borrador', () => {
  const r = calcular({ lineas: recetaMarmolado(), pesoFinalG: PESO_FINAL_G, pesoPorcionG: null });
  const v = validarEtiqueta(r, datosOk);
  assert.equal(v.estado, 'borrador');
  assert.ok(v.bloqueos.some((b) => b.codigo === 'sin_porcion'));
});

test('un ingrediente sin ficha deja la etiqueta en borrador', () => {
  const lineas = recetaMarmolado();
  lineas[0] = { ...lineas[0], ficha: null };
  const r = calcular({ lineas, pesoFinalG: PESO_FINAL_G, pesoPorcionG: 160, porcionesPorEnvase: 1 });
  const v = validarEtiqueta(r, datosOk);
  assert.equal(v.estado, 'borrador');
  assert.ok(v.bloqueos.some((b) => b.codigo === 'sin_ficha'));
});

test('una conversión imposible deja la etiqueta en borrador', () => {
  const lineas = recetaMarmolado();
  lineas[2] = { ...lineas[2], ficha: { ...lineas[2].ficha!, densidadGMl: null } };
  const r = calcular({ lineas, pesoFinalG: PESO_FINAL_G, pesoPorcionG: 160, porcionesPorEnvase: 1 });
  const v = validarEtiqueta(r, datosOk);
  assert.equal(v.estado, 'borrador');
  assert.ok(v.bloqueos.some((b) => b.codigo === 'sin_densidad'));
});

test('faltando la denominación no se puede declarar lista', () => {
  const v = validarEtiqueta(calculoCompleto(), { ...datosOk, denominacion: '  ' });
  assert.equal(v.estado, 'borrador');
  assert.ok(v.bloqueos.some((b) => /denominación/i.test(b.detalle)));
});

test('faltando el elaborador no se puede declarar lista', () => {
  const v = validarEtiqueta(calculoCompleto(), { ...datosOk, elaborador: '' });
  assert.equal(v.estado, 'borrador');
  assert.ok(v.bloqueos.some((b) => /elaborador/i.test(b.detalle)));
});

test('faltando la lista de ingredientes no se puede declarar lista', () => {
  const v = validarEtiqueta(calculoCompleto(), { ...datosOk, textoIngredientes: '' });
  assert.equal(v.estado, 'borrador');
  assert.ok(v.bloqueos.some((b) => /ingredientes/i.test(b.detalle)));
});

test('los bloqueos se explican en castellano, no con códigos sueltos', () => {
  const r = calcular({ lineas: recetaMarmolado(), pesoFinalG: null });
  for (const b of validarEtiqueta(r, datosOk).bloqueos) {
    assert.ok(b.detalle.length > 15, `bloqueo poco explicativo: ${b.detalle}`);
  }
});

test('mientras el redondeo no esté confirmado, NADA sale como lista', () => {
  const v = validarEtiqueta(calculoCompleto(), datosOk);

  if (!REDONDEO_CONFIRMADO) {
    assert.equal(v.estado, 'borrador');
    assert.ok(v.bloqueos.some((b) => b.codigo === 'redondeo_no_confirmado'));
    // Y ese tiene que ser el ÚNICO motivo pendiente: si aparecen otros, el
    // cálculo tiene un problema real además del punto regulatorio abierto.
    assert.deepEqual(v.bloqueos.map((b) => b.codigo), ['redondeo_no_confirmado']);
  } else {
    // Cuando se confirmen las reglas de redondeo, este caso pasa a "lista" solo.
    assert.equal(v.estado, 'lista');
    assert.deepEqual(v.bloqueos, []);
  }
});
