import React, { memo } from 'react';

interface SyntaxHighlightProps {
  content: string;
}

export const JsonHighlight: React.FC<SyntaxHighlightProps> = memo(({ content }) => {
  try {
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);

    const parts = formatted.split(/(\s*"[^"]*"\s*:\s*|[{}\[\],])/g);

    return (
      <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words">
        {parts.map((part, i) => {
          if (!part) return null;

          let className = 'text-slate-300';
          if (part.startsWith('"')) {
            if (part.includes(':')) {
              className = 'text-cyan-300';
            } else if (part.match(/^".*"$/)) {
              className = 'text-amber-300';
            } else if (part.match(/^-?\d+(\.\d+)?$/)) {
              className = 'text-emerald-300';
            } else if (part === 'true' || part === 'false') {
              className = 'text-purple-300';
            } else if (part === 'null') {
              className = 'text-slate-500';
            }
          } else if (!isNaN(parseFloat(part))) {
            className = 'text-emerald-300';
          } else if (['{', '}', '[', ']', ':', ','].includes(part)) {
            className = 'text-slate-400';
          }

          return <span key={i} className={className}>{part}</span>;
        })}
      </pre>
    );
  } catch {
    return <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words text-red-400">{content}</pre>;
  }
});

JsonHighlight.displayName = 'JsonHighlight';

export const HtmlHighlight: React.FC<SyntaxHighlightProps> = memo(({ content }) => {
  const parts = content.split(/(<[^>]+>)/g);

  return (
    <pre className="text-xs leading-relaxed font-mono whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (!part) return null;

        if (part.startsWith('<') && part.endsWith('>')) {
          if (part.startsWith('</')) {
            return <span key={i} className="text-red-400">{part}</span>;
          }
          if (part.match(/^<\w+/)) {
            return <span key={i} className="text-cyan-400">{part}</span>;
          }
          if (part.startsWith('<!')) {
            return <span key={i} className="text-purple-400">{part}</span>;
          }
          return <span key={i} className="text-slate-300">{part}</span>;
        }
        return <span key={i} className="text-slate-200">{part}</span>;
      })}
    </pre>
  );
});

HtmlHighlight.displayName = 'HtmlHighlight';
