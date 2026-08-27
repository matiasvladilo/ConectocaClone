# Restricción de edición de pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar pedidos solo a `dispatch` y `admin`.

**Architecture:** La interfaz usa una regla pura para la visibilidad y el diálogo. El endpoint `PUT /orders/:id` aplica la misma lista de permisos antes de actualizar datos.

**Tech Stack:** React, TypeScript, Node test runner, Hono/Supabase Edge Function.

## Global Constraints

- Roles autorizados: exactamente `dispatch` y `admin`.
- No cambiar creación, eliminación, estados ni recepción de pedidos.

---

### Task 1: Regla de permiso

**Files:**
- Create: `src/utils/orderPermissions.ts`
- Test: `src/utils/orderPermissions.test.ts`

**Interfaces:** Produces `canEditOrder(role?: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
test('canEditOrder solo autoriza a dispatch y admin', () => {
  assert.equal(canEditOrder('dispatch'), true);
  assert.equal(canEditOrder('admin'), true);
  for (const role of ['local', 'production', 'user', 'worker', 'pastry']) {
    assert.equal(canEditOrder(role), false);
  }
  assert.equal(canEditOrder(undefined), false);
});
```

- [ ] **Step 2: Run the test red**

Run `node --test src/utils/orderPermissions.test.ts`; it must fail because the module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
const ORDER_EDIT_ROLES = new Set(['admin', 'dispatch']);
export function canEditOrder(role?: string): boolean {
  return Boolean(role && ORDER_EDIT_ROLES.has(role));
}
```

- [ ] **Step 4: Run the test green**

Run `node --test src/utils/orderPermissions.test.ts`; it must pass.

- [ ] **Step 5: Commit**

Run `git add src/utils/orderPermissions.ts src/utils/orderPermissions.test.ts` followed by `git commit -m "feat: define order edit permission"`.

### Task 2: Controles y diálogo de interfaz

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/OrderDetail.tsx`
- Modify: `src/components/OrderHistory.tsx`
- Modify: `src/components/DispatchOrders.tsx`
- Modify: `src/components/EditOrderDialog.tsx`

**Interfaces:** Every edit entry point passes `userRole` to `EditOrderDialog`; buttons render only when `canEditOrder(userRole)` is true; the dialog refuses `handleSave` otherwise.

- [ ] **Step 1: Use the tested rule in every edit entry point**

Add `const canEdit = canEditOrder(userRole)` in detail/history, combine it with the existing editable-status condition, and provide role props from App and the dispatch screen.

- [ ] **Step 2: Guard saving in the dialog**

At the first line of `handleSave`, reject unauthorised roles with `toast.error('No tienes permiso para editar este pedido')` and return.

- [ ] **Step 3: Run verification**

Run `npm test && npm run build`; both commands must pass.

- [ ] **Step 4: Commit**

Run `git add src/App.tsx src/components/OrderDetail.tsx src/components/OrderHistory.tsx src/components/DispatchOrders.tsx src/components/EditOrderDialog.tsx` followed by `git commit -m "fix: restrict order editing in the interface"`.

### Task 3: Endpoint authorization

**Files:**
- Modify: `supabase/functions/make-server-6d979413/index.ts`

**Interfaces:** `PUT /orders/:id` returns `{ error: 'No tienes permiso para editar este pedido' }` with HTTP 403 for every role except `admin` and `dispatch`.

- [ ] **Step 1: Verify current behavior is too permissive**

Run `rg -n "allowedRoles = \['admin', 'production', 'dispatch', 'local'\]" supabase/functions/make-server-6d979413/index.ts`; it must find the current allowlist.

- [ ] **Step 2: Implement the server allowlist**

Replace it with `const allowedRoles = ['admin', 'dispatch'];` and reject any role not included, before `await c.req.json()` and any database update.

- [ ] **Step 3: Verify and commit**

Run `rg -n -A6 "const allowedRoles = \['admin', 'dispatch'\]" supabase/functions/make-server-6d979413/index.ts && npm test && npm run build`, then commit as `fix: enforce order edit roles on server`.
