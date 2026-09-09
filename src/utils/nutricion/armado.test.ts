import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarEtiqueta } from './armado.ts';
import type { LineaConAlergenos } from './armado.ts';
import { PESO_FINAL_G, recetaMarmolado } from './fixtures.ts';
import type { AlergenoCatalogo } from './alergenos.ts';

const A = {
  gluten: { id: '1', codigo: 'gluten_trigo', nombre: 'Trigo (gluten)', nombreEtiqueta: 'trigo (gluten)', orden: 10 },
  huevo: { id: '2', codigo: 'huevo', nombre: 'Huevo', nombreEtiqueta: 'huevos', orden: 20 },
  leche: { id: '3', codigo: 'leche', nombre: 'Leche', nombreEtiqueta: 'leche', orden: 30 },
  soya: { id: '4', codigo: 'soya', nombre: 'Soya', nombreEtiqueta: 'soya', orden: 40 },
} satisfies Record<string, AlergenoCatalogo>;

function lineas(): LineaConAlergenos[] {
  const base = recetaMarmolado();
  return [
    { ...base[0], contiene: [A.gluten, A.leche], trazas: [A.soya] },
    { ...base[1], contiene: [], trazas: [] },
    { ...base[2], contiene: [], trazas: [] },
    { ...base[3], contiene: [A.huevo], trazas: [] },
  ];
}

const perfilCompleto = {
  pesoFinalPromedioG: PESO_FINAL_G,
  pesoPorcionG: 160,
  porcionesPorEnvase: 1,
  porcionDescripcion: '1 unidad',
};

const entradaOk = () => ({
  productName: 'Bizcocho Marmolado',
  lineas: lineas(),
  perfil: perfilCompleto,
  elaborador: 'La Oca SpA',
});

test('arma la etiqueta completa del marmolado', () => {
  const r = armarEtiqueta(entradaOk());

  assert.equal(r.denominacion, 'Bizcocho Marmolado');
  assert.equal(r.porcionDescripcion, '1 unidad');
  assert.ok(Math.abs(r.calculo.por100g!.energia_kcal - 441.71875) < 1e-9);
  assert.deepEqual(r.calculo.nutrientesIncompletos, []);
});

test('la lista de ingredientes sale ordenada por gramos reales y con el compuesto expandido', () => {
  const r = armarEtiqueta(entradaOk());
  assert.equal(
    r.textoIngredientes,
    'Mix queque neutro (harina de trigo enriquecida, azúcar, suero de leche en polvo, ' +
      'polvos de hornear, sal), cacao amargo, huevos, aceite vegetal.',
  );
});

test('consolida los alérgenos de toda la receta', () => {
  const r = armarEtiqueta(entradaOk());
  assert.equal(r.textoAlergenos, 'Contiene trigo (gluten), huevos y leche.');
  assert.equal(r.textoTrazas, 'Puede contener trazas de soya.');
});

test('los sellos salen evaluados', () => {
  const r = armarEtiqueta(entradaOk());
  assert.deepEqual(
    r.sellos!.sellos.map((s) => s.codigo).sort(),
    ['alto_azucares', 'alto_calorias', 'alto_grasas_saturadas'],
  );
});

test('sin peso final NO se devuelven cero sellos: se devuelve "no evaluado"', () => {
  // Devolver una lista vacía diría "este producto no lleva sellos", que es una
  // afirmación distinta —y peligrosa— frente a "no se pudo evaluar".
  const r = armarEtiqueta({ ...entradaOk(), perfil: { pesoFinalPromedioG: null } });
  assert.equal(r.sellos, null);
  assert.equal(r.veredicto.estado, 'borrador');
  assert.ok(r.veredicto.bloqueos.some((b) => /sellos/i.test(b.detalle)));
});

test('el override de ingredientes pisa el texto sin tocar la receta', () => {
  const entrada = entradaOk();
  const original = JSON.parse(JSON.stringify(entrada.lineas));

  const r = armarEtiqueta({
    ...entrada,
    perfil: { ...perfilCompleto, ingredientesTextoOverride: 'Texto corregido a mano.' },
  });

  assert.equal(r.textoIngredientes, 'Texto corregido a mano.');
  assert.equal(r.hayOverrides, true);
  // La receta que entró no se tocó: sigue siendo la fuente de verdad de costos y stock.
  assert.deepEqual(JSON.parse(JSON.stringify(entrada.lineas)), original);
  // Y el cálculo se sigue haciendo sobre la receta, no sobre el texto.
  assert.ok(Math.abs(r.calculo.por100g!.energia_kcal - 441.71875) < 1e-9);
});

test('un override vacío o en blanco no pisa nada', () => {
  const r = armarEtiqueta({
    ...entradaOk(),
    perfil: { ...perfilCompleto, ingredientesTextoOverride: '   ' },
  });
  assert.match(r.textoIngredientes, /^Mix queque neutro/);
  assert.equal(r.hayOverrides, false);
});

test('la denominación legal pisa al nombre comercial', () => {
  const r = armarEtiqueta({
    ...entradaOk(),
    perfil: { ...perfilCompleto, denominacionLegal: 'Queque marmolado' },
  });
  assert.equal(r.denominacion, 'Queque marmolado');
});

test('sin elaborador queda en borrador', () => {
  const r = armarEtiqueta({ ...entradaOk(), elaborador: null });
  assert.equal(r.veredicto.estado, 'borrador');
  assert.ok(r.veredicto.bloqueos.some((b) => /elaborador/i.test(b.detalle)));
});

test('un ingrediente sin ficha aparece en los bloqueos con su nombre', () => {
  const ls = lineas();
  ls[1] = { ...ls[1], ficha: null };
  const r = armarEtiqueta({ ...entradaOk(), lineas: ls });

  const b = r.veredicto.bloqueos.find((x) => x.codigo === 'sin_ficha');
  assert.ok(b);
  assert.equal(b!.ingredienteNombre, 'Cacao Amargo');
  assert.equal(r.veredicto.estado, 'borrador');
});

test('el armado es determinista: dos corridas dan lo mismo', () => {
  // Es la propiedad que hace reproducible el snapshot que se guarda por versión.
  const a = armarEtiqueta(entradaOk());
  const b = armarEtiqueta(entradaOk());
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('cambiar la receta cambia el resultado, y el anterior no se ve afectado', () => {
  const antes = armarEtiqueta(entradaOk());
  const energiaAntes = antes.calculo.por100g!.energia_kcal;

  const ls = lineas();
  ls[0] = { ...ls[0], cantidad: 0.2 };
  const despues = armarEtiqueta({ ...entradaOk(), lineas: ls });

  assert.equal(antes.calculo.por100g!.energia_kcal, energiaAntes);
  assert.notEqual(despues.calculo.por100g!.energia_kcal, energiaAntes);
});

test('receta vacía no produce textos inventados', () => {
  const r = armarEtiqueta({ ...entradaOk(), lineas: [] });
  assert.equal(r.textoIngredientes, '');
  assert.equal(r.textoAlergenos, '');
  assert.equal(r.textoTrazas, '');
  assert.equal(r.veredicto.estado, 'borrador');
});
