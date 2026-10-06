import assert from 'node:assert/strict';
import test from 'node:test';

import { complaintDeepLinkDecision } from './deepLink.ts';
import { ProfileRestoreCoordinator } from './profileRestoreGuard.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => { resolve = next; });
  return { promise, resolve };
}

test('logout invalidates a pending profile fetch before it can repopulate the user or consume the deep link', async () => {
  const guard = new ProfileRestoreCoordinator();
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
  const guard = new ProfileRestoreCoordinator();
  const attemptA = guard.begin('user-a', 'token-a');
  const responseA = deferred<{ role: string }>();
  const responseB = deferred<{ role: string }>();
  const applied: Array<{ session: string; decision: string; shouldLoadComplaint: boolean }> = [];

  const completionA = responseA.promise.then(profile => {
    if (!guard.isCurrent(attemptA)) return;
    const decision = complaintDeepLinkDecision('remote', profile.role, 'case-a');
    applied.push({ session: 'a', decision: decision.kind, shouldLoadComplaint: decision.shouldLoadComplaint });
  });

  assert.equal(guard.updateSession('user-b', 'token-b'), 'identity-changed');
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
  const guard = new ProfileRestoreCoordinator();
  const loginA = guard.invalidate();
  const loginB = guard.invalidate();

  assert.equal(guard.begin('user-a', 'token-a', loginA), null);
  const attemptB = guard.begin('user-b', 'token-b', loginB);
  assert.ok(attemptB);
  assert.equal(guard.isCurrent(attemptB), true);
});

test('a cached profile is usable only for the exact active session identity', () => {
  const coordinator = new ProfileRestoreCoordinator();
  const attempt = coordinator.begin('user-b', 'token-b');

  assert.equal(coordinator.canUseCachedUser(attempt, 'user-a'), false);
  assert.equal(coordinator.canUseCachedUser(attempt, 'user-b'), true);
});

test('a token refresh for the same identity preserves the pending restore and applies it with the current token', async () => {
  const coordinator = new ProfileRestoreCoordinator();
  const attempt = coordinator.begin('user-a', 'token-old');
  const response = deferred<{ role: string }>();
  const applied: Array<{ decision: string; token: string | null }> = [];

  const completion = response.promise.then(profile => {
    if (!coordinator.isCurrent(attempt)) return;
    const decision = complaintDeepLinkDecision('remote', profile.role, 'case-a');
    applied.push({ decision: decision.kind, token: coordinator.currentToken(attempt) });
  });

  assert.equal(coordinator.updateSession('user-a', 'token-new'), 'token-refreshed');
  response.resolve({ role: 'admin' });
  await completion;

  assert.deepEqual(applied, [{ decision: 'open', token: 'token-new' }]);
  assert.equal(coordinator.isCurrent(attempt), true);
});

test('a delayed auth-error sign-out cannot clear a newer session', async () => {
  const coordinator = new ProfileRestoreCoordinator();
  const attemptA = coordinator.begin('user-a', 'token-a');
  const signOut = deferred<void>();
  let clearCount = 0;

  const staleErrorHandler = (async () => {
    await signOut.promise;
    if (!coordinator.isCurrent(attemptA)) return;
    clearCount += 1;
  })();

  const loginB = coordinator.invalidate();
  const attemptB = coordinator.begin('user-b', 'token-b', loginB);
  assert.ok(attemptB);
  signOut.resolve();
  await staleErrorHandler;

  assert.equal(clearCount, 0);
  assert.equal(coordinator.isCurrent(attemptB), true);
});
