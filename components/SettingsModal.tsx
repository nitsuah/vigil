"use client";

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { AlertTriangle, Check, Loader2, Trash2 } from 'lucide-react';
import { byokPromptKey } from '@/lib/byok-prompt-key';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIdentity?: string | null;
}

type Provider = 'gemini' | 'openai' | 'anthropic';

interface KeyStatus {
  hasKey: boolean;
  provider?: Provider;
  updatedAt?: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

/**
 * BYOK settings: lets a signed-in user store their own AI provider API key
 * instead of riding the app's shared/default key. See lib/byok-crypto.ts for
 * how the key is encrypted at rest, and app/api/settings/ai-key/route.ts for
 * the backing API — the raw key is never sent back to the client once saved.
 */
export function SettingsModal(props: SettingsModalProps) {
  // Mount the stateful body only while open: each open starts from fresh
  // state (no stale key/error/saved flag) without resetting it in an effect.
  if (!props.isOpen) return null;
  return <SettingsModalBody {...props} />;
}

function SettingsModalBody({ isOpen, onClose, userIdentity }: SettingsModalProps) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // SettingsModal stays mounted (Modal just returns null when closed), so a
    // rapid close-reopen can leave two fetches in flight; without this guard
    // a late response from the first can overwrite state set by the second.
    const controller = new AbortController();
    fetch('/api/settings/ai-key', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load settings'))))
      .then((data: KeyStatus) => {
        setStatus(data);
        if (data.provider) setProvider(data.provider);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError('Could not load your current AI key settings.');
      })
      .finally(() => {
        // A closed-then-reopened modal aborts the earlier request, but its
        // .finally() still runs — without this guard it could clear loading
        // state for a newer request that's still in flight.
        if (!controller.signal.aborted) setLoadingStatus(false);
      });

    // Opening Settings at all counts as having seen the BYOK option — don't
    // nudge again after this regardless of what the user does inside. Uses
    // the same identity-scoped key as the chat panel's nudge (app/page.tsx)
    // so the two stay in sync.
    try {
      window.localStorage.setItem(byokPromptKey(userIdentity), '1');
    } catch {
      // localStorage may be unavailable (private mode); non-fatal.
    }

    return () => controller.abort();
  }, [userIdentity]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length < 8) {
      setError('That key looks too short to be valid.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/ai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save your key.');
        return;
      }
      setStatus({ hasKey: true, provider, updatedAt: new Date().toISOString() });
      setApiKey('');
      setSaved(true);
    } catch {
      setError('Network error — failed to save your key.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/ai-key', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to remove your key.');
        return;
      }
      setStatus({ hasKey: false });
      setSaved(false);
    } catch {
      setError('Network error — failed to remove your key.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Provider Settings" size="sm">
      <div className="space-y-4 text-sm">
        <p className="text-slate-400">
          By default, chat and AI features use Vigil&apos;s own shared AI key. You can
          use your own provider key instead — useful if you want higher limits or a
          specific model.
        </p>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-900/20 border border-amber-700/40 text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Using your own key means <strong>you are responsible for your own usage and
            costs</strong> with that provider. Vigil never sees or stores your key in
            plain text.
          </span>
        </div>

        {loadingStatus ? (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading current settings…
          </div>
        ) : status?.hasKey ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-900/20 border border-emerald-700/40">
            <span className="flex items-center gap-2 text-emerald-300">
              <Check className="h-4 w-4" />
              Using your own {PROVIDER_LABELS[status.provider ?? 'gemini']} key
            </span>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Remove
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-400">
            No personal key set — using the shared AI key (rate-limited; you&apos;ll see a
            warning if you get close to the limit).
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-slate-700/50">
          <div>
            <label htmlFor="byok-provider" className="block text-xs font-medium text-slate-400 mb-1">
              Provider
            </label>
            <select
              id="byok-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 text-base sm:text-sm"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </div>
          <div>
            <label htmlFor="byok-key" className="block text-xs font-medium text-slate-400 mb-1">
              API key
            </label>
            <input
              id="byok-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 text-base sm:text-sm"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}
          {saved && !error && <p className="text-emerald-400 text-xs">Saved — this key will be used for your AI requests.</p>}

          <button
            type="submit"
            disabled={saving || apiKey.trim().length === 0}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 btn-primary-gradient rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? 'Saving…' : status?.hasKey ? 'Replace key' : 'Save key'}
          </button>
        </form>
      </div>
    </Modal>
  );
}
