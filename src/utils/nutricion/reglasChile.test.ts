import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETIQUETA_NUTRIENTE,
  LIMITES,
  NUTRIENTES_OBLIGATORIOS,
  VERSION_REGLAS,
  formatearParaEtiqueta,
  redondearParaEtiqueta,
} from './reglasChile.ts';
import { NUTRIENTES } from './tipos.ts';

test('los umbrales de la Tabla N°1 son los verificados contra el Decreto 13', () => {
  assert.deepEqual(LIMITES.solido, {
    energia_kcal: 275,
    sodio_mg: 400,
    azucares_totales_g: 10,
    grasa_saturada_g: 4,
  });
  assert.deepEqual(LIMITES.liquido, {
    energia_kcal: 70,
    sodio_mg: 100,
    azucares_totales_g: 5,
    grasa_saturada_g: 3,
  });
});

test('hay una versión de reglas para estampar en cada etiqueta', () => {
  assert.ok(VERSION_REGLAS.length > 0);
});

test('los 11 nutrientes obligatorios tienen rótulo', () => {
  assert.equal(NUTRIENTES_OBLIGATORIOS.length, 11);
  for (const clave of NUTRIENTES) {
    assert.ok(ETIQUETA_NUTRIENTE[clave], `falta el rótulo de ${clave}`);
  }
});

test('energía, colesterol y sodio se redondean a entero', () => {
  assert.equal(redondearParaEtiqueta('energia_kcal', 441.71875), 442);
  assert.equal(redondearParaEtiqueta('colesterol_mg', 58.125), 58);
  assert.equal(redondearParaEtiqueta('sodio_mg', 354.4375), 354);
});

test('los gramos van con un decimal', () => {
  assert.equal(redondearParaEtiqueta('proteinas_g', 6.04), 6);
  assert.equal(redondearParaEtiqueta('grasa_total_g', 16.78), 16.8);
  assert.equal(redondearParaEtiqueta('azucares_totales_g', 16.975), 17);
});

test('los medios redondean hacia arriba', () => {
  assert.equal(redondearParaEtiqueta('grasa_saturada_g', 0.15), 0.2);
  assert.equal(redondearParaEtiqueta('grasa_saturada_g', 2.25), 2.3);
  assert.equal(redondearParaEtiqueta('energia_kcal', 441.5), 442);
});

test('la guarda de coma flotante está puesta por si DECIMALES sube a 2', () => {
  // A 0 y 1 decimales el + Number.EPSILON no cambia ningún resultado. A 2 sí:
  // este es el caso que documenta por qué la guarda sigue en el código.
  assert.equal(Math.round(1.005 * 100) / 100, 1);
  assert.equal(Math.round((1.005 + Number.EPSILON) * 100) / 100, 1.01);
});

test('el formato usa coma decimal y mantiene los decimales fijos', () => {
  assert.equal(formatearParaEtiqueta('proteinas_g', 6), '6,0');
  assert.equal(formatearParaEtiqueta('grasa_total_g', 16.78), '16,8');
  assert.equal(formatearParaEtiqueta('energia_kcal', 441.7), '442');
  assert.equal(formatearParaEtiqueta('grasas_trans_g', 0), '0,0');
});

test('redondear antes de dividir arrastra error: por eso se redondea al final', () => {
  // Caso donde redondear el total primero cambia el valor declarado por 100 g.
  //   exacto:            2.44 g en 100 g de producto -> 2,4
  //   redondeando antes: round(2.44) = 2 -> 2,0
  const totalCrudo = 2.44;
  const exacto = redondearParaEtiqueta('grasa_saturada_g', totalCrudo);
  const desdeRedondeado = redondearParaEtiqueta(
    'grasa_saturada_g',
    redondearParaEtiqueta('energia_kcal', totalCrudo), // redondeo a entero, como si fuera un paso intermedio
  );
  assert.equal(exacto, 2.4);
  assert.equal(desdeRedondeado, 2);
  assert.notEqual(exacto, desdeRedondeado);
});
