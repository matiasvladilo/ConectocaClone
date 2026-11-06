import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_FLOW,
  flowIndex,
  siguienteEstado,
  estadoAnterior,
  puedeAvanzar,
  puedeRetroceder,
} from './orderStatusFlow.ts';

// ─── El flujo lineal ──────────────────────────────────────────────────────────

test('el flujo tiene los 5 estados en orden y con su progreso', () => {
  assert.deepEqual(
    ORDER_FLOW.map(s => s.key),
    ['pending', 'in_progress', 'completed', 'dispatched', 'delivered'],
  );
  assert.deepEqual(ORDER_FLOW.map(s => s.progress), [0, 25, 50, 75, 100]);
});

test('flowIndex ubica cada estado; cancelled y desconocidos quedan fuera (-1)', () => {
  assert.equal(flowIndex('pending'), 0);
  assert.equal(flowIndex('delivered'), 4);
  assert.equal(flowIndex('cancelled'), -1);
  assert.equal(flowIndex('cualquier_cosa'), -1);
});

test('siguiente/anterior recorren el flujo y devuelven null en los extremos', () => {
  assert.equal(siguienteEstado('pending')?.key, 'in_progress');
  assert.equal(siguienteEstado('dispatched')?.key, 'delivered');
  assert.equal(siguienteEstado('delivered'), null); // no hay siguiente
  assert.equal(estadoAnterior('in_progress')?.key, 'pending');
  assert.equal(estadoAnterior('pending'), null); // no hay anterior
  assert.equal(siguienteEstado('cancelled'), null);
});

// ─── Permisos: roles de poder ────────────────────────────────────────────────
// admin / production / dispatch / pastry mueven todo el flujo (igual que el
// Edge Function en PUT /orders/:id/status).

for (const role of ['admin', 'production', 'dispatch', 'pastry']) {
  test(`${role} avanza y retrocede en todo el flujo`, () => {
    assert.equal(puedeAvanzar('pending', role)?.key, 'in_progress');
    assert.equal(puedeAvanzar('completed', role)?.key, 'dispatched');
    assert.equal(puedeRetroceder('dispatched', role)?.key, 'completed');
    assert.equal(puedeRetroceder('delivered', role)?.key, 'dispatched');
  });

  test(`${role} no puede pasar los extremos`, () => {
    assert.equal(puedeAvanzar('delivered', role), null);
    assert.equal(puedeRetroceder('pending', role), null);
  });
}

// ─── Permisos: local / user ──────────────────────────────────────────────────
// Un local solo puede marcar Recibido un pedido que ya está Despachado, y no
// puede retroceder nada (mismo criterio que el botón "Recibido" de OrderDetail
// y la rama isLocalDelivering del Edge Function).

for (const role of ['local', 'user']) {
  test(`${role} solo puede avanzar de Despachado a Recibido`, () => {
    assert.equal(puedeAvanzar('dispatched', role)?.key, 'delivered');
  });

  test(`${role} no puede avanzar desde ningún otro estado`, () => {
    assert.equal(puedeAvanzar('pending', role), null);
    assert.equal(puedeAvanzar('in_progress', role), null);
    assert.equal(puedeAvanzar('completed', role), null);
    assert.equal(puedeAvanzar('delivered', role), null);
  });

  test(`${role} nunca puede retroceder`, () => {
    assert.equal(puedeRetroceder('dispatched', role), null);
    assert.equal(puedeRetroceder('delivered', role), null);
    assert.equal(puedeRetroceder('in_progress', role), null);
  });
}

// ─── Casos borde ──────────────────────────────────────────────────────────────

test('un pedido cancelado no se puede deslizar en ningún sentido ni rol', () => {
  for (const role of ['admin', 'production', 'local', 'user']) {
    assert.equal(puedeAvanzar('cancelled', role), null);
    assert.equal(puedeRetroceder('cancelled', role), null);
  }
});

test('un rol vacío o desconocido no puede cambiar nada', () => {
  assert.equal(puedeAvanzar('dispatched', undefined), null);
  assert.equal(puedeAvanzar('pending', ''), null);
  assert.equal(puedeAvanzar('pending', 'supervisor'), null);
  assert.equal(puedeRetroceder('dispatched', 'supervisor'), null);
});
