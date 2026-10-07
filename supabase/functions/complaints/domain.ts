export type ComplaintOrigin = 'branch' | 'production' | 'other';

export type ComplaintKind = 'complaint' | 'suggestion' | 'compliment';

export const COMPLAINT_KINDS: readonly ComplaintKind[] = ['complaint', 'suggestion', 'compliment'];

export interface RawComplaintFields {
  originType: string;
  branchId: string;
  email: string;
  name: string;
  phone: string;
  description: string;
  honeypot: string;
  kind?: string;
}

export interface ValidComplaintFields {
  kind: ComplaintKind;
  originType: ComplaintOrigin;
  branchId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  description: string;
}

export interface AttachmentDescriptor {
  name: string;
  type: string;
  size: number;
}

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MIN_FORM_AGE = 2_000;
const MAX_FORM_AGE = 2 * 60 * 60 * 1_000;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

function requireText(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${field} es obligatorio`);
  return normalized;
}

export function validateComplaintFields(raw: RawComplaintFields): ValidComplaintFields {
  if (String(raw.honeypot ?? '').trim()) {
    throw new Error('Solicitud inválida');
  }

  // TRANSICIÓN: el frontend publicado antes de este cambio no envía `kind`.
  // Se elimina en la Task 8, una vez que Netlify publique el formulario nuevo.
  const kind = (String(raw.kind ?? '').trim() || 'complaint') as ComplaintKind;
  if (!COMPLAINT_KINDS.includes(kind)) {
    throw new Error('Tipo de mensaje inválido');
  }

  const originType = requireText(raw.originType, 'El origen') as ComplaintOrigin;
  if (!['branch', 'production', 'other'].includes(originType)) {
    throw new Error('Origen inválido');
  }

  const branchId = String(raw.branchId ?? '').trim();
  if (originType === 'branch' && !branchId) {
    throw new Error('Debes seleccionar una sucursal');
  }
  if (originType !== 'branch' && branchId) {
    throw new Error('La sucursal no corresponde al origen seleccionado');
  }

  const email = requireText(raw.email, 'El correo');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Correo inválido');
  }

  const name = String(raw.name ?? '').trim();
  if (name.length > 120) throw new Error('El nombre no puede superar 120 caracteres');

  const phone = String(raw.phone ?? '').trim();
  if (phone.length > 40) throw new Error('El teléfono no puede superar 40 caracteres');

  const description = requireText(raw.description, 'La descripción');
  if (description.length < 10 || description.length > 5_000) {
    throw new Error('La descripción debe tener entre 10 y 5.000 caracteres');
  }

  return {
    kind,
    originType,
    branchId: originType === 'branch' ? branchId : null,
    email: email.toLowerCase(),
    name: name || null,
    phone: phone || null,
    description,
  };
}

export function validateAttachments(files: AttachmentDescriptor[]): void {
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error('No puedes adjuntar más de cinco archivos');
  }

  for (const file of files) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      throw new Error('Tipo de archivo no permitido');
    }
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_ATTACHMENT_SIZE) {
      throw new Error('Cada archivo debe pesar como máximo 10 MB');
    }
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function sign(payload: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
}

export async function createFormToken(secret: string, nowMs = Date.now()): Promise<string> {
  const issuedAt = String(Math.trunc(nowMs));
  const signature = await sign(issuedAt, secret);
  return `${issuedAt}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyFormToken(token: string, secret: string, nowMs = Date.now()): Promise<boolean> {
  const [issuedAtText, signatureText, ...extra] = token.split('.');
  if (!issuedAtText || !signatureText || extra.length > 0 || !/^\d+$/.test(issuedAtText)) return false;

  const issuedAt = Number(issuedAtText);
  if (!Number.isSafeInteger(issuedAt) || nowMs - issuedAt < MIN_FORM_AGE || nowMs - issuedAt > MAX_FORM_AGE) {
    return false;
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signatureText),
      new TextEncoder().encode(issuedAtText),
    );
  } catch {
    return false;
  }
}

export async function hashRateLimitKey(secret: string, ip: string, now = new Date()): Promise<string> {
  const window = now.toISOString().slice(0, 13);
  const digest = await sign(`${ip.trim()}|${window}`, secret);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

// El panel autentica con Bearer token, no con cookies, así que CORS no es la
// barrera de seguridad: basta con el dominio público y cualquier puerto local
// (el dev server de Vite cambia de puerto cuando el 3000 está ocupado).
export function isAllowedComplaintOrigin(origin: string, appPublicUrl: string): boolean {
  if (!origin) return false;
  return origin === new URL(appPublicUrl).origin || LOCAL_DEV_ORIGIN.test(origin);
}
