import assert from 'node:assert/strict';
import test from 'node:test';

import { complaintQrUrl } from './complaintQr.ts';

test('builds the universal QR URL at the origin root without business data', () => {
  assert.equal(
    complaintQrUrl('https://app.conectoca.cl/admin?businessId=private-id'),
    'https://app.conectoca.cl/reclamos',
  );
});

test('preserves the development origin and port', () => {
  assert.equal(complaintQrUrl('http://localhost:5173'), 'http://localhost:5173/reclamos');
});
