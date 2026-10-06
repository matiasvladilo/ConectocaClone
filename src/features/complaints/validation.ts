import type { ComplaintDraft, ComplaintValidationErrors } from './types';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateComplaintDraft(draft: ComplaintDraft): ComplaintValidationErrors {
  const errors: ComplaintValidationErrors = {};
  const originType = draft.originType;
  const branchId = draft.branchId.trim();
  const email = draft.email.trim();
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const description = draft.description.trim();

  if (originType !== 'branch' && originType !== 'production' && originType !== 'other') {
    errors.originType = 'Selecciona el origen del reclamo';
  }

  if (originType === 'branch' && !branchId) {
    errors.branchId = 'Selecciona una sucursal';
  } else if (originType !== 'branch' && branchId) {
    errors.branchId = 'La sucursal no corresponde al origen seleccionado';
  }

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Ingresa un correo válido';
  }

  if (name.length > 120) {
    errors.name = 'El nombre no puede superar 120 caracteres';
  }

  if (phone.length > 40) {
    errors.phone = 'El teléfono no puede superar 40 caracteres';
  }

  if (description.length < 20 || description.length > 5_000) {
    errors.description = 'La descripción debe tener entre 20 y 5.000 caracteres';
  }

  if (draft.files.length > MAX_FILES) {
    errors.files = 'Puedes adjuntar hasta cinco archivos';
  } else if (draft.files.some(file => !ALLOWED_FILE_TYPES.has(file.type))) {
    errors.files = 'Solo puedes adjuntar archivos JPG, PNG, WebP o PDF';
  } else if (draft.files.some(file => !Number.isFinite(file.size) || file.size < 1 || file.size > MAX_FILE_SIZE)) {
    errors.files = 'Cada archivo debe pesar como máximo 10 MB';
  }

  return errors;
}
