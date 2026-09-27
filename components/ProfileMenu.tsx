"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { CheckCircle, HelpCircle, LogOut, Tag, Zap } from "lucide-react";
import { useGeminiStatus } from "@/hooks/useGeminiStatus";

const APP_VERSION = "v0.2.0";

/**
 * Header profile control: an avatar button the same height as the other
 * header buttons, opening a dropdown panel (identity, status, tour, sign out).
 * The panel floats below the header, so opening it never changes the header's
 * size or pushes the right cluster around.
 *
 * The guided tour highlights the status rows (data-tour="auth-status" etc.)
 * and opens/closes the panel by clicking data-tour="profile-toggle".
 */
export function ProfileMenu({ session, onStartTour }: {
    session: Session;
    onStartTour?: () => void;
}): React.JSX.Element {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const gemini = useGeminiStatus();
    const name = session.user?.name ?? "User";

    // Close on outside click and Escape. Clicks inside the guided tour's overlay
    // don't count: the tour keeps the panel open while it points at the rows.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Element | null;
            if (root.current?.contains(t) || t?.closest?.("[data-guided-tour]")) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const geminiRow = gemini.loading
        ? { label: "Checking…", cls: "text-slate-400", dot: "bg-slate-500" }
        : gemini.healthy
            ? { label: "Available", cls: "text-emerald-300", dot: "bg-emerald-400" }
            : { label: "Unavailable", cls: "text-red-300", dot: "bg-red-400" };

    return (
        <div ref={root} className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Profile, status and sign out"
                title="Profile, status and sign out"
                data-tour="profile-toggle"
                className={`relative flex h-[38px] w-[38px] items-center justify-center rounded-full ring-2 transition-all duration-200 focus:outline-none focus-visible:ring-fuchsia-300 ${open ? "ring-fuchsia-400/80" : "ring-purple-500/50 hover:ring-fuchsia-400/70"}`}
            >
                {session.user?.image ? (
                    <Image src={session.user.image} alt={name} width={34} height={34} className="rounded-full" />
                ) : (
                    <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 text-sm font-bold text-white">
                        {name.charAt(0)}
                    </span>
                )}
                {!gemini.loading && !gemini.healthy && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-slate-950" aria-hidden />
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-slate-900/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-md"
                >
                    <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                        {session.user?.image && (
                            <Image src={session.user.image} alt="" width={40} height={40} className="rounded-full ring-2 ring-purple-500/50" />
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-100">{name}</p>
                            {session.user?.email && <p className="truncate text-xs text-slate-400">{session.user.email}</p>}
                        </div>
                    </div>

                    <dl className="space-y-1.5 py-3 text-xs">
                        <div className="flex items-center justify-between" data-tour="auth-status">
                            <dt className="flex items-center gap-1.5 text-slate-400"><CheckCircle className="h-3.5 w-3.5" /> GitHub</dt>
                            <dd className="text-emerald-300">Signed in</dd>
                        </div>
                        <div className="flex items-center justify-between" data-tour="gemini-status">
                            <dt className="flex items-center gap-1.5 text-slate-400"><Zap className="h-3.5 w-3.5" /> Gemini AI</dt>
                            <dd className={`flex items-center gap-1.5 ${geminiRow.cls}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${geminiRow.dot}`} /> {geminiRow.label}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between" data-tour="version-info">
                            <dt className="flex items-center gap-1.5 text-slate-400"><Tag className="h-3.5 w-3.5" /> Version</dt>
                            <dd className="text-sky-300 tabular-nums">{APP_VERSION}</dd>
                        </div>
                    </dl>

                    <div className="flex items-center gap-2 pt-3 border-t border-white/10">
                        {onStartTour && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setOpen(false); onStartTour(); }}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-500/10"
                            >
                                <HelpCircle className="h-3.5 w-3.5" /> Tour
                            </button>
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => signOut()}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/15"
                        >
                            <LogOut className="h-3.5 w-3.5" /> Sign out
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
