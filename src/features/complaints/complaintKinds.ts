import type { ComplaintKind } from './types';

export const COMPLAINT_KIND_OPTIONS: ReadonlyArray<{ value: ComplaintKind; label: string; hint: string }> = [
  { value: 'complaint', label: 'Reclamo', hint: 'Algo no salió como esperabas' },
  { value: 'suggestion', label: 'Sugerencia', hint: 'Una idea para mejorar' },
  { value: 'compliment', label: 'Felicitación', hint: 'Algo que te gustó' },
];

const NOUNS: Record<ComplaintKind, string> = {
  complaint: 'reclamo',
  suggestion: 'sugerencia',
  compliment: 'felicitación',
};

const SUCCESS: Record<ComplaintKind, { title: string; message: string }> = {
  complaint: {
    title: 'Recibimos tu reclamo',
    message: 'Lamentamos lo ocurrido. Lo vamos a revisar y te responderemos por correo.',
  },
  suggestion: {
    title: 'Gracias por tu sugerencia',
    message: 'Ya la estamos revisando con el equipo para seguir mejorando.',
  },
  compliment: {
    title: '¡Gracias por felicitarnos!',
    message: 'Le haremos llegar tus palabras al equipo.',
  },
};

const PLACEHOLDERS: Record<ComplaintKind | '', string> = {
  '': 'Cuéntanos qué pasó, cuándo y cualquier detalle que nos ayude a entenderlo.',
  complaint: 'Cuéntanos qué pasó, cuándo ocurrió y cualquier detalle que nos ayude a entenderlo.',
  suggestion: 'Cuéntanos tu idea y cómo crees que podríamos mejorar.',
  compliment: 'Cuéntanos qué te gustó y, si quieres, quién te atendió.',
};

export const COMPLAINT_KIND_BADGE_CLASSES: Record<ComplaintKind, string> = {
  complaint: 'bg-red-100 text-red-800',
  suggestion: 'bg-blue-100 text-blue-800',
  compliment: 'bg-green-100 text-green-800',
};

export function complaintKindLabel(kind: ComplaintKind): string {
  return COMPLAINT_KIND_OPTIONS.find(option => option.value === kind)?.label ?? 'Reclamo';
}

export function complaintKindNoun(kind: ComplaintKind): string {
  return NOUNS[kind] ?? 'reclamo';
}

export function complaintKindSuccess(kind: ComplaintKind): { title: string; message: string } {
  return SUCCESS[kind] ?? SUCCESS.complaint;
}

export function complaintDescriptionPlaceholder(kind: ComplaintKind | ''): string {
  return PLACEHOLDERS[kind] ?? PLACEHOLDERS[''];
}
