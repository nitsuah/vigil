"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_CHAT_MESSAGES, type ChatMessage } from '@/lib/repo-chat';

const STORAGE_PREFIX = 'vigil.repo-chat.v1';
/** Pre-rebrand storage prefix. Read once per namespace to migrate any
 * existing threads forward; never written to again. */
const LEGACY_STORAGE_PREFIX = 'overseer.repo-chat.v1';
/** Storage namespace used when no authenticated identity is available. */
const ANON_NAMESPACE = 'anon';
/** Keep persisted threads bounded so localStorage cannot grow without limit. */
const MAX_PERSISTED_MESSAGES = 40;

export interface ChatThreadMessage extends ChatMessage {
    id: string;
    createdAt: string;
    /** Set when the request for this turn failed; lets the UI mark it. */
    failed?: boolean;
    /** Structured doc-edit proposal returned by the server. */
    proposal?: {
      docType: string;
      content: string;
      summary: string;
    };
    /** Structured task operation proposal returned by the server. */
    taskProposal?: import('@/lib/repo-chat').TaskOperationProposal;
    /** BYOK: set when this turn rode the app's shared AI key and is
     * approaching its per-user rate limit. */
    rateLimitWarning?: string;
}

export type ChatThreads = Record<string, ChatThreadMessage[]>;

/**
 * Public contract returned by {@link useRepoChat}.
 *
 * Every field is scoped to the identity/namespace the hook was called with —
 * `threads`, `sendingRepo`, and `error` are all reset the moment that identity
 * changes, and `sendMessage` refuses a second call while one is already
 * in flight (there is exactly one outstanding request across all repos).
 */
export interface UseRepoChatResult {
    /** All persisted threads for the current identity, keyed by repo name. */
    threads: ChatThreads;
    /** The thread for one repo, or `[]` if it has no messages yet. */
    getThread: (repoName: string) => ChatThreadMessage[];
    /** Sends `text` as a new user turn in `repoName`'s thread. No-ops if a
     *  request is already in flight or `text` is empty/whitespace. */
    sendMessage: (repoName: string, text: string) => Promise<void>;
    /** Deletes `repoName`'s thread entirely (and clears any active error). */
    clearThread: (repoName: string) => void;
    /** Clears the proposal attached to one assistant message, without
     *  touching the rest of the thread — used when the user dismisses a
     *  proposed doc edit instead of applying it. */
    dismissProposal: (repoName: string, messageId: string) => void;
    /** The repo with an in-flight `sendMessage` call, or `null`. */
    sendingRepo: string | null;
    /** The most recent request-level error, or `null`. */
    error: string | null;
}

function newId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** localStorage is shared per-origin: without namespacing, a second person on
 * the same browser profile could load the first user's transcripts. Keying by
 * the authenticated identity (falling back to a fixed anonymous namespace)
 * isolates threads per-account without needing to wipe storage on sign-out. */
function storageKeyFor(namespace: string): string {
    return `${STORAGE_PREFIX}.${encodeURIComponent(namespace)}`;
}

function legacyStorageKeyFor(namespace: string): string {
    return `${LEGACY_STORAGE_PREFIX}.${encodeURIComponent(namespace)}`;
}

function isValidProposal(value: unknown): value is NonNullable<ChatThreadMessage['proposal']> {
    if (typeof value !== 'object' || value === null) return false;
    const p = value as Record<string, unknown>;
    return (
        typeof p.docType === 'string' &&
        typeof p.content === 'string' &&
        typeof p.summary === 'string'
    );
}

function isValidThreadMessage(value: unknown): value is ChatThreadMessage {
    if (typeof value !== 'object' || value === null) return false;
    const m = value as Record<string, unknown>;
    return (
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        typeof m.id === 'string' &&
        typeof m.createdAt === 'string' &&
        (m.proposal === undefined || isValidProposal(m.proposal))
    );
}

/** Parses persisted JSON defensively: any repo entry that is not an array of
 * well-formed messages is dropped rather than kept, so a corrupted or
 * hand-edited localStorage value can never reach `sendMessage` and throw when
 * it is spread into a new array (which would otherwise skip the try/finally
 * that resets `sendingRepo`). */
