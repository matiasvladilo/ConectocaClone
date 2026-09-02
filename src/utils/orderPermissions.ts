const ORDER_EDIT_ROLES = new Set(['admin', 'dispatch', 'production']);
const EDITABLE_ORDER_STATUSES = new Set(['pending', 'in_progress', 'completed']);

export function canEditOrder(role?: string): boolean {
  return Boolean(role && ORDER_EDIT_ROLES.has(role));
}

export function isOrderEditableStatus(status?: string): boolean {
  return Boolean(status && EDITABLE_ORDER_STATUSES.has(status));
}
