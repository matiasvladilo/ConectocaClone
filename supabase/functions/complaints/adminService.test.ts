import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeAdmin,
  createAdminComplaintService,
  parseComplaintListQuery,
  parseRetryKinds,
  parseStatus,
  type AdminComplaintRepository,
  type ComplaintDetail,
} from './adminService.ts';
import type { ComplaintEmailData } from './emailTemplates.ts';
import {
  createSupabaseComplaintRepository,
  type EmailResult,
} from './repository.ts';

const complaintDetail: ComplaintDetail = {
  id: 'case-1',
  kind: 'complaint',
  caseNumber: 'REC-2026-000001',
  originType: 'other',
  branchName: null,
  customerEmail: 'cliente@mail.cl',
  customerName: null,
  customerPhone: null,
  descriptionPreview: 'Descripción suficientemente larga',
  description: 'Descripción suficientemente larga',
  status: 'pending',
  hasEmailFailure: true,
  createdAt: '2026-10-05T12:00:00.000Z',
  confirmationEmailStatus: 'failed',
  notificationEmailStatus: 'failed',
  confirmationEmailError: 'provider down',
  notificationEmailError: 'provider down',
  attendedAt: null,
  attendedBy: null,
  attachments: [],
};

const complaintEmailFixture: ComplaintEmailData = {
  kind: 'complaint',
  caseNumber: 'REC-2026-000001',
  createdAt: '2026-10-05T12:00:00.000Z',
  originLabel: 'Otro / no sabe',
  customerEmail: 'cliente@mail.cl',
  customerName: null,
  customerPhone: null,
  description: 'Descripción suficientemente larga',
  attachmentCount: 0,
  adminUrl: 'https://conectoca.cl/?screen=complaints&case=case-1',
};

function adminRepository(
  overrides: Partial<AdminComplaintRepository> = {},
): AdminComplaintRepository {
  return {
    list: async query => ({
      data: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    }),
    getDetail: async () => complaintDetail,
    setStatus: async (_id, _businessId, update) => ({ ...complaintDetail, ...update }),
    createAttachmentUrl: async () => 'https://storage.example/signed',
    claimEmailRetry: async () => true,
    getEmailData: async () => complaintEmailFixture,
    completeEmailRetry: async () => undefined,
    ...overrides,
  };
}

function serviceForTest(repository: AdminComplaintRepository, overrides: {
  send?: (input: { from: string; to: string; subject: string; html: string; text: string }) => Promise<void>;
} = {}) {
  return createAdminComplaintService({
    repository,
    mailer: { send: overrides.send ?? (async () => undefined) },
    fromEmail: 'reclamos@empresa.cl',
    recipientEmail: 'central@empresa.cl',
    appPublicUrl: 'https://conectoca.cl',
    now: () => new Date('2026-10-05T13:00:00.000Z'),
  });
}

test('rechaza a un usuario no administrador', async () => {
  await assert.rejects(
    () => authorizeAdmin({
      token: 'token-local',
      expectedBusinessId: 'biz-1',
      auth: {
        getUser: async () => ({ id: 'user-1' }),
        getProfile: async () => ({ id: 'user-1', role: 'local', businessId: 'biz-1' }),
      },
    }),
    (error: any) => error.code === 'FORBIDDEN',
  );
});

test('rechaza token inválido y administrador de otro negocio', async () => {
  await assert.rejects(
    () => authorizeAdmin({
      token: 'invalid',
      expectedBusinessId: 'biz-1',
      auth: {
        getUser: async () => null,
        getProfile: async () => assert.fail('no debe consultar el perfil'),
      },
    }),
    (error: any) => error.code === 'UNAUTHORIZED',
  );

  await assert.rejects(
    () => authorizeAdmin({
      token: 'token-admin',
      expectedBusinessId: 'biz-1',
      auth: {
        getUser: async () => ({ id: 'admin-1' }),
        getProfile: async () => ({ id: 'admin-1', role: 'admin', businessId: 'biz-2' }),
      },
    }),
    (error: any) => error.code === 'FORBIDDEN',
  );
});

test('autoriza solo con usuario validado, perfil admin y negocio configurado', async () => {
  const calls: string[] = [];
  const admin = await authorizeAdmin({
    token: 'token-admin',
    expectedBusinessId: 'biz-1',
    auth: {
      getUser: async token => {
        calls.push(`user:${token}`);
        return { id: 'admin-1' };
      },
      getProfile: async userId => {
        calls.push(`profile:${userId}`);
        return { id: userId, role: 'admin', businessId: 'biz-1' };
      },
    },
  });

  assert.deepEqual(admin, { userId: 'admin-1', businessId: 'biz-1' });
  assert.deepEqual(calls, ['user:token-admin', 'profile:admin-1']);
});

test('el detalle siempre consulta por id y businessId', async () => {
  const calls: unknown[] = [];
  const service = serviceForTest(adminRepository({
    getDetail: async (id, businessId) => {
      calls.push({ operation: 'detail', id, businessId });
      return { ...complaintDetail, id };
    },
  }));

  await service.getDetail('case-1', { userId: 'admin-1', businessId: 'biz-1' });

  assert.deepEqual(calls[0], { operation: 'detail', id: 'case-1', businessId: 'biz-1' });
});

