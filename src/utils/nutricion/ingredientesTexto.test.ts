import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarTextoIngredientes, ordenarPorCantidad } from './ingredientesTexto.ts';
import type { IngredienteParaTexto } from './ingredientesTexto.ts';

const marmolado: IngredienteParaTexto[] = [
  {
    nombre: 'Mix Queque Neutro',
    gramos: 104,
    ingredientesDeclarados: 'harina de trigo enriquecida, azúcar, suero de leche en polvo, sal',
  },
  { nombre: 'Cacao Amargo', gramos: 58 },
  { nombre: 'Aceite Vegetal', gramos: 8.28 },
  { nombre: 'Huevos', gramos: 25 },
];

test('ordena en cantidad decreciente, no en el orden de carga', () => {
  const orden = ordenarPorCantidad(marmolado).map((i) => i.nombre);
  assert.deepEqual(orden, ['Mix Queque Neutro', 'Cacao Amargo', 'Huevos', 'Aceite Vegetal']);
});

test('genera la lista de la etiqueta con el compuesto expandido', () => {
  assert.equal(
    generarTextoIngredientes(marmolado),
    'Mix queque neutro (harina de trigo enriquecida, azúcar, suero de leche en polvo, sal), ' +
      'cacao amargo, huevos, aceite vegetal.',
  );
});

test('los nombres van en minúscula y solo se capitaliza el arranque de la frase', () => {
  const texto = generarTextoIngredientes([{ nombre: 'Cacao Amargo', gramos: 1 }]);
  assert.equal(texto, 'Cacao amargo.');
});

test('no inventa paréntesis cuando el proveedor no declaró la composición', () => {
  const texto = generarTextoIngredientes([{ nombre: 'Cacao Amargo', gramos: 1 }]);
  assert.ok(!texto.includes('('));
});

test('el punto final del compuesto no queda dentro del paréntesis', () => {
  const texto = generarTextoIngredientes([
    { nombre: 'Mix', gramos: 1, ingredientesDeclarados: 'harina, azúcar.' },
  ]);
  assert.equal(texto, 'Mix (harina, azúcar).');
});

test('una declaración vacía se trata como ausente', () => {
  const texto = generarTextoIngredientes([{ nombre: 'Mix', gramos: 1, ingredientesDeclarados: '   ' }]);
  assert.equal(texto, 'Mix.');
});

test('receta vacía devuelve texto vacío, no una frase suelta', () => {
  assert.equal(generarTextoIngredientes([]), '');
});

test('los empates conservan el orden de la receta', () => {
  const orden = ordenarPorCantidad([
    { nombre: 'Primero', gramos: 10 },
    { nombre: 'Segundo', gramos: 10 },
  ]).map((i) => i.nombre);
  assert.deepEqual(orden, ['Primero', 'Segundo']);
});

test('ordenar no muta el arreglo original', () => {
  const original = [...marmolado];
  ordenarPorCantidad(marmolado);
  assert.deepEqual(marmolado, original);
});

test('el orden usa gramos reales, así que el aceite en ml no se cuela arriba', () => {
  // 9 ml de aceite son 8.28 g: van últimos. Si el orden usara la cantidad cruda
  // en la unidad de cada materia prima (0.104 kg vs 0.009 l vs 58 g), la lista
  // saldría en cualquier orden.
  const orden = ordenarPorCantidad(marmolado).map((i) => i.nombre);
  assert.equal(orden[orden.length - 1], 'Aceite Vegetal');
});
