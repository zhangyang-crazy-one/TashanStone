import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, Edit2, Sparkles, X, Filter, SortAsc, SortDesc, Brain, RefreshCw, AlertCircle } from 'lucide-react';
import { List, type RowComponentProps, useDynamicRowHeight } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import Tooltip from './Tooltip';
import { Button } from './ui/Button';
import { Skeleton } from './ui/Skeleton';

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

type MemorySortBy = 'updated' | 'created' | 'importance';
type MemoryImportanceFilter = 'all' | 'low' | 'medium' | 'high';

const IMPORTANCE_FILTERS: Record<MemoryImportanceFilter, true> = {
  all: true,
  low: true,
  medium: true,
  high: true
};

const SORT_BY_OPTIONS: Record<MemorySortBy, true> = {
  updated: true,
  created: true,
  importance: true
};

const isImportanceFilter = (value: string): value is MemoryImportanceFilter => value in IMPORTANCE_FILTERS;
const isSortByOption = (value: string): value is MemorySortBy => value in SORT_BY_OPTIONS;

const DEFAULT_ROW_HEIGHT = 88;

interface MemoryIndexEntry {
  id: string;
  filePath: string;
  created: string;
  updated: string;
  topics?: string[];
  importance?: 'low' | 'medium' | 'high';
  sourceSessions?: string[];
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
  const [sortBy, setSortBy] = useState<MemorySortBy>('updated');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [importanceFilter, setImportanceFilter] = useState<MemoryImportanceFilter>('all');
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

