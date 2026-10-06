export interface ComplaintMailtoInput {
  email: string;
  caseNumber: string;
  customerName: string | null;
}

export function buildComplaintMailto(input: ComplaintMailtoInput): string {
  const greeting = input.customerName?.trim() ? `Hola ${input.customerName.trim()},` : 'Hola,';
  const subject = `Respuesta a tu reclamo ${input.caseNumber}`;
  const body = `${greeting}\n\nTe escribimos en respuesta a tu reclamo ${input.caseNumber}.\n\nSaludos,`;
  return `mailto:${encodeURIComponent(input.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
