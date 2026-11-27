import { describe, it, expect, afterEach, vi } from 'vitest';
import { readTourState, writeTourState } from './tour-state';

afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
});

describe('tour state', () => {
    it('merges what is written', () => {
        writeTourState({ introDismissed: true });
        writeTourState({ tour: 'partial', mode: 'quick', step: 2 });
        expect(readTourState()).toEqual({ introDismissed: true, tour: 'partial', mode: 'quick', step: 2 });
    });

    it('behaves like a first visit when storage throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        expect(() => writeTourState({ introDismissed: true })).not.toThrow();
        expect(readTourState()).toEqual({});
    });
});
