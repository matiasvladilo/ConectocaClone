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
    <h1>${KIND_COPY[data.kind].noun} ${escapeHtml(data.caseNumber)}</h1>
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
  const copy = KIND_COPY[data.kind];
  const caseNumber = escapeHtml(data.caseNumber);
  return {
    subject: `${copy.title} — ${data.caseNumber}`,
    html: `<p>${escapeHtml(copy.title)}. Tu número de caso es <strong>${caseNumber}</strong>.</p>${commonHtml(data)}<p>${escapeHtml(copy.message)}</p>`,
    text: `${copy.title}. Tu número de caso es ${data.caseNumber}.\n\nFecha: ${data.createdAt}\nOrigen: ${data.originLabel}\n\n${copy.message}`,
  };
}

export function buildCentralNotification(data: ComplaintEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const copy = KIND_COPY[data.kind];
  const adminUrl = escapeHtml(data.adminUrl);
  return {
    subject: `${copy.centralPrefix} ${data.caseNumber} — ${data.originLabel}`,
    html: `${commonHtml(data)}<p><a href="${adminUrl}">Abrir en Conectoca</a></p>`,
    text: `${copy.centralPrefix} ${data.caseNumber} — ${data.originLabel}\n\nCorreo: ${data.customerEmail}\nNombre: ${valueOrFallback(data.customerName, 'No indicado')}\nTeléfono: ${valueOrFallback(data.customerPhone, 'No indicado')}\nDescripción: ${data.description}\nEvidencias: ${data.attachmentCount}\n\nAbrir: ${data.adminUrl}`,
  };
}
