import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFormToken, type RawComplaintFields } from './domain.ts';
import {
  createPublicComplaintService,
  type PublicComplaintSubmission,
} from './publicService.ts';
import {
  createSupabaseComplaintRepository,
  type ComplaintRepository,
  type StoredComplaint,
} from './repository.ts';
import { createResendMailer } from './mailer.ts';

const storedComplaint: StoredComplaint = {
  id: 'case-1',
  caseNumber: 'REC-2026-000001',
  createdAt: '2026-10-05T12:00:00.000Z',
  originType: 'other',
  branchName: null,
  customerEmail: 'cliente@mail.cl',
  customerName: null,
  customerPhone: null,
  description: 'Descripción suficientemente larga',
  attachmentCount: 0,
};

function baseRepository(overrides: Partial<ComplaintRepository> = {}): ComplaintRepository {
  return {
    listBranches: async () => [],
    findBranch: async () => null,
    consumeRateLimit: async () => true,
    uploadEvidence: async () => undefined,
    removeEvidence: async () => undefined,
    insertComplaint: async () => storedComplaint,
    updateEmailResult: async () => undefined,
    ...overrides,
  };
}

const VALID_FORM_TOKEN = await createFormToken(
  'secret',
  new Date('2026-10-05T12:00:00.000Z').getTime(),
);

function jpeg(name: string): File {
  return new File([new Uint8Array([1])], name, { type: 'image/jpeg' });
}

function submissionForTest(
  overrides: Partial<RawComplaintFields> & { files?: File[] } = {},
): PublicComplaintSubmission {
  const { files = [], ...fieldOverrides } = overrides;
  return {
    fields: {
      originType: 'other',
      branchId: '',
      email: 'cliente@mail.cl',
      name: '',
      phone: '',
      description: 'Descripción suficientemente larga',
      honeypot: '',
      ...fieldOverrides,
    },
    files,
    formToken: VALID_FORM_TOKEN,
    ip: '203.0.113.10',
  };
}

function publicServiceForTest({
  repository,
  mailer = { send: async () => undefined },
}: {
  repository: ComplaintRepository;
  mailer?: { send(input: { from: string; to: string; subject: string; html: string; text: string }): Promise<void> };
}) {
  return createPublicComplaintService({
    businessId: 'biz-1',
    appPublicUrl: 'https://conectoca.cl',
    rateLimitSecret: 'secret',
    recipientEmail: 'central@empresa.cl',
    fromEmail: 'reclamos@empresa.cl',
    repository,
    mailer,
    now: () => new Date('2026-10-05T12:00:05.000Z'),
  });
}

test('guarda primero y conserva el caso si falla el correo central', async () => {
  const events: string[] = [];
  const repository = baseRepository({
    consumeRateLimit: async () => {
      events.push('rate-limit');
      return true;
    },
    insertComplaint: async () => {
      events.push('insert');
      return storedComplaint;
    },
    updateEmailResult: async (_id, kind, result) => {
      events.push(`result:${kind}:${result.status}`);
    },
  });
  const service = publicServiceForTest({
    repository,
    mailer: {
      send: async ({ to }) => {
        events.push(`mail:${to}`);
        if (to === 'central@empresa.cl') throw new Error('provider down');
      },
    },
  });

  const result = await service.submit(submissionForTest());

  assert.equal(result.caseNumber, 'REC-2026-000001');
  assert.deepEqual(events.slice(0, 2), ['rate-limit', 'insert']);
  assert.deepEqual(events.filter(event => event.startsWith('mail:')), [
    'mail:cliente@mail.cl',
    'mail:central@empresa.cl',
  ]);
  assert.equal(result.confirmationEmailStatus, 'sent');
  assert.equal(result.notificationEmailStatus, 'failed');
});