test('atender registra actor y fecha; reabrir los limpia', async () => {
  const updates: unknown[] = [];
  const service = serviceForTest(adminRepository({
    setStatus: async (_id, _businessId, update) => {
      updates.push(update);
      return { ...complaintDetail, ...update };
    },
  }));
  const admin = { userId: 'admin-1', businessId: 'biz-1' };

  await service.setStatus('case-1', 'attended', admin);
  await service.setStatus('case-1', 'pending', admin);

  assert.deepEqual(updates, [
    {
      status: 'attended',
      attendedAt: '2026-10-05T13:00:00.000Z',
      attendedBy: 'admin-1',
    },
    { status: 'pending', attendedAt: null, attendedBy: null },
  ]);
});

test('la URL firmada queda acotada al negocio y expira en 300 segundos', async () => {
  const calls: unknown[] = [];
  const service = serviceForTest(adminRepository({
    createAttachmentUrl: async (id, businessId, expiresIn) => {
      calls.push({ id, businessId, expiresIn });
      return 'https://storage.example/signed';
    },
  }));

  const result = await service.createAttachmentUrl(
    'attachment-1',
    { userId: 'admin-1', businessId: 'biz-1' },
  );

  assert.deepEqual(result, { url: 'https://storage.example/signed', expiresIn: 300 });
  assert.deepEqual(calls, [{ id: 'attachment-1', businessId: 'biz-1', expiresIn: 300 }]);
});

test('dos reintentos concurrentes producen un solo correo', async () => {
  let claimed = false;
  let sends = 0;
  const repository = adminRepository({
    claimEmailRetry: async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
    getEmailData: async () => complaintEmailFixture,
    completeEmailRetry: async () => undefined,
  });
  const service = serviceForTest(repository, {
    send: async () => { sends += 1; },
  });
  const admin = { userId: 'admin-1', businessId: 'biz-1' };

  await Promise.all([
    service.retryEmails('case-1', ['notification'], admin),
    service.retryEmails('case-1', ['notification'], admin),
  ]);

  assert.equal(sends, 1);
});

test('un reintento fallido completa el claim como failed sin lanzar', async () => {
  const completed: Array<{ businessId: string; kind: string; result: EmailResult }> = [];
  const service = serviceForTest(adminRepository({
    completeEmailRetry: async (_id, kind, result, businessId) => {
      completed.push({ businessId, kind, result });
    },
  }), {
    send: async () => { throw new Error('provider internals'); },
  });

  const result = await service.retryEmails(
    'case-1',
    ['confirmation'],
    { userId: 'admin-1', businessId: 'biz-1' },
  );

  assert.equal(result.confirmationEmailStatus, 'failed');
  assert.deepEqual(completed, [{
    businessId: 'biz-1',
    kind: 'confirmation',
    result: { status: 'failed', sentAt: null, error: 'provider internals' },
  }]);
});

test('valida paginación, enums, fechas, estado y tipos de reintento antes del repositorio', () => {
  assert.deepEqual(parseComplaintListQuery(new URLSearchParams('page=2&limit=25&status=pending&originType=branch&dateFrom=2026-10-01T00%3A00%3A00.000Z')), {
    page: 2,
    limit: 25,
    status: 'pending',
    originType: 'branch',
    dateFrom: '2026-10-01T00:00:00.000Z',
  });
  assert.throws(() => parseComplaintListQuery(new URLSearchParams('page=0')), /página/i);
  assert.throws(() => parseComplaintListQuery(new URLSearchParams('limit=101')), /límite/i);
  assert.throws(() => parseComplaintListQuery(new URLSearchParams('status=closed')), /estado/i);
  assert.throws(() => parseComplaintListQuery(new URLSearchParams('originType=store')), /origen/i);
  assert.throws(() => parseComplaintListQuery(new URLSearchParams('dateTo=mañana')), /fecha/i);
  assert.equal(parseStatus({ status: 'attended' }), 'attended');
  assert.throws(() => parseStatus({ status: 'closed' }), /estado/i);
  assert.deepEqual(parseRetryKinds({ kinds: ['notification', 'confirmation', 'notification'] }), [
    'notification',
    'confirmation',
  ]);
  assert.throws(() => parseRetryKinds({ kinds: [] }), /correo/i);
  assert.throws(() => parseRetryKinds({ kinds: ['all'] }), /correo/i);
});

test('rechaza fechas ISO cuyo día no existe en el calendario', () => {
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams('dateFrom=2026-02-30')),
    /fecha/i,
  );
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams('dateTo=2026-02-29T12%3A00%3A00.000Z')),
    /fecha/i,
  );
  assert.equal(
    parseComplaintListQuery(new URLSearchParams('dateFrom=2024-02-29')).dateFrom,
    '2024-02-29',
  );
});

