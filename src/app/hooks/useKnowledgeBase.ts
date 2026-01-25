import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { AIConfig, MarkdownFile, RAGStats } from '@/types';
import { VectorStore } from '@/services/ragService';

interface UseKnowledgeBaseOptions {
  aiConfig: AIConfig;
  files: MarkdownFile[];
  filesRef: MutableRefObject<MarkdownFile[]>;
  ragStats: RAGStats;
  setRagStats: Dispatch<SetStateAction<RAGStats>>;
}

interface UseKnowledgeBaseResult {
  vectorStore: VectorStore;
  handleIndexKnowledgeBase: (forceList?: MarkdownFile[]) => Promise<void>;
}

export const useKnowledgeBase = ({
  aiConfig,
  files,
  filesRef,
  ragStats,
  setRagStats
}: UseKnowledgeBaseOptions): UseKnowledgeBaseResult => {
  const [vectorStore] = useState(() => new VectorStore());

  useEffect(() => {
    const validFiles = files.filter(f => !f.name.endsWith('.keep') && f.content.trim().length > 0);
    const stats = vectorStore.getStats();

    setRagStats(prev => ({
      ...prev,
      totalFiles: validFiles.length,
      indexedFiles: stats.indexedFiles,
      totalChunks: stats.totalChunks
    }));
  }, [files, setRagStats, vectorStore]);

  const handleIndexKnowledgeBase = useCallback(async (forceList?: MarkdownFile[]) => {
    if (ragStats.isIndexing) return;

    const targetFiles = forceList || filesRef.current;
    const uniqueFilesMap = new Map<string, MarkdownFile>();

    targetFiles.forEach(file => {
      if (!file.name.endsWith('.keep') && file.content.trim().length > 0) {
        uniqueFilesMap.set(file.id, file);
      }
    });

    const validFiles = Array.from(uniqueFilesMap.values());
    setRagStats(prev => ({ ...prev, isIndexing: true, totalFiles: validFiles.length }));

    const currentFilesForSync = validFiles.map(file => ({ id: file.id, name: file.name }));
    try {
      const cleanedCount = await vectorStore.syncWithFileSystem(currentFilesForSync);
      if (cleanedCount > 0) {
        console.log(`[KnowledgeBase] Cleaned ${cleanedCount} stale files from vector store`);
      }
      const dbStats = await vectorStore.getStatsFromDB();
      setRagStats(prev => ({
        ...prev,
        totalFiles: dbStats.totalFiles,
        indexedFiles: dbStats.indexedFiles,
        totalChunks: dbStats.totalChunks
      }));
    } catch (error) {
      console.error('[KnowledgeBase] Failed to sync vector store:', error);
    }

    try {
      for (const file of validFiles) {
        if (file.content && file.content.length > 0) {
          await vectorStore.indexFile(file, aiConfig);
          const dbStats = await vectorStore.getStatsFromDB();
          setRagStats(prev => ({
            ...prev,
            totalFiles: dbStats.totalFiles,
            indexedFiles: dbStats.indexedFiles,
            totalChunks: dbStats.totalChunks
          }));
        }
      }
    } catch (error) {
      console.error('Indexing error', error);
    } finally {
      setRagStats(prev => ({ ...prev, isIndexing: false }));
    }
  }, [aiConfig, filesRef, ragStats.isIndexing, setRagStats, vectorStore]);

  return {
    vectorStore,
    handleIndexKnowledgeBase
  };
};
