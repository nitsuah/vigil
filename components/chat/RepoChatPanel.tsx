"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Send, Trash2, MessageSquare, Loader2, FileText, Check, X as XIcon } from 'lucide-react';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { SUGGESTED_WORKFLOWS } from '@/lib/repo-chat';
import type { ChatThreadMessage } from '@/hooks/useRepoChat';
import type { TaskOperationProposal } from '@/lib/repo-chat';
import { getTypeIcon } from '@/components/dashboard/repo-row/repo-row-utils';
import type { RepoType } from '@/lib/repo-type';

interface DocEditProposal {
  docType: string;
  content: string;
  summary: string;
}

interface RepoChatPanelProps {
    isOpen: boolean;
    repoName: string | null;
    repoType?: RepoType;
    healthScore?: number | null;
    messages: ChatThreadMessage[];
    sending: boolean;
    error: string | null;
    onClose: () => void;
    onSend: (text: string) => void;
    onClear: () => void;
    onApplyProposal?: (proposal: DocEditProposal) => void;
    onDismissProposal?: (messageId: string) => void;
    onApplyTaskProposal?: (proposal: TaskOperationProposal) => void;
}

/**
 * Messenger-style slide-in panel. One thread per repository; the server
 * attaches the repo's dashboard data as context on every turn.
 */
export function RepoChatPanel({
    isOpen,
    repoName,
    repoType,
    healthScore,
    messages,
    sending,
    error,
    onClose,
    onSend,
    onClear,
    onApplyProposal,
    onDismissProposal,
    onApplyTaskProposal,
}: RepoChatPanelProps): React.JSX.Element | null {
    const [draft, setDraft] = useState('');
    const [draftRepo, setDraftRepo] = useState(repoName);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Reset the draft when switching to a different repo's thread. Adjusting
    // state during render is cheaper than an effect and avoids a flash of the
    // previous repo's text.
    if (repoName !== draftRepo) {
        setDraftRepo(repoName);
        setDraft('');
    }

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen, repoName]);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, sending]);

    if (!isOpen || !repoName) return null;

    const submit = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || sending) return;
        onSend(trimmed);
        setDraft('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit(draft);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={`Chat about ${repoName}`}
                className="w-full sm:max-w-md h-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col"
            >
                {/* Header — the repo is the "friend" you are messaging */}
                <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 bg-slate-900/95">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-500/40 flex items-center justify-center text-lg">
                        {repoType ? getTypeIcon(repoType) : '📄'}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-slate-100 truncate">{repoName}</h2>
                        <p className="text-xs text-slate-400">
                            {healthScore !== null && healthScore !== undefined
                                ? `Health ${healthScore}/100 · dashboard data attached`
                                : 'Dashboard data attached'}
                        </p>
                    </div>
                    {messages.length > 0 && (
                        <button
                            onClick={onClear}
                            disabled={sending}
                            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                            title={sending ? 'Wait for the reply before clearing' : 'Clear this conversation'}
                            aria-label="Clear conversation"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        aria-label="Close chat"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* Transcript */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {messages.length === 0 && (
                        <div className="text-center py-6">
                            <MessageSquare className="h-8 w-8 mx-auto text-slate-600 mb-3" />
                            <p className="text-sm text-slate-400 mb-1">
                                Ask about <span className="text-slate-200 font-medium">{repoName}</span>
                            </p>
                            <p className="text-xs text-slate-500 mb-4">
                                Health, docs, TASKS.md and ROADMAP.md are sent as context.
                            </p>
                            <div className="flex flex-col gap-2">
                                {SUGGESTED_WORKFLOWS.map((w) => (
                                    <button
                                        key={w.id}
                                        onClick={() => submit(w.prompt)}
                                        disabled={sending}
                                        className="text-left text-sm px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-indigo-500/50 transition-colors disabled:opacity-50"
                                    >
                                        {w.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((message) => (
                        <React.Fragment key={message.id}>
                            <div
                                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                                        message.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-br-sm'
                                            : message.failed
                                                ? 'bg-red-500/10 border border-red-500/40 text-red-300 rounded-bl-sm'
                                                : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-sm'
                                    }`}
                                >
                                    {message.role === 'user' ? (
                                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                                    ) : (
                                        <div className="chat-markdown break-words">
                                            <MarkdownPreview content={message.content} />
                                        </div>
                                    )}
                                </div>
                            </div>
                            {message.role === 'assistant' && message.rateLimitWarning && (
                              <div className="flex justify-start">
                                <p className="max-w-[85%] text-xs text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-1.5">
                                  {message.rateLimitWarning}
                                </p>
                              </div>
                            )}
                            {message.role === 'assistant' && message.proposal && onApplyProposal && (
                              <div className="flex justify-start">
                                <div className="max-w-[85%] bg-emerald-500/10 border border-emerald-500/40 rounded-2xl rounded-bl-sm px-3.5 py-2">
                                  <div className="flex items-center gap-2 text-emerald-300 text-sm mb-2">
                                    <FileText className="h-4 w-4" />
                                    <span className="font-medium">Proposed edit: {message.proposal.docType.toUpperCase()}</span>
                                  </div>
                                  <p className="text-slate-300 text-xs mb-2">{message.proposal.summary}</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => onApplyProposal(message.proposal!)}
                                      disabled={sending}
                                      className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                      <Check className="h-3 w-3" />
                                      Apply
                                    </button>
                                    <button
                                      onClick={() => onDismissProposal?.(message.id)}
                                      disabled={sending}
                                      className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                      <XIcon className="h-3 w-3" />
                                      Dismiss
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {message.role === 'assistant' && message.taskProposal && onApplyTaskProposal && (
                              <div className="flex justify-start">
                                <div className="max-w-[85%] bg-blue-500/10 border border-blue-500/40 rounded-2xl rounded-bl-sm px-3.5 py-2">
                                  <div className="flex items-center gap-2 text-blue-300 text-sm mb-2">
                                    <FileText className="h-4 w-4" />
                                    <span className="font-medium">Task operation: {message.taskProposal.operation.replace('_', ' ')}</span>
                                  </div>
                                  <p className="text-slate-300 text-xs mb-2">{message.taskProposal.summary}</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => onApplyTaskProposal(message.taskProposal!)}
                                      disabled={sending}
                                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                      <Check className="h-3 w-3" />
                                      Apply
                                    </button>
                                    <button
                                      onClick={() => onDismissProposal?.(message.id)}
                                      disabled={sending}
                                      className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                                    >
                                      <XIcon className="h-3 w-3" />
                                      Dismiss
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                        </React.Fragment>
                    ))}

                    {sending && (
                        <div className="flex justify-start">
                            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-2 text-slate-400 text-sm">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Reading dashboard context...
                            </div>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="px-4 py-2 text-xs text-red-300 bg-red-500/10 border-t border-red-500/30">
                        {error}
                    </div>
                )}

                {/* Composer */}
                <div className="border-t border-slate-700 p-3">
                    {messages.length > 0 && !sending && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {SUGGESTED_WORKFLOWS.map((w) => (
                                <button
                                    key={w.id}
                                    onClick={() => submit(w.prompt)}
                                    className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-indigo-500/50 transition-colors"
                                >
                                    {w.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            placeholder={`Message ${repoName}...`}
                            aria-label="Chat message"
                            className="flex-1 resize-none max-h-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        <button
                            onClick={() => submit(draft)}
                            disabled={sending || draft.trim().length === 0}
                            className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Send message"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    );
}
