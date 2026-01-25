import React from 'react';
import { Archive, Brain, Maximize2, Minimize2, Sparkles, Trash2, X } from 'lucide-react';

import type { AIState } from '../../types';
import Tooltip from '../Tooltip';
import { MemoryPanel, type InjectedMemory, type MemorySearchResult } from './MemoryPanel';
import type { Language } from '../../utils/translations';

type TranslationStrings = (typeof import('../../utils/translations').translations)['en'];

interface ChatHeaderProps {
  aiState: AIState;
  language: Language;
  t: TranslationStrings;
  tokenUsage: number;
  maxTokens: number;
  messagesCount: number;
  compactMode: boolean;
  onToggleCompactMode: () => void;
  onCompactChat?: () => Promise<void>;
  showMemorySearch: boolean;
  onToggleMemorySearch: () => void;
  memorySearchQuery: string;
  onMemorySearchQueryChange: (value: string) => void;
  onMemorySearch: () => void;
  isSearchingMemories: boolean;
  memorySearchResults: MemorySearchResult[];
  onMemoryClick: (memory: MemorySearchResult) => void;
  injectedMemories: InjectedMemory[];
  onRemoveInjectedMemory: (memoryId: string) => void;
  onCloseMemoryPanel: () => void;
  onClearChat: () => void;
  onClose: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  aiState,
  language,
  t,
  tokenUsage,
  maxTokens,
  messagesCount,
  compactMode,
  onToggleCompactMode,
  onCompactChat,
  showMemorySearch,
  onToggleMemorySearch,
  memorySearchQuery,
  onMemorySearchQueryChange,
  onMemorySearch,
  isSearchingMemories,
  memorySearchResults,
  onMemoryClick,
  injectedMemories,
  onRemoveInjectedMemory,
  onCloseMemoryPanel,
  onClearChat,
  onClose
}) => {
  const injectedMemoryCount = injectedMemories.length;
  const showTokenUsage = tokenUsage > 0 && maxTokens > 0;
  const tokenRatio = showTokenUsage ? tokenUsage / maxTokens : 0;
  const tokenPercent = Math.round(tokenRatio * 100);
  const tokenBarClass = tokenRatio > 0.9
    ? 'bg-red-500'
    : tokenRatio > 0.7
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  const tokenTextClass = tokenRatio > 0.9
    ? 'text-red-500'
    : tokenRatio > 0.7
      ? 'text-amber-500'
      : 'text-emerald-500';

  return (
    <div className="relative bg-gradient-to-r from-violet-500/5 via-transparent to-cyan-500/5 dark:from-violet-600/10 dark:to-cyan-600/10 border-b border-violet-200/30 dark:border-violet-700/30">
      <div className="h-12 flex items-center justify-between px-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-lg flex items-center justify-center shrink-0 shadow-sm shadow-violet-500/20">
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-violet-600 dark:text-violet-400 truncate">
            {t.aiCompanion}
          </span>
          {showTokenUsage && (
            <div className="flex items-center gap-1 shrink-0">
              <div className="h-1.5 w-12 bg-slate-200/50 dark:bg-slate-700/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tokenBarClass}`}
                  style={{ width: `${Math.min(tokenRatio * 100, 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${tokenTextClass}`}>
                {tokenPercent}%
              </span>
            </div>
          )}

          {onCompactChat && messagesCount >= 2 && !aiState.isThinking && (
            <Tooltip content={t.tooltips?.compactContext || (language === 'zh' ? '压缩上下文' : 'Compact Context')}>
              <button
                onClick={onCompactChat}
                className="p-1.5 rounded-md text-violet-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
                aria-label={t.tooltips?.compactContext || (language === 'zh' ? '压缩上下文' : 'Compact Context')}
              >
                <Archive size={15} />
              </button>
            </Tooltip>
          )}

          <Tooltip content={compactMode ? t.expandView : t.compactView}>
            <button
              onClick={onToggleCompactMode}
              className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
              aria-label={compactMode ? t.expandView : t.compactView}
            >
              {compactMode ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
            </button>
          </Tooltip>

          <Tooltip content={t.tooltips?.manageMemories || (language === 'zh' ? '管理记忆' : 'Manage Memories')}>
            <button
              onClick={onToggleMemorySearch}
              className={`p-1.5 rounded-md transition-all relative ${showMemorySearch
                ? 'text-violet-500 bg-violet-100/50 dark:bg-violet-900/30'
                : 'text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30'
                }`}
              aria-label={t.tooltips?.manageMemories || (language === 'zh' ? '管理记忆' : 'Manage Memories')}
            >
              <Brain size={15} />
              {injectedMemoryCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {injectedMemoryCount > 9 ? '9+' : injectedMemoryCount}
                </span>
              )}
            </button>
          </Tooltip>

          {showMemorySearch && (
            <MemoryPanel
              language={language}
              memorySearchQuery={memorySearchQuery}
              onMemorySearchQueryChange={onMemorySearchQueryChange}
              onMemorySearch={onMemorySearch}
              isSearchingMemories={isSearchingMemories}
              memorySearchResults={memorySearchResults}
              onMemoryClick={onMemoryClick}
              injectedMemories={injectedMemories}
              onRemoveInjectedMemory={onRemoveInjectedMemory}
              onClose={onCloseMemoryPanel}
            />
          )}

          <Tooltip content={t.clearHistory}>
            <button
              onClick={onClearChat}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-all"
              aria-label={t.clearHistory}
            >
              <Trash2 size={15} />
            </button>
          </Tooltip>

          <Tooltip content={t.close || (language === 'zh' ? '关闭' : 'Close')}>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 dark:hover:bg-slate-700/50 transition-all"
              aria-label={t.close || (language === 'zh' ? '关闭' : 'Close')}
            >
              <X size={15} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
