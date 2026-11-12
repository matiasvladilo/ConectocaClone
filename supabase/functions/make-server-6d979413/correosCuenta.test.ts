import test from 'node:test';
import assert from 'node:assert/strict';
import { enlaceCuenta, correoRecuperacion, correoVerificacion, enviarCorreoCuenta, REMITENTE_CUENTA } from './correosCuenta.ts';

test('el enlace va a la app con la acción, el token y el tipo', () => {
  const url = new URL(enlaceCuenta('https://app.laoca.info/', 'nueva-clave', 'abc123', 'recovery'));
  assert.equal(url.origin, 'https://app.laoca.info');
  assert.equal(url.searchParams.get('cuenta'), 'nueva-clave');
  assert.equal(url.searchParams.get('token_hash'), 'abc123');
  assert.equal(url.searchParams.get('type'), 'recovery');
});

test('la plantilla escapa el nombre (no se inyecta HTML)', () => {
  const c = correoVerificacion('<b>Ana</b>', 'https://x.test/?a=1&b=2');
  assert.ok(!c.html.includes('<b>Ana</b>'));
  assert.ok(c.html.includes('&lt;b&gt;Ana&lt;/b&gt;'));
  assert.ok(c.html.includes('a=1&amp;b=2'));
  assert.ok(c.text.includes('https://x.test/?a=1&b=2'));
});

test('el correo de recuperación avisa que vence', () => {
  const c = correoRecuperacion('https://x.test');
  assert.match(c.subject, /contraseña/);
  assert.match(c.text, /1 hora/);
});

test('envía con Resend desde laoca.info y falla si Resend rechaza', async () => {
  let cuerpo: any = null;
  const ok = (async (_u: string, init: any) => { cuerpo = JSON.parse(init.body); return new Response('{}', { status: 200 }); }) as any;
  await enviarCorreoCuenta('k', { to: 'a@b.cl', subject: 's', html: 'h', text: 't' }, ok);
  assert.equal(cuerpo.from, REMITENTE_CUENTA);
  assert.equal(cuerpo.to, 'a@b.cl');
  const mal = (async () => new Response('{}', { status: 422 })) as any;
  await assert.rejects(enviarCorreoCuenta('k', { to: 'a@b.cl', subject: 's', html: 'h', text: 't' }, mal));
});
