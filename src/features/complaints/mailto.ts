// Con extensión .ts: los tests corren con `node --test`, que no resuelve
// imports de valores sin extensión (tsconfig tiene allowImportingTsExtensions).
import { complaintKindNoun } from './complaintKinds.ts';
import type { ComplaintKind } from './types';

export interface ComplaintMailtoInput {
  kind: ComplaintKind;
  email: string;
  caseNumber: string;
  customerName: string | null;
}

export function buildComplaintMailto(input: ComplaintMailtoInput): string {
  const noun = complaintKindNoun(input.kind);
  const greeting = input.customerName?.trim() ? `Hola ${input.customerName.trim()},` : 'Hola,';
  const subject = `Respuesta a tu ${noun} ${input.caseNumber}`;
  const body = `${greeting}\n\nTe escribimos en respuesta a tu ${noun} ${input.caseNumber}.\n\nSaludos,`;
  return `mailto:${encodeURIComponent(input.email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
