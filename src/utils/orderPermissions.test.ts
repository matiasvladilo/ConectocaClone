import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canEditOrder } from './orderPermissions.ts';

test('permite editar pedidos solo a distribución y administración', () => {
  assert.equal(canEditOrder('dispatch'), true);
  assert.equal(canEditOrder('admin'), true);

  for (const role of ['local', 'production', 'user', 'worker', 'pastry']) {
    assert.equal(canEditOrder(role), false);
  }

  assert.equal(canEditOrder(undefined), false);
});
