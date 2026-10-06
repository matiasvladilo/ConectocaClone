import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ComplaintDetail, ComplaintFilters, ComplaintPage } from './types.ts';
import {
  applyComplaintFilter,
  getComplaintEmptyMessage,
  mergeComplaintEmailStatuses,
  replaceComplaintInPage,
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
