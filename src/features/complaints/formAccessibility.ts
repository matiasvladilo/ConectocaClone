import type { ComplaintValidationErrors } from './types';

const FIELD_IDS: Array<[keyof ComplaintValidationErrors, string]> = [
  ['kind', 'complaint-kind-complaint'],
  ['originType', 'complaint-origin'],
  ['branchId', 'complaint-branch'],
  ['email', 'complaint-email'],
  ['name', 'complaint-name'],
  ['phone', 'complaint-phone'],
  ['description', 'complaint-description'],
];

export function firstInvalidComplaintField(errors: ComplaintValidationErrors): string | null {
  return FIELD_IDS.find(([field]) => errors[field])?.[1] ?? null;
}
