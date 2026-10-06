import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ComplaintDraft } from './types.ts';
import { validateComplaintDraft } from './validation.ts';

const validDraft: ComplaintDraft = {
  originType: 'other',
  branchId: '',
  email: 'cliente@example.com',
  name: '',
  phone: '',
  description: 'Descripción suficientemente larga para ser válida.',
  files: [],
};

function file(type: string, size: number): File {
  return { type, size } as File;
}

test('requiere sucursal solo cuando el origen es branch', () => {
  assert.equal(
    validateComplaintDraft({ ...validDraft, originType: 'branch', branchId: '' }).branchId,
    'Selecciona una sucursal',
  );
  assert.equal(
    validateComplaintDraft({ ...validDraft, originType: 'production', branchId: '' }).branchId,
    undefined,
  );
});

test('rechaza descripciones fuera del límite de 20 a 5.000 caracteres', () => {
  assert.equal(
    validateComplaintDraft({ ...validDraft, description: 'Muy corta' }).description,
    'La descripción debe tener entre 20 y 5.000 caracteres',
  );
  assert.equal(
    validateComplaintDraft({ ...validDraft, description: 'a'.repeat(5_001) }).description,
    'La descripción debe tener entre 20 y 5.000 caracteres',
  );
});

test('rechaza correos inválidos o demasiado largos', () => {
  assert.equal(
    validateComplaintDraft({ ...validDraft, email: 'cliente.example.com' }).email,
    'Ingresa un correo válido',
  );
  assert.equal(
    validateComplaintDraft({ ...validDraft, email: `${'a'.repeat(243)}@ejemplo.com` }).email,
    'Ingresa un correo válido',
  );
});

test('limita las evidencias a cinco archivos permitidos de hasta 10 MB', () => {
  assert.equal(
    validateComplaintDraft({
      ...validDraft,
      files: Array.from({ length: 6 }, () => file('image/jpeg', 1)),
    }).files,
    'Puedes adjuntar hasta cinco archivos',
  );
  assert.equal(
    validateComplaintDraft({ ...validDraft, files: [file('text/plain', 1)] }).files,
    'Solo puedes adjuntar archivos JPG, PNG, WebP o PDF',
  );
  assert.equal(
    validateComplaintDraft({ ...validDraft, files: [file('application/pdf', 10 * 1024 * 1024 + 1)] }).files,
    'Cada archivo debe pesar como máximo 10 MB',
  );
});
