import type { RepoWeekly } from '@/app/api/metrics/overview/route';
import { formatMetricValue } from '@/lib/metrics-charts';

/** This week's numbers per repo. */
export function RepoBreakdown({ repos }: { repos: RepoWeekly[] }): React.JSX.Element {
    return (
        <section className="rounded-xl border border-white/8 bg-slate-900/60 overflow-x-auto">
            <table className="w-full text-sm">
                <caption className="text-left px-4 pt-3 text-xs font-semibold text-slate-300 uppercase tracking-wider">By repo, this week</caption>
                <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                        <th scope="col" className="text-left px-4 py-2 font-semibold">Repo</th>
                        {['Opened', 'Closed', 'PRs merged', 'Lead p50', 'Bugs in', 'Bugs fixed', 'imp merged'].map((h) => (
                            <th key={h} scope="col" className="text-right px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {repos.map((r) => (
                        <tr key={r.id} className="border-t border-white/5">
                            <th scope="row" className="text-left px-4 py-2 font-medium text-slate-200 whitespace-nowrap">{r.name}</th>
                            {[r.current.issuesOpened, r.current.issuesClosed, r.current.prsMerged].map((v, i) => (
                                <td key={i} className="text-right px-3 py-2 tabular-nums text-slate-300">{v}</td>
                            ))}
                            <td className="text-right px-3 py-2 tabular-nums text-slate-300">{formatMetricValue(r.current.leadTimeP50Hours, 'hours')}</td>
                            {[r.current.bugsOpened, r.current.bugsClosed, r.current.impPrsMerged].map((v, i) => (
                                <td key={i} className="text-right px-3 py-2 tabular-nums text-slate-300">{v}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}
