import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ComplaintDetail, ComplaintFilters, ComplaintPage } from './types.ts';
import {
  applyComplaintFilter,
  applyComplaintOriginFilter,
  complaintOriginFilterValue,
  complaintStatusCountFilters,
  ComplaintDetailRequestGuard,
  getComplaintEmptyMessage,
  isCompactPaginationWidth,
  mergeComplaintEmailStatuses,
  normalizeComplaintPage,
  replaceComplaintInPage,
  requestedEmailsAreSending,
} from './adminPanelState.ts';

const filters: ComplaintFilters = {
  search: '',
  status: '',
  originType: '',
  branchId: '',
  dateFrom: '',
  dateTo: '',
  page: 4,
  limit: 20,
};

const complaint: ComplaintDetail = {
  id: 'case-1',
  caseNumber: 'REC-2026-000001',
  originType: 'other',
  branchName: null,
  customerEmail: 'cliente@example.com',
  customerName: 'Ana',
  customerPhone: null,
  descriptionPreview: 'Producto en mal estado',
  description: 'El producto recibido estaba en mal estado.',
  status: 'pending',
  hasEmailFailure: true,
  confirmationEmailStatus: 'failed',
  notificationEmailStatus: 'sent',
  confirmationEmailError: 'Proveedor no disponible',
  notificationEmailError: null,
  attendedAt: null,
  attendedBy: null,
  attachments: [],
  createdAt: '2026-10-05T12:00:00.000Z',
};

test('cualquier filtro aplicado reinicia la paginación sin mutar el valor anterior', () => {
  const next = applyComplaintFilter(filters, { status: 'pending' });

  assert.equal(next.page, 1);
  assert.equal(next.status, 'pending');
  assert.equal(filters.page, 4);
  assert.equal(filters.status, '');
});

test('el vacío diferencia una bandeja nueva de filtros sin resultados', () => {
  assert.equal(getComplaintEmptyMessage(filters), 'Todavía no hay reclamos recibidos.');
  assert.equal(
    getComplaintEmptyMessage({ ...filters, dateFrom: '2026-10-01' }),
    'Ningún reclamo coincide con los filtros.',
  );
});

test('el resultado de reintentar correos actualiza estados y recalcula la advertencia', () => {
  const next = mergeComplaintEmailStatuses(complaint, {
    confirmationEmailStatus: 'sent',
    notificationEmailStatus: 'sent',
  });

  assert.equal(next.confirmationEmailStatus, 'sent');
  assert.equal(next.hasEmailFailure, false);
  assert.equal(complaint.confirmationEmailStatus, 'failed');
});

test('un cambio de estado reemplaza solo la fila correspondiente', () => {
  const untouched = { ...complaint, id: 'case-2', caseNumber: 'REC-2026-000002' };
  const page: ComplaintPage = {
    data: [complaint, untouched],
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
  };
  const attended = {
    ...complaint,
    status: 'attended' as const,
    attendedAt: '2026-10-06T12:00:00.000Z',
    attendedBy: 'admin-1',
  };

  const next = replaceComplaintInPage(page, attended);

  assert.equal(next.data[0]?.status, 'attended');
  assert.equal(next.data[1], untouched);
  assert.equal(page.data[0]?.status, 'pending');
});

test('el guard invalida una mutación al cambiar o cerrar el detalle', () => {
  const guard = new ComplaintDetailRequestGuard();
  const first = guard.begin('case-1');

  assert.equal(guard.isCurrent(first, 'case-1'), true);

  const second = guard.begin('case-2');
  assert.equal(first.signal.aborted, true);
  assert.equal(guard.isCurrent(first, 'case-1'), false);
  assert.equal(guard.isCurrent(second, 'case-2'), true);

  guard.invalidate();
  assert.equal(second.signal.aborted, true);
  assert.equal(guard.isCurrent(second, 'case-2'), false);
});

test('corrige una página que quedó fuera del último resultado disponible', () => {
  assert.equal(normalizeComplaintPage(4, 2), 2);
  assert.equal(normalizeComplaintPage(2, 0), 1);
  assert.equal(normalizeComplaintPage(2, 5), 2);
});

test('solo reconcilia si uno de los correos solicitados sigue en sending', () => {
  const statuses = {
    confirmationEmailStatus: 'sending' as const,
    notificationEmailStatus: 'sent' as const,
  };

  assert.equal(requestedEmailsAreSending(statuses, ['confirmation']), true);
  assert.equal(requestedEmailsAreSending(statuses, ['notification']), false);
});

test('al reintentar limpia el error anterior aunque la respuesta no traiga uno nuevo', () => {
  const next = mergeComplaintEmailStatuses(complaint, {
    confirmationEmailStatus: 'failed',
    notificationEmailStatus: 'sent',
  }, ['confirmation']);

  assert.equal(next.confirmationEmailError, null);
});

test('la paginación compacta cambia reactivamente bajo 640 px', () => {
  assert.equal(isCompactPaginationWidth(639), true);
  assert.equal(isCompactPaginationWidth(640), false);
});

test('origin selector value reflects branch, production, other and all', () => {
  assert.equal(complaintOriginFilterValue(filters), '');
  assert.equal(complaintOriginFilterValue({ ...filters, originType: 'production' }), 'production');
  assert.equal(complaintOriginFilterValue({ ...filters, originType: 'other' }), 'other');
  assert.equal(complaintOriginFilterValue({ ...filters, originType: 'branch', branchId: 'b-1' }), 'branch:b-1');
  assert.equal(complaintOriginFilterValue({ ...filters, originType: 'branch' }), 'branch');
});

test('applying the origin selector sets origin and branch together and resets the page', () => {
  assert.deepEqual(
    applyComplaintOriginFilter(filters, 'branch:b-1'),
    { ...filters, originType: 'branch', branchId: 'b-1', page: 1 },
  );
  assert.deepEqual(
    applyComplaintOriginFilter({ ...filters, originType: 'branch', branchId: 'b-1' }, 'production'),
    { ...filters, originType: 'production', branchId: '', page: 1 },
  );
  assert.deepEqual(
    applyComplaintOriginFilter({ ...filters, originType: 'other' }, ''),
    { ...filters, originType: '', branchId: '', page: 1 },
  );
  assert.deepEqual(
    applyComplaintOriginFilter(filters, 'unknown'),
    { ...filters, originType: '', branchId: '', page: 1 },
  );
});

test('status count filters ignore the current search and request a single row', () => {
  assert.deepEqual(complaintStatusCountFilters('pending'), {
    search: '', status: 'pending', originType: '', branchId: '', dateFrom: '', dateTo: '', page: 1, limit: 1,
  });
});
