import { AlertTriangle, CheckCircle2, Clock, MinusCircle, type LucideIcon } from 'lucide-react';
import type { JourneysStatus } from '@/lib/journeys-metrics';

const BADGE: Record<JourneysStatus, { label: string; Icon: LucideIcon; cls: string }> = {
    green: { label: 'Passing', Icon: CheckCircle2, cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
    red: { label: 'Failing', Icon: AlertTriangle, cls: 'text-red-300 border-red-500/50 bg-red-500/15' },
    stale: { label: 'Stale', Icon: Clock, cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
    none: { label: 'No runs yet', Icon: MinusCircle, cls: 'text-slate-400 border-slate-600/40 bg-slate-600/10' },
};

/** Status as icon + word + colour, so it never depends on colour alone. */
export function JourneysStatusBadge({ status }: { status: JourneysStatus }) {
    const { label, Icon, cls } = BADGE[status];
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold ${cls}`}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
        </span>
    );
}
