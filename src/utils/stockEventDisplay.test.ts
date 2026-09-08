import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ETIQUETA_MOVIMIENTO, SIGNO_MOVIMIENTO, COLOR_MOVIMIENTO } from './stockEventDisplay.ts';

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
