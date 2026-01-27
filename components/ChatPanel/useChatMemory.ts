import { useCallback, useState } from 'react';

import type { MemoryItem } from '../MemoryPreviewModal';
import type { InjectedMemory, MemorySearchResult } from './MemoryPanel';
import type { Language } from '../../utils/translations';

interface MemoryWindow extends Window {
  searchPermanentMemories?: (query: string, limit: number) => Promise<MemorySearchResult[]>;
}

interface UseChatMemoryOptions {
  language: Language;
  showToast?: (message: string, isError?: boolean) => void;
}

const getMemoryWindow = (): MemoryWindow | null => {
  if (typeof window === 'undefined') return null;
  return window as MemoryWindow;
};

export const useChatMemory = ({ language, showToast }: UseChatMemoryOptions) => {
  const [showMemorySearch, setShowMemorySearch] = useState(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [memorySearchResults, setMemorySearchResults] = useState<MemorySearchResult[]>([]);
  const [isSearchingMemories, setIsSearchingMemories] = useState(false);
  const [injectedMemories, setInjectedMemories] = useState<InjectedMemory[]>([]);
  const [previewMemory, setPreviewMemory] = useState<MemoryItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleToggleMemorySearch = useCallback(() => {
    console.log('[Brain] Toggle Memory Management clicked, current state:', showMemorySearch);
    setShowMemorySearch(prev => !prev);
  }, [showMemorySearch]);

  const handleCloseMemoryPanel = useCallback(() => {
    setShowMemorySearch(false);
  }, []);

  const handleRemoveInjectedMemory = useCallback((memoryId: string) => {
    setInjectedMemories(prev => prev.filter(m => m.id !== memoryId));
    console.log('[Memory] Removed memory:', memoryId);
  }, []);

  const handleMemorySearch = useCallback(async () => {
    if (!memorySearchQuery.trim()) return;

    setIsSearchingMemories(true);

    const logger = {
      info: (msg: string, data?: unknown) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, error?: unknown) => console.error(`[ERROR] ${msg}`, error || ''),
      warn: (msg: string, data?: unknown) => console.warn(`[WARN] ${msg}`, data || '')
    };

    try {
      let results: MemorySearchResult[] = [];
      let searchMethod = 'unknown';

      logger.info('MemorySearch Starting', { query: memorySearchQuery });

      const memoryWindow = getMemoryWindow();
      if (memoryWindow?.searchPermanentMemories) {
        searchMethod = 'window.searchPermanentMemories';
        logger.info('Using window search method');
        results = await memoryWindow.searchPermanentMemories(memorySearchQuery, 10);
      } else if (memoryWindow?.electronAPI?.memory?.search) {
        searchMethod = 'electronAPI.memory.search';
        logger.info('Using IPC search method');
        results = await memoryWindow.electronAPI.memory.search(memorySearchQuery, 10);
      } else {
        logger.warn('No search function available');
        showToast?.(language === 'zh' ? '记忆服务暂不可用' : 'Memory service unavailable', true);
        setIsSearchingMemories(false);
        return;
      }

      if (!Array.isArray(results)) {
        logger.error('Invalid results format', { results });
        results = [];
      }

      setMemorySearchResults(results);
      logger.info('MemorySearch Complete', { method: searchMethod, count: results.length });

      if (results.length === 0) {
        showToast?.(language === 'zh' ? '未找到相关记忆' : 'No memories found');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('MemorySearch Failed', { error: errorMessage });

      showToast?.(
        language === 'zh'
          ? `记忆搜索失败: ${errorMessage}`
          : `Memory search failed: ${errorMessage}`,
        true
      );
    } finally {
      setIsSearchingMemories(false);
    }
  }, [memorySearchQuery, language, showToast]);

  const buildInjectedMessage = useCallback(async (userQuery: string) => {
    let messageContent = userQuery;

    try {
      const memoryWindow = getMemoryWindow();
      if (memoryWindow?.searchPermanentMemories || memoryWindow?.electronAPI?.memory?.search) {
        console.log('[MemoryAuto] Searching for relevant memories based on user query...');
        const autoResults = await memoryWindow.searchPermanentMemories?.(userQuery, 5)
          || await memoryWindow.electronAPI?.memory?.search?.(userQuery, 5);

        if (autoResults && autoResults.length > 0) {
          console.log('[MemoryAuto] Found', autoResults.length, 'relevant memories');

          const autoMemoryIds = new Set(autoResults.map((result) => result.id || result.filePath));

          const allMemories: Array<InjectedMemory | MemorySearchResult> = [
            ...injectedMemories,
            ...autoResults.filter((result) => !injectedMemories.some(m => m.id === (result.id || result.filePath)))
          ];

          if (allMemories.length > 0) {
            const memoryContents = allMemories.map((m, index) => {
              let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              content = content.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');

              const fileName = 'fileName' in m && m.fileName
                ? m.fileName
                : m.filePath?.split('/').pop()?.replace('.md', '') || m.id || '未知';

              return `【记忆片段 ${index + 1}】━━━━━━━━━━━━━━━━━━━━
来源：${fileName}
标签：${m.topics?.join(', ') || '无'}
内容：
${content}
━━━━━━━━━━━━━━━━━━━━━`;
            }).join('\n\n');

            messageContent = `【系统提示】以下持久记忆已根据您的问题自动检索并注入到对话上下文中，供参考使用：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
基于问题检索：${autoResults.length} 条
手动添加：${injectedMemories.length} 条
总计注入：${allMemories.length} 条
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${memoryContents}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**重要提示**：以上记忆信息已完整注入，包含用户需要的知识。
请勿再用 read_file 或 search_files 重复读取这些记忆文件。
请直接使用注入的信息回答用户问题。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用户问题：` + userQuery;

            console.log('[MemoryAuto] Total memories injected:', allMemories.length);
          }
        }
      }
    } catch (error) {
      console.error('[MemoryAuto] Auto-inject failed:', error);
      showToast?.(
        language === 'zh' ? '自动记忆注入失败，请手动添加' : 'Auto memory injection failed, please add manually',
        true
      );
    }

    return messageContent;
  }, [injectedMemories, showToast, language]);

  const handleMemoryClick = useCallback((memory: MemorySearchResult) => {
    setPreviewMemory({
      id: memory.id || memory.filePath,
      fileName: memory.filePath?.split('/').pop()?.replace('.md', '') || memory.id,
      content: memory.content || '',
      topics: memory.topics || [],
      filePath: memory.filePath,
      summary: memory.summary,
      isStarred: memory.isStarred || false,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt
    });
    setIsPreviewOpen(true);
    console.log('[Memory] Opening preview:', memory.id);
  }, []);

  const handleConfirmAddMemory = useCallback((memory: MemoryItem) => {
    const memoryId = memory.id;

    if (injectedMemories.some(m => m.id === memoryId)) {
      showToast?.(language === 'zh' ? '该记忆已在注入列表中' : 'Memory already in injected list');
      return;
    }

    setInjectedMemories(prev => [...prev, {
      id: memoryId,
      fileName: memory.fileName,
      content: memory.content,
      topics: memory.topics || [],
      filePath: memory.filePath,
      injectedAt: Date.now()
    }]);

    console.log('[Memory] Added to injected list:', memory.fileName);
    showToast?.(language === 'zh' ? '已添加到注入列表' : 'Added to injected list');
  }, [injectedMemories, showToast, language]);

  const handleSaveMemory = useCallback(async (memory: MemoryItem) => {
    try {
      const memoryWindow = getMemoryWindow();
      if (memoryWindow?.electronAPI?.memory?.update) {
        console.log('[Memory] 调用 update IPC, id:', memory.id);
        const result = await memoryWindow.electronAPI.memory.update({
          id: memory.id,
          content: memory.content,
          updatedAt: Date.now()
        });
        console.log('[Memory] update 返回值:', JSON.stringify(result));

        if (result.success) {
          console.log('[Memory] Saved:', memory.id);

          if (previewMemory?.id === memory.id) {
            setPreviewMemory(prev => prev ? {
              ...prev,
              content: memory.content,
              updatedAt: Date.now()
            } : null);
          }

          showToast?.(language === 'zh' ? '保存成功' : 'Saved successfully');
        } else {
          const errorMessage = 'error' in result ? result.error : 'Unknown error';
          console.error('[Memory] 保存失败:', errorMessage);
          showToast?.(language === 'zh' ? '保存失败' : 'Save failed', true);
        }
      } else {
        console.warn('[Memory] Update IPC not available');
        showToast?.(language === 'zh' ? '保存功能暂不可用' : 'Save not available', true);
      }
    } catch (error) {
      console.error('[Memory] Save failed:', error);
      showToast?.(language === 'zh' ? '保存失败' : 'Save failed', true);
    }
  }, [previewMemory, showToast, language]);

  const handleStarMemory = useCallback(async (memoryId: string, isStarred: boolean) => {
    try {
      const memoryWindow = getMemoryWindow();
      if (memoryWindow?.electronAPI?.memory?.star) {
        console.log('[Memory] 调用 star IPC, id:', memoryId, 'isStarred:', isStarred);
        const result = await memoryWindow.electronAPI.memory.star(memoryId, isStarred);
        console.log('[Memory] star 返回值:', JSON.stringify(result));

        if (result.success) {
          console.log('[Memory] Star toggled:', memoryId, isStarred);
          showToast?.(isStarred
            ? (language === 'zh' ? '已标星' : 'Starred')
            : (language === 'zh' ? '取消标星' : 'Unstarred'));

          if (previewMemory?.id === memoryId) {
            setPreviewMemory(prev => prev ? { ...prev, isStarred } : null);
          }
        } else {
          const errorMessage = 'error' in result ? result.error : 'Unknown error';
          console.error('[Memory] 标星失败:', errorMessage);
        }
      } else {
        console.warn('[Memory] Star IPC not available');
      }
    } catch (error) {
      console.error('[Memory] Star toggle failed:', error);
    }
  }, [previewMemory, showToast, language]);

  const handleCloseMemoryPreview = useCallback(() => {
    setIsPreviewOpen(false);
    setPreviewMemory(null);
  }, []);

  return {
    showMemorySearch,
    memorySearchQuery,
    setMemorySearchQuery,
    memorySearchResults,
    isSearchingMemories,
    injectedMemories,
    previewMemory,
    isPreviewOpen,
    handleToggleMemorySearch,
    handleCloseMemoryPanel,
    handleRemoveInjectedMemory,
    handleMemorySearch,
    buildInjectedMessage,
    handleMemoryClick,
    handleConfirmAddMemory,
    handleSaveMemory,
    handleStarMemory,
    handleCloseMemoryPreview
  };
};
