import { escapeHtml, type ComplaintKind } from './domain.ts';

export interface ComplaintEmailData {
  kind: ComplaintKind;
  caseNumber: string;
  createdAt: string;
  originLabel: string;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  description: string;
  attachmentCount: number;
  adminUrl: string;
}

interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

const KIND_COPY: Record<ComplaintKind, {
  noun: string;
  title: string;
  message: string;
  centralPrefix: string;
}> = {
  complaint: {
    noun: 'Reclamo',
    title: 'Recibimos tu reclamo',
    message: 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.',
    centralPrefix: 'Nuevo reclamo',
  },
  suggestion: {
    noun: 'Sugerencia',
    title: 'Gracias por tu sugerencia',
    message: 'Ya la estamos revisando con el equipo para seguir mejorando.',
    centralPrefix: 'Nueva sugerencia',
  },
  compliment: {
    noun: 'Felicitación',
    title: '¡Gracias por felicitarnos!',
    message: 'Le haremos llegar tus palabras al equipo.',
    centralPrefix: 'Nueva felicitación',
  },
};

// Paleta del estilo "cálido" (sugerencia y felicitación). El reclamo usa el
// encabezado azul de la marca para transmitir que se toma en serio.
const WARM_THEME: Record<'suggestion' | 'compliment', {
  background: string;
  title: string;
  text: string;
}> = {
  suggestion: { background: '#eff6ff', title: '#1e3a8a', text: '#1e40af' },
  compliment: { background: '#f0fdf4', title: '#14532d', text: '#166534' },
};

const BADGE_COLORS: Record<ComplaintKind, { background: string; text: string }> = {
  complaint: { background: '#fee2e2', text: '#991b1b' },
  suggestion: { background: '#dbeafe', text: '#1e40af' },
  compliment: { background: '#dcfce7', text: '#166534' },
};

// Azul marino del logo. La franja superior es una imagen (public/email-banner.png)
// porque Gmail en modo oscuro invierte los fondos de color pero no las imágenes.
const BRAND_NAVY = '#063c84';
const SIGNATURE = 'Con cariño, equipo de La Oca';
const EXCERPT_LENGTH = 280;
const FONT = "font-family:Helvetica,Arial,sans-serif";

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Santiago',
});

