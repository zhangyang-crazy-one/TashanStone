import React from 'react';
import { Brain, FileText, Loader2, Search, X } from 'lucide-react';
import type { Language } from '../../utils/translations';

export interface MemorySearchResult {
  id?: string;
  filePath?: string;
  topics?: string[];
  content?: string;
  summary?: string;
  isStarred?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface InjectedMemory {
  id: string;
  fileName?: string;
  topics?: string[];
  filePath?: string;
  content?: string;
  injectedAt?: number;
}

interface MemoryPanelProps {
  language: Language;
  memorySearchQuery: string;
  onMemorySearchQueryChange: (value: string) => void;
  onMemorySearch: () => void;
  isSearchingMemories: boolean;
  memorySearchResults: MemorySearchResult[];
  onMemoryClick: (memory: MemorySearchResult) => void;
  injectedMemories: InjectedMemory[];
  onRemoveInjectedMemory: (memoryId: string) => void;
  onClose: () => void;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({
  language,
  memorySearchQuery,
  onMemorySearchQueryChange,
  onMemorySearch,
  isSearchingMemories,
  memorySearchResults,
  onMemoryClick,
  injectedMemories,
  onRemoveInjectedMemory,
  onClose
}) => {
  const injectedMemoryCount = injectedMemories.length;

  return (
    <div className="absolute top-full right-0 mt-1 w-[calc(100vw-2rem)] sm:w-[22rem] max-w-[calc(100%-0.5rem)] bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-700 p-3 z-50 max-h-96 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-paper-200 dark:border-cyber-700">
        <Brain size={14} className="text-violet-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
          {language === 'zh' ? '持久记忆管理' : 'Persistent Memory'}
        </span>
        <span className="text-xs text-slate-400">
          {injectedMemoryCount} {language === 'zh' ? '条已注入' : 'injected'}
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 dark:hover:bg-cyber-700 rounded"
        >
          <X size={12} className="text-slate-400" />
        </button>
      </div>

      {/* Auto-injected notice */}
      <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-700 dark:text-amber-400">
        💡 {language === 'zh'
          ? 'AI 会自动根据对话内容注入相关记忆'
          : 'AI automatically injects relevant memories based on your messages'}
      </div>

      {/* Search to add memories */}
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={memorySearchQuery}
          onChange={(e) => onMemorySearchQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onMemorySearch()}
          placeholder={language === 'zh' ? '搜索并添加记忆...' : 'Search and add memories...'}
          className="flex-1 px-2 py-1.5 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded focus:outline-none focus:border-violet-500"
        />
        <button
          onClick={onMemorySearch}
          disabled={isSearchingMemories || !memorySearchQuery.trim()}
          className="p-1.5 bg-violet-500 hover:bg-violet-600 text-white rounded disabled:opacity-50"
        >
          {isSearchingMemories ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Search size={12} />
          )}
        </button>
      </div>

      {/* Search results (to add) */}
      {memorySearchResults.length > 0 && (
        <div className="mb-3 max-h-32 overflow-y-auto space-y-1 border-t border-paper-200 dark:border-cyber-700 pt-2">
          <div className="text-xs text-slate-500 mb-1">
            {language === 'zh' ? '点击添加到对话' : 'Click to add to conversation'}
          </div>
          {memorySearchResults.map((memory) => (
            <div
              key={memory.id}
              onClick={() => onMemoryClick(memory)}
              className="px-2 py-1.5 rounded hover:bg-paper-200 dark:hover:bg-cyber-700 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-1">
                <FileText size={10} className="text-violet-400" />
                <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                  {memory.filePath?.split('/').pop()?.replace('.md', '') || memory.id}
                </span>
              </div>
              {memory.topics && memory.topics.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {memory.topics.slice(0, 2).map((topic, i) => (
                    <span key={i} className="text-[9px] px-1 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded">
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-paper-200 dark:border-cyber-700 my-2"></div>

      {/* Currently injected memories */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="text-xs text-slate-500 mb-2 flex-shrink-0">
          {language === 'zh' ? '已注入的记忆（点击移除）' : 'Injected memories (click to remove)'}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {injectedMemories.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-xs">
              {language === 'zh' ? '暂无注入记忆' : 'No memories injected'}
            </div>
          ) : (
            injectedMemories.map((memory) => (
              <div
                key={memory.id}
                onClick={() => onRemoveInjectedMemory(memory.id)}
                className="group px-2 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer transition-colors flex items-start gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <FileText size={10} className="text-amber-500 shrink-0" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                      {memory.fileName || memory.id}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {memory.topics?.join(', ') || ''}
                  </div>
                </div>
                <X size={10} className="text-slate-400 group-hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export type { MemoryPanelProps };
