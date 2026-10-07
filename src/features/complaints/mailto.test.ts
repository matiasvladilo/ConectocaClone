import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildComplaintMailto } from './mailto.ts';

test('mailto incluye destinatario y caso codificados', () => {
  const url = buildComplaintMailto({
    kind: 'complaint',
    email: 'cliente@example.com',
    caseNumber: 'REC-2026-000123',
    customerName: 'Ana',
  });

  assert.ok(url.startsWith('mailto:cliente%40example.com?'));
  assert.ok(decodeURIComponent(url).includes('Respuesta a tu reclamo REC-2026-000123'));
});

test('mailto codifica caracteres reservados sin cambiar ningún estado', () => {
  const url = buildComplaintMailto({
    kind: 'complaint',
    email: 'ana+compras@example.com',
    caseNumber: 'REC-2026-000124',
    customerName: 'Ana & Compañía',
  });
  const [recipient, query] = url.slice('mailto:'.length).split('?');
  const params = new URLSearchParams(query);

  assert.equal(decodeURIComponent(recipient), 'ana+compras@example.com');
  assert.equal(params.get('subject'), 'Respuesta a tu reclamo REC-2026-000124');
  assert.match(params.get('body') ?? '', /Ana & Compañía/);
});

test('mailto usa el tipo en asunto y cuerpo', () => {
  const url = buildComplaintMailto({
    kind: 'compliment',
    email: 'cliente@example.com',
    caseNumber: 'FEL-2026-000007',
    customerName: null,
  });
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('subject'), 'Respuesta a tu felicitación FEL-2026-000007');
  assert.match(params.get('body') ?? '', /en respuesta a tu felicitación FEL-2026-000007/);
});
