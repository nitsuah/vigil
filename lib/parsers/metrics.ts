import { parseFrontMatter } from './front-matter';

export interface MetricsData {
    frontmatter: {
        repo?: string;
        updated?: string;
        [key: string]: unknown;
    };
    metrics: MetricItemData[];
}

export interface MetricItemData {
    name: string;
    value: number;
    unit: string | null;
}

export function parseMetrics(content: string): MetricsData {
    const { data: frontmatter, content: markdown } = parseFrontMatter(content);

    const metrics: MetricItemData[] = [];

    // Extract metrics from frontmatter if present
    if (frontmatter.metrics && Array.isArray(frontmatter.metrics)) {
        for (const metric of frontmatter.metrics) {
            if (metric.name && metric.value !== undefined) {
                const v = parseFloat(metric.value);
                if (Number.isFinite(v)) {
                    metrics.push({ name: metric.name, value: v, unit: metric.unit || null });
                }
            }
        }
    }

    // Parse markdown tables (| Metric | Value | Unit |)
    const lines = markdown.split('\n');
    let inTable = false;
    let headerParsed = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Detect table start
        if (trimmed.startsWith('|') && !inTable) {
            inTable = true;
            continue;
        }

        // Skip separator line
        if (inTable && !headerParsed && trimmed.match(/^\|[\s:-]+\|/)) {
            headerParsed = true;
            continue;
        }

        // Parse table rows
        if (inTable && headerParsed && trimmed.startsWith('|')) {
            const cells = trimmed
                .split('|')
                .map((cell) => cell.trim())
                .filter((cell) => cell);

            if (cells.length >= 2) {
                const name = cells[0];
                const rawValue = cells[1];
                const notes = cells.length >= 3 ? cells[2] : null;
                
                // Extract numeric value and unit
                let value: number;
                let unit: string | null = null;
                
                // Check if value contains a percent sign
                if (rawValue.includes('%')) {
                    const numStr = rawValue.replace(/[^0-9.-]/g, '');
                    value = parseFloat(numStr);
                    unit = '%';

                    // Normalize: if value is between 0 and 1, convert to percentage
                    // e.g., 0.8666 -> 86.66, but 86.66 stays as 86.66
                    if (Number.isFinite(value) && value > 0 && value < 1) {
                        value = value * 100;
                    }
                } else {
                    // Try to extract just the number
                    const numStr = rawValue.replace(/[^0-9.-]/g, '');
                    value = parseFloat(numStr);

                    // Extract unit from the original value (e.g., "6s" -> "s", "245KB" -> "KB")
                    const unitMatch = rawValue.match(/[a-zA-Z]+/);
                    if (unitMatch) {
                        unit = unitMatch[0];
                    } else if (notes) {
                        // Use notes column as unit if available, but only if it's short
                        unit = notes.length <= 15 ? notes : null;
                    }
                }

                if (Number.isFinite(value)) {
                    metrics.push({ name, value, unit });
                }
            }
        }

        // End of table
        if (inTable && !trimmed.startsWith('|')) {
            inTable = false;
            headerParsed = false;
        }
    }

    return {
        frontmatter,
        metrics,
    };
}
