import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateComplaintFields,
  validateAttachments,
  createFormToken,
  verifyFormToken,
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
