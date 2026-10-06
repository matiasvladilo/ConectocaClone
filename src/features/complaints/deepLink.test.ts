import assert from 'node:assert/strict';
import test from 'node:test';

import {
  complaintIdForRole,
  complaintIdFromLocation,
} from './deepLink.ts';

const complaintId = '62f44d1f-0be2-4c55-8ae0-98979b4d19f1';

test('extracts the complaint case only from the complaints screen deep link', () => {
  assert.equal(
    complaintIdFromLocation(`?screen=complaints&case=${complaintId}`),
    complaintId,
  );
  assert.equal(complaintIdFromLocation(`?screen=orders&case=${complaintId}`), null);
  assert.equal(complaintIdFromLocation('?screen=complaints'), null);
});

test('allows a pending complaint case only for the admin role', () => {
  assert.equal(complaintIdForRole('admin', complaintId), complaintId);

  for (const role of ['local', 'production', 'dispatch', 'worker', 'user', 'pastry']) {
    assert.equal(complaintIdForRole(role, complaintId), null, role);
  }
});

test('does not create an admin destination when no pending case exists', () => {
  assert.equal(complaintIdForRole('admin', null), null);
});
