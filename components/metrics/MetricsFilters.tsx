import { AUTHOR_OPTIONS, LABEL_OPTIONS, WEEK_OPTIONS, type MetricsFilterState } from '@/lib/metrics-charts';

const chip = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${on
        ? 'bg-indigo-600/25 border-indigo-400/60 text-indigo-200'
        : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`;

/** Repo, label, author-type and range filters; the parent keeps them in the URL. */
export function MetricsFilters({ value, available, onChange }: {
    value: MetricsFilterState;
    available: Array<{ full_name: string; name: string }>;
    /** Takes an updater so rapid clicks compose instead of overwriting each other. */
    onChange: (update: (prev: MetricsFilterState) => MetricsFilterState) => void;
}): React.JSX.Element {
    const toggleRepo = (full: string) =>
        onChange((v) => ({ ...v, repos: v.repos.includes(full) ? v.repos.filter((r) => r !== full) : [...v.repos, full] }));
    return (
        <form className="rounded-xl border border-white/8 bg-slate-900/60 p-4 space-y-3" aria-label="Metrics filters" onSubmit={(e) => e.preventDefault()}>
            <fieldset className="flex items-center gap-2 flex-wrap">
                <legend className="sr-only">Range</legend>
                <label htmlFor="metrics-weeks" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Range</label>
                <select
                    id="metrics-weeks"
                    value={value.weeks}
                    onChange={(e) => onChange((v) => ({ ...v, weeks: Number(e.target.value) }))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
                >
                    {WEEK_OPTIONS.map((w) => <option key={w} value={w}>Last {w} weeks</option>)}
                </select>
            </fieldset>
            <fieldset className="flex items-center gap-2 flex-wrap">
                <legend className="sr-only">Label</legend>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider" aria-hidden="true">Label</span>
                {LABEL_OPTIONS.map((l) => (
                    <button key={l} type="button" aria-pressed={value.label === l} className={chip(value.label === l)} onClick={() => onChange((v) => ({ ...v, label: v.label === l ? null : l }))}>{l}</button>
                ))}
            </fieldset>
            <fieldset className="flex items-center gap-2 flex-wrap">
                <legend className="sr-only">Author type</legend>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider" aria-hidden="true">Author</span>
                {AUTHOR_OPTIONS.map((a) => (
                    <button key={a} type="button" aria-pressed={value.authorType === a} className={chip(value.authorType === a)} onClick={() => onChange((v) => ({ ...v, authorType: v.authorType === a ? null : a }))}>{a}</button>
                ))}
            </fieldset>
            {available.length > 0 && (
                <fieldset className="flex items-center gap-2 flex-wrap">
                    <legend className="sr-only">Repos</legend>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider" aria-hidden="true">Repos</span>
                    {available.map((r) => (
                        <button key={r.full_name} type="button" aria-pressed={value.repos.includes(r.full_name)} className={chip(value.repos.includes(r.full_name))} onClick={() => toggleRepo(r.full_name)}>{r.name}</button>
                    ))}
                    {value.repos.length > 0 && (
                        <button type="button" className="text-xs text-slate-400 hover:text-slate-200 underline" onClick={() => onChange((v) => ({ ...v, repos: [] }))}>All repos</button>
                    )}
                </fieldset>
            )}
        </form>
    );
}
