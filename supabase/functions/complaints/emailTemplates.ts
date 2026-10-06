import { escapeHtml } from './domain.ts';

export interface ComplaintEmailData {
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

function valueOrFallback(value: string | null, fallback: string): string {
  return value?.trim() || fallback;
}

function commonHtml(data: ComplaintEmailData): string {
  const customerName = escapeHtml(valueOrFallback(data.customerName, 'No indicado'));
  const customerPhone = escapeHtml(valueOrFallback(data.customerPhone, 'No indicado'));
  const description = escapeHtml(data.description).replaceAll('\n', '<br>');
  const origin = escapeHtml(data.originLabel);
  const date = escapeHtml(data.createdAt);
  const email = escapeHtml(data.customerEmail);
  return `
    <h1>Reclamo ${escapeHtml(data.caseNumber)}</h1>
    <p><strong>Fecha:</strong> ${date}</p>
    <p><strong>Origen:</strong> ${origin}</p>
    <p><strong>Nombre:</strong> ${customerName}</p>
    <p><strong>Correo:</strong> ${email}</p>
    <p><strong>Teléfono:</strong> ${customerPhone}</p>
    <p><strong>Descripción:</strong><br>${description}</p>
    <p><strong>Evidencias:</strong> ${data.attachmentCount}</p>`;
}

export function buildCustomerConfirmation(data: ComplaintEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const caseNumber = escapeHtml(data.caseNumber);
  return {
    subject: `Recibimos tu reclamo — ${data.caseNumber}`,
    html: `<p>Recibimos tu reclamo. Tu número de caso es <strong>${caseNumber}</strong>.</p>${commonHtml(data)}<p>Te responderemos por correo.</p>`,
    text: `Recibimos tu reclamo. Tu número de caso es ${data.caseNumber}.\n\nFecha: ${data.createdAt}\nOrigen: ${data.originLabel}\n\nTe responderemos por correo.`,
  };
}

export function buildCentralNotification(data: ComplaintEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const adminUrl = escapeHtml(data.adminUrl);
  return {
    subject: `Nuevo reclamo ${data.caseNumber} — ${data.originLabel}`,
    html: `${commonHtml(data)}<p><a href="${adminUrl}">Abrir reclamo en Conectoca</a></p>`,
    text: `Nuevo reclamo ${data.caseNumber} — ${data.originLabel}\n\nCorreo: ${data.customerEmail}\nNombre: ${valueOrFallback(data.customerName, 'No indicado')}\nTeléfono: ${valueOrFallback(data.customerPhone, 'No indicado')}\nDescripción: ${data.description}\nEvidencias: ${data.attachmentCount}\n\nAbrir reclamo: ${data.adminUrl}`,
  };
}
