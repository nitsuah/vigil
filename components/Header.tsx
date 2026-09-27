"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { LogOut, Plus, Filter, X, RefreshCw, HelpCircle, LayoutDashboard, Menu, Settings, EyeOff } from "lucide-react";
import Link from "next/link";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { VigilIcon } from "@/components/icons/VigilIcon";
import Image from "next/image";
import { getLanguageColor } from "@/lib/language-colors";
import { useState } from "react";
import { RepoType } from "@/lib/repo-type";
import { useRateLimit, RateLimitDisplay } from "./RateLimitIndicator";
import { ProfileMenu } from "./ProfileMenu";

interface HeaderProps {
    repoCount?: { filtered: number; total: number };
    showAddRepo?: boolean;
    addRepoUrl?: string;
    addRepoType?: string;
    addingRepo?: boolean;
    showFilters?: boolean;
    syncing?: boolean;
    isAuthenticated?: boolean;
    filterType?: RepoType | 'all';
    filterLanguage?: string;
    filterFork?: 'all' | 'no-forks' | 'forks-only';
    languages?: string[];
    onAddRepoUrlChange?: (url: string) => void;
    onAddRepoTypeChange?: (type: RepoType) => void;
    onAddRepoSubmit?: (e: React.FormEvent) => void;
    onToggleAddRepo?: () => void;
    onToggleFilters?: () => void;
    onSync?: () => void;
    onFilterTypeChange?: (type: RepoType | 'all') => void;
    onFilterLanguageChange?: (language: string) => void;
    onFilterForkChange?: (fork: 'all' | 'no-forks' | 'forks-only') => void;
    onClearFilters?: () => void;
    onStartTour?: () => void;
    showHidden?: boolean;
    onToggleHidden?: () => void;
    onOpenSettings?: () => void;
}

const repoTypes: RepoType[] = ['web-app', 'game', 'tool', 'library', 'bot', 'research', 'unknown'];

