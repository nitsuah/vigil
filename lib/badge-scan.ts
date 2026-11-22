/**
 * Linear-time extraction of badge/image references from README text.
 *
 * The scan is capped (MAX_BADGE_SCAN_CHARS) and never backtracks: each
 * closing delimiter is located at most once and reused, so unterminated
 * constructs cannot make the cost grow faster than the input.
 */

export const MAX_BADGE_SCAN_CHARS = 200_000;
/** Longest `<img ...>` tag considered; longer ones are ignored. */
export const MAX_IMG_TAG_CHARS = 4_000;
/** Longest image URL handed to the scorer. */
export const MAX_BADGE_URL_CHARS = 2_048;

export interface BadgeCandidates {
    /** `![alt](src)` sources. */
    markdown: string[];
    /** `[![alt](src)](href)` image sources (same shape as markdown ones, but wrapped in a link). */
    linked: string[];
    /** `<img src=... alt=...>` tags. */
    html: Array<{ src: string; alt?: string }>;
}

/** Memoised "first index of `ch` at or after `from`" so repeated misses stay O(n) overall. */
function makeFinder(text: string, ch: string): (from: number) => number {
    let cached = -2; // -2: not computed yet; -1: no occurrence in the rest of the text
    return (from) => {
        if (cached === -1) return -1;
        if (cached >= from) return cached;
        cached = text.indexOf(ch, from);
        return cached;
    };
}

const imgStart = /<img\s/gi;
const srcAttr = /\bsrc=["']([^"']+)["']/i;
const altAttr = /\balt=["']([^"']+)["']/i;

export function extractBadgeCandidates(readme: string): BadgeCandidates {
    const text = readme.length > MAX_BADGE_SCAN_CHARS ? readme.slice(0, MAX_BADGE_SCAN_CHARS) : readme;
    const out: BadgeCandidates = { markdown: [], linked: [], html: [] };

    const nextBracket = makeFinder(text, ']');
    const nextParen = makeFinder(text, ')');

    // Markdown images, and which of them are wrapped in a link.
    let i = 0;
    while (i < text.length) {
        const start = text.indexOf('![', i);
        if (start === -1) break;
        const close = nextBracket(start + 2);
        if (close === -1) break;
        if (text[close + 1] !== '(') {
            i = start + 2;
            continue;
        }
        const end = nextParen(close + 2);
        if (end === -1) break;
        if (end === close + 2) {
            // Empty "()" is not an image reference.
            i = start + 2;
            continue;
        }
        const src = text.slice(close + 2, end);
        out.markdown.push(src);

        if (start > 0 && text[start - 1] === '[' && text.startsWith('](', end + 1)) {
            const hrefEnd = nextParen(end + 3);
            if (hrefEnd > end + 3) out.linked.push(src);
        }
        i = end + 1;
    }

    // HTML <img> tags: locate the tag end once, then read attributes from that slice only.
    const nextGt = makeFinder(text, '>');
    imgStart.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = imgStart.exec(text)) !== null) {
        const gt = nextGt(m.index + m[0].length);
        if (gt === -1) break;
        const tag = text.slice(m.index, gt + 1);
        imgStart.lastIndex = gt + 1;
        if (tag.length > MAX_IMG_TAG_CHARS) continue;
        const src = tag.match(srcAttr)?.[1];
        if (!src) continue;
        out.html.push({ src, alt: tag.match(altAttr)?.[1] });
    }

    return out;
}
