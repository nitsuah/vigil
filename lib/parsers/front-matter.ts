import matter from 'gray-matter';

// gray-matter lets a document pick its own front-matter language with a "---js" / "---javascript" fence and then
// EVALUATES it as JavaScript on the server. Repository documents are untrusted, so only YAML and JSON are allowed.
class FrontMatterLanguageError extends Error {}

const refuse = (): never => {
    throw new FrontMatterLanguageError('Front matter language is not allowed');
};
const OPTIONS = {
    language: 'yaml',
    engines: { js: refuse, javascript: refuse, coffee: refuse, coffeescript: refuse, cson: refuse },
};

/** The document with its leading front-matter block (opening fence line through the closing "---" line) removed. */
function stripFrontMatterBlock(content: string): string {
    // gray-matter ignores a leading UTF-8 BOM, so the opening fence can sit behind one.
    const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const lines = text.split(/\r?\n/);
    if (!lines[0]?.startsWith('---')) return text;
    const close = lines.findIndex((line, i) => i > 0 && line.trimEnd() === '---');
    return close === -1 ? '' : lines.slice(close + 1).join('\n');
}

/**
 * Parse optional front matter without ever executing code.
 * A fence that selects an executable language is dropped (no data, body = what follows the block), so its text can
 * never be mistaken for document content. Genuinely malformed YAML/JSON still throws, exactly as before, so callers
 * abort instead of acting on a half-parsed document.
 */
export function parseFrontMatter(content: string): { data: matter.GrayMatterFile<string>['data']; content: string } {
    try {
        const { data, content: body } = matter(content, OPTIONS);
        return { data, content: body };
    } catch (e) {
        if (e instanceof FrontMatterLanguageError) return { data: {}, content: stripFrontMatterBlock(content) };
        throw e;
    }
}
