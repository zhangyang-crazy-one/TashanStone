import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageMarkdownProps {
  content: string;
  useCustomComponents?: boolean;
}

type InjectedMemoryCounts = {
  auto?: number;
  manual?: number;
  total?: number;
};

type InjectedMessage = {
  injectedBlock: string;
  userQuery: string;
  counts: InjectedMemoryCounts;
};

const INJECTION_PREFIX = '【系统提示】';
const QUESTION_MARKERS = ['用户问题：', 'User question:'];

const getTextFromNode = (node: React.ReactNode): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) {
    return node.map(getTextFromNode).join('');
  }
  return '';
};

const parseInjectedMessage = (content: string): InjectedMessage | null => {
  if (!content.startsWith(INJECTION_PREFIX)) return null;
  const questionMarker = QUESTION_MARKERS.find(marker => content.includes(marker));
  if (!questionMarker) return null;
  const questionIndex = content.lastIndexOf(questionMarker);
  if (questionIndex <= 0) return null;
  const injectedBlock = content.slice(0, questionIndex).trim();
  const userQuery = content.slice(questionIndex + questionMarker.length).trim();
  if (!userQuery) return null;

  const autoMatch = injectedBlock.match(/基于问题检索：\s*(\d+)/);
  const manualMatch = injectedBlock.match(/手动添加：\s*(\d+)/);
  const totalMatch = injectedBlock.match(/总计注入：\s*(\d+)/);

  return {
    injectedBlock,
    userQuery,
    counts: {
      auto: autoMatch ? Number(autoMatch[1]) : undefined,
      manual: manualMatch ? Number(manualMatch[1]) : undefined,
      total: totalMatch ? Number(totalMatch[1]) : undefined
    }
  };
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

const InjectedMemoryCard: React.FC<InjectedMessage> = ({ injectedBlock, counts }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const summaryParts = [
    counts.auto !== undefined ? `auto ${counts.auto}` : null,
    counts.manual !== undefined ? `manual ${counts.manual}` : null,
    counts.total !== undefined ? `total ${counts.total}` : null
  ].filter(Boolean);
  const summaryText = summaryParts.length > 0 ? summaryParts.join(' | ') : 'details';

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Memory injection</div>
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="text-[11px] font-medium text-amber-700 dark:text-amber-300 hover:underline"
        >
          {isExpanded ? 'Hide details' : 'Show details'}
        </button>
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-amber-700/80 dark:text-amber-300/70">
        {summaryText}
      </div>
      {isExpanded && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-white/70 dark:bg-cyber-900/60 p-2 text-[10px] leading-relaxed text-amber-900 dark:text-amber-100">
          {injectedBlock}
        </pre>
      )}
    </div>
  );
};

const renderMarkdown = (content: string, useCustomComponents: boolean) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={useCustomComponents ? markdownComponents : undefined}
  >
    {content}
  </ReactMarkdown>
);

export const MessageMarkdown: React.FC<MessageMarkdownProps> = ({
  content,
  useCustomComponents = false
}) => {
  const injectedMessage = useMemo(() => parseInjectedMessage(content), [content]);

  if (injectedMessage) {
    return (
      <div className="space-y-2">
        <InjectedMemoryCard {...injectedMessage} />
        <div className="chat-markdown-content">
          {renderMarkdown(injectedMessage.userQuery, useCustomComponents)}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-markdown-content">
      {renderMarkdown(content, useCustomComponents)}
    </div>
  );
};
