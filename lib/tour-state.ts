// What this browser remembers about the visitor intro and the guided tour.
// Storage can throw (private windows, blocked site data): every access is
// wrapped, and the page behaves like a first visit when it does.

export interface TourState {
    introDismissed?: boolean;
    tour?: 'done' | 'partial';
    /** Which step list a partial run was on, and where it stopped. */
    mode?: 'quick' | 'full';
    step?: number;
}

const KEY = 'vigil:tour';

/** Keeps only fields with the expected shape: storage can hold anything. */
function toTourState(value: unknown): TourState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const { introDismissed, tour, mode, step } = value as Record<string, unknown>;
    return {
        ...(typeof introDismissed === 'boolean' && { introDismissed }),
        ...((tour === 'done' || tour === 'partial') && { tour }),
        ...((mode === 'quick' || mode === 'full') && { mode }),
        ...(typeof step === 'number' && Number.isInteger(step) && step >= 0 && { step }),
    };
}

export function readTourState(): TourState {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
        return toTourState(parsed);
    } catch {
        return {};
    }
}

export function writeTourState(patch: TourState): void {
    try {
        window.localStorage.setItem(KEY, JSON.stringify({ ...readTourState(), ...patch }));
    } catch {
        // Nothing to remember it in; the page still works.
    }
}
