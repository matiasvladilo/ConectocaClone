export interface ProfileRestoreAttempt {
  readonly generation: number;
  readonly sessionIdentity: string;
  readonly token: string;
}

export type ProfileSessionUpdate = 'adopted' | 'unchanged' | 'token-refreshed' | 'identity-changed';

export class ProfileRestoreCoordinator {
  private generation = 0;
  private activeAttempt: ProfileRestoreAttempt | null = null;
  private activeSession: { sessionIdentity: string; token: string } | null = null;

  invalidate(): number {
    this.generation += 1;
    this.activeAttempt = null;
    this.activeSession = null;
    return this.generation;
  }

  begin(sessionIdentity: string, token: string): ProfileRestoreAttempt;
  begin(sessionIdentity: string, token: string, expectedGeneration: number): ProfileRestoreAttempt | null;
  begin(
    sessionIdentity: string,
    token: string,
    expectedGeneration?: number,
  ): ProfileRestoreAttempt | null {
    if (expectedGeneration !== undefined && expectedGeneration !== this.generation) return null;

    const attempt: ProfileRestoreAttempt = Object.freeze({
      generation: this.generation + 1,
      sessionIdentity,
      token,
    });
    this.generation = attempt.generation;
    this.activeAttempt = attempt;
    this.activeSession = { sessionIdentity, token };
    return attempt;
  }

  updateSession(sessionIdentity: string, token: string): ProfileSessionUpdate {
    if (!this.activeSession) {
      this.activeSession = { sessionIdentity, token };
      return 'adopted';
    }

    if (this.activeSession.sessionIdentity !== sessionIdentity) {
      this.generation += 1;
      this.activeAttempt = null;
      this.activeSession = { sessionIdentity, token };
      return 'identity-changed';
    }

    if (this.activeSession.token !== token) {
      this.activeSession = { sessionIdentity, token };
      return 'token-refreshed';
    }

    return 'unchanged';
  }

  isCurrent(attempt: ProfileRestoreAttempt | null): attempt is ProfileRestoreAttempt {
    return attempt !== null
      && this.activeAttempt === attempt
      && attempt.generation === this.generation
      && attempt.sessionIdentity === this.activeSession?.sessionIdentity;
  }

  hasActiveAttempt(): boolean {
    return this.activeAttempt !== null;
  }

  matchesActiveSession(sessionIdentity: string, token: string): boolean {
    return this.activeSession?.sessionIdentity === sessionIdentity
      && this.activeSession.token === token;
  }

  currentToken(attempt: ProfileRestoreAttempt | null): string | null {
    return this.isCurrent(attempt) ? this.activeSession?.token ?? null : null;
  }

  canUseCachedUser(attempt: ProfileRestoreAttempt | null, cachedUserId: string): boolean {
    return this.isCurrent(attempt) && cachedUserId === attempt.sessionIdentity;
  }

  isGenerationCurrent(expectedGeneration: number): boolean {
    return this.generation === expectedGeneration;
  }
}
