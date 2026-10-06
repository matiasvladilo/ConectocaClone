import assert from 'node:assert/strict';
import test from 'node:test';

import { complaintDeepLinkDecision } from './deepLink.ts';
import { ProfileRestoreGuard } from './profileRestoreGuard.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

test('logout invalidates a pending profile fetch before it can repopulate the user or consume the deep link', async () => {
  const guard = new ProfileRestoreGuard();
  const attempt = guard.begin('user-a', 'token-a');
  const response = deferred<{ role: string }>();
  const applied: string[] = [];

  const completion = response.promise.then(profile => {
    if (!guard.isCurrent(attempt)) return;
    const decision = complaintDeepLinkDecision('remote', profile.role, 'case-a');
    applied.push(decision.kind);
  });

  guard.invalidate();
  response.resolve({ role: 'admin' });
  await completion;

  assert.deepEqual(applied, []);
  assert.equal(guard.isCurrent(attempt), false);
});

test('session B supersedes session A and a late A response cannot combine with the new token', async () => {
  const guard = new ProfileRestoreGuard();
  const attemptA = guard.begin('user-a', 'token-a');
  const responseA = deferred<{ role: string }>();
  const responseB = deferred<{ role: string }>();
  const applied: Array<{ session: string; decision: string; shouldLoadComplaint: boolean }> = [];

  const completionA = responseA.promise.then(profile => {
    if (!guard.isCurrent(attemptA)) return;
    const decision = complaintDeepLinkDecision('remote', profile.role, 'case-a');
    applied.push({ session: 'a', decision: decision.kind, shouldLoadComplaint: decision.shouldLoadComplaint });
  });

  const attemptB = guard.begin('user-b', 'token-b');
  const completionB = responseB.promise.then(profile => {
    if (!guard.isCurrent(attemptB)) return;
    const decision = complaintDeepLinkDecision('remote', profile.role, 'case-b');
    applied.push({ session: 'b', decision: decision.kind, shouldLoadComplaint: decision.shouldLoadComplaint });
  });

  responseB.resolve({ role: 'local' });
  await completionB;
  responseA.resolve({ role: 'admin' });
  await completionA;

  assert.deepEqual(applied, [{ session: 'b', decision: 'deny', shouldLoadComplaint: false }]);
  assert.equal(guard.matchesActiveSession('user-b', 'token-b'), true);
  assert.equal(guard.matchesActiveSession('user-a', 'token-a'), false);
});

test('an older login reservation cannot start a restore after a newer login begins', () => {
  const guard = new ProfileRestoreGuard();
  const loginA = guard.invalidate();
  const loginB = guard.invalidate();

  assert.equal(guard.begin('user-a', 'token-a', loginA), null);
  const attemptB = guard.begin('user-b', 'token-b', loginB);
  assert.ok(attemptB);
  assert.equal(guard.isCurrent(attemptB), true);
});
