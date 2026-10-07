import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMPLAINT_KIND_OPTIONS,
  complaintDescriptionPlaceholder,
  complaintKindLabel,
  complaintKindNoun,
  complaintKindSuccess,
} from './complaintKinds.ts';

test('ofrece los tres tipos en orden', () => {
  assert.deepEqual(COMPLAINT_KIND_OPTIONS.map(option => option.value), ['complaint', 'suggestion', 'compliment']);
  assert.deepEqual(COMPLAINT_KIND_OPTIONS.map(option => option.label), ['Reclamo', 'Sugerencia', 'Felicitación']);
});

test('nombres por tipo', () => {
  assert.equal(complaintKindLabel('compliment'), 'Felicitación');
  assert.equal(complaintKindNoun('suggestion'), 'sugerencia');
});

test('mensaje de cierre por tipo', () => {
  assert.deepEqual(complaintKindSuccess('complaint'), {
    title: 'Recibimos tu reclamo',
    message: 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.',
  });
  assert.deepEqual(complaintKindSuccess('suggestion'), {
    title: 'Gracias por tu sugerencia',
    message: 'Ya la estamos revisando con el equipo para seguir mejorando.',
  });
  assert.deepEqual(complaintKindSuccess('compliment'), {
    title: '¡Gracias por felicitarnos!',
    message: 'Le haremos llegar tus palabras al equipo.',
  });
});

test('placeholder neutro sin tipo y específico con tipo', () => {
  assert.match(complaintDescriptionPlaceholder(''), /Cuéntanos/);
  assert.notEqual(complaintDescriptionPlaceholder('compliment'), complaintDescriptionPlaceholder('complaint'));
});
