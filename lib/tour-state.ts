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

export function readTourState(): TourState {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
        return parsed && typeof parsed === 'object' ? (parsed as TourState) : {};
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