test('rechaza el año ISO 0000', () => {
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams('dateFrom=0000-01-01')),
    /fecha/i,
  );
});

test('limita el offset UTC a catorce horas exactas', () => {
  assert.equal(
    parseComplaintListQuery(new URLSearchParams(
      'dateFrom=2026-10-05T12%3A00%3A00%2B14%3A00',
    )).dateFrom,
    '2026-10-05T12:00:00+14:00',
  );
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams(
      'dateFrom=2026-10-05T12%3A00%3A00%2B14%3A01',
    )),
    /fecha/i,
  );
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams(
      'dateFrom=2026-10-05T12%3A00%3A00%2B23%3A59',
    )),
    /fecha/i,
  );
});

test('compara dateTo de fecha sola usando el final de ese día', () => {
  const query = parseComplaintListQuery(new URLSearchParams(
    'dateFrom=2026-10-05T12%3A00%3A00.000Z&dateTo=2026-10-05',
  ));

  assert.equal(query.dateFrom, '2026-10-05T12:00:00.000Z');
  assert.equal(query.dateTo, '2026-10-05');
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams(
      'dateFrom=2026-10-06T00%3A00%3A00.000Z&dateTo=2026-10-05',
    )),
    /posterior/i,
  );
});

test('rechaza paginación infinita, insegura o cuyo rango no es seguro', () => {
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams(`page=${'9'.repeat(400)}`)),
    /página/i,
  );
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams('page=9007199254740992')),
    /página/i,
  );
  assert.throws(
    () => parseComplaintListQuery(new URLSearchParams('page=9007199254740991&limit=100')),
    /página/i,
  );
});

test('repositorio acota detalle y claim de correo por business_id', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const detailRow = {
    id: 'case-1', business_id: 'biz-1', case_number: 'REC-2026-000001',
    origin_type: 'other', branch_name_snapshot: null, customer_email: 'cliente@mail.cl',
    customer_name: null, customer_phone: null, description: 'Descripción suficientemente larga',
    status: 'pending', confirmation_email_status: 'failed', notification_email_status: 'failed',
    confirmation_email_error: 'failed', notification_email_error: 'failed', attended_at: null,
    attended_by: null, created_at: '2026-10-05T12:00:00.000Z', complaint_attachments: [],
  };
  function builder(result: { data: unknown; error: unknown }) {
    const chain: any = {
      select: (...args: unknown[]) => { calls.push({ method: 'select', args }); return chain; },
      update: (...args: unknown[]) => { calls.push({ method: 'update', args }); return chain; },
      eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return chain; },
      maybeSingle: async () => result,
    };
    return chain;
  }
  let nextResult = { data: detailRow as unknown, error: null as unknown };
  const repository = createSupabaseComplaintRepository({
    from: () => builder(nextResult),
    storage: { from: () => ({}) },
  } as any);

  await repository.getDetail('case-1', 'biz-1');
  nextResult = { data: { id: 'case-1' }, error: null };
  await repository.claimEmailRetry('case-1', 'biz-1', 'notification');

  const businessFilters = calls.filter(call => call.method === 'eq' && call.args[0] === 'business_id');
  assert.deepEqual(businessFilters, [
    { method: 'eq', args: ['business_id', 'biz-1'] },
    { method: 'eq', args: ['business_id', 'biz-1'] },
  ]);
  assert.ok(calls.some(call => call.method === 'eq'
    && call.args[0] === 'notification_email_status'
    && call.args[1] === 'failed'));
});

test('el listado acepta filtrar por tipo y rechaza tipos desconocidos', () => {
  assert.equal(parseComplaintListQuery(new URLSearchParams('kind=suggestion')).kind, 'suggestion');
  assert.throws(() => parseComplaintListQuery(new URLSearchParams('kind=queja')), /tipo/i);
});

test('repository.list aplica el filtro por tipo y por negocio', async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const result = { data: [] as unknown[], error: null, count: 0 };
  const chain: any = {
    select: (...args: unknown[]) => { calls.push({ method: 'select', args }); return chain; },
    eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return chain; },
    gte: (...args: unknown[]) => { calls.push({ method: 'gte', args }); return chain; },
    lte: (...args: unknown[]) => { calls.push({ method: 'lte', args }); return chain; },
    or: (...args: unknown[]) => { calls.push({ method: 'or', args }); return chain; },
    order: (...args: unknown[]) => { calls.push({ method: 'order', args }); return chain; },
    range: async (...args: unknown[]) => { calls.push({ method: 'range', args }); return result; },
  };
  const repository = createSupabaseComplaintRepository({
    from: () => chain,
    storage: { from: () => ({}) },
  } as any);

  const page = await repository.list({ page: 1, limit: 20, kind: 'suggestion' } as any, 'biz-1');

  assert.ok(calls.some(c => c.method === 'eq' && c.args[0] === 'kind' && c.args[1] === 'suggestion'));
  assert.ok(calls.some(c => c.method === 'eq' && c.args[0] === 'business_id' && c.args[1] === 'biz-1'));
  assert.equal(page.pagination.total, 0);
});
