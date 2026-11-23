"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { isAllowedImageSrc } from '@/lib/safe-image';

/**
 * Secure markdown preview component using react-markdown.
 * Supports GitHub Flavored Markdown with built-in XSS protection.
 */
export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mt-8 mb-4 text-slate-100">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-bold mt-6 mb-3 text-slate-100">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-bold mt-4 mb-2 text-slate-100">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base font-bold mt-3 mb-2 text-slate-100">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="my-2 text-slate-300">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-blue-400 hover:text-blue-300 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isInline = !className;
            return isInline ? (
              <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono text-blue-300">
                {children}
              </code>
            ) : (
              <code className="text-xs text-slate-200 font-mono">{children}</code>
            );
          },
          pre: ({ children }) => (
            <pre className="bg-slate-800 border border-slate-700 p-3 rounded my-3 overflow-x-auto">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-slate-600 pl-4 my-3 text-slate-300 italic">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-6 list-disc text-slate-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-6 list-decimal text-slate-300">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-slate-300">{children}</li>
          ),
          hr: () => <hr className="border-t border-slate-600 my-4" />,
          table: ({ children }) => (
            <table className="my-4 w-full border-collapse">{children}</table>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="border border-slate-600 px-3 py-2 bg-slate-700 font-semibold text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-600 px-3 py-2">{children}</td>
          ),
          img: ({ src, alt }) =>
            isAllowedImageSrc(src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt} className="max-w-full rounded my-2" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-slate-400 italic">{alt ? `[image: ${alt}]` : '[image]'}</span>
            ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
