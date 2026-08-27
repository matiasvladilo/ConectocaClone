const ORDER_EDIT_ROLES = new Set(['admin', 'dispatch']);

export function canEditOrder(role?: string): boolean {
  return Boolean(role && ORDER_EDIT_ROLES.has(role));
}
