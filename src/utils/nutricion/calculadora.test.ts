import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from './calculadora.ts';
import { FICHA_MIX, PESO_FINAL_G, recetaMarmolado } from './fixtures.ts';
import type { LineaReceta } from './tipos.ts';

function cerca(actual: number, esperado: number, tol = 1e-9) {
  assert.ok(
    Math.abs(actual - esperado) < tol,
    `esperaba ${esperado}, vino ${actual} (dif ${Math.abs(actual - esperado)})`,
  );
}

const entradaCompleta = () => ({
  lineas: recetaMarmolado(),
  pesoFinalG: PESO_FINAL_G,
  pesoPorcionG: 160,
  porcionesPorEnvase: 1,
});

test('suma los aportes de varios ingredientes', () => {
  const r = calcular(entradaCompleta());

  // Energía, verificable a mano:
  //   Mix    104 g   x 400/100 = 416
  //   Cacao   58 g   x 300/100 = 174
  //   Aceite   8.28 g x 900/92 =  81
  //   Huevo   25 g   x 143/100 =  35.75
  //                             --------
  //                              706.75 kcal por unidad
  cerca(r.totales.energia_kcal, 706.75);
  assert.equal(r.bloqueos.length, 0);
  assert.deepEqual(r.nutrientesIncompletos, []);
});

test('la suma de la receta usa gramos reales, no la unidad de cada materia prima', () => {
  const r = calcular(entradaCompleta());
  // 104 + 58 + 8.28 + 25
  cerca(r.gramosReceta, 195.28);
});

test('el cálculo por 100 g usa el peso FINAL, no la suma de la receta', () => {
  const r = calcular(entradaCompleta());
  // 706.75 kcal en 160 g de producto terminado.
  cerca(r.por100g!.energia_kcal, (706.75 / 160) * 100);

  // Si usara los 195.28 g de la mezcla cruda daría ~362 kcal/100 g en vez de
  // ~442: el producto quedaría declarado como bastante menos calórico de lo que
  // es. Este es EL error que el módulo está para evitar.
  const conPesoDeReceta = (706.75 / 195.28) * 100;
  assert.ok(r.por100g!.energia_kcal - conPesoDeReceta > 70);
});

test('pérdida de peso en el horno: el producto terminado concentra los nutrientes', () => {
  const sinPerdida = calcular({ ...entradaCompleta(), pesoFinalG: 195.28 });
  const conPerdida = calcular(entradaCompleta());
  assert.ok(conPerdida.por100g!.energia_kcal > sinPerdida.por100g!.energia_kcal);
});

test('la porción escala desde el peso final', () => {
  const r = calcular(entradaCompleta());
  // Porción de 160 g = el producto entero.
  cerca(r.porPorcion!.energia_kcal, 706.75);

  const media = calcular({ ...entradaCompleta(), pesoPorcionG: 80, porcionesPorEnvase: 2 });
  cerca(media.porPorcion!.energia_kcal, 706.75 / 2);
});

test('por envase = porción x porciones', () => {
  const r = calcular({ ...entradaCompleta(), pesoPorcionG: 80, porcionesPorEnvase: 2 });
  cerca(r.porEnvase!.energia_kcal, 706.75);
});

test('los nutrientes de la etiqueta de referencia salen todos', () => {
  const r = calcular(entradaCompleta()).por100g!;
  cerca(r.azucares_totales_g, (27.16 / 160) * 100);
  cerca(r.grasa_saturada_g, (8.24 / 160) * 100);
  cerca(r.sodio_mg, (567.1 / 160) * 100);
  cerca(r.colesterol_mg, (93 / 160) * 100); // 25 g de huevo x 372/100 = 93 mg
});

test('un ingrediente sin ficha NO se calcula como cero: bloquea', () => {
  const lineas = recetaMarmolado();
  lineas[1] = { ...lineas[1], ficha: null };
  const r = calcular({ ...entradaCompleta(), lineas });

  const bloqueo = r.bloqueos.find((b) => b.codigo === 'sin_ficha');
  assert.ok(bloqueo, 'esperaba un bloqueo sin_ficha');
  assert.equal(bloqueo!.ingredienteNombre, 'Cacao Amargo');
  // Todos los nutrientes quedan marcados: sin la ficha no se sabe nada de él.
  assert.equal(r.nutrientesIncompletos.length, 11);
});

test('los gramos de un ingrediente sin ficha igual cuentan para el orden y el total', () => {
  const lineas = recetaMarmolado();
  lineas[1] = { ...lineas[1], ficha: null };
  const r = calcular({ ...entradaCompleta(), lineas });
  cerca(r.gramosReceta, 195.28);
  assert.equal(r.aportes[1].gramos, 58);
});

