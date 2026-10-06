export interface ProfileRestoreAttempt {
  readonly generation: number;
  readonly sessionIdentity: string;
  readonly token: string;
}

export class ProfileRestoreGuard {
  private generation = 0;
  private activeAttempt: ProfileRestoreAttempt | null = null;

  invalidate(): number {
    this.generation += 1;
    this.activeAttempt = null;
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
    return attempt;
  }

  isCurrent(attempt: ProfileRestoreAttempt | null): attempt is ProfileRestoreAttempt {
    return attempt !== null
      && this.activeAttempt === attempt
      && attempt.generation === this.generation
      && attempt.sessionIdentity === this.activeAttempt.sessionIdentity
      && attempt.token === this.activeAttempt.token;
  }

  hasActiveAttempt(): boolean {
    return this.activeAttempt !== null;
  }

  matchesActiveSession(sessionIdentity: string, token: string): boolean {
    return this.activeAttempt?.sessionIdentity === sessionIdentity
      && this.activeAttempt.token === token;
  }
}
