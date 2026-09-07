import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCantidadAgregable } from './cartStock.ts';

const conStock = (stock: number, trackStock = true) => ({ stock, trackStock });

// EL BUG REPORTADO: queda 1 unidad, el local pide su cantidad habitual y antes
// no se agregaba nada. Ahora entra 1 y se le avisa que se recortó.
test('recorta a lo disponible en vez de rechazar el pedido entero', () => {
  const d = calcularCantidadAgregable(conStock(1), 6, 0);
  assert.deepEqual(d, { agregable: 1, recortada: true, disponible: 1 });
});

test('la última unidad se puede pedir tal cual', () => {
  const d = calcularCantidadAgregable(conStock(1), 1, 0);
  assert.deepEqual(d, { agregable: 1, recortada: false, disponible: 1 });
});

test('sin stock no agrega nada', () => {
  const d = calcularCantidadAgregable(conStock(0), 3, 0);
  assert.equal(d.agregable, 0);
  assert.equal(d.recortada, false);
});

// Con 1 de stock y esa unidad ya en el carrito no queda nada que agregar, pero
// tampoco es "sin stock": el producto está en el pedido. El mensaje lo decide
// quien llama mirando producto.stock.
test('lo que ya está en el carrito descuenta del disponible', () => {
  const d = calcularCantidadAgregable(conStock(1), 1, 1);
  assert.deepEqual(d, { agregable: 0, recortada: false, disponible: 0 });
});

test('stock ilimitado por -1 no tiene tope', () => {
  const d = calcularCantidadAgregable(conStock(-1), 50, 10);
  assert.deepEqual(d, { agregable: 50, recortada: false, disponible: Infinity });
});

test('stock ilimitado por trackStock false no tiene tope', () => {
  const d = calcularCantidadAgregable(conStock(0, false), 50, 0);
  assert.equal(d.agregable, 50);
  assert.equal(d.recortada, false);
});

// Los productos por peso (allowDecimal) recortan sin redondear a entero: media
// unidad disponible se agrega como 0.5, no como 0 ni como 1.
test('recorta respetando decimales', () => {
  const d = calcularCantidadAgregable(conStock(2), 3, 1.5);
  assert.deepEqual(d, { agregable: 0.5, recortada: true, disponible: 0.5 });
});

test('cantidad pedida invalida no agrega nada', () => {
  assert.equal(calcularCantidadAgregable(conStock(10), 0, 0).agregable, 0);
  assert.equal(calcularCantidadAgregable(conStock(10), -2, 0).agregable, 0);
});
