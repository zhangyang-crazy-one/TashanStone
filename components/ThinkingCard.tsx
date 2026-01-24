import React, { memo, useCallback, useState } from 'react';
import { Brain, CheckCheck, ChevronDown, Copy } from 'lucide-react';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

interface ThinkingCardProps {
  content: string;
  defaultExpanded?: boolean;
  language?: Language;
}

export const ThinkingCard: React.FC<ThinkingCardProps> = memo(({
  content,
  defaultExpanded = false,
  language = 'en'
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);
  const t = translations[language];

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  const handleCopy = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  const previewText = content.length > 100
    ? content.substring(0, 100).replace(/\n/g, ' ').trim() + '...'
    : content.replace(/\n/g, ' ').trim();

  return (
    <div className={`
      my-3 rounded-2xl overflow-hidden
      bg-violet-50 dark:bg-violet-950/30
      border border-violet-200 dark:border-violet-500/30
      backdrop-blur-xl
      transition-all duration-300
      hover:shadow-lg hover:shadow-violet-500/10
    `}>
      <div className="h-1 bg-gradient-to-r from-violet-400 via-purple-500 to-indigo-500" />

      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none group"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br from-violet-400 via-purple-500 to-indigo-500 shadow-md">
              <Brain size={14} className="text-white" />
            </div>
            <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-br from-violet-400 to-indigo-500 opacity-20 blur-sm animate-pulse -z-10" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                Thinking
              </span>
              <span className="text-[10px] text-violet-400 dark:text-violet-500">
                ({content.length} chars)
              </span>
            </div>
            {!isExpanded && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {previewText}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <Tooltip content={t.tooltips?.copyThinking || "Copy thinking content"}>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg transition-all hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-500 dark:text-violet-400"
              aria-label={t.tooltips?.copyThinking || "Copy thinking content"}
            >
              {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
            </button>
          </Tooltip>
          <ChevronDown
            size={14}
            className={`
              text-violet-400 dark:text-violet-500
              transition-transform duration-300
              ${isExpanded ? 'rotate-180' : 'rotate-0'}
            `}
          />
        </div>
      </div>

      <div className={`
        overflow-hidden transition-all duration-300
        ${isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="border-t border-violet-200 dark:border-violet-500/20">
          <div className="px-4 py-3 max-h-[350px] overflow-auto custom-scrollbar">
            <pre className="
              text-xs leading-relaxed whitespace-pre-wrap break-words
              text-slate-600 dark:text-slate-300
              font-sans
            ">
              {content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
});

ThinkingCard.displayName = 'ThinkingCard';