function parseThreadsJson(raw: string | null): ChatThreads {
    if (!raw) return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

        const result: ChatThreads = {};
        for (const [repo, messages] of Object.entries(parsed as Record<string, unknown>)) {
            if (Array.isArray(messages) && messages.every(isValidThreadMessage)) {
                result[repo] = messages;
            }
        }
        return result;
    } catch {
        return {};
    }
}

/** localStorage.getItem() can throw (storage blocked/denied by the browser),
 * not just return null -- callers must never let that exception escape. */
function safeGetItem(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function loadThreads(namespace: string): ChatThreads {
    if (typeof window === 'undefined') return {};

    const current = parseThreadsJson(safeGetItem(storageKeyFor(namespace)));
    if (Object.keys(current).length > 0) return current;

    // One-time migration from the pre-rebrand key: a repo's threads would
    // otherwise sit unread in localStorage forever post-rename, since nothing
    // reads LEGACY_STORAGE_PREFIX once STORAGE_PREFIX exists.
    const legacyKey = legacyStorageKeyFor(namespace);
    const legacy = parseThreadsJson(safeGetItem(legacyKey));
    if (Object.keys(legacy).length === 0) return legacy;

    try {
        window.localStorage.setItem(storageKeyFor(namespace), JSON.stringify(legacy));
        window.localStorage.removeItem(legacyKey);
    } catch {
        // Storage may be unavailable (private mode, quota); still hand back
        // the migrated threads for this session even if persisting failed.
    }
    return legacy;
}

function persistThreads(namespace: string, threads: ChatThreads): void {
    if (typeof window === 'undefined') return;
    try {
        const trimmed: ChatThreads = {};
        for (const [repo, messages] of Object.entries(threads)) {
            trimmed[repo] = messages.slice(-MAX_PERSISTED_MESSAGES);
        }
        window.localStorage.setItem(storageKeyFor(namespace), JSON.stringify(trimmed));
    } catch {
        // Storage may be unavailable (private mode, quota); chat still works in-memory.
    }
}

/**
 * Per-repo chat threads. Every repo gets its own persistent conversation
 * ("one friend per repo"), restored across page loads from localStorage and
 * automatically re-persisted (bounded to {@link MAX_PERSISTED_MESSAGES} per
 * repo) on every change. Only one {@link UseRepoChatResult.sendMessage} call
 * may be in flight at a time across all repos; a second call while one is
 * pending is a no-op.
 *
 * @param identity A stable per-account key (e.g. the signed-in user's email).
 *   Threads are namespaced by this value so switching accounts on a shared
 *   browser profile never surfaces another account's conversation; omit it
 *   (or pass undefined while a session is still loading) to use a fixed
 *   anonymous namespace. Changing `identity` immediately (synchronously,
 *   before this render commits) swaps in the new namespace's threads and
 *   clears any pending request/error state left over from the old one.
 */
export function useRepoChat(identity?: string | null): UseRepoChatResult {
    const namespace = identity && identity.trim().length > 0 ? identity : ANON_NAMESPACE;

    // React's "adjusting state during render" pattern (not an effect): when
    // `namespace` no longer matches the value threads/sendingRepo/error were
    // last reset for, reset them in the same render that observes the change.
    // An effect would commit and paint one frame of the *previous* identity's
    // threads under the *new* identity's label first (CWE-200), and — because
    // effects run in declaration order within one flush — a naive rehydrate
    // effect can mark itself "done" before the sibling persistence effect
    // sees the update, causing that effect to write the stale threads under
    // the new identity's storage key. Resetting synchronously during render
    // means neither effect ever observes a mismatched (namespace, threads)
    // pair.
    const [hydratedNamespace, setHydratedNamespace] = useState(namespace);
    const [threads, setThreads] = useState<ChatThreads>(() => loadThreads(namespace));
    const [sendingRepo, setSendingRepo] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    if (namespace !== hydratedNamespace) {
        setHydratedNamespace(namespace);
        setThreads(loadThreads(namespace));
        setSendingRepo(null);
        setError(null);
    }

    // Mirrors `namespace` for `sendMessage` to read at request-completion
    // time. Updated from an effect (commit phase), never during render:
    // React may discard or replay a render, and a ref write during render
    // would leak into `sendMessage` calls issued by UI that never actually
    // committed.
    const namespaceRef = useRef(namespace);
    useEffect(() => {
        namespaceRef.current = namespace;
    }, [namespace]);

    // Safe unconditionally: the synchronous reset above guarantees `threads`
    // is never observed alongside a `namespace` it wasn't loaded for.
    useEffect(() => {
        persistThreads(namespace, threads);
    }, [threads, namespace]);

    const getThread = useCallback(
        (repoName: string): ChatThreadMessage[] => threads[repoName] ?? [],
        [threads]
    );

    const clearThread = useCallback((repoName: string) => {
        setError(null);
        setThreads((prev) => {
            const next = { ...prev };
            delete next[repoName];
            return next;
        });
    }, []);

    const dismissProposal = useCallback((repoName: string, messageId: string) => {
        setThreads((prev) => {
            const existing = prev[repoName];
            if (!existing) return prev;
            return {
                ...prev,
                [repoName]: existing.map((m) =>
                    m.id === messageId ? { ...m, proposal: undefined, taskProposal: undefined } : m
                ),
            };
        });
    }, []);

    const sendMessage = useCallback(
        async (repoName: string, text: string): Promise<void> => {
            const trimmed = text.trim();
            if (!trimmed || sendingRepo) return;

            // Captured at request time: if the identity changes before this
            // request resolves, its result belongs to a namespace that is no
            // longer current and must not be applied.
            const requestNamespace = namespaceRef.current;
            const isStale = (): boolean => namespaceRef.current !== requestNamespace;

            setError(null);
            setSendingRepo(repoName);

            const userMessage: ChatThreadMessage = {
                id: newId(),
                role: 'user',
                content: trimmed,
                createdAt: new Date().toISOString(),
            };

            // Snapshot the transcript we are about to send, including this turn.
            // The `?? []` guard is defense in depth: loadThreads() already
            // discards malformed persisted entries, so this should always be
            // an array, but a corrupted entry reaching the spread below would
            // throw before the try block and leave sendingRepo stuck forever.
            const existing = Array.isArray(threads[repoName]) ? threads[repoName] : [];
            const history = [...existing, userMessage];
            setThreads((prev) => ({ ...prev, [repoName]: history }));

            try {
                // Persistence keeps up to MAX_PERSISTED_MESSAGES for display,
                // but the wire payload is capped to the same window the server
                // keeps (MAX_CHAT_MESSAGES) — sending more just inflates the
                // request and gets truncated server-side anyway.
                const outgoing = history.filter((m) => !m.failed).slice(-MAX_CHAT_MESSAGES);

                const res = await fetch(`/api/repos/${encodeURIComponent(repoName)}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: outgoing.map(({ role, content }) => ({ role, content })),
                    }),
                });

                const data = await res.json().catch(() => ({}));

                // The identity changed while this request was in flight (e.g.
                // sign-in/sign-out); this hook's state was already reset for
                // the new identity, so applying a result computed for the old
                // one would misattribute it.
                if (isStale()) return;

                if (!res.ok) {
                    const message = data?.error || `Chat request failed (${res.status})`;
                    setError(message);
                    setThreads((prev) => ({
                        ...prev,
                        [repoName]: [
                            ...(prev[repoName] ?? []),
                            {
                                id: newId(),
                                role: 'assistant',
                                content: `Could not reach the assistant: ${message}`,
                                createdAt: new Date().toISOString(),
                                failed: true,
                            },
                        ],
                    }));
                    return;
                }

                setThreads((prev) => ({
                    ...prev,
                    [repoName]: [
                        ...(prev[repoName] ?? []),
                        {
                            id: newId(),
                            role: 'assistant',
                            content: data.reply ?? '(empty response)',
                            createdAt: new Date().toISOString(),
                            proposal: isValidProposal(data.proposal) ? data.proposal : undefined,
                            rateLimitWarning: data.rateLimitWarning ?? undefined,
                        },
                    ],
                }));
            } catch {
                if (isStale()) return;
                const message = 'Network error - could not reach the chat endpoint';
                setError(message);
                setThreads((prev) => ({
                    ...prev,
                    [repoName]: [
                        ...(prev[repoName] ?? []),
                        {
                            id: newId(),
                            role: 'assistant',
                            content: message,
                            createdAt: new Date().toISOString(),
                            failed: true,
                        },
                    ],
                }));
            } finally {
                if (!isStale()) setSendingRepo(null);
            }
        },
        [threads, sendingRepo]
    );

    return { threads, getThread, sendMessage, clearThread, dismissProposal, sendingRepo, error };
}