test('usa solo el negocio configurado y conserva el nombre de sucursal del servidor', async () => {
  const lookups: Array<{ businessId: string; branchId: string }> = [];
  let insertedBusinessId = '';
  let insertedBranchName: string | null = null;
  const repository = baseRepository({
    findBranch: async (businessId, branchId) => {
      lookups.push({ businessId, branchId });
      return { id: branchId, name: 'Sucursal Centro' };
    },
    insertComplaint: async input => {
      insertedBusinessId = input.businessId;
      insertedBranchName = input.branchNameSnapshot;
      return { ...storedComplaint, originType: 'branch', branchName: 'Sucursal Centro' };
    },
  });

  await publicServiceForTest({ repository }).submit(submissionForTest({
    originType: 'branch',
    branchId: 'branch-1',
  }));

  assert.deepEqual(lookups, [{ businessId: 'biz-1', branchId: 'branch-1' }]);
  assert.equal(insertedBusinessId, 'biz-1');
  assert.equal(insertedBranchName, 'Sucursal Centro');
});

test('rechaza una sucursal que ya no existe', async () => {
  const service = publicServiceForTest({ repository: baseRepository() });
  await assert.rejects(
    () => service.submit(submissionForTest({ originType: 'branch', branchId: 'missing' })),
    (error: any) => error.code === 'INVALID_BRANCH',
  );
});

test('rechaza cuando el límite fue agotado', async () => {
  const service = publicServiceForTest({
    repository: baseRepository({ consumeRateLimit: async () => false }),
  });
  await assert.rejects(
    () => service.submit(submissionForTest()),
    (error: any) => error.code === 'RATE_LIMITED',
  );
});

test('limpia archivos previos si una carga posterior falla', async () => {
  const removed: string[][] = [];
  let uploads = 0;
  const service = publicServiceForTest({
    repository: baseRepository({
      uploadEvidence: async () => {
        uploads += 1;
        if (uploads === 2) throw new Error('storage');
      },
      removeEvidence: async paths => {
        removed.push(paths);
      },
    }),
  });

  await assert.rejects(() => service.submit(submissionForTest({
    files: [jpeg('a.jpg'), jpeg('b.jpg')],
  })));
  assert.equal(removed.length, 1);
  assert.equal(removed[0].length, 1);
});

test('si falla el listado entrega token sin inventar sucursales', async () => {
  const service = publicServiceForTest({
    repository: baseRepository({
      listBranches: async () => {
        throw new Error('database unavailable');
      },
    }),
  });

  const result = await service.getBranches();

  assert.deepEqual(result.branches, []);
  assert.equal(result.branchesUnavailable, true);
  assert.match(result.formToken, /^\d+\.[A-Za-z0-9_-]+$/);
});

test('el repositorio sube evidencias solo al bucket privado dedicado', async () => {
  const buckets: string[] = [];
  const uploads: string[] = [];
  const client = {
    storage: {
      from: (bucket: string) => {
        buckets.push(bucket);
        return {
          upload: async (path: string) => {
            uploads.push(path);
            return { data: { path }, error: null };
          },
        };
      },
    },
  };
  const repository = createSupabaseComplaintRepository(client as any);

  await repository.uploadEvidence('biz-1/case-1/file-1-a.jpg', jpeg('a.jpg'));

  assert.deepEqual(buckets, ['complaint-evidence']);
  assert.deepEqual(uploads, ['biz-1/case-1/file-1-a.jpg']);
});

test('mailer usa Resend con bearer y reduce errores no exitosos', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const mailer = createResendMailer({
    apiKey: 'resend-secret',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response('{"message":"provider internals"}', { status: 503 });
    },
  });

  await assert.rejects(
    () => mailer.send({
      from: 'reclamos@empresa.cl',
      to: 'central@empresa.cl',
      subject: 'Nuevo reclamo',
      html: '<p>Reclamo</p>',
      text: 'Reclamo',
    }),
    (error: Error) => error.message === 'Email provider rejected the request (503)',
  );
  assert.equal(calls[0]?.url, 'https://api.resend.com/emails');
  assert.equal(new Headers(calls[0]?.init?.headers).get('Authorization'), 'Bearer resend-secret');
});
