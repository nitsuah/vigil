import type { DocStatus } from '@/types/repo';

const DOCS = [
  ['readme', 'README'],
  ['roadmap', 'Roadmap'],
  ['tasks', 'Tasks'],
  ['metrics', 'Metrics'],
  ['features', 'Features'],
] as const;

const STATE_COLORS: Record<string, string> = {
  healthy: 'text-green-400',
  dormant: 'text-yellow-400',
  malformed: 'text-orange-400',
  missing: 'text-red-400',
};

/** Each core document's name and state in words, so neither colour nor hover is needed. */
export function DocStatusList({ docStatuses }: { docStatuses: DocStatus[] }) {
  return (
    <ul aria-label="Document status" className="space-y-0.5 text-xs">
      {DOCS.map(([type, label]) => {
        const doc = docStatuses.find((d) => d.doc_type === type);
        const state = doc?.health_state || (doc?.exists ? 'healthy' : 'missing');
        return (
          <li key={type} className="flex justify-between gap-3 whitespace-nowrap">
            <span className="text-slate-300">{label}</span>
            <span className={STATE_COLORS[state] ?? 'text-slate-400'}>{state}</span>
          </li>
        );
      })}
    </ul>
  );
}
