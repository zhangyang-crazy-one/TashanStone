import React, { useState } from 'react';
import { Check, Copy, FileCode, WrapText } from 'lucide-react';

import Tooltip from '../Tooltip';
import { MermaidRenderer } from './MermaidRenderer';
import { extractText } from './markdownUtils';
import { sanitizeHtml } from '../../utils/sanitizeHtml';

interface EnhancedCodeBlockTooltips {
  copyCode: string;
  toggleWrap: string;
}

interface EnhancedCodeBlockOptions {
  enableMermaid?: boolean;
}

type EnhancedCodeBlockProps = React.ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
  node?: unknown;
};

export const createEnhancedCodeBlock = (
  renderHtml: boolean,
  tooltips: EnhancedCodeBlockTooltips,
  options?: EnhancedCodeBlockOptions
) => {
  return ({ children, className, inline, ...props }: EnhancedCodeBlockProps) => {
    const [copied, setCopied] = useState(false);
    const [wrap, setWrap] = useState(false);

    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    const isMermaid = language === 'mermaid';
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    const isInline = inline === true || (!className && !language);

    if (isInline) {
      return (
        <code className={`${className || ''} bg-paper-200 dark:bg-cyber-800 px-1.5 py-0.5 rounded text-sm text-cyan-700 dark:text-cyan-400 font-mono`} {...props}>
          {children}
        </code>
      );
    }

    if (isMermaid && options?.enableMermaid !== false) {
      const codeText = extractText(children);
      return <MermaidRenderer code={codeText} isDark={isDark} />;
    }

    if (renderHtml && language === 'html') {
      const htmlContent = sanitizeHtml(extractText(children));
      return (
        <div className="my-6 rounded-xl border border-paper-200 dark:border-cyber-700 overflow-hidden shadow-lg">
          <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-b border-paper-200 dark:border-cyber-700">
            <div className="flex items-center gap-2">
              <FileCode size={14} className="text-cyan-500" />
              <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                HTML Rendered
              </span>
            </div>
          </div>
          <div
            className="p-4 bg-paper-50 dark:bg-cyber-900 prose prose-lg max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      );
    }

    const handleCopy = async () => {
      const text = extractText(children);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error(err);
      }
    };

    return (
      <div className="my-6 rounded-xl border border-paper-200 dark:border-cyber-700 bg-[#282c34] overflow-hidden shadow-lg group">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#21252b] border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
            </div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono ml-2 select-none">
              {language || 'text'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip content={tooltips.toggleWrap}>
              <button
                onClick={() => setWrap(!wrap)}
                className={`p-1.5 rounded transition-all ${wrap ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                aria-label={tooltips.toggleWrap}
              >
                <WrapText size={16} />
              </button>
            </Tooltip>
            <Tooltip content={tooltips.copyCode}>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded text-slate-500 hover:text-slate-300 transition-all"
                aria-label={tooltips.copyCode}
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </Tooltip>
          </div>
        </div>

        <div className={`relative p-0 ${wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'}`}>
          <pre className={`!m-0 !p-4 !bg-transparent text-sm font-mono leading-relaxed text-gray-300 ${wrap ? '!whitespace-pre-wrap' : '!whitespace-pre'}`} {...props}>
            <code className={className || 'language-text'} style={{ textShadow: 'none' }}>
              {children}
            </code>
          </pre>
        </div>
      </div>
    );
  };
};
