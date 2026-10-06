import assert from 'node:assert/strict';
import test from 'node:test';

test('readComplaintResponse preserves status, code and message from a public API failure', async () => {
  const api = await import('./apiError.ts') as {
    readComplaintResponse?: <T>(response: Response) => Promise<T>;
    ComplaintApiError?: new (...args: never[]) => Error;
  };
  const response = new Response(JSON.stringify({
    code: 'INVALID_FORM_TOKEN',
    message: 'El formulario expiró. Recarga e intenta nuevamente.',
  }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  await assert.rejects(
    () => api.readComplaintResponse!<never>(response),
    (error: unknown) => {
      assert.ok(api.ComplaintApiError && error instanceof api.ComplaintApiError);
      assert.equal((error as { status: number }).status, 400);
      assert.equal((error as { code: string }).code, 'INVALID_FORM_TOKEN');
      assert.equal((error as Error).message, 'El formulario expiró. Recarga e intenta nuevamente.');
      return true;
    },
  );
});
