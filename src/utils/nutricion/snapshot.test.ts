import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirSnapshot, mismaEtiqueta, restaurarDeSnapshot, FORMATO_SNAPSHOT } from './snapshot.ts';
import type { SnapshotEtiqueta } from './snapshot.ts';
import { armarEtiqueta } from './armado.ts';
import { construirEtiquetaPosterior } from './etiquetas.ts';
import { VERSION_REGLAS } from './reglasChile.ts';
import { PESO_FINAL_G, recetaMarmolado } from './fixtures.ts';

const elaborador = { razonSocial: 'La Oca SpA', rut: '76.123.456-7' };

const armar = (cantidadMix = 0.104) => {
  const lineas = recetaMarmolado();
  lineas[0] = { ...lineas[0], cantidad: cantidadMix };
  return armarEtiqueta({
    productName: 'Bizcocho Marmolado',
    lineas,
    perfil: {
      pesoFinalPromedioG: PESO_FINAL_G, pesoPorcionG: 160,
      porcionesPorEnvase: 1, porcionDescripcion: '1 unidad',
    },
    elaborador: 'La Oca SpA',
  });
};

const snap = (cantidadMix = 0.104, anchoMm = 90, altoMm = 60): SnapshotEtiqueta =>
  construirSnapshot({
    resultado: armar(cantidadMix),
    elaborador,
    lineas: recetaMarmolado().map((l) => ({
      ingredienteId: l.ingredienteId, nombre: l.nombre,
      cantidad: l.cantidad, unidad: l.unidad, ficha: l.ficha ?? null,
    })),
    anchoMm, altoMm,
    regulationVersion: VERSION_REGLAS,
  });

test('el snapshot guarda todo lo necesario para redibujar', () => {
  const s = snap();
  assert.equal(s.formato, FORMATO_SNAPSHOT);
  assert.equal(s.regulationVersion, VERSION_REGLAS);
  assert.equal(s.anchoMm, 90);
  assert.equal(s.fichasUsadas.length, 4);
  assert.ok(s.resultado.calculo.por100g);
});

test('sobrevive al viaje por JSON, que es como se guarda en jsonb', () => {
  const original = snap();
  const ida = JSON.parse(JSON.stringify(original));
  const r = restaurarDeSnapshot(ida);
  assert.ok(r);
  assert.equal(r!.anchoMm, 90);
  assert.ok(Math.abs(r!.resultado.calculo.por100g!.energia_kcal - 441.71875) < 1e-9);
});

test('una etiqueta restaurada se dibuja igual que la original', () => {
  // Es la propiedad que hace utilizable el historial: reimprimir la v1 tiene que
  // dar exactamente el mismo dibujo, sin volver a consultar la receta.
  const original = snap();
  const directa = construirEtiquetaPosterior(original.resultado, original.elaborador, {
    anchoMm: 90, altoMm: 60,
  });

  const r = restaurarDeSnapshot(JSON.parse(JSON.stringify(original)))!;
  const restaurada = construirEtiquetaPosterior(r.resultado, r.elaborador, {
    anchoMm: r.anchoMm, altoMm: r.altoMm,
  });

  assert.deepEqual(restaurada.primitivas, directa.primitivas);
  assert.deepEqual(restaurada.avisosLegibilidad, directa.avisosLegibilidad);
});

test('la etiqueta histórica NO cambia cuando cambia la receta', () => {
  // El punto entero del versionado.
  const v1 = snap(0.104);
  const guardado = JSON.parse(JSON.stringify(v1));

  const v2 = snap(0.2); // se cambió la receta
  assert.notEqual(
    v2.resultado.calculo.por100g!.energia_kcal,
    v1.resultado.calculo.por100g!.energia_kcal,
  );

  // La v1 guardada sigue diciendo lo mismo que decía.
  const r = restaurarDeSnapshot(guardado)!;
  assert.ok(Math.abs(r.resultado.calculo.por100g!.energia_kcal - 441.71875) < 1e-9);
});

test('mismaEtiqueta reconoce dos generaciones idénticas', () => {
  assert.equal(mismaEtiqueta(snap(), snap()), true);
});

test('mismaEtiqueta funciona aunque jsonb haya reordenado las claves', () => {
  // Postgres jsonb NO conserva el orden de inserción de las claves. Comparando
  // con JSON.stringify directo, un snapshot recién armado nunca coincidía con el
  // mismo snapshot leído de la base: la deduplicación no deduplicaba y cada
  // descarga creaba una versión nueva idéntica.
  const original = snap();

  const reordenar = (v: any): any => {
    if (Array.isArray(v)) return v.map(reordenar);
    if (v && typeof v === 'object') {
      const salida: any = {};
      for (const k of Object.keys(v).reverse()) salida[k] = reordenar(v[k]);
      return salida;
    }
    return v;
  };

  const comoVuelveDeLaBase = reordenar(JSON.parse(JSON.stringify(original)));

  // Se comprueba que el escenario del test es real: el orden cambió de verdad.
  assert.notEqual(
    JSON.stringify(comoVuelveDeLaBase.resultado),
    JSON.stringify(original.resultado),
  );
  assert.equal(mismaEtiqueta(original, comoVuelveDeLaBase), true);
});

test('mismaEtiqueta no confunde una clave ausente con un valor distinto', () => {
  const a = { ...snap(), elaborador: { razonSocial: 'La Oca SpA', rut: undefined } };
  const b = { ...snap(), elaborador: { razonSocial: 'La Oca SpA' } };
  assert.equal(mismaEtiqueta(a as never, b as never), true);
});

test('mismaEtiqueta detecta un cambio de receta', () => {
  assert.equal(mismaEtiqueta(snap(0.104), snap(0.2)), false);
});

test('mismaEtiqueta detecta un cambio de elaborador', () => {
  const a = snap();
  const b = { ...snap(), elaborador: { razonSocial: 'Otra SpA' } };
  assert.equal(mismaEtiqueta(a, b), false);
});

test('cambiar solo el tamaño físico NO es una etiqueta nueva', () => {
  // Misma información en otro sticker. Versionar por tamaño llenaría el
  // historial de ruido.
  assert.equal(mismaEtiqueta(snap(0.104, 90, 60), snap(0.104, 100, 75)), true);
});

test('un snapshot de formato futuro se rechaza sin romper', () => {
  const futuro = { ...snap(), formato: FORMATO_SNAPSHOT + 1 };
  assert.equal(restaurarDeSnapshot(futuro), null);
});

test('basura no rompe la restauración', () => {
  assert.equal(restaurarDeSnapshot(null), null);
  assert.equal(restaurarDeSnapshot({}), null);
  assert.equal(restaurarDeSnapshot('hola'), null);
  assert.equal(restaurarDeSnapshot({ formato: 1 }), null);
});
