import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageMarkdownProps {
  content: string;
  useCustomComponents?: boolean;
}

const getTextFromNode = (node: React.ReactNode): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    return node.map(getTextFromNode).join('');
  }
  return '';
};

const markdownComponents: Components = {
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      style={{
        maxWidth: '100%',
        overflowX: 'auto',
        whiteSpace: 'pre',
        backgroundColor: 'var(--pre-bg)',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        margin: '0.5rem 0',
        fontSize: '0.75rem',
      }}
      className="bg-slate-200 dark:bg-slate-800"
    >
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const text = getTextFromNode(children);
    const hasLanguage = typeof className === 'string' && className.includes('language-');
    const isInline = !hasLanguage && !text.includes('\n');

    return isInline ? (
      <code
        {...props}
        className="text-xs px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800"
      >
        {children}
      </code>
    ) : (
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
  p: ({ children, ...props }) => (
    <p {...props} className="my-1 leading-relaxed break-words">
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul {...props} className="my-1 ml-4 list-disc">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className="my-1 ml-4 list-decimal">
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="my-0.5 break-words">
      {children}
    </li>
  ),
  h1: ({ children, ...props }) => (
    <h1 {...props} className="text-lg font-bold my-2">{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 {...props} className="text-base font-bold my-2">{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 {...props} className="text-sm font-semibold my-1">{children}</h3>
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-2">
      <table {...props} className="min-w-full text-xs border-collapse border border-slate-300 dark:border-slate-600">
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead {...props} className="bg-slate-100 dark:bg-slate-700">
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr {...props} className="border-b border-slate-300 dark:border-slate-600">
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th {...props} className="px-2 py-1 text-left font-semibold border border-slate-300 dark:border-slate-600">
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="px-2 py-1 border border-slate-300 dark:border-slate-600">
      {children}
    </td>
  ),
};

export const MessageMarkdown: React.FC<MessageMarkdownProps> = ({
  content,
  useCustomComponents = false
}) => (
  <div className="chat-markdown-content">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={useCustomComponents ? markdownComponents : undefined}
    >
      {content}
    </ReactMarkdown>
  </div>
);
