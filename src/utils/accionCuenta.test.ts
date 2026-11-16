import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAccionCuenta, accionDesdeUrl } from './accionCuenta.ts';

test('lee el enlace de verificación que arma el Edge Function', () => {
  assert.deepEqual(leerAccionCuenta('?cuenta=verificar&token_hash=abc&type=signup'), {
    accion: 'verificar', tokenHash: 'abc', tipo: 'signup',
  });
});

test('rechaza acciones, tipos o tokens que no corresponden', () => {
  assert.equal(leerAccionCuenta('?cuenta=borrar&token_hash=abc&type=signup'), null);
  assert.equal(leerAccionCuenta('?cuenta=verificar&token_hash=abc&type=email_change'), null);
  assert.equal(leerAccionCuenta('?cuenta=verificar&type=signup'), null);
  assert.equal(leerAccionCuenta(''), null);
});

// En la app nativa el enlace no llega por window.location sino como URL completa
// (Universal Link / App Link https, o el esquema propio de la app).
test('acepta la URL https completa con la que se abre la app', () => {
  assert.deepEqual(
    accionDesdeUrl('https://conectocadev.netlify.app/?cuenta=nueva-clave&token_hash=xyz&type=recovery'),
    { accion: 'nueva-clave', tokenHash: 'xyz', tipo: 'recovery' },
  );
});

test('acepta el esquema propio de la app', () => {
  assert.deepEqual(
    accionDesdeUrl('info.laoca.app://cuenta?cuenta=verificar&token_hash=t1&type=magiclink'),
    { accion: 'verificar', tokenHash: 't1', tipo: 'magiclink' },
  );
});

test('una URL que no es de cuenta o está mal formada no abre nada', () => {
  assert.equal(accionDesdeUrl('https://conectocadev.netlify.app/opina?local=1'), null);
  assert.equal(accionDesdeUrl('no es una url'), null);
  assert.equal(accionDesdeUrl(''), null);
});