test('un nutriente suelto faltante marca solo ese nutriente', () => {
  const lineas = recetaMarmolado();
  lineas[0] = {
    ...lineas[0],
    ficha: { ...FICHA_MIX, valores: { ...FICHA_MIX.valores, colesterol_mg: null } },
  };
  const r = calcular({ ...entradaCompleta(), lineas });

  assert.deepEqual(r.nutrientesIncompletos, ['colesterol_mg']);
  // La energía sigue completa y con el mismo valor de siempre.
  cerca(r.totales.energia_kcal, 706.75);
  assert.equal(r.bloqueos.filter((b) => b.codigo === 'nutriente_faltante').length, 1);
});

test('un cero declarado por el proveedor NO es un dato faltante', () => {
  const r = calcular(entradaCompleta());
  // grasas_trans está en 0 en las cuatro fichas y no aparece como incompleto.
  assert.ok(!r.nutrientesIncompletos.includes('grasas_trans_g'));
  assert.equal(r.totales.grasas_trans_g, 0);
});

test('sin peso final no hay columna de 100 g', () => {
  const r = calcular({ ...entradaCompleta(), pesoFinalG: null });
  assert.equal(r.por100g, null);
  assert.equal(r.porPorcion, null);
  assert.ok(r.bloqueos.some((b) => b.codigo === 'sin_peso_final'));
});

test('sin porción hay 100 g pero no columna de porción', () => {
  const r = calcular({ ...entradaCompleta(), pesoPorcionG: null });
  assert.ok(r.por100g !== null);
  assert.equal(r.porPorcion, null);
  assert.ok(r.bloqueos.some((b) => b.codigo === 'sin_porcion'));
});

test('un peso final mayor que la receta bloquea: falta un ingrediente o está mal medido', () => {
  const r = calcular({ ...entradaCompleta(), pesoFinalG: 300 });
  assert.ok(r.bloqueos.some((b) => b.codigo === 'peso_final_mayor_que_receta'));
});

test('porción por porciones tiene que dar el peso del envase', () => {
  const r = calcular({ ...entradaCompleta(), pesoPorcionG: 100, porcionesPorEnvase: 1 });
  assert.ok(r.bloqueos.some((b) => b.codigo === 'porciones_inconsistentes'));
});

test('receta vacía bloquea y no inventa nutrientes', () => {
  const r = calcular({ lineas: [], pesoFinalG: 160, pesoPorcionG: 160, porcionesPorEnvase: 1 });
  assert.ok(r.bloqueos.some((b) => b.codigo === 'sin_receta'));
  assert.equal(r.nutrientesIncompletos.length, 11);
  assert.equal(r.totales.energia_kcal, 0);
});

test('consolida los flags de nutriente añadido de todas las materias primas', () => {
  const r = calcular(entradaCompleta());
  assert.deepEqual(r.anadidos, { azucares: true, sodio: true, grasasSaturadas: true });
});

test('sin materias primas con flags, el producto queda fuera del régimen de sellos', () => {
  const lineas: LineaReceta[] = recetaMarmolado().map((l) => ({
    ...l,
    ficha: l.ficha
      ? {
          ...l.ficha,
          aportaAzucaresAnadidos: false,
          aportaSodioAnadido: false,
          aportaGrasasSaturadasAnadidas: false,
        }
      : null,
  }));
  const r = calcular({ ...entradaCompleta(), lineas });
  assert.deepEqual(r.anadidos, { azucares: false, sodio: false, grasasSaturadas: false });
});

test('la precisión se mantiene: por 100 g x peso / 100 vuelve al total', () => {
  const r = calcular(entradaCompleta());
  cerca((r.por100g!.energia_kcal * 160) / 100, r.totales.energia_kcal, 1e-9);
});

// Versionado: el motor es una función pura. Recalcular con otra receta no puede
// tocar el resultado anterior — es lo que hace seguro guardar snapshots.
test('recalcular con la receta cambiada no muta el resultado anterior', () => {
  const antes = calcular(entradaCompleta());
  const energiaAntes = antes.totales.energia_kcal;

  const lineasV2 = recetaMarmolado();
  lineasV2[0] = { ...lineasV2[0], cantidad: 0.15 }; // más mix
  const despues = calcular({ ...entradaCompleta(), lineas: lineasV2 });

  assert.equal(antes.totales.energia_kcal, energiaAntes);
  assert.notEqual(despues.totales.energia_kcal, energiaAntes);
  cerca(despues.totales.energia_kcal, energiaAntes + (0.15 - 0.104) * 1000 * 4);
});

test('la entrada no se muta', () => {
  const entrada = entradaCompleta();
  const copia = JSON.parse(JSON.stringify(entrada));
  calcular(entrada);
  assert.deepEqual(JSON.parse(JSON.stringify(entrada)), copia);
});
