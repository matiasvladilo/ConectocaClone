import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerConfirmation, buildCentralNotification } from './emailTemplates.ts';

const emailData = {
  kind: 'complaint' as const,
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

test('la confirmación al cliente usa el mensaje de cada tipo', () => {
  const cases = [
    ['complaint', 'Recibimos tu reclamo', 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.'],
    ['suggestion', 'Gracias por tu sugerencia', 'Ya la estamos revisando con el equipo para seguir mejorando.'],
    ['compliment', '¡Gracias por felicitarnos!', 'Le haremos llegar tus palabras al equipo.'],
  ] as const;
  for (const [kind, title, message] of cases) {
    const email = buildCustomerConfirmation({ ...emailData, kind, caseNumber: 'X-1' });
    assert.equal(email.subject, `${title} — X-1`);
    assert.ok(email.text.includes(message));
    assert.ok(email.html.includes(message));
  }
});

test('el aviso central nombra el tipo', () => {
  assert.match(buildCentralNotification({ ...emailData, kind: 'suggestion' }).subject, /^Nueva sugerencia REC-2026-000123/);
  assert.match(buildCentralNotification({ ...emailData, kind: 'compliment' }).subject, /^Nueva felicitación /);
  assert.match(buildCentralNotification(emailData).subject, /^Nuevo reclamo /);
});
