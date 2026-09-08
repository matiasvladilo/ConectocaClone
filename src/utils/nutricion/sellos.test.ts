import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from './calculadora.ts';
import { evaluarSellos, resumenSellos } from './sellos.ts';
import { LIMITES, VERSION_REGLAS } from './reglasChile.ts';
import { PESO_FINAL_G, recetaMarmolado } from './fixtures.ts';
import { nutrientesEnCero } from './tipos.ts';
import type { Anadidos } from './calculadora.ts';

const TODOS_ANADIDOS: Anadidos = { azucares: true, sodio: true, grasasSaturadas: true };
const NINGUNO: Anadidos = { azucares: false, sodio: false, grasasSaturadas: false };

const marmolado = () =>
  calcular({
    lineas: recetaMarmolado(),
    pesoFinalG: PESO_FINAL_G,
    pesoPorcionG: 160,
    porcionesPorEnvase: 1,
  });

test('el marmolado saca azúcares, grasas saturadas y calorías, pero no sodio', () => {
  const r = marmolado();
  const { sellos } = evaluarSellos(r.por100g!, r.anadidos);
  const codigos = sellos.map((s) => s.codigo).sort();

  assert.deepEqual(codigos, ['alto_azucares', 'alto_calorias', 'alto_grasas_saturadas']);

  // El sodio está añadido (el mix lo declara) pero 354 mg/100 g no llega a 400.
  assert.ok(r.por100g!.sodio_mg < LIMITES.solido.sodio_mg);
});

test('sin nutriente añadido no hay sello aunque se pase de los límites', () => {
  const por100 = nutrientesEnCero();
  por100.energia_kcal = 900;
  por100.azucares_totales_g = 50;
  por100.grasa_saturada_g = 30;
  por100.sodio_mg = 2000;

  const ev = evaluarSellos(por100, NINGUNO);
  assert.deepEqual(ev.sellos, []);
  assert.equal(ev.fueraDeRegimen, true);
});

test('el límite es estricto: igualarlo no lleva sello, pasarlo sí', () => {
  const justo = nutrientesEnCero();
  justo.azucares_totales_g = LIMITES.solido.azucares_totales_g; // 10 exactos
  assert.deepEqual(evaluarSellos(justo, TODOS_ANADIDOS).sellos.map((s) => s.codigo), []);

  const pasado = nutrientesEnCero();
  pasado.azucares_totales_g = LIMITES.solido.azucares_totales_g + 0.1;
  assert.deepEqual(evaluarSellos(pasado, TODOS_ANADIDOS).sellos.map((s) => s.codigo), ['alto_azucares']);
});

test('cada sello mira solo su propio flag de añadido', () => {
  const por100 = nutrientesEnCero();
  por100.azucares_totales_g = 50;
  por100.grasa_saturada_g = 30;
  por100.sodio_mg = 2000;

  const soloAzucar = evaluarSellos(por100, { azucares: true, sodio: false, grasasSaturadas: false });
  assert.deepEqual(soloAzucar.sellos.map((s) => s.codigo), ['alto_azucares']);
});

test('el sello de calorías necesita que el alimento esté dentro del régimen', () => {
  const por100 = nutrientesEnCero();
  por100.energia_kcal = 500;

  assert.deepEqual(evaluarSellos(por100, NINGUNO).sellos, []);
  assert.deepEqual(
    evaluarSellos(por100, { azucares: false, sodio: true, grasasSaturadas: false }).sellos.map((s) => s.codigo),
    ['alto_calorias'],
  );
});

test('los límites de líquidos son distintos a los de sólidos', () => {
  const por100 = nutrientesEnCero();
  por100.energia_kcal = 100; // pasa el límite líquido (70), no el sólido (275)

  assert.deepEqual(evaluarSellos(por100, TODOS_ANADIDOS, 'solido').sellos, []);
  assert.deepEqual(
    evaluarSellos(por100, TODOS_ANADIDOS, 'liquido').sellos.map((s) => s.codigo),
    ['alto_calorias'],
  );
});

test('cada sello informa contra qué límite se comparó', () => {
  const r = marmolado();
  const { sellos } = evaluarSellos(r.por100g!, r.anadidos);
  const azucar = sellos.find((s) => s.codigo === 'alto_azucares')!;

  assert.equal(azucar.limite, 10);
  assert.equal(azucar.nutriente, 'azucares_totales_g');
  assert.ok(azucar.valorPor100 > azucar.limite);
});

test('la evaluación registra con qué versión de reglas se hizo', () => {
  const r = marmolado();
  assert.equal(evaluarSellos(r.por100g!, r.anadidos).versionReglas, VERSION_REGLAS);
});

test('el resumen para el pegado manual dice cuántos y cuáles', () => {
  const r = marmolado();
  const { sellos } = evaluarSellos(r.por100g!, r.anadidos);
  const texto = resumenSellos(sellos);

  assert.match(texto, /3 sellos/);
  assert.match(texto, /ALTO EN AZÚCARES/);
  assert.match(texto, /ALTO EN GRASAS SATURADAS/);
  assert.match(texto, /ALTO EN CALORÍAS/);
});

test('sin sellos el resumen lo dice explícitamente', () => {
  assert.equal(resumenSellos([]), 'Este producto no lleva sellos.');
});

test('un solo sello va en singular', () => {
  const por100 = nutrientesEnCero();
  por100.azucares_totales_g = 50;
  const { sellos } = evaluarSellos(por100, { azucares: true, sodio: false, grasasSaturadas: false });
  assert.match(resumenSellos(sellos), /1 sello:/);
});
