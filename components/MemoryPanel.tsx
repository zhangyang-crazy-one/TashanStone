import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Sparkles, X, Filter, SortAsc, SortDesc, Brain, RefreshCw, AlertCircle } from 'lucide-react';

interface MemoryDocument {
  id: string;
  filePath: string;
  created: number;
  updated: number;
  topics: string[];
  importance: 'low' | 'medium' | 'high';
  sourceSessions: string[];
  content: string;
}

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  language?: 'zh' | 'en';
  onEditMemory?: (memory: MemoryDocument) => void;
  onDeleteMemory?: (id: string) => Promise<void>;
  onCreateMemory?: () => void;
}

const MemoryPanel: React.FC<MemoryPanelProps> = ({
  isOpen,
  onClose,
  language = 'en',
  onEditMemory,
  onDeleteMemory,
  onCreateMemory,
}) => {
  const [memories, setMemories] = useState<MemoryDocument[]>([]);
  const [filteredMemories, setFilteredMemories] = useState<MemoryDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'importance'>('updated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [importanceFilter, setImportanceFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedMemory, setExpandedMemory] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ needsSync: boolean; outdatedFiles: string[] }>({ needsSync: false, outdatedFiles: [] });
  const [isCheckingSync, setIsCheckingSync] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMemories();
      checkSyncStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    filterAndSortMemories();
  }, [memories, searchQuery, sortBy, sortOrder, importanceFilter]);

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.file?.readFile) {
        const indexPath = '.memories/_memories_index.json';
        const indexData = await (window as any).electronAPI.file.readFile(indexPath);
        if (indexData) {
          const index = JSON.parse(indexData);
          const loadedMemories: MemoryDocument[] = [];

          for (const memoryInfo of index.memories || []) {
            try {
              const content = await (window as any).electronAPI.file.readFile(memoryInfo.filePath);
              if (content) {
                const memory = parseMarkdownToMemory(content, memoryInfo);
                loadedMemories.push(memory);
              }
            } catch {
              console.warn(`[MemoryPanel] Failed to read memory: ${memoryInfo.filePath}`);
            }
          }

          setMemories(loadedMemories);
        }
      }
    } catch (error) {
      console.error('[MemoryPanel] Failed to load memories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkSyncStatus = async () => {
    setIsCheckingSync(true);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.lancedb) {
        const status = await (window as any).electronAPI.lancedb.checkSyncStatus();
        setSyncStatus(status || { needsSync: false, outdatedFiles: [] });
      }
    } catch (error) {
      console.warn('[MemoryPanel] Failed to check sync status:', error);
    } finally {
      setIsCheckingSync(false);
    }
  };

  const handleRefresh = async () => {
    await loadMemories();
    await checkSyncStatus();
  };

  const parseMarkdownToMemory = (content: string, metadata: any): MemoryDocument => {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    let topics: string[] = [];
    let parsedContent = content;

    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      parsedContent = frontmatterMatch[2];

      const topicMatch = frontmatter.match(/topics:\s*(\[[^\]]*\])/);
      if (topicMatch) {
        try {
          topics = JSON.parse(topicMatch[1]);
        } catch {
          topics = metadata.topics || [];
        }
      }
    }

    return {
      id: metadata.id,
      filePath: metadata.filePath,
      created: new Date(metadata.created).getTime(),
      updated: new Date(metadata.updated).getTime(),
      topics,
      importance: metadata.importance || 'medium',
      sourceSessions: metadata.sourceSessions || [],
      content: parsedContent.trim(),
    };
  };

  const filterAndSortMemories = () => {
    let result = [...memories];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(query) ||
        m.topics.some(t => t.toLowerCase().includes(query)) ||
        m.id.toLowerCase().includes(query)
      );
    }

    if (importanceFilter !== 'all') {
      result = result.filter(m => m.importance === importanceFilter);
    }

    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'updated') {
        comparison = a.updated - b.updated;
      } else if (sortBy === 'created') {
        comparison = a.created - b.created;
      } else if (sortBy === 'importance') {
        const importanceOrder = { high: 3, medium: 2, low: 1 };
        comparison = importanceOrder[a.importance] - importanceOrder[b.importance];
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    setFilteredMemories(result);
  };

  const getImportanceColor = (importance: string) => {
    switch (importance) {
      case 'high': return 'text-red-500 bg-red-100 dark:bg-red-900/30';
      case 'medium': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30';
      default: return 'text-slate-500 bg-slate-100 dark:bg-slate-800';
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDelete = async (id: string) => {
    if (!onDeleteMemory) return;
    try {
      await onDeleteMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      console.error('[MemoryPanel] Failed to delete memory:', error);
    }
  };

  if (!isOpen) return null;

  const t = {
    title: language === 'zh' ? '🧠 AI 记忆库' : '🧠 Memory Library',
    searchPlaceholder: language === 'zh' ? '搜索记忆...' : 'Search memories...',
    noMemories: language === 'zh' ? '暂无记忆' : 'No memories',
    noMemoriesDesc: language === 'zh' ? '创建第一个记忆来保存重要信息' : 'Create your first memory to save important information',
    importance: language === 'zh' ? '重要性' : 'Importance',
    topics: language === 'zh' ? '主题标签' : 'Topics',
    created: language === 'zh' ? '创建时间' : 'Created',
    updated: language === 'zh' ? '更新时间' : 'Updated',
    delete: language === 'zh' ? '删除' : 'Delete',
    edit: language === 'zh' ? '编辑' : 'Edit',
    create: language === 'zh' ? '新建记忆' : 'New Memory',
    filterAll: language === 'zh' ? '全部' : 'All',
    filterHigh: language === 'zh' ? '高' : 'High',
    filterMedium: language === 'zh' ? '中' : 'Medium',
    filterLow: language === 'zh' ? '低' : 'Low',
    sortBy: language === 'zh' ? '排序方式' : 'Sort by',
    confirmDelete: language === 'zh' ? '确定要删除这个记忆吗？' : 'Are you sure you want to delete this memory?',
    outOfSync: language === 'zh' ? '部分记忆可能已过期' : 'Some memories may be outdated',
    refresh: language === 'zh' ? '刷新' : 'Refresh',
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 sm:w-96 transform transition-transform duration-300 ease-in-out shadow-2xl bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border-l border-paper-200 dark:border-cyber-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-paper-200 dark:border-cyber-700">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-violet-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {t.title}
          </h2>
          {syncStatus.needsSync && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded">
              <AlertCircle size={10} />
              <span>{t.outOfSync}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
            title={t.refresh}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onCreateMemory}
            className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
            title={t.create}
          >
            <Plus size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-all"
            title={language === 'zh' ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-b border-paper-200 dark:border-cyber-700 space-y-2">
        <button
          onClick={onCreateMemory}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors text-xs font-medium"
        >
          <Plus size={14} />
          {t.create}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="p-3 border-b border-paper-200 dark:border-cyber-700 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full pl-8 pr-3 py-2 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded focus:outline-none focus:border-violet-500 text-slate-700 dark:text-slate-300"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={importanceFilter}
            onChange={(e) => setImportanceFilter(e.target.value as any)}
            className="flex-1 px-2 py-1.5 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded focus:outline-none focus:border-violet-500 text-slate-700 dark:text-slate-300"
          >
            <option value="all">{t.filterAll}</option>
            <option value="high">{t.filterHigh}</option>
            <option value="medium">{t.filterMedium}</option>
            <option value="low">{t.filterLow}</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="flex-1 px-2 py-1.5 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded focus:outline-none focus:border-violet-500 text-slate-700 dark:text-slate-300"
          >
            <option value="updated">{t.updated}</option>
            <option value="created">{t.created}</option>
            <option value="importance">{t.importance}</option>
          </select>

          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded hover:bg-paper-200 dark:hover:bg-cyber-700 transition-colors"
          >
            {sortOrder === 'asc' ? <SortAsc size={14} className="text-slate-400" /> : <SortDesc size={14} className="text-slate-400" />}
          </button>
        </div>
      </div>

      {/* Memory List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-500" />
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs text-slate-400">{t.noMemories}</p>
            <p className="text-[10px] text-slate-400 mt-1">{t.noMemoriesDesc}</p>
          </div>
        ) : (
          filteredMemories.map((memory) => (
            <div
              key={memory.id}
              className="bg-paper-50 dark:bg-cyber-900/50 rounded-lg border border-paper-200 dark:border-cyber-700 overflow-hidden transition-colors hover:border-violet-300 dark:hover:border-violet-700"
            >
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                onClick={() => setExpandedMemory(prev => prev === memory.id ? null : memory.id)}
              >
                <Sparkles size={12} className="text-violet-400 shrink-0" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex-1">
                  {memory.filePath?.split('/').pop()?.replace('.md', '') || memory.id}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${getImportanceColor(memory.importance)}`}>
                  {memory.importance}
                </span>
              </div>

              {expandedMemory === memory.id && (
                <div className="px-3 pb-3 space-y-2">
                  {memory.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {memory.topics.map((topic, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded">
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-500 line-clamp-3 dark:text-slate-400">
                    {memory.content}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-paper-200 dark:border-cyber-700">
                    <span className="text-[9px] text-slate-400">
                      {t.updated}: {formatDate(memory.updated)}
                    </span>
                    <div className="flex items-center gap-1">
                      {onEditMemory && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditMemory(memory);
                          }}
                          className="p-1 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded transition-colors"
                          title={t.edit}
                        >
                          <Edit2 size={12} className="text-violet-500" />
                        </button>
                      )}
                      {onDeleteMemory && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(memory.id);
                          }}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                          title={t.delete}
                        >
                          <Trash2 size={12} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MemoryPanel;
