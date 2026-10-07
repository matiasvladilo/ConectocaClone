import assert from 'node:assert/strict';
import test from 'node:test';

test('firstInvalidComplaintField follows the public form order and leaves attachment errors for the summary', async () => {
  const accessibility = await import('./formAccessibility.ts') as {
    firstInvalidComplaintField?: (errors: Record<string, string | undefined>) => string | null;
  };

  assert.equal(accessibility.firstInvalidComplaintField!({ email: 'Inválido', description: 'Corta' }), 'complaint-email');
  assert.equal(accessibility.firstInvalidComplaintField!({ branchId: 'Obligatoria' }), 'complaint-branch');
  assert.equal(accessibility.firstInvalidComplaintField!({ files: 'Inválido' }), null);
});

test('el tipo es el primer campo a enfocar', async () => {
  const { firstInvalidComplaintField } = await import('./formAccessibility.ts');
  assert.equal(
    firstInvalidComplaintField({ kind: 'x', email: 'y' }),
    'complaint-kind-complaint',
  );
});
