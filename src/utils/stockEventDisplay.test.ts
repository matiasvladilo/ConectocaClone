import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ETIQUETA_MOVIMIENTO, SIGNO_MOVIMIENTO, COLOR_MOVIMIENTO, etiquetaMovimiento } from './stockEventDisplay.ts';

const TIPOS = ['despacho', 'reposicion', 'merma', 'ajuste', 'devolucion'] as const;

test('los tres mapas cubren todos los tipos de movimiento', () => {
  for (const t of TIPOS) {
    assert.ok(ETIQUETA_MOVIMIENTO[t], `falta etiqueta para ${t}`);
    assert.ok(COLOR_MOVIMIENTO[t], `falta color para ${t}`);
    assert.ok(t in SIGNO_MOVIMIENTO, `falta signo para ${t}`);
  }
});

test('ajuste no finge un signo', () => {
  assert.equal(SIGNO_MOVIMIENTO.ajuste, '');
});

test('lo que suma y lo que resta tiene el signo correcto', () => {
  assert.equal(SIGNO_MOVIMIENTO.reposicion, '+');
  assert.equal(SIGNO_MOVIMIENTO.devolucion, '+');
  assert.equal(SIGNO_MOVIMIENTO.despacho, '−');
  assert.equal(SIGNO_MOVIMIENTO.merma, '−');
});

test('un despacho nombra el local si se conoce', () => {
  assert.equal(etiquetaMovimiento({ type: 'despacho', customerName: 'LA OCA PV' }), 'Despacho a LA OCA PV');
  assert.equal(etiquetaMovimiento({ type: 'despacho' }), 'Despacho a local');
  assert.equal(etiquetaMovimiento({ type: 'merma', customerName: 'X' }), 'Merma');
});
