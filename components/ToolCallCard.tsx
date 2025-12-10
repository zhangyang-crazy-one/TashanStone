import React, { useState, useEffect } from 'react';
import { Terminal, Check, AlertTriangle, Loader2, ChevronDown, Copy, CheckCheck, Sparkles } from 'lucide-react';
import { ToolCall } from '../types';

interface ToolCallCardProps {
  toolCall: ToolCall;
  isExpanded?: boolean;
  language?: 'en' | 'zh';
}

// 流式工具调用卡片 - 用于流式聊天中的内联显示
interface StreamToolCardProps {
  toolName: string;
  status: 'executing' | 'success' | 'error';
  result?: string;
  args?: Record<string, any>;
}

export const StreamToolCard: React.FC<StreamToolCardProps> = ({
  toolName,
  status,
  result,
  args
}) => {
  // 默认折叠，只有执行中状态才展开
  const [isExpanded, setIsExpanded] = useState(status === 'executing');
  const [copied, setCopied] = useState(false);
  const [glowIntensity, setGlowIntensity] = useState(0);

  // 执行中的呼吸动画
  useEffect(() => {
    if (status === 'executing') {
      const interval = setInterval(() => {
        setGlowIntensity(prev => (prev + 1) % 100);
      }, 30);
      return () => clearInterval(interval);
    }
  }, [status]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (result) {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 解析 JSON 结果
  let parsedResult: any = null;
  let isSuccess = true;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
      isSuccess = parsedResult.success !== false;
    } catch {
      parsedResult = result;
    }
  }

  const actualStatus = status === 'success' && !isSuccess ? 'error' : status;

  // 状态配置 - 使用主题适配的颜色
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
      {/* 顶部渐变条 */}
      <div className={`h-1 bg-gradient-to-r ${config.gradient}`} />

      {/* 头部区域 */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {/* 动态图标 */}
          <div className="relative">
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

          {/* 工具名称 */}
          <div>
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-slate-400 dark:text-slate-500" />
              <span className={`font-mono text-sm font-bold ${config.text}`}>
                {toolName}
              </span>
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

        {/* 右侧控制 */}
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={handleCopy}
              className={`
                p-2 rounded-lg transition-all
                hover:bg-black/5 dark:hover:bg-white/10
                ${config.text}
              `}
              title="Copy result"
            >
              {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
            </button>
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

      {/* 展开内容 */}
      <div className={`
        overflow-hidden transition-all duration-300
        ${isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="border-t border-slate-200 dark:border-white/10">
          {/* 参数显示 */}
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

          {/* 结果输出 */}
          {result && (
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Terminal size={10} />
                OUTPUT
              </div>

              {/* 智能结果渲染 */}
              {parsedResult?.output ? (
                <div className="space-y-2">
                  {/* 简洁摘要 */}
                  <div className={`
                    p-3 rounded-xl
                    bg-slate-100 dark:bg-slate-900/60
                    border border-slate-200 dark:border-slate-700/30
                    font-mono text-xs leading-relaxed
                    text-slate-700 dark:text-slate-300
                    max-h-48 overflow-auto custom-scrollbar
                  `}>
                    {typeof parsedResult.output === 'string' ? (
                      <pre className="whitespace-pre-wrap break-words">
                        {parsedResult.output.length > 800
                          ? parsedResult.output.substring(0, 800) + '\n...(truncated)'
                          : parsedResult.output
                        }
                      </pre>
                    ) : (
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(parsedResult.output, null, 2).substring(0, 800)}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <pre className={`
                  p-3 rounded-xl
                  bg-slate-100 dark:bg-slate-900/60
                  border border-slate-200 dark:border-slate-700/30
                  font-mono text-xs leading-relaxed
                  ${actualStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}
                  max-h-48 overflow-auto custom-scrollbar
                  whitespace-pre-wrap break-words
                `}>
                  {result.length > 800 ? result.substring(0, 800) + '\n...(truncated)' : result}
                </pre>
              )}
            </div>
          )}

          {/* 执行中的骨架屏 */}
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
};

// 原有的 ToolCallCard 保持兼容
export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  toolCall,
  isExpanded: defaultExpanded = false,
  language = 'en'
}) => {
  // 转换为新组件的格式
  const statusMap: Record<string, 'executing' | 'success' | 'error'> = {
    'pending': 'executing',
    'running': 'executing',
    'success': 'success',
    'error': 'error'
  };

  return (
    <StreamToolCard
      toolName={toolCall.name}
      status={statusMap[toolCall.status] || 'executing'}
      result={toolCall.result ? (typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result)) : undefined}
      args={toolCall.args}
    />
  );
};

// 解析工具调用的辅助函数
export const parseToolCallsFromContent = (content: string): Array<{
  type: 'text' | 'tool';
  content?: string;
  toolName?: string;
  status?: 'executing' | 'success' | 'error';
  result?: string;
  args?: Record<string, any>;
}> => {
  const parts: Array<{
    type: 'text' | 'tool';
    content?: string;
    toolName?: string;
    status?: 'executing' | 'success' | 'error';
    result?: string;
    args?: Record<string, any>;
  }> = [];

  // 匹配工具执行块
  const toolPattern = /🔧\s*\*\*(?:Tool|Executing):\s*([^*]+)\*\*(?:\.\.\.)?\s*(?:```json\s*([\s\S]*?)```)?/g;

  let lastIndex = 0;
  let match;

  while ((match = toolPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    const toolName = match[1].trim();
    const resultJson = match[2]?.trim();

    let status: 'executing' | 'success' | 'error' = resultJson ? 'success' : 'executing';

    if (resultJson) {
      try {
        const parsed = JSON.parse(resultJson);
        if (parsed.success === false || resultJson.toLowerCase().includes('error')) {
          status = 'error';
        }
      } catch {
        if (resultJson.toLowerCase().includes('error')) {
          status = 'error';
        }
      }
    }

    parts.push({
      type: 'tool',
      toolName,
      status,
      result: resultJson
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex).trim();
    if (remainingText) {
      parts.push({ type: 'text', content: remainingText });
    }
  }

  if (parts.length === 0 && content.trim()) {
    parts.push({ type: 'text', content: content.trim() });
  }

  return parts;
};

export default ToolCallCard;