export default function Header(props: HeaderProps = {}) {
    const { data: session, status } = useSession();
    const rateLimitState = useRateLimit(!!session);

    const {
        repoCount,
        showAddRepo,
        addRepoUrl,
        addRepoType,
        addingRepo,
        showFilters,
        syncing,
        filterType,
        filterLanguage,
        filterFork,
        languages = [],
        onAddRepoUrlChange,
        onAddRepoTypeChange,
        onAddRepoSubmit,
        onToggleAddRepo,
        onToggleFilters,
        onSync,
        onFilterTypeChange,
        onFilterLanguageChange,
        onFilterForkChange,
        onClearFilters,
        onStartTour,
        showHidden,
        onToggleHidden,
        onOpenSettings,
    } = props;

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const hasActiveFilters = filterType && (filterType !== 'all' || filterLanguage !== 'all' || filterFork !== 'all');

    if (status === "loading") return null;

    return (
        <header className="header-dark relative flex flex-col py-2 px-4 md:px-6 text-white shadow-lg border-b border-white/10">
        {/* Main row */}
        <div className="flex items-center justify-between w-full">
            {/* Left Cluster */}
            <div className="flex items-center gap-3">
                {/* Vigil icon — doubles as sync trigger (full sync with RGB flair) */}
                <button
                    onClick={onSync}
                    disabled={syncing}
                    className="relative group/icon cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                    title="Sync all repositories"
                >
                    <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-indigo-600/10 to-purple-600/10 border border-indigo-500/20 group-hover/icon:border-indigo-400/50 group-hover/icon:from-indigo-600/20 group-hover/icon:to-purple-600/20 group-hover/icon:shadow-lg group-hover/icon:shadow-indigo-500/20 transition-all duration-200">
                        {/* RGB animated glow ring */}
                        <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 opacity-0 group-hover/icon:opacity-30 transition-opacity duration-300 motion-safe:animate-[spin_3s_linear_infinite] blur" />
                        <VigilIcon className={`h-6 w-6 text-indigo-300 group-hover/icon:text-indigo-200 transition-colors duration-200 relative z-10 ${syncing ? 'animate-spin drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'motion-safe:animate-[pulse_2s_ease-in-out_infinite] drop-shadow-[0_0_4px_rgba(168,85,247,0.4)]'}`} />
                    </div>
                    {/* Sync all label on hover/focus */}
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 text-xs bg-slate-900 border border-indigo-500/30 rounded opacity-0 group-hover/icon:opacity-100 group-focus-visible/icon:opacity-100 transition-opacity duration-200 whitespace-nowrap text-indigo-300">
                        Sync All
                    </span>
                </button>
                <div className="flex flex-col leading-none gap-0.5">
                    <h1 className="text-lg font-bold tracking-wide">
                        <span className="bg-gradient-to-r from-indigo-300 via-purple-300 to-fuchsia-300 bg-clip-text text-transparent">
                            Vigil
                        </span>
                    </h1>
                    <span className="text-[9px] text-slate-500 tracking-widest uppercase font-medium hidden md:block">
                        Repo Intelligence
                    </span>
                </div>
            </div>

            {/* Right Cluster — desktop only */}
            <div className="hidden md:flex items-center gap-3">
                {/* Rate Limit Indicator */}
                {session && <RateLimitDisplay {...rateLimitState} />}

                {/* Repo Controls */}
                {session && onToggleAddRepo && (
                    <div className="flex items-center gap-2">
                        {/* Compact Add Repo */}
                        <div className="relative group/add" data-tour="add-repo">
                            <div className={`absolute -inset-0.5 bg-gradient-to-r from-emerald-600 to-green-600 rounded-lg opacity-0 group-hover/add:opacity-20 blur transition-all duration-300 ${showAddRepo ? 'opacity-30' : ''}`}></div>
                            <div className={`relative flex items-center gap-2 bg-slate-800/90 border rounded-lg transition-all duration-300 ${showAddRepo
                                ? 'border-emerald-600/50 shadow-lg shadow-emerald-600/20 pr-2 py-2'
                                : 'border-slate-700 hover:border-emerald-600/30 px-3 py-2'
                                }`}>
                                {showAddRepo ? (
                                    <form onSubmit={onAddRepoSubmit} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            aria-label="Repository URL (owner/repo)"
                                            value={addRepoUrl}
                                            onChange={(e) => onAddRepoUrlChange?.(e.target.value)}
                                            placeholder="owner/repo"
                                            className="w-40 px-3 py-0 bg-transparent text-slate-200 placeholder:text-slate-500 focus:outline-none text-sm"
                                            autoFocus
                                        />
                                        <select
                                            value={addRepoType}
                                            onChange={(e) => onAddRepoTypeChange?.(e.target.value as RepoType)}
                                            className="px-2 py-1 bg-slate-900/50 border border-slate-700 rounded text-slate-300 focus:outline-none text-xs"
                                        >
                                            <option value="unknown">Type</option>
                                            <option value="web-app">Web App</option>
                                            <option value="game">Game</option>
                                            <option value="tool">Tool</option>
                                            <option value="library">Library</option>
                                            <option value="bot">Bot</option>
                                            <option value="research">Research</option>
                                        </select>
                                        <button
                                            type="submit"
                                            disabled={addingRepo || !addRepoUrl?.trim()}
                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-all flex items-center gap-1.5 min-w-[60px] justify-center"
                                        >
                                            {addingRepo ? (
                                                <>
                                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                                    <span>Adding</span>
                                                </>
                                            ) : 'Add'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onToggleAddRepo}
                                            className="p-1 text-slate-400 hover:text-slate-200"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </form>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (showFilters) onToggleFilters?.();
                                            onToggleAddRepo();
                                        }}
                                        className="flex items-center gap-1.5 text-sm font-medium text-slate-300 group-hover/add:text-emerald-400 transition-colors"
                                    >
                                        <Plus className="h-4 w-4" />
                                        <span>Add</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Compact Filters */}
                        <div className="relative group/filter">
                            <div className={`absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg opacity-0 group-hover/filter:opacity-20 blur transition-all duration-300 ${showFilters ? 'opacity-30' : ''}`}></div>
                            <div className={`relative flex items-center gap-2 bg-slate-800/90 border rounded-lg transition-all duration-300 ${showFilters
                                ? 'border-blue-600/50 shadow-lg shadow-blue-600/20 pr-2 py-2'
                                : hasActiveFilters
                                    ? 'border-purple-600/50 px-3 py-2'
                                    : 'border-slate-700 hover:border-blue-600/30 px-3 py-2'
                                }`}>
                                {showFilters ? (
                                    <div className="flex items-center gap-1.5">
                                        <select
                                            value={filterType}
                                            onChange={(e) => onFilterTypeChange?.(e.target.value as RepoType | 'all')}
                                            className="px-3 py-1.5 bg-slate-700/60 border-2 border-purple-500/60 rounded-lg text-slate-100 hover:border-purple-400/80 hover:shadow-sm hover:shadow-purple-500/30 focus:outline-none focus:border-purple-400 transition-all duration-200 text-sm font-medium cursor-pointer"
                                        >
                                            <option value="all" className="bg-slate-900 text-slate-300">Type</option>
                                            {repoTypes.map((t) => (
                                                <option key={t} value={t} className="bg-slate-900 text-slate-300">
                                                    {t.charAt(0).toUpperCase() + t.slice(1).replace('-', ' ')}
                                                </option>
                                            ))}
                                        </select>
                                        <select
                                            value={filterLanguage}
                                            onChange={(e) => onFilterLanguageChange?.(e.target.value)}
                                            className="px-3 py-1.5 bg-slate-700/60 border-2 border-blue-500/60 rounded-lg text-slate-100 hover:border-blue-400/80 hover:shadow-sm hover:shadow-blue-500/30 focus:outline-none focus:border-blue-400 transition-all duration-200 text-sm font-medium cursor-pointer"
                                        >
                                            <option value="all" className="bg-slate-900 text-slate-300">Language</option>
                                            {[...languages].sort().map((lang) => {
                                                const colorClass = getLanguageColor(lang);
                                                return (
                                                    <option key={lang} value={lang} className={`bg-slate-900 ${colorClass} font-semibold`}>
                                                        {lang}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <select
                                            value={filterFork}
                                            onChange={(e) => onFilterForkChange?.(e.target.value as 'all' | 'no-forks' | 'forks-only')}
                                            className="px-3 py-1.5 bg-slate-700/60 border-2 border-fuchsia-500/60 rounded-lg text-slate-100 hover:border-fuchsia-400/80 hover:shadow-sm hover:shadow-fuchsia-500/30 focus:outline-none focus:border-fuchsia-400 transition-all duration-200 text-sm font-medium cursor-pointer"
                                        >
                                            <option value="all" className="bg-slate-900 text-slate-300">Fork</option>
                                            <option value="no-forks" className="bg-slate-900 text-slate-300">No Forks</option>
                                            <option value="forks-only" className="bg-slate-900 text-slate-300">Forks Only</option>
                                        </select>
                                        {/* Hidden toggle inside filter dropdown */}
                                        {onToggleHidden && (
                                            <button
                                                onClick={onToggleHidden}
                                                className={`flex items-center gap-2 px-3 py-1.5 bg-slate-700/60 border-2 rounded-lg text-slate-100 hover:border-indigo-400/80 hover:shadow-sm hover:shadow-indigo-500/30 focus:outline-none focus:border-indigo-400 transition-all duration-200 text-sm font-medium cursor-pointer ${showHidden ? 'border-indigo-500/60 text-indigo-400' : 'border-slate-600 text-slate-400'}`}
                                            >
                                                <EyeOff className="h-3.5 w-3.5" />
                                                <span>{showHidden ? 'Hide hidden' : 'Show hidden'}</span>
                                            </button>
                                        )}
                                        {hasActiveFilters && (
                                            <button
                                                onClick={onClearFilters}
                                                className="px-2 py-1 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded transition-colors font-medium"
                                            >
                                                Clear
                                            </button>
                                        )}
                                        <button
                                            onClick={onToggleFilters}
                                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition-colors"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => {
                                            if (showAddRepo) onToggleAddRepo?.();
                                            onToggleFilters?.();
                                        }}
                                        className="flex items-center gap-1.5 text-sm font-medium transition-colors relative"
                                        data-tour="filters"
                                        title="Filters"
                                        aria-label="Filters"
                                    >
                                        <Filter className={`h-4 w-4 ${hasActiveFilters ? 'text-purple-400' : 'text-slate-300 group-hover/filter:text-blue-400'}`} />
                                        {repoCount && (
                                            <span className="pill relative overflow-hidden text-sky-300 font-bold shadow-lg shadow-sky-500/20 ml-1 text-[10px]">
                                                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent motion-safe:animate-[shimmer_3s_infinite]"></span>
                                                <span className="relative">{repoCount.filtered}/{repoCount.total}</span>
                                            </span>
                                        )}
                                        {hasActiveFilters && (
                                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Settings (BYOK AI key) */}
                {session && onOpenSettings && (
                    <button
                        onClick={onOpenSettings}
                        className="p-2 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition-all duration-200"
                        title="AI provider settings"
                        aria-label="AI provider settings"
                    >
                        <Settings className="h-4 w-4" />
                    </button>
                )}

                {/* PMO Link */}
                {session && (
                    <Link
                        href="/pmo"
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800/90 border border-slate-700 hover:border-indigo-500/50 hover:text-indigo-300 rounded-lg text-sm font-medium text-slate-300 transition-all duration-200"
                        title="PMO Dashboard"
                    >
                        <LayoutDashboard className="h-4 w-4" />
                        <span>PMO</span>
                    </Link>
                )}

                {session ? (
                    <ProfileMenu session={session} onStartTour={onStartTour} />
                ) : (
                    <button
                        onClick={() => signIn('github', { redirectTo: '/' })}
                        className="btn-raised btn-primary-gradient flex items-center gap-2 px-5 py-2"
                    >
                        <GithubIcon className="h-5 w-5" />
                        <span className="font-semibold">Sign in with GitHub</span>
                    </button>
                )}
            </div>

            {/* Mobile-only right cluster */}
            <div className="flex md:hidden items-center gap-2">
                {session && (
                    <button
                        onClick={() => setMobileMenuOpen(o => !o)}
                        className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300"
                        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={mobileMenuOpen}
                    >
                        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                )}
                {!session && (
                    <button
                        onClick={() => signIn('github', { redirectTo: '/' })}
                        className="btn-raised btn-primary-gradient flex items-center gap-2 px-3 py-2 text-sm"
                    >
                        <GithubIcon className="h-4 w-4" />
                        <span className="font-semibold">Sign in</span>
                    </button>
                )}
            </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && session && (
            <div className="md:hidden mt-3 border-t border-slate-700/50 pt-3 flex flex-col gap-3">
                {/* Action row — "Sync All" is intentionally not duplicated here; the
                    top mobile bar already has a one-tap sync icon. */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        href="/pmo"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-slate-300"
                    >
                        <LayoutDashboard className="h-4 w-4" />
                        PMO
                    </Link>
                    {onOpenSettings && (
                        <button
                            onClick={() => { onOpenSettings(); setMobileMenuOpen(false); }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-slate-300"
                        >
                            <Settings className="h-4 w-4" />
                            AI Settings
                        </button>
                    )}
                    {onToggleAddRepo && (
                        <button
                            onClick={() => {
                                if (showFilters) onToggleFilters?.();
                                onToggleAddRepo();
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-slate-300"
                        >
                            <Plus className="h-4 w-4" />
                            Add Repo
                        </button>
                    )}
                    {onToggleFilters && (
                        <button
                            onClick={() => {
                                if (showAddRepo) onToggleAddRepo?.();
                                onToggleFilters();
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 bg-slate-800 border rounded-lg text-sm font-medium transition-colors ${hasActiveFilters ? 'border-purple-500/50 text-purple-400' : 'border-slate-700 text-slate-300'}`}
                        >
                            <Filter className="h-4 w-4" />
                            Filters
                            {repoCount && (
                                <span className="text-xs text-sky-400 font-bold">{repoCount.filtered}/{repoCount.total}</span>
                            )}
                        </button>
                    )}
                    {onStartTour && (
                        <button
                            onClick={() => { onStartTour(); setMobileMenuOpen(false); }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-medium text-slate-300"
                        >
                            <HelpCircle className="h-4 w-4" />
                            Tour
                        </button>
                    )}
                </div>

                {/* Mobile add-repo form (shown when toggled) */}
                {showAddRepo && onAddRepoSubmit && (
                    <form onSubmit={onAddRepoSubmit} className="flex items-center gap-2 flex-wrap">
                        <input
                            type="text"
                            aria-label="Repository URL (owner/repo)"
                            value={addRepoUrl}
                            onChange={(e) => onAddRepoUrlChange?.(e.target.value)}
                            placeholder="owner/repo"
                            className="flex-1 min-w-0 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-600/50 text-sm"
                            autoFocus
                        />
                        <select
                            aria-label="Repository type"
                            value={addRepoType}
                            onChange={(e) => onAddRepoTypeChange?.(e.target.value as RepoType)}
                            className="px-2 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-300 focus:outline-none text-sm"
                        >
                            <option value="unknown">Type</option>
                            <option value="web-app">Web App</option>
                            <option value="game">Game</option>
                            <option value="tool">Tool</option>
                            <option value="library">Library</option>
                            <option value="bot">Bot</option>
                            <option value="research">Research</option>
                        </select>
                        <button
                            type="submit"
                            disabled={addingRepo || !addRepoUrl?.trim()}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-medium"
                        >
                            {addingRepo ? 'Adding…' : 'Add'}
                        </button>
                    </form>
                )}

                {/* Mobile filters (shown when toggled) */}
                {showFilters && (
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 flex-wrap">
                            <select
                                aria-label="Filter by repository type"
                                value={filterType}
                                onChange={(e) => onFilterTypeChange?.(e.target.value as RepoType | 'all')}
                                className="flex-1 px-3 py-2 bg-slate-700/60 border border-purple-500/60 rounded-lg text-slate-100 focus:outline-none text-sm"
                            >
                                <option value="all">All Types</option>
                                {repoTypes.map((t) => (
                                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('-', ' ')}</option>
                                ))}
                            </select>
                            <select
                                aria-label="Filter by language"
                                value={filterLanguage}
                                onChange={(e) => onFilterLanguageChange?.(e.target.value)}
                                className="flex-1 px-3 py-2 bg-slate-700/60 border border-blue-500/60 rounded-lg text-slate-100 focus:outline-none text-sm"
                            >
                                <option value="all">All Languages</option>
                                {[...languages].sort().map((lang) => (
                                    <option key={lang} value={lang}>{lang}</option>
                                ))}
                            </select>
                            <select
                                aria-label="Filter by fork status"
                                value={filterFork}
                                onChange={(e) => onFilterForkChange?.(e.target.value as 'all' | 'no-forks' | 'forks-only')}
                                className="flex-1 px-3 py-2 bg-slate-700/60 border border-fuchsia-500/60 rounded-lg text-slate-100 focus:outline-none text-sm"
                            >
                                <option value="all">All</option>
                                <option value="no-forks">No Forks</option>
                                <option value="forks-only">Forks Only</option>
                            </select>
                        </div>
                        {/* Hidden toggle inside mobile filter dropdown */}
                        {onToggleHidden && (
                            <button
                                onClick={onToggleHidden}
                                className={`self-start flex items-center gap-2 px-3 py-2 bg-slate-700/60 border-2 rounded-lg text-slate-100 hover:border-indigo-400/80 hover:shadow-sm hover:shadow-indigo-500/30 focus:outline-none focus:border-indigo-400 transition-all duration-200 text-sm font-medium ${showHidden ? 'border-indigo-500/60 text-indigo-400' : 'border-slate-600 text-slate-400'}`}
                            >
                                <EyeOff className="h-3.5 w-3.5" />
                                <span>{showHidden ? 'Hide hidden' : 'Show hidden'}</span>
                            </button>
                        )}
                        {hasActiveFilters && (
                            <button
                                onClick={onClearFilters}
                                className="self-start px-3 py-1.5 text-sm text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                )}

                {/* Profile + rate limit — last items in the mobile expanded nav */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/50">
                    <div className="flex items-center gap-2 min-w-0">
                        {session.user?.image && (
                            <Image
                                src={session.user.image}
                                alt={session.user?.name ?? 'User'}
                                width={32}
                                height={32}
                                className="rounded-full ring-1 ring-purple-500/60 shrink-0"
                            />
                        )}
                        <span className="text-sm font-semibold text-slate-200 truncate">{session.user?.name}</span>
                        <button
                            onClick={() => signOut()}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs shrink-0"
                        >
                            <LogOut className="h-3 w-3" />
                            Sign out
                        </button>
                    </div>
                    <RateLimitDisplay {...rateLimitState} />
                </div>
            </div>
        )}
        </header>
    );
}
