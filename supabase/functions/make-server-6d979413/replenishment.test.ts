import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AJUSTES_POR_DEFECTO,
  calcularReposicion,
  sumarSalidas,
  validarAjustes,
  type ProductoStock,
  type SalidasProducto,
} from './replenishment.ts';

const AHORA = new Date('2026-11-15T12:00:00Z');
const HACE_UN_ANO = '2025-11-15T12:00:00Z';

function producto(id: string, stock: number, extra: Partial<ProductoStock> = {}): ProductoStock {
  return { id, name: `Producto ${id}`, categoryId: 'cat', stock, minStock: null, unlimitedStock: false, trackStock: true, createdAt: HACE_UN_ANO, ...extra };
}
function salidas(entries: [string, number, number?][]): Map<string, SalidasProducto> {
  return new Map(entries.map(([id, despachos, devoluciones = 0]) => [id, { despachos, devoluciones }]));
}
const calcular = (ps: ProductoStock[], s: Map<string, SalidasProducto>, ajustes = AJUSTES_POR_DEFECTO) =>
  calcularReposicion(ps, s, ajustes, AHORA);

test('rotación = (despachos − devoluciones) ÷ 28 y días que alcanza = stock ÷ rotación', () => {
  // 280 − 28 = 252 en 28 días → 9/día; stock 18 → 2 días (< 3) → entra
  const [fila] = calcular([producto('a', 18)], salidas([['a', 280, 28]]));
  assert.equal(fila.rotacionDiaria, 9);
  assert.equal(fila.diasQueAlcanza, 2);
  assert.equal(fila.motivo, 'pocos_dias');
  // 9 × 7 − 18 = 45
  assert.equal(fila.comprar, 45);
});

test('devoluciones mayores que despachos → salidas 0, sin rotación', () => {
  const filas = calcular([producto('a', 5)], salidas([['a', 2, 10]]));
  assert.equal(filas.length, 0); // sin rotación y sin mínimo: no aparece
});

test('producto creado hace 7 días: la ventana es de 7 días, no de 28', () => {
  const nuevo = producto('n', 10, { createdAt: '2026-11-08T12:00:00Z' });
  const [fila] = calcular([nuevo], salidas([['n', 70]])); // 70 ÷ 7 = 10/día → 1 día
  assert.equal(fila.rotacionDiaria, 10);
  assert.equal(fila.diasQueAlcanza, 1);
});

test('producto creado hace minutos: la ventana mínima es 1 día', () => {
  const recien = producto('r', 0, { createdAt: '2026-11-15T11:00:00Z' });
  const [fila] = calcular([recien], salidas([['r', 6]]));
  assert.equal(fila.rotacionDiaria, 6);
});

test('no aparece si el stock cubre el umbral de aviso', () => {
  // 56 en 28 días = 2/día; stock 10 → 5 días ≥ 3
  assert.equal(calcular([producto('a', 10)], salidas([['a', 56]])).length, 0);
});

test('entra por mínimo manual aunque le queden muchos días', () => {
  // 1/día, stock 20 → 20 días; mínimo 24 → entra
  const [fila] = calcular([producto('a', 20, { minStock: 24 })], salidas([['a', 28]]));
  assert.equal(fila.motivo, 'bajo_minimo');
  // por rotación: 1 × 7 − 20 = −13; por mínimo: 24 − 20 = 4 → 4
  assert.equal(fila.comprar, 4);
});

test('sin ventas recientes: entra solo por mínimo y se marca', () => {
  const [fila] = calcular([producto('a', 2, { minStock: 5 })], new Map());
  assert.equal(fila.motivo, 'sin_ventas_recientes');
  assert.equal(fila.rotacionDiaria, 0);
  assert.equal(fila.diasQueAlcanza, null);
  assert.equal(fila.comprar, 3);
});

test('sin ventas y sin mínimo manual: no aparece (el 10 por defecto no se usa)', () => {
  assert.equal(calcular([producto('a', 1)], new Map()).length, 0);
});

test('agotado con rotación', () => {
  const [fila] = calcular([producto('a', 0)], salidas([['a', 28]]));
  assert.equal(fila.motivo, 'agotado');
  assert.equal(fila.diasQueAlcanza, 0);
  assert.equal(fila.comprar, 7);
});

test('cantidad: redondea hacia arriba y nunca es menor que 1', () => {
  // 0,5/día → stock 1 = 2 días; 0,5 × 7 − 1 = 2,5 → 3
  assert.equal(calcular([producto('a', 1)], salidas([['a', 14]]))[0].comprar, 3);
  // aviso 3, cobertura 3: 1/día, stock 2,5 → 2,5 días; 1 × 3 − 2,5 = 0,5 → 1
  assert.equal(calcular([producto('b', 2.5)], salidas([['b', 28]]), { coverageDays: 3, alertDays: 3 })[0].comprar, 1);
});

test('stock negativo se trata como 0', () => {
  const [fila] = calcular([producto('a', -3)], salidas([['a', 28]]));
  assert.equal(fila.stock, 0);
  assert.equal(fila.motivo, 'agotado');
});

test('excluye productos sin control de stock', () => {
  const ps = [
    producto('ilimitado', 0, { unlimitedStock: true }),
    producto('menos-uno', -1),
    producto('sin-control', 0, { trackStock: false }),
  ];
  assert.equal(calcular(ps, salidas([['ilimitado', 99], ['menos-uno', 99], ['sin-control', 99]])).length, 0);
});

test('orden: agotados, luego por días que alcanza, al final sin ventas recientes', () => {
  const ps = [
    producto('sin-ventas', 1, { minStock: 3 }),
    producto('dos-dias', 2),
    producto('agotado', 0),
    producto('un-dia', 1),
  ];
  const s = salidas([['dos-dias', 28], ['agotado', 28], ['un-dia', 28]]);
  assert.deepEqual(calcular(ps, s).map(f => f.productId), ['agotado', 'un-dia', 'dos-dias', 'sin-ventas']);
});

test('sumarSalidas agrupa despachos y devoluciones e ignora el resto', () => {
  const m = sumarSalidas([
    { product_id: 'a', type: 'despacho', quantity: 5 },
    { product_id: 'a', type: 'despacho', quantity: '3' },
    { product_id: 'a', type: 'devolucion', quantity: 2 },
    { product_id: 'a', type: 'merma', quantity: 100 },
    { product_id: 'b', type: 'reposicion', quantity: 50 },
  ]);
  assert.deepEqual(m.get('a'), { despachos: 8, devoluciones: 2 });
  assert.equal(m.has('b'), false);
});

test('validarAjustes acepta enteros en rango y rechaza el resto', () => {
  assert.deepEqual(validarAjustes({ coverageDays: 14, alertDays: 4 }), { ok: true, ajustes: { coverageDays: 14, alertDays: 4 } });
  for (const malo of [
    null, {}, { coverageDays: 0, alertDays: 1 }, { coverageDays: 61, alertDays: 3 },
    { coverageDays: 7, alertDays: 0 }, { coverageDays: 7, alertDays: 31 },
    { coverageDays: 5, alertDays: 6 }, { coverageDays: 7.5, alertDays: 3 }, { coverageDays: '7', alertDays: 3 },
  ]) {
    assert.equal(validarAjustes(malo).ok, false, JSON.stringify(malo));
  }
});
