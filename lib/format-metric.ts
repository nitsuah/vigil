const COMPACT_UNIT = /^(%|[a-z]{1,2})$/i;

/** Join a metric value and unit for display: "86%", "6s", "245KB", but "2.4992 functions", "151 🟢 Pass". */
export function joinMetricValue(value: number | string, unit?: string | null): string {
    if (!unit) return `${value}`;
    return COMPACT_UNIT.test(unit) ? `${value}${unit}` : `${value} ${unit}`;
}