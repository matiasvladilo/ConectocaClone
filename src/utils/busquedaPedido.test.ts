import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarIdPedido, idPedidoCoincide } from './busquedaPedido.ts';

// UUID real de un pedido (23/11/2026). En la app se ve como "#4210C619".
const UUID = '4210c619-a845-4dcb-9a8a-b4c86907187b';

test('encuentra el pedido con el id tal como sale impreso en la guía', () => {
  assert.equal(idPedidoCoincide(UUID, '#4210C619'), true);
});

test('encuentra el pedido con el id tal como se ve en la app', () => {
  assert.equal(idPedidoCoincide(UUID, '4210C619'), true);
  assert.equal(idPedidoCoincide(UUID, '4210c619'), true);
});

test('sigue sirviendo el formato viejo D- de las guías impresas', () => {
  assert.equal(idPedidoCoincide(UUID, 'D-4210'), true);
  assert.equal(idPedidoCoincide(UUID, 'd-4210'), true);
});

test('tolera espacios de sobra al copiar y pegar', () => {
  assert.equal(idPedidoCoincide(UUID, '  #4210C619  '), true);
});

test('acepta el UUID completo pegado desde la base', () => {
  assert.equal(idPedidoCoincide(UUID, UUID), true);
  assert.equal(idPedidoCoincide(UUID, UUID.toUpperCase()), true);
});

test('busca también por el medio del id, no solo por el principio', () => {
  assert.equal(idPedidoCoincide(UUID, 'a845'), true);
});

test('no devuelve un pedido que no corresponde', () => {
  assert.equal(idPedidoCoincide(UUID, '#9999FFFF'), false);
  assert.equal(idPedidoCoincide(UUID, 'D-9999'), false);
});

test('una búsqueda vacía no hace match con todo', () => {
  assert.equal(idPedidoCoincide(UUID, ''), false);
  assert.equal(idPedidoCoincide(UUID, '   '), false);
  // Solo el adorno, sin id: tampoco debería traer todos los pedidos.
  assert.equal(idPedidoCoincide(UUID, '#'), false);
  assert.equal(idPedidoCoincide(UUID, 'D-'), false);
});

test('normalizarIdPedido saca el adorno y nada más', () => {
  assert.equal(normalizarIdPedido('#4210C619'), '4210c619');
  assert.equal(normalizarIdPedido('D-4210'), '4210');
  assert.equal(normalizarIdPedido('  4210 C619 '), '4210c619');
  // El # del medio no es adorno: solo se saca el del principio.
  assert.equal(normalizarIdPedido('4210#619'), '4210#619');
});
