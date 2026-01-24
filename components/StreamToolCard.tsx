import React, { memo, useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCheck, ChevronDown, Copy, Loader2, Sparkles, Terminal } from 'lucide-react';
import { JsonValue } from '../types';
import Tooltip from './Tooltip';
import { HtmlHighlight, JsonHighlight } from './SyntaxHighlight';
import { deepParseJson, deepParseObject, formatWithSyntaxHighlight, ParsedToolResult } from '../utils/jsonHelpers';
import { translations, Language } from '../utils/translations';
interface StreamToolCardProps {
  toolName: string;
  status: 'executing' | 'success' | 'error';
  result?: string;
  args?: Record<string, JsonValue>;
  language?: Language;
}
export const StreamToolCard: React.FC<StreamToolCardProps> = memo(({
  toolName,
  status,
  result,
  args,
  language = 'en'
}) => {
  const [isExpanded, setIsExpanded] = useState(status === 'executing');
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
    if (result) {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);
  const parsedData = useMemo(() => {
    let parsedResult: ParsedToolResult | JsonValue | null = null;
    let isSuccess = true;
    let outputValue: JsonValue | undefined;
    let outputFormat: { type: 'json' | 'html' | 'text'; formatted: string } | null = null;
    let fallbackFormat: { type: 'json' | 'html' | 'text'; formatted: string } | null = null;
    if (result) {
      try {
        const parsedJson = JSON.parse(result) as JsonValue;
        const deepParsed = deepParseObject(parsedJson);
        parsedResult = deepParsed;
        if (typeof deepParsed === 'object' && deepParsed !== null && !Array.isArray(deepParsed)) {
          const resultObject = deepParsed as ParsedToolResult;
          if (resultObject.success === false) {
            isSuccess = false;
          }
          outputValue = resultObject.output;
        }
      } catch {
        parsedResult = deepParseJson(result);
      }

      if (outputValue !== undefined && typeof outputValue === 'string') {
        outputFormat = formatWithSyntaxHighlight(outputValue);
      }
      fallbackFormat = formatWithSyntaxHighlight(result);
    }

    return { parsedResult, isSuccess, outputValue, outputFormat, fallbackFormat };
  }, [result]);
  const actualStatus = status === 'success' && !parsedData.isSuccess ? 'error' : status;
  const statusConfig = {
    executing: {
      gradient: 'from-amber-500 via-orange-500 to-yellow-500',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-300 dark:border-amber-500/40',
      text: 'text-amber-600 dark:text-amber-400',
      label: 'EXECUTING',
      labelZh: '执行中'
    },
    success: {
      gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      border: 'border-emerald-300 dark:border-emerald-500/40',
      text: 'text-emerald-600 dark:text-emerald-400',
      label: 'COMPLETE',
      labelZh: '已完成'
    },
    error: {
      gradient: 'from-red-500 via-rose-500 to-pink-500',
      bg: 'bg-red-50 dark:bg-red-950/40',
      border: 'border-red-300 dark:border-red-500/40',
      text: 'text-red-600 dark:text-red-400',
      label: 'FAILED',
      labelZh: '失败'
    }
  };
  const config = statusConfig[actualStatus];
  const outputValue = parsedData.outputValue;
  return (
    <div
      className={`
        my-4 rounded-2xl overflow-hidden
        ${config.bg}
        border ${config.border}
        backdrop-blur-xl
        transition-all duration-300
        hover:shadow-lg
      `}
    >
      <div className={`h-1 bg-gradient-to-r ${config.gradient}`} />
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none group"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative shrink-0">
            <div className={`
              w-8 h-8 rounded-xl flex items-center justify-center
              bg-gradient-to-br ${config.gradient}
              shadow-md
            `}>
              {actualStatus === 'executing' ? (
                <Loader2 size={16} className="text-white animate-spin" />
              ) : actualStatus === 'success' ? (
                <Check size={16} className="text-white" />
              ) : (
                <AlertTriangle size={16} className="text-white" />
              )}
            </div>
            {actualStatus === 'executing' && (
              <div className={`
                absolute -inset-1 rounded-xl bg-gradient-to-br ${config.gradient}
                opacity-30 blur-md animate-pulse -z-10
              `} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-slate-400 dark:text-slate-500 shrink-0" />
              <Tooltip content={toolName}>
                <span className={`font-mono text-sm font-bold ${config.text} truncate`} aria-label={toolName}>
                  {toolName}
                </span>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`
                text-[10px] font-bold tracking-[0.2em] uppercase
                ${config.text} opacity-70
              `}>
                {config.label}
              </span>
              {actualStatus === 'executing' && (
                <div className="flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className={`w-1 h-1 rounded-full bg-gradient-to-r ${config.gradient} animate-bounce`}
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {result && (
            <Tooltip content={t.tooltips?.copyResult || "Copy result"}>
              <button
                onClick={handleCopy}
                className={`
                  p-2 rounded-lg transition-all
                  hover:bg-black/5 dark:hover:bg-white/10
                  ${config.text}
                `}
                aria-label={t.tooltips?.copyResult || "Copy result"}
              >
                {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
              </button>
            </Tooltip>
          )}
          <ChevronDown
            size={16}
            className={`
              ${config.text} opacity-50
              transition-transform duration-300
              ${isExpanded ? 'rotate-180' : 'rotate-0'}
            `}
          />
        </div>
      </div>
      <div className={`
        overflow-hidden transition-all duration-300
        ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="border-t border-slate-200 dark:border-white/10">
          {args && Object.keys(args).length > 0 && (
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Sparkles size={10} />
                INPUT
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(args).map(([key, value]) => (
                  <div
                    key={key}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
                      bg-slate-100 dark:bg-slate-800/50
                      border border-slate-200 dark:border-slate-700/50
                      text-xs font-mono"
                  >
                    <span className="text-slate-500 dark:text-slate-400">{key}</span>
                    <span className="text-slate-400 dark:text-slate-500">=</span>
                    <span className={`${config.text} truncate max-w-[150px]`}>
                      {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result && (
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Terminal size={10} />
                OUTPUT
              </div>

              {outputValue !== undefined ? (
                <div className="space-y-2">
                  <div className={`
                    p-3 rounded-xl
                    bg-slate-900 dark:bg-slate-900/80
                    border border-slate-700 dark:border-slate-700/50
                    max-h-48 overflow-auto custom-scrollbar
                  `}>
                    {typeof outputValue === 'string' ? (
                      parsedData.outputFormat?.type === 'json' ? (
                        <JsonHighlight content={parsedData.outputFormat.formatted} />
                      ) : parsedData.outputFormat?.type === 'html' ? (
                        <HtmlHighlight content={parsedData.outputFormat.formatted} />
                      ) : (
                        <pre className="whitespace-pre-wrap break-words text-slate-300">
                          {outputValue.length > 800
                            ? outputValue.substring(0, 800) + '\n...(truncated)'
                            : outputValue}
                        </pre>
                      )
                    ) : (
                      <JsonHighlight content={JSON.stringify(outputValue, null, 2)} />
                    )}
                  </div>
                </div>
              ) : (
                <div className={`
                  p-3 rounded-xl
                  bg-slate-900 dark:bg-slate-900/80
                  border border-slate-700 dark:border-slate-700/30
                  max-h-48 overflow-auto custom-scrollbar
                  ${actualStatus === 'error' ? 'border-red-500/50' : ''}
                `}>
                  {parsedData.fallbackFormat?.type === 'json' ? (
                    <JsonHighlight content={parsedData.fallbackFormat.formatted} />
                  ) : parsedData.fallbackFormat?.type === 'html' ? (
                    <HtmlHighlight content={parsedData.fallbackFormat.formatted} />
                  ) : (
                    <pre className={`
                      whitespace-pre-wrap break-words text-xs leading-relaxed font-mono
                      ${actualStatus === 'error' ? 'text-red-400' : 'text-slate-300'}
                    `}>
                      {result.length > 800 ? result.substring(0, 800) + '\n...(truncated)' : result}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
          {actualStatus === 'executing' && !result && (
            <div className="px-4 py-6">
              <div className="space-y-2">
                <div className="h-3 bg-slate-200 dark:bg-slate-700/30 rounded-full w-3/4 animate-pulse" />
                <div className="h-3 bg-slate-200 dark:bg-slate-700/30 rounded-full w-1/2 animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="h-3 bg-slate-200 dark:bg-slate-700/30 rounded-full w-2/3 animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
StreamToolCard.displayName = 'StreamToolCard';
