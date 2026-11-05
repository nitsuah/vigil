import { randomUUID } from 'node:crypto';

export const SYNC_PHASES = [
    'auth',
    'database',
    'repository_list',
    'metadata',
    'metadata_retry',
    'detailed_health',
    'default_repos',
    'completion',
] as const;

export type SyncPhase = (typeof SYNC_PHASES)[number];
export type SyncOutcome = 'success' | 'failure' | 'partial' | 'skipped';
export type SyncErrorClass = 'auth' | 'database' | 'github_api' | 'rate_limit' | 'timeout' | 'unknown';

const OUTCOMES: readonly SyncOutcome[] = ['success', 'failure', 'partial', 'skipped'];
const ERROR_CLASSES: readonly SyncErrorClass[] = ['auth', 'database', 'github_api', 'rate_limit', 'timeout', 'unknown'];
const COUNT_KEYS = ['total', 'succeeded', 'failed', 'completed', 'skipped', 'remaining'] as const;
type CountKey = (typeof COUNT_KEYS)[number];
const MAX_COUNT = 100_000;
const MAX_ELAPSED_MS = 3_600_000;

export type SyncObservation = {
    schema: 1;
    correlationId: string;
    phase: SyncPhase;
    event: 'phase_started' | 'phase_finished';
    elapsedMs?: number;
    outcome?: SyncOutcome;
    errorClass?: SyncErrorClass;
    counts?: Partial<Record<CountKey, number>>;
};

type FinishDetails = { errorClass?: unknown; counts?: Record<string, unknown> };
type Options = {
    emit?: (event: SyncObservation) => void;
    now?: () => number;
    correlationId?: () => string;
};

function clamp(value: number, max: number): number {
    return Math.max(0, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : 0));
}

function sanitizeCounts(input?: Record<string, unknown>): Partial<Record<CountKey, number>> | undefined {
    if (!input || typeof input !== 'object') return undefined;
    const counts: Partial<Record<CountKey, number>> = {};
    for (const key of COUNT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(input, key)) {
            const value = input[key];
            counts[key] = clamp(typeof value === 'number' ? value : 0, MAX_COUNT);
        }
    }
    return Object.keys(counts).length ? counts : undefined;
}

export function createSyncObservability(options: Options = {}) {
    const emit = options.emit ?? (() => {});
    const now = options.now ?? Date.now;
    const rawId = (options.correlationId ?? randomUUID)();
    const correlationId = typeof rawId === 'string' && rawId.length <= 64 && /^[A-Za-z0-9-]+$/.test(rawId)
        ? rawId
        : 'unknown';
    const started = new Map<SyncPhase, number>();
    const finished = new Set<SyncPhase>();
    const clock = () => {
        try {
            const value = now();
            return Number.isFinite(value) ? value : 0;
        } catch {
            return 0;
        }
    };
    const send = (event: Omit<SyncObservation, 'schema' | 'correlationId'>) => {
        try {
            emit({ schema: 1, correlationId, ...event });
        } catch {
            // Observability must never change sync behavior.
        }
    };

    return {
        start(phase: SyncPhase) {
            if (!SYNC_PHASES.includes(phase) || started.has(phase)) return;
            started.set(phase, clock());
            send({ phase, event: 'phase_started' });
        },
        finish(phase: SyncPhase, outcome: SyncOutcome, details: FinishDetails = {}) {
            if (!started.has(phase) || finished.has(phase)) return;
            finished.add(phase);
            const safeOutcome = OUTCOMES.includes(outcome) ? outcome : 'failure';
            const errorClass = details.errorClass === undefined
                ? undefined
                : ERROR_CLASSES.includes(details.errorClass as SyncErrorClass)
                    ? details.errorClass as SyncErrorClass
                    : 'unknown';
            const counts = sanitizeCounts(details.counts);
            send({
                phase,
                event: 'phase_finished',
                elapsedMs: clamp(clock() - (started.get(phase) ?? 0), MAX_ELAPSED_MS),
                outcome: safeOutcome,
                ...(errorClass ? { errorClass } : {}),
                ...(counts ? { counts } : {}),
            });
        },
    };
}
