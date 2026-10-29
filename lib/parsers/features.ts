import { parseFrontMatter } from './front-matter';

export interface FeaturesData {
    frontmatter: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    };
    categories: FeatureCategory[];
}

export interface FeatureCategory {
    name: string;
    description?: string;
    items: string[];
}

export function parseFeatures(content: string): FeaturesData {
    const { data: frontmatter, content: markdown } = parseFrontMatter(content);

    const categories: FeatureCategory[] = [];
    const lines = markdown.split(/\r?\n/);
    let currentCategory: FeatureCategory | null = null;
    let pendingDescription: string[] = [];

    for (const line of lines) {
        // Detect category headers - prioritize ### (h3), but accept ## (h2) as fallback
        const categoryMatch = line.match(/^(#{2,3})\s+(.+)$/);
        if (categoryMatch) {
            // Save previous category
            if (currentCategory && currentCategory.items.length > 0) {
                categories.push(currentCategory);
            }

            const title = categoryMatch[2].trim();
            currentCategory = {
                name: title,
                items: [],
            };
            pendingDescription = [];
            continue;
        }

        // Parse list items (features) - handle both - and * bullets
        const itemMatch = line.match(/^[-*]\s+(.+)$/);
        if (itemMatch && currentCategory) {
            // If we had pending description lines, join them
            if (pendingDescription.length > 0 && !currentCategory.description) {
                currentCategory.description = pendingDescription.join(' ').trim();
                pendingDescription = [];
            }

            const itemText = itemMatch[1].trim();
            // Remove bolding if present at start (e.g. **Feature Name**: Description)
            const cleanItem = itemText.replace(/^\*\*(.+?)\*\*[:\s-]+/, '$1: ');
            currentCategory.items.push(cleanItem);
        } else if (currentCategory && line.trim() && !line.startsWith('#') && !line.startsWith('<!--')) {
            // Collect description lines (non-empty, non-header, non-list, non-comment)
            if (currentCategory.items.length === 0) {
                pendingDescription.push(line.trim());
            }
        }
    }

    // Push the last category
    if (currentCategory && currentCategory.items.length > 0) {
        categories.push(currentCategory);
    }

    return {
        frontmatter,
        categories,
    };
}
