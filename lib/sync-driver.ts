// Client-side loop for chunked sync (#305): calls /api/sync-repos/batch until
// the run is done. Framework-free so it can be unit tested without a DOM.

export interface SyncProgressState {
    sessionId: string;
    phase: 'metadata' | 'health' | 'complete' | 'error';
    totalRepos: number;
    completedRepos: number;
    currentRepo: string;
    failedRepos: number;
    cursor?: number;
    progressPercentage: number;
    done: boolean;
}

export type DriveStatus = 'complete' | 'error' | 'cancelled' | 'unauthorized' | 'lost' | 'failed';

export interface DriveResult {
    status: DriveStatus;
    progress: SyncProgressState | null;
    /** Server-provided or driver-generated reason for a non-complete end. */
    message?: string;
}

export interface DriveOptions {
    sessionId: string;
    /** Where the run is, when known (a fresh run starts at metadata/0). */
    start?: { cursor: number; phase: string };
    signal?: AbortSignal;
    onProgress?: (progress: SyncProgressState) => void;
    fetchImpl?: typeof fetch;
    /** Safety valve: a run can never need more calls than repos x 2 phases; this just stops a runaway loop. */
    maxCalls?: number;
}

const BATCH_URL = '/api/sync-repos/batch';

type CallOutcome =
    | { kind: 'ok'; progress: SyncProgressState }
    | { kind: 'unauthorized' }
    | { kind: 'lost'; message?: string }
    | { kind: 'transient' };

async function callBatch(
    fetchImpl: typeof fetch,
    sessionId: string,
    skip: boolean,
    at: { cursor: number; phase: string } | null,
    signal?: AbortSignal,
): Promise<CallOutcome> {
    try {
        const res = await fetchImpl(BATCH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Name the batch we mean: if a response was lost and the run moved on, the server
            // does no work (and skips nothing) for a position we no longer hold.
            body: JSON.stringify({ sessionId, ...(skip ? { skip: true } : {}), ...(at ?? {}) }),
            signal,
        });
        if (res.status === 401) return { kind: 'unauthorized' };
        // 404: the run is gone (expired or another account). 409: a pre-chunking row that can never advance.
        if (res.status === 404 || res.status === 409) {
            const data = await res.json().catch(() => ({}));
            return { kind: 'lost', message: typeof data?.error === 'string' ? data.error : undefined };
        }
        if (!res.ok) return { kind: 'transient' };
        const data = (await res.json()) as SyncProgressState;
        if (!data || typeof data.phase !== 'string') return { kind: 'transient' };
        return { kind: 'ok', progress: data };
    } catch {
        // Aborts are handled by the caller's signal check; anything else is a network blip.
        return { kind: 'transient' };
    }
}

/**
 * Drives one run to its end. A batch that fails is retried once; if the retry
 * fails too the batch is recorded as failed (skip) and the run continues, so one
 * bad repo or one dropped request can't stall the sync.
 */
export async function driveSync(opts: DriveOptions): Promise<DriveResult> {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const maxCalls = opts.maxCalls ?? 2000;
    let last: SyncProgressState | null = null;
    let at: { cursor: number; phase: string } | null = opts.start ?? null;
    let calls = 0;

    const cancelled = (): DriveResult => ({ status: 'cancelled', progress: last });

    while (calls++ < maxCalls) {
        if (opts.signal?.aborted) return cancelled();

        let outcome = await callBatch(fetchImpl, opts.sessionId, false, at, opts.signal);
        if (opts.signal?.aborted) return cancelled();
        if (outcome.kind === 'transient') {
            outcome = await callBatch(fetchImpl, opts.sessionId, false, at, opts.signal);
            if (opts.signal?.aborted) return cancelled();
        }
        if (outcome.kind === 'transient') {
            outcome = await callBatch(fetchImpl, opts.sessionId, true, at, opts.signal);
            if (opts.signal?.aborted) return cancelled();
            if (outcome.kind === 'transient') {
                return { status: 'failed', progress: last, message: 'The sync could not reach the server. Run it again to continue.' };
            }
        }
        if (outcome.kind === 'unauthorized') return { status: 'unauthorized', progress: last };
        if (outcome.kind === 'lost') return { status: 'lost', progress: last, message: outcome.message };

        last = outcome.progress;
        if (typeof last.cursor === 'number') at = { cursor: last.cursor, phase: last.phase };
        opts.onProgress?.(last);
        if (last.phase === 'complete') return { status: 'complete', progress: last };
        if (last.phase === 'error') return { status: 'error', progress: last, message: last.currentRepo };
    }
    return { status: 'failed', progress: last, message: 'The sync did not finish. Run it again to continue.' };
}

const STORAGE_KEY = 'vigil.sync.session';

/** The run to resume after a reload. Storage can be unavailable (private mode): then there is no resume. */
export function rememberSyncSession(sessionId: string | null): void {
    try {
        if (sessionId) window.localStorage.setItem(STORAGE_KEY, sessionId);
        else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable */ }
}

export function recallSyncSession(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}
