import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerConfirmation, buildCentralNotification } from './emailTemplates.ts';

const emailData = {
  caseNumber: 'REC-2026-000123',
  createdAt: '2026-10-05T12:00:00.000Z',
  originLabel: 'Otro / no sabe',
  customerEmail: 'cliente@example.com',
  customerName: '<script>alert(1)</script>',
  customerPhone: null,
  description: '<script>alert(2)</script>',
  attachmentCount: 0,
  adminUrl: 'https://conectoca.cl/?screen=complaints&case=case-1',
};

for (const [name, build] of [
  ['cliente', buildCustomerConfirmation],
  ['central', buildCentralNotification],
] as const) {
  test(`plantilla ${name} escapa HTML e incluye el caso`, () => {
    const message = build(emailData);
    assert.match(message.subject, /REC-2026-000123/);
    assert.doesNotMatch(message.html, /<script>/);
    assert.match(message.html, /&lt;script&gt;/);
  });
}
