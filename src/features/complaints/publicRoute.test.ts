import assert from 'node:assert/strict';
import test from 'node:test';

import { isPublicComplaintPath } from './publicRoute.ts';

test('isPublicComplaintPath recognizes the single public route with an optional trailing slash', () => {
  assert.equal(isPublicComplaintPath('/reclamos'), true);
  assert.equal(isPublicComplaintPath('/reclamos/'), true);
  assert.equal(isPublicComplaintPath('/reclamos////'), true);
});

test('isPublicComplaintPath does not intercept authenticated or nested routes', () => {
  assert.equal(isPublicComplaintPath('/'), false);
  assert.equal(isPublicComplaintPath('/reclamos/otro'), false);
  assert.equal(isPublicComplaintPath('/Reclamos'), false);
});

test('isPublicComplaintPath acepta la ruta nueva /opina', () => {
  assert.equal(isPublicComplaintPath('/opina'), true);
  assert.equal(isPublicComplaintPath('/opina/'), true);
  assert.equal(isPublicComplaintPath('/opina/otro'), false);
});
