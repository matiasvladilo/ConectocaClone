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

test('saluda por el nombre cuando existe y firma con cariño', () => {
  const withName = buildCustomerConfirmation({ ...emailData, customerName: 'Camila' });
  assert.ok(withName.html.includes('Hola Camila,'));
  assert.ok(withName.text.startsWith('Hola Camila,'));
  const withoutName = buildCustomerConfirmation({ ...emailData, customerName: null });
  assert.ok(withoutName.text.startsWith('Hola,'));
  for (const email of [withName, withoutName]) {
    assert.ok(email.html.includes('Con cariño, equipo de La Oca'));
    assert.ok(email.text.includes('Con cariño, equipo de La Oca'));
  }
});

test('incluye el logo publicado en el mismo sitio que el enlace al caso', () => {
  const email = buildCustomerConfirmation(emailData);
  assert.ok(email.html.includes('src="https://conectoca.cl/logo-email.png"'));
});

test('todos llevan la franja azul del logo; sugerencia y felicitación, cuerpo cálido', () => {
  for (const kind of ['complaint', 'suggestion', 'compliment'] as const) {
    assert.ok(buildCustomerConfirmation({ ...emailData, kind }).html.includes('background-color:#063c84'));
  }
  assert.ok(buildCustomerConfirmation({ ...emailData, kind: 'compliment' }).html.includes('background-color:#f0fdf4'));
  assert.ok(buildCustomerConfirmation({ ...emailData, kind: 'suggestion' }).html.includes('background-color:#eff6ff'));
});

test('el logo es la oca transparente, sin recuadro', () => {
  const html = buildCustomerConfirmation(emailData).html;
  assert.match(html, /<img src="https:\/\/conectoca\.cl\/logo-email\.png" width="\d+" height="\d+"/);
  assert.doesNotMatch(html, /alt="La Oca" style="[^"]*border-radius/);
});

test('muestra lo que contó el cliente, escapado y recortado', () => {
  const long = 'a'.repeat(400);
  const email = buildCustomerConfirmation({ ...emailData, description: long });
  assert.ok(email.html.includes('a'.repeat(280) + '…'));
  assert.ok(!email.html.includes('a'.repeat(281)));
});

test('formatea la fecha en hora de Chile', () => {
  const email = buildCustomerConfirmation({ ...emailData, createdAt: '2026-10-07T15:30:00.000Z' });
  assert.match(email.text, /7 (de )?oct/i);
  assert.match(email.text, /12:30/);
});

test('el aviso central lleva etiqueta del tipo y botón al caso', () => {
  const email = buildCentralNotification({ ...emailData, kind: 'compliment' });
  assert.ok(email.html.includes('Felicitación'));
  assert.ok(email.html.includes('href="https://conectoca.cl/?screen=complaints&amp;case=case-1"'));
  assert.ok(email.html.includes('Abrir en Conectoca'));
});