function valueOrFallback(value: string | null, fallback: string): string {
  return value?.trim() || fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function greeting(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hola ${trimmed},` : 'Hola,';
}

function excerpt(description: string): string {
  const trimmed = description.trim();
  return trimmed.length > EXCERPT_LENGTH ? `${trimmed.slice(0, EXCERPT_LENGTH)}…` : trimmed;
}

// El banner vive en el mismo sitio que el enlace al caso, que siempre es absoluto.
function bannerUrl(adminUrl: string): string | null {
  try {
    return new URL('/email-banner.png', adminUrl).toString();
  } catch {
    return null;
  }
}

function logoBand(adminUrl: string): string {
  const src = bannerUrl(adminUrl);
  const img = src
    ? `<img src="${escapeHtml(src)}" width="560" alt="La Oca" style="display:block;width:100%;max-width:560px;height:auto;border:0">`
    : '';
  return `<tr><td style="background-color:${BRAND_NAVY};padding:0;line-height:0;font-size:0">${img}</td></tr>`;
}

function emailShell(background: string, inner: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;padding:0;background-color:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${background};border-radius:12px;overflow:hidden;${FONT};color:#1f2937;font-size:15px;line-height:1.6">
${inner}
</table>
</td></tr>
</table>
</body></html>`;
}

function complaintHtml(data: ComplaintEmailData): string {
  const copy = KIND_COPY.complaint;
  return emailShell('#ffffff', `
${logoBand(data.adminUrl)}
<tr><td style="padding:24px">
  <div style="font-size:22px;font-weight:bold;color:${BRAND_NAVY};margin:0 0 14px">${escapeHtml(copy.title)}</div>
  <p style="margin:0 0 14px">${escapeHtml(greeting(data.customerName))}</p>
  <p style="margin:0 0 18px">${escapeHtml(copy.message)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;margin-bottom:18px"><tr><td style="padding:12px 16px">
    <div style="font-size:12px;color:#6b7280">Tu número de caso</div>
    <div style="font-size:22px;font-weight:bold;color:#0c3c84;letter-spacing:0.5px">${escapeHtml(data.caseNumber)}</div>
  </td></tr></table>
  <div style="font-size:12px;color:#6b7280;margin-bottom:4px">Lo que nos contaste</div>
  <div style="border-left:3px solid #d1d5db;padding:2px 12px;color:#374151;margin-bottom:18px">${escapeHtml(excerpt(data.description)).replaceAll('\n', '<br>')}</div>
  <div style="font-size:12px;color:#6b7280;margin-bottom:18px">${escapeHtml(data.originLabel)} · ${escapeHtml(formatDate(data.createdAt))}</div>
  <p style="margin:0">${escapeHtml(SIGNATURE)}</p>
</td></tr>
<tr><td style="background-color:#f9fafb;padding:12px 24px;font-size:12px;color:#6b7280">Este correo es automático. Te responderemos desde esta misma dirección.</td></tr>`);
}

function warmHtml(data: ComplaintEmailData, kind: 'suggestion' | 'compliment'): string {
  const copy = KIND_COPY[kind];
  const theme = WARM_THEME[kind];
  return emailShell(theme.background, `
${logoBand(data.adminUrl)}
<tr><td align="center" style="padding:24px 24px 8px">
  <div style="font-size:23px;font-weight:bold;color:${theme.title}">${escapeHtml(copy.title)}</div>
  <p style="margin:10px 0 0;color:${theme.text}">${escapeHtml(greeting(data.customerName))}</p>
  <p style="margin:4px 0 0;color:${theme.text}">${escapeHtml(copy.message)}</p>
</td></tr>
<tr><td style="padding:18px 20px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:10px"><tr><td style="padding:14px 18px">
    <div style="font-style:italic;color:#374151">“${escapeHtml(excerpt(data.description)).replaceAll('\n', '<br>')}”</div>
    <div style="font-size:12px;color:#6b7280;margin-top:10px">${escapeHtml(data.originLabel)} · ${escapeHtml(data.caseNumber)} · ${escapeHtml(formatDate(data.createdAt))}</div>
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:4px 24px 26px;color:${theme.text}">${escapeHtml(SIGNATURE)}</td></tr>`);
}

export function buildCustomerConfirmation(data: ComplaintEmailData): EmailMessage {
  const copy = KIND_COPY[data.kind];
  return {
    subject: `${copy.title} — ${data.caseNumber}`,
    html: data.kind === 'complaint' ? complaintHtml(data) : warmHtml(data, data.kind),
    text: [
      greeting(data.customerName),
      '',
      `${copy.title}. ${copy.message}`,
      '',
      `Tu número de caso: ${data.caseNumber}`,
      `Origen: ${data.originLabel}`,
      `Fecha: ${formatDate(data.createdAt)}`,
      '',
      'Lo que nos contaste:',
      excerpt(data.description),
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

export function buildCentralNotification(data: ComplaintEmailData): EmailMessage {
  const copy = KIND_COPY[data.kind];
  const badge = BADGE_COLORS[data.kind];
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;width:96px;color:#6b7280;font-size:13px;vertical-align:top">${label}</td><td style="padding:4px 0;font-size:13px">${escapeHtml(value)}</td></tr>`;
  const html = emailShell('#ffffff', `
<tr><td style="padding:18px 24px;border-bottom:1px solid #f3f4f6">
  <span style="background-color:${badge.background};color:${badge.text};border-radius:999px;padding:3px 10px;font-size:12px;font-weight:bold">${escapeHtml(copy.noun)}</span>
  <span style="font-weight:bold;margin-left:8px">${escapeHtml(data.caseNumber)}</span>
</td></tr>
<tr><td style="padding:18px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
    ${row('Origen', data.originLabel)}
    ${row('Fecha', formatDate(data.createdAt))}
    ${row('Cliente', `${valueOrFallback(data.customerName, 'Sin nombre')} · ${data.customerEmail}`)}
    ${row('Teléfono', valueOrFallback(data.customerPhone, 'No indicado'))}
    ${row('Evidencias', String(data.attachmentCount))}
  </table>
  <div style="background-color:#f9fafb;border-radius:8px;padding:12px 14px;color:#374151;margin-bottom:18px">${escapeHtml(data.description).replaceAll('\n', '<br>')}</div>
  <a href="${escapeHtml(data.adminUrl)}" style="display:block;background-color:${BRAND_NAVY};color:#ffffff;text-align:center;text-decoration:none;font-weight:bold;border-radius:8px;padding:12px">Abrir en Conectoca</a>
</td></tr>`);
  return {
    subject: `${copy.centralPrefix} ${data.caseNumber} — ${data.originLabel}`,
    html,
    text: `${copy.centralPrefix} ${data.caseNumber} — ${data.originLabel}\n\nFecha: ${formatDate(data.createdAt)}\nCorreo: ${data.customerEmail}\nNombre: ${valueOrFallback(data.customerName, 'No indicado')}\nTeléfono: ${valueOrFallback(data.customerPhone, 'No indicado')}\nDescripción: ${data.description}\nEvidencias: ${data.attachmentCount}\n\nAbrir: ${data.adminUrl}`,
  };
}
