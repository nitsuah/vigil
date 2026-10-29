import matter from 'gray-matter';

// gray-matter lets a document pick its own front-matter language with a "---js" / "---javascript" fence and then
// EVALUATES it as JavaScript on the server. Repository documents are untrusted, so only YAML and JSON are allowed.
const refuse = (): never => {
    throw new Error('Front matter language is not allowed');
};
const OPTIONS = {
    language: 'yaml',
    engines: { js: refuse, javascript: refuse, coffee: refuse, coffeescript: refuse, cson: refuse },
};

/** Parse optional front matter without ever executing code. Unsupported languages are treated as no front matter. */
export function parseFrontMatter(content: string): { data: matter.GrayMatterFile<string>['data']; content: string } {
    try {
        const { data, content: body } = matter(content, OPTIONS);
        return { data, content: body };
    } catch {
        return { data: {}, content };
    }
}
