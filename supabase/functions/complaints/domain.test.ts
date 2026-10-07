import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateComplaintFields,
  validateAttachments,
  createFormToken,
  verifyFormToken,
  isAllowedComplaintOrigin,
} from './domain.ts';

test('branch exige una sucursal y normaliza el correo', () => {
  assert.throws(() => validateComplaintFields({
    originType: 'branch', branchId: '', email: 'CLIENTE@MAIL.CL',
    name: '', phone: '', description: 'Descripción suficientemente larga', honeypot: '',
  }), /sucursal/i);
  assert.equal(validateComplaintFields({
    originType: 'other', branchId: '', email: ' CLIENTE@MAIL.CL ',
    name: '', phone: '', description: 'Descripción suficientemente larga', honeypot: '',
  }).email, 'cliente@mail.cl');
});

test('rechaza más de cinco adjuntos o un archivo sobre 10 MB', () => {
  const ok = { name: 'foto.jpg', type: 'image/jpeg', size: 100 };
  assert.throws(() => validateAttachments(Array(6).fill(ok)), /cinco/i);
  assert.throws(() => validateAttachments([{ ...ok, size: 10 * 1024 * 1024 + 1 }]), /10 MB/i);
});

test('token solo vale entre 2 segundos y 2 horas', async () => {
  const token = await createFormToken('secret', 1_000_000);
  assert.equal(await verifyFormToken(token, 'secret', 1_001_999), false);
  assert.equal(await verifyFormToken(token, 'secret', 1_002_000), true);
  assert.equal(await verifyFormToken(token, 'secret', 8_200_001), false);
});

test('CORS acepta el dominio público y cualquier puerto local, nada más', () => {
  const app = 'https://conectocadev.netlify.app';
  assert.equal(isAllowedComplaintOrigin('https://conectocadev.netlify.app', app), true);
  assert.equal(isAllowedComplaintOrigin('http://localhost:53535', app), true);
  assert.equal(isAllowedComplaintOrigin('http://127.0.0.1:3000', app), true);
  assert.equal(isAllowedComplaintOrigin('http://localhost', app), true);
  assert.equal(isAllowedComplaintOrigin('http://conectocadev.netlify.app', app), false);
  assert.equal(isAllowedComplaintOrigin('https://localhost.evil.com', app), false);
  assert.equal(isAllowedComplaintOrigin('http://localhost:3000.evil.com', app), false);
  assert.equal(isAllowedComplaintOrigin('https://evil.com', app), false);
  assert.equal(isAllowedComplaintOrigin('', app), false);
});

const baseFields = {
  originType: 'other', branchId: '', email: 'cliente@mail.cl',
  name: '', phone: '', description: 'Muy buena atención', honeypot: '',
};

test('acepta los tres tipos de mensaje', () => {
  for (const kind of ['complaint', 'suggestion', 'compliment']) {
    assert.equal(validateComplaintFields({ ...baseFields, kind }).kind, kind);
  }
});

test('rechaza un tipo desconocido', () => {
  assert.throws(() => validateComplaintFields({ ...baseFields, kind: 'queja' }), /tipo/i);
});

test('TRANSICIÓN: sin tipo se trata como reclamo', () => {
  assert.equal(validateComplaintFields({ ...baseFields }).kind, 'complaint');
});

test('la descripción admite desde 10 caracteres', () => {
  assert.equal(validateComplaintFields({ ...baseFields, kind: 'compliment', description: 'Excelente!' }).description, 'Excelente!');
  assert.throws(
    () => validateComplaintFields({ ...baseFields, kind: 'compliment', description: 'Muy bien' }),
    /entre 10 y 5\.000/,
  );
});
