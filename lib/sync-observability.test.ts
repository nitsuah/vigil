import { describe, expect, it } from 'vitest';
import { createSyncObservability } from './sync-observability';

describe('createSyncObservability', () => {
  it('emits one terminal event per started phase, including background failure', () => {
    const events: unknown[] = [];
    let time = 100;
    const observe = createSyncObservability({
      emit: (event) => events.push(event),
      now: () => time,
      correlationId: () => 'opaque-1',
    });

    observe.finish('database', 'success');
    observe.start('auth');
    time = 150;
    observe.finish('auth', 'success');
    observe.finish('auth', 'failure');
    observe.start('auth');
    observe.start('completion');
    observe.finish('completion', 'failure', {
      errorClass: 'unknown',
      counts: { total: 2, failed: 1 },
    });

    expect(events).toHaveLength(4);
    expect(events[1]).toMatchObject({
      phase: 'auth',
      event: 'phase_finished',
      elapsedMs: 50,
      outcome: 'success',
    });
    expect(events[3]).toMatchObject({
      phase: 'completion',
      event: 'phase_finished',
      outcome: 'failure',
      errorClass: 'unknown',
      counts: { total: 2, failed: 1 },
    });
  });

  it('bounds timing/counts and drops raw or unknown fields', () => {
    const events: unknown[] = [];
    let time = 0;
    const observe = createSyncObservability({
      emit: (event) => events.push(event),
      now: () => time,
      correlationId: () => 'opaque-2',
    });
    observe.start('metadata');
    time = 9_000_000;
    observe.finish('metadata', 'partial', {
      errorClass: 'private provider error token=secret',
      counts: {
        total: 1_000_000_000,
        succeeded: -4,
        failed: 2.8,
        skipped: Number.NaN,
        repoName: 'owner/private',
        token: 'secret',
        userId: 'user-7',
        rawError: 'private',
      },
    });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('owner/private');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('user-7');
    expect(serialized).not.toContain('private provider error');
    expect(events[1]).toMatchObject({
      elapsedMs: 3_600_000,
      outcome: 'partial',
      errorClass: 'unknown',
    });
    expect((events[1] as { counts?: unknown }).counts).toEqual({
      total: 100_000,
      succeeded: 0,
      failed: 2,
      skipped: 0,
    });
  });

  it('keeps later phases observable after an emitter failure', () => {
    const events: unknown[] = [];
    let calls = 0;
    const observe = createSyncObservability({
      emit: (event) => {
        calls += 1;
        if (calls === 2) throw new Error('private emitter error');
        events.push(event);
      },
      now: () => 0,
      correlationId: () => 'opaque-3',
    });

    observe.start('auth');
    expect(() => observe.finish('auth', 'success')).not.toThrow();
    observe.start('database');
    observe.finish('database', 'success');

    expect(events).toEqual([
      { schema: 1, correlationId: 'opaque-3', phase: 'auth', event: 'phase_started' },
      { schema: 1, correlationId: 'opaque-3', phase: 'database', event: 'phase_started' },
      {
        schema: 1,
        correlationId: 'opaque-3',
        phase: 'database',
        event: 'phase_finished',
        elapsedMs: 0,
        outcome: 'success',
      },
    ]);
  });
});
