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
  logger,
}: {
  repository: ComplaintRepository;
  mailer?: { send(input: { from: string; to: string; subject: string; html: string; text: string }): Promise<void> } | null;
  logger?: { error(event: string, context: Record<string, unknown>): void };
}) {
  return createPublicComplaintService({
    businessId: 'biz-1',
    appPublicUrl: 'https://conectoca.cl',
    rateLimitSecret: 'secret',
    recipientEmail: 'central@empresa.cl',
    fromEmail: 'reclamos@empresa.cl',
    repository,
    mailer,
    logger,
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
  const telemetry: Array<{ event: string; context: Record<string, unknown> }> = [];
  const service = publicServiceForTest({
    repository: baseRepository({
      listBranches: async () => {
        throw new Error('database unavailable');
      },
    }),
    logger: { error: (event, context) => telemetry.push({ event, context }) },
  });

  const result = await service.getBranches();

  assert.deepEqual(result.branches, []);
  assert.equal(result.branchesUnavailable, true);
  assert.match(result.formToken, /^\d+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(telemetry, [{
    event: 'complaint_branch_list_failed',
    context: { error: 'database unavailable' },
  }]);
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

test('repositorio persiste caso y adjuntos con una sola RPC transaccional', async () => {
  const calls: Array<{ name: string; parameters: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ name, parameters });
      return {
        data: {
          id: 'case-1',
          case_number: 'REC-2026-000001',
          created_at: '2026-10-05T12:00:00.000Z',
          origin_type: 'other',
          branch_name_snapshot: null,
          customer_email: 'cliente@mail.cl',
          customer_name: null,
          customer_phone: null,
          description: 'Descripción suficientemente larga',
          attachment_count: 1,
        },
        error: null,
      };
    },
  };
  const repository = createSupabaseComplaintRepository(client as any);

  const result = await repository.insertComplaint({
    id: 'case-1',
    businessId: 'biz-1',
    originType: 'other',
    branchProfileId: null,
    branchNameSnapshot: null,
    customerEmail: 'cliente@mail.cl',
    customerName: null,
    customerPhone: null,
    description: 'Descripción suficientemente larga',
  }, [{
    id: 'attachment-1',
    complaintId: 'case-1',
    storagePath: 'biz-1/case-1/attachment-1-a.jpg',
    originalName: 'a.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1,
  }]);

  assert.equal(result.attachmentCount, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, 'insert_complaint_with_attachments');
  assert.deepEqual(calls[0]?.parameters.p_attachments, [{
    id: 'attachment-1',
    storage_path: 'biz-1/case-1/attachment-1-a.jpg',
    original_name: 'a.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 1,
  }]);
});

test('repositorio propaga inequívocamente el error de la RPC atómica', async () => {
  const repository = createSupabaseComplaintRepository({
    rpc: async () => ({ data: null, error: { message: 'atomic insert failed' } }),
  } as any);

  await assert.rejects(
    () => repository.insertComplaint({
      id: 'case-1',
      businessId: 'biz-1',
      originType: 'other',
      branchProfileId: null,
      branchNameSnapshot: null,
      customerEmail: 'cliente@mail.cl',
      customerName: null,
      customerPhone: null,
      description: 'Descripción suficientemente larga',
    }, []),
    /atomic insert failed/,
  );
});

test('mailer aborta Resend al vencer el timeout configurado', async () => {
  const mailer = createResendMailer({
    apiKey: 'resend-secret',
    timeoutMs: 5,
    fetch: async () => await new Promise<Response>(resolve => {
      setTimeout(() => resolve(new Response(null, { status: 200 })), 40);
    }),
  });

  await assert.rejects(
    () => mailer.send({
      from: 'reclamos@empresa.cl',
      to: 'central@empresa.cl',
      subject: 'Nuevo reclamo',
      html: '<p>Reclamo</p>',
      text: 'Reclamo',
    }),
    (error: Error) => error.message === 'Email provider timed out',
  );
});

test('inicia ambos correos sin esperar que termine el primero', async () => {
  let started = 0;
  let releaseFirst!: () => void;
  let markSecondStarted!: () => void;
  const firstMail = new Promise<void>(resolve => {
    releaseFirst = resolve;
  });
  const secondStarted = new Promise<void>(resolve => {
    markSecondStarted = resolve;
  });
  const service = publicServiceForTest({
    repository: baseRepository(),
    mailer: {
      send: async () => {
        started += 1;
        if (started === 2) markSecondStarted();
        if (started === 1) await firstMail;
      },
    },
  });

  const submission = service.submit(submissionForTest());
  const startedBeforeFirstFinished = await Promise.race([
    secondStarted.then(() => true),
    new Promise<false>(resolve => setTimeout(() => resolve(false), 100)),
  ]);
  releaseFirst();
  await submission;

  assert.equal(startedBeforeFirstFinished, true);
});

test('reporta fallos de limpieza y registro sin exponer datos del cliente', async () => {
  const telemetry: Array<{ event: string; context: Record<string, unknown> }> = [];
  let uploads = 0;
  const service = publicServiceForTest({
    repository: baseRepository({
      uploadEvidence: async () => {
        uploads += 1;
        if (uploads === 2) throw new Error('storage upload failed');
      },
      removeEvidence: async () => {
        throw new Error('storage cleanup failed');
      },
    }),
    logger: { error: (event, context) => telemetry.push({ event, context }) },
  });

  await assert.rejects(
    () => service.submit(submissionForTest({ files: [jpeg('a.jpg'), jpeg('b.jpg')] })),
    /storage upload failed/,
  );

  assert.deepEqual(telemetry, [{
    event: 'complaint_evidence_cleanup_failed',
    context: { pathCount: 1, error: 'storage cleanup failed' },
  }]);
  assert.equal(JSON.stringify(telemetry).includes('cliente@mail.cl'), false);
});

test('reporta fallos al registrar correo pero conserva el caso', async () => {
  const telemetry: Array<{ event: string; context: Record<string, unknown> }> = [];
  const service = publicServiceForTest({
    repository: baseRepository({
      updateEmailResult: async () => {
        throw new Error('database update failed');
      },
    }),
    logger: { error: (event, context) => telemetry.push({ event, context }) },
  });

  const result = await service.submit(submissionForTest());

  assert.equal(result.caseNumber, 'REC-2026-000001');
  assert.equal(telemetry.length, 2);
  assert.deepEqual(telemetry.map(item => item.event), [
    'complaint_email_result_update_failed',
    'complaint_email_result_update_failed',
  ]);
  assert.equal(JSON.stringify(telemetry).includes('cliente@mail.cl'), false);
});

test('sin correo configurado guarda el caso y deja ambos correos sin enviar', async () => {
  const events: string[] = [];
  const repository = baseRepository({
    insertComplaint: async () => {
      events.push('insert');
      return storedComplaint;
    },
    updateEmailResult: async (_id, kind) => {
      events.push(`result:${kind}`);
    },
  });
  const service = publicServiceForTest({ repository, mailer: null });

  const result = await service.submit(submissionForTest());

  assert.deepEqual(events, ['insert']);
  assert.equal(result.caseNumber, storedComplaint.caseNumber);
  assert.equal(result.confirmationEmailStatus, 'pending');
  assert.equal(result.notificationEmailStatus, 'pending');
});
