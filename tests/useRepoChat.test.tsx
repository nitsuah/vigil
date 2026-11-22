import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRepoChat, EPHEMERAL_CHAT_IDENTITY } from '@/hooks/useRepoChat';

/**
 * Regression coverage for the identity-change race: a `sendMessage` request
 * issued under one identity must not write its result into a different
 * identity's threads if that identity changes before the request resolves
 * (CWE-200 — it would otherwise leak one account's reply into another's
 * persisted, localStorage-backed thread on a shared browser profile).
 */
describe('useRepoChat', () => {
    let resolveFetch: (value: Response) => void;

    beforeEach(() => {
        window.localStorage.clear();
        vi.stubGlobal(
            'fetch',
            vi.fn(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveFetch = resolve;
                    })
            )
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function jsonResponse(body: unknown, ok = true): Response {
        return {
            ok,
            status: ok ? 200 : 500,
            json: async () => body,
        } as Response;
    }

    it('does not apply a reply to the new identity after the identity changes mid-request', async () => {
        const { result, rerender } = renderHook(({ identity }: { identity: string }) => useRepoChat(identity), {
            initialProps: { identity: 'anon' },
        });

        act(() => {
            void result.current.sendMessage('repo-a', 'hello');
        });

        await waitFor(() => expect(result.current.sendingRepo).toBe('repo-a'));

        // Identity changes (e.g. sign-in) while the request is still pending.
        rerender({ identity: 'user@example.com' });

        await waitFor(() => expect(result.current.sendingRepo).toBeNull());
        expect(result.current.threads['repo-a']).toBeUndefined();

        // The stale request now resolves. Its reply must not land in the
        // new identity's threads.
        act(() => {
            resolveFetch(jsonResponse({ reply: 'stale reply from anon session' }));
        });

        // Give the microtask queue a turn; no assertion should ever observe
        // the stale reply appearing.
        await new Promise((r) => setTimeout(r, 0));

        expect(result.current.threads['repo-a']).toBeUndefined();
        expect(result.current.sendingRepo).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('clears sendingRepo on identity change so the new identity is never stuck mid-send', async () => {
        const { result, rerender } = renderHook(({ identity }: { identity: string }) => useRepoChat(identity), {
            initialProps: { identity: 'anon' },
        });

        act(() => {
            void result.current.sendMessage('repo-a', 'hello');
        });
        await waitFor(() => expect(result.current.sendingRepo).toBe('repo-a'));

        rerender({ identity: 'user@example.com' });

        expect(result.current.sendingRepo).toBeNull();
    });

    it('applies a reply normally when the identity does not change', async () => {
        const { result } = renderHook(() => useRepoChat('user@example.com'));

        act(() => {
            void result.current.sendMessage('repo-a', 'hello');
        });
        await waitFor(() => expect(result.current.sendingRepo).toBe('repo-a'));

        act(() => {
            resolveFetch(jsonResponse({ reply: 'a real reply' }));
        });

        await waitFor(() =>
            expect(result.current.threads['repo-a']?.some((m) => m.content === 'a real reply')).toBe(true)
        );
        expect(result.current.sendingRepo).toBeNull();
    });

    it('migrates threads from the pre-rebrand storage key on first load', () => {
        const identity = 'user@example.com';
        const legacyKey = `overseer.repo-chat.v1.${encodeURIComponent(identity)}`;
        const newKey = `vigil.repo-chat.v1.${encodeURIComponent(identity)}`;
        const legacyThread = [
            { id: 'm1', role: 'user', content: 'hi from before the rename', createdAt: new Date().toISOString() },
        ];
        window.localStorage.setItem(legacyKey, JSON.stringify({ 'repo-a': legacyThread }));

        const { result } = renderHook(() => useRepoChat(identity));

        expect(result.current.getThread('repo-a')).toEqual(legacyThread);
        expect(window.localStorage.getItem(legacyKey)).toBeNull();
        expect(JSON.parse(window.localStorage.getItem(newKey)!)).toEqual({ 'repo-a': legacyThread });
    });

    it('ignores the legacy key once the new key already has threads', () => {
        const identity = 'user@example.com';
        const legacyKey = `overseer.repo-chat.v1.${encodeURIComponent(identity)}`;
        const newKey = `vigil.repo-chat.v1.${encodeURIComponent(identity)}`;
        const legacyThread = [
            { id: 'old', role: 'user', content: 'legacy message', createdAt: new Date().toISOString() },
        ];
        const currentThread = [
            { id: 'new', role: 'user', content: 'current message', createdAt: new Date().toISOString() },
        ];
        window.localStorage.setItem(legacyKey, JSON.stringify({ 'repo-a': legacyThread }));
        window.localStorage.setItem(newKey, JSON.stringify({ 'repo-a': currentThread }));

        const { result } = renderHook(() => useRepoChat(identity));

        expect(result.current.getThread('repo-a')).toEqual(currentThread);
        // Left alone rather than merged -- the new key already has data.
        expect(window.localStorage.getItem(legacyKey)).not.toBeNull();
    });

    it('keeps ephemeral identities in memory: nothing is restored from or written to storage', () => {
        const thread = [{ id: 'm1', role: 'user', content: 'someone else', createdAt: new Date().toISOString() }];
        window.localStorage.setItem('vigil.repo-chat.v1.anon', JSON.stringify({ 'repo-a': thread }));
        const before = Object.keys(window.localStorage).sort();

        const { result } = renderHook(() => useRepoChat(EPHEMERAL_CHAT_IDENTITY));

        expect(result.current.getThread('repo-a')).toEqual([]);
        expect(Object.keys(window.localStorage).sort()).toEqual(before);
    });

    it('migrates email-keyed threads to the stable id once', () => {
        const emailKey = `vigil.repo-chat.v1.${encodeURIComponent('user@example.com')}`;
        const idKey = 'vigil.repo-chat.v1.12345';
        const thread = [{ id: 'm1', role: 'user', content: 'mine', createdAt: new Date().toISOString() }];
        window.localStorage.setItem(emailKey, JSON.stringify({ 'repo-a': thread }));

        const { result } = renderHook(() => useRepoChat('12345', 'user@example.com'));

        expect(result.current.getThread('repo-a')).toEqual(thread);
        expect(window.localStorage.getItem(emailKey)).toBeNull();
        expect(JSON.parse(window.localStorage.getItem(idKey)!)).toEqual({ 'repo-a': thread });
    });

    it('migrates email-keyed threads only for the first account id that claims the email', () => {
        const emailKey = `vigil.repo-chat.v1.${encodeURIComponent('shared@example.com')}`;
        const thread = [{ id: 'm1', role: 'user', content: 'first owner', createdAt: new Date().toISOString() }];
        window.localStorage.setItem(emailKey, JSON.stringify({ 'repo-a': thread }));

        renderHook(() => useRepoChat('111', 'shared@example.com'));
        // Threads are written back under the email key again (e.g. an old tab), but the claim is already bound.
        window.localStorage.setItem(emailKey, JSON.stringify({ 'repo-a': thread }));
        const second = renderHook(() => useRepoChat('222', 'shared@example.com'));

        expect(second.result.current.getThread('repo-a')).toEqual([]);
        expect(window.localStorage.getItem(emailKey)).not.toBeNull();
        expect(window.localStorage.getItem('vigil.repo-chat.v1.migrated.shared%40example.com')).toBe('111');
    });

    it('does not load threads of a different stable id', () => {
        const thread = [{ id: 'm1', role: 'user', content: 'theirs', createdAt: new Date().toISOString() }];
        window.localStorage.setItem('vigil.repo-chat.v1.111', JSON.stringify({ 'repo-a': thread }));
        const { result } = renderHook(() => useRepoChat('222'));
        expect(result.current.getThread('repo-a')).toEqual([]);
    });
});