  const rowHeightKey = useMemo(() => (
    `${filteredMemories.length}-${sortBy}-${sortOrder}-${importanceFilter}-${searchQuery}`
  ), [filteredMemories.length, sortBy, sortOrder, importanceFilter, searchQuery]);
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: DEFAULT_ROW_HEIGHT, key: rowHeightKey });

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (electronAPI?.file?.readFile) {
        const indexPath = '.memories/_memories_index.json';
        const indexData = await electronAPI.file.readFile(indexPath);
        if (indexData) {
          const index = JSON.parse(indexData) as { memories?: MemoryIndexEntry[] };
          const loadedMemories: MemoryDocument[] = [];

          const indexMemories = Array.isArray(index.memories) ? index.memories : [];
          const metadataList = electronAPI.file.getBatchMetadata
            ? await electronAPI.file.getBatchMetadata(indexMemories.map(m => m.filePath), true)
            : [];
          const metadataByPath = new Map(metadataList.map(item => [item.path, item]));

          for (const memoryInfo of indexMemories) {
            try {
              const metadata = metadataByPath.get(memoryInfo.filePath);
              const content = metadata?.content;
              if (content) {
                const memory = parseMarkdownToMemory(content, memoryInfo);
                loadedMemories.push(memory);
              } else if (!electronAPI.file.getBatchMetadata) {
                const fallbackContent = await electronAPI.file.readFile(memoryInfo.filePath);
                if (fallbackContent) {
                  const memory = parseMarkdownToMemory(fallbackContent, memoryInfo);
                  loadedMemories.push(memory);
                }
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
      const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (electronAPI?.memory?.checkSyncStatus) {
        const status = await electronAPI.memory.checkSyncStatus();
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

  const parseMarkdownToMemory = (content: string, metadata: MemoryIndexEntry): MemoryDocument => {
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

  const t = useMemo(() => ({
    title: language === 'zh' ? 'AI 记忆库' : 'Memory Library',
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
    close: language === 'zh' ? '关闭' : 'Close',
    filterAll: language === 'zh' ? '全部' : 'All',
    filterHigh: language === 'zh' ? '高' : 'High',
    filterMedium: language === 'zh' ? '中' : 'Medium',
    filterLow: language === 'zh' ? '低' : 'Low',
    sortBy: language === 'zh' ? '排序方式' : 'Sort by',
    confirmDelete: language === 'zh' ? '确定要删除这个记忆吗？' : 'Are you sure you want to delete this memory?',
    outOfSync: language === 'zh' ? '部分记忆可能已过期' : 'Some memories may be outdated',
    refresh: language === 'zh' ? '刷新' : 'Refresh',
  }), [language]);

  type MemoryRowProps = {
    memories: MemoryDocument[];
    expandedMemory: string | null;
    onToggleExpanded: (id: string) => void;
    onEditMemory?: (memory: MemoryDocument) => void;
    onDeleteMemory?: (id: string) => Promise<void>;
    handleDelete: (id: string) => void;
    t: typeof t;
  };

  const MemoryRow = ({ index, style, ariaAttributes, ...rowProps }: RowComponentProps<MemoryRowProps>) => {
    const memory = rowProps.memories[index];
    if (!memory) return null;

    return (
      <div style={style} className="pb-2" {...ariaAttributes}>
        <div className="bg-paper-50 dark:bg-cyber-900/50 rounded-lg border border-paper-200 dark:border-cyber-700 overflow-hidden transition-colors hover:border-violet-300 dark:hover:border-violet-700">
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer"
            onClick={() => rowProps.onToggleExpanded(memory.id)}
          >
            <Sparkles size={12} className="text-violet-400 shrink-0" />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex-1">
              {memory.filePath?.split('/').pop()?.replace('.md', '') || memory.id}
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded ${getImportanceColor(memory.importance)}`}>
              {memory.importance}
            </span>
          </div>

          {rowProps.expandedMemory === memory.id && (
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
                  {rowProps.t.updated}: {formatDate(memory.updated)}
                </span>
                <div className="flex items-center gap-1">
                  {rowProps.onEditMemory && (
                    <Tooltip content={rowProps.t.edit}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          rowProps.onEditMemory?.(memory);
                        }}
                        className="p-1 hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded transition-colors"
                        aria-label={rowProps.t.edit}
                      >
                        <Edit2 size={12} className="text-violet-500" />
                      </button>
                    </Tooltip>
                  )}
                  {rowProps.onDeleteMemory && (
                    <Tooltip content={rowProps.t.delete}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          rowProps.handleDelete(memory.id);
                        }}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                        aria-label={rowProps.t.delete}
                      >
                        <Trash2 size={12} className="text-red-500" />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
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
          <Tooltip content={t.refresh}>
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
              aria-label={t.refresh}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </Tooltip>
          <Tooltip content={t.create}>
            <button
              onClick={onCreateMemory}
              className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
              aria-label={t.create}
            >
              <Plus size={18} />
            </button>
          </Tooltip>
          <Tooltip content={t.close || (language === 'zh' ? '关闭' : 'Close')}>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-all"
              aria-label={t.close || (language === 'zh' ? '关闭' : 'Close')}
            >
              <X size={18} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-b border-paper-200 dark:border-cyber-700 space-y-2">
        <Button
          onClick={onCreateMemory}
          size="sm"
          fullWidth
          leftIcon={<Plus size={14} />}
          className="bg-violet-500 hover:bg-violet-600"
        >
          {t.create}
        </Button>
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
            onChange={(e) => {
              const value = e.target.value;
              setImportanceFilter(isImportanceFilter(value) ? value : 'all');
            }}
            className="flex-1 px-2 py-1.5 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded focus:outline-none focus:border-violet-500 text-slate-700 dark:text-slate-300"
          >
            <option value="all">{t.filterAll}</option>
            <option value="high">{t.filterHigh}</option>
            <option value="medium">{t.filterMedium}</option>
            <option value="low">{t.filterLow}</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => {
              const value = e.target.value;
              setSortBy(isSortByOption(value) ? value : 'updated');
            }}
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
      <div className="flex-1 overflow-hidden p-3">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`memory-skeleton-${index}`}
                className="rounded-lg border border-paper-200 dark:border-cyber-700 bg-white/70 dark:bg-cyber-800/60 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs text-slate-400">{t.noMemories}</p>
            <p className="text-[10px] text-slate-400 mt-1">{t.noMemoriesDesc}</p>
          </div>
        ) : (
          <AutoSizer
            renderProp={({ height, width }) => {
              if (!height || !width) return null;
              return (
                <List
                  rowCount={filteredMemories.length}
                  rowHeight={dynamicRowHeight}
                  rowComponent={MemoryRow}
                  rowProps={{
                    memories: filteredMemories,
                    expandedMemory,
                    onToggleExpanded: (id: string) => setExpandedMemory(prev => prev === id ? null : id),
                    onEditMemory,
                    onDeleteMemory,
                    handleDelete,
                    t
                  }}
                  overscanCount={4}
                  style={{ height, width }}
                />
              );
            }}
          />
        )}
      </div>
    </div>
  );
};

export default MemoryPanel;
