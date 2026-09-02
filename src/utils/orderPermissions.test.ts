import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditOrder, isOrderEditableStatus } from './orderPermissions.ts';

test('permite editar pedidos a distribución, producción y administración', () => {
  assert.equal(canEditOrder('dispatch'), true);
  assert.equal(canEditOrder('admin'), true);
  assert.equal(canEditOrder('production'), true);

  for (const role of ['local', 'user', 'worker', 'pastry']) {
    assert.equal(canEditOrder(role), false);
  }

  assert.equal(canEditOrder(undefined), false);
});

test('solo permite editar pedidos pendientes, en preparación o listos', () => {
  for (const status of ['pending', 'in_progress', 'completed']) {
    assert.equal(isOrderEditableStatus(status), true);
  }

  for (const status of ['dispatched', 'delivered', 'cancelled']) {
    assert.equal(isOrderEditableStatus(status), false);
  }
});
