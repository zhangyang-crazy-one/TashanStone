import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { AIConfig, QuestionBank } from '@/types';
import { initPersistentMemory, searchPermanentMemories } from '@/services/aiService';
import { mcpService } from '@/src/services/mcpService';
import { questionBankService } from '@/src/services/quiz/questionBankService';
import type { VectorStore } from '@/services/ragService';

interface UseAppServicesOptions {
  aiConfig: AIConfig;
  vectorStore: VectorStore;
  setQuestionBanks: Dispatch<SetStateAction<QuestionBank[]>>;
}

export const useAppServices = ({
  aiConfig,
  vectorStore,
  setQuestionBanks
}: UseAppServicesOptions): void => {
  useEffect(() => {
    const windowWithSearch = window as Window & {
      searchPermanentMemories?: typeof searchPermanentMemories;
    };
    windowWithSearch.searchPermanentMemories = searchPermanentMemories;
    return () => {
      delete windowWithSearch.searchPermanentMemories;
    };
  }, []);

  useEffect(() => {
    const initServices = async () => {
      try {
        await vectorStore.initialize();
        console.log('[VectorStore] Initialized');
      } catch (err) {
        console.error('[VectorStore] Init failed:', err);
      }

      try {
        await initPersistentMemory();
        console.log('[PersistentMemory] Initialized');
      } catch (err) {
        console.error('[PersistentMemory] Init failed:', err);
      }

      if (aiConfig.mcpTools && aiConfig.mcpTools.trim() !== '[]' && mcpService.isAvailable()) {
        try {
          console.log('[MCP] Loading saved configuration...');
          const result = await mcpService.loadConfig(aiConfig.mcpTools);
          if (result.success) {
            console.log('[MCP] Configuration loaded successfully on startup');
          } else {
            console.warn('[MCP] Failed to load configuration on startup:', result.error);
          }
        } catch (err) {
          console.error('[MCP] Error loading configuration on startup:', err);
        }
      }

      try {
        const { initializeContextMemory } = await import('@/services/aiService');
        const { LanceDBMemoryStorage } = await import('@/src/services/context/long-term-memory');

        const longTermStorage = new LanceDBMemoryStorage();
        const initialized = await longTermStorage.initialize();

        if (initialized) {
          initializeContextMemory({ longTermStorage });
          console.log('[ContextMemory] Initialized with LanceDB long-term storage');
        } else {
          initializeContextMemory();
          console.warn('[ContextMemory] LanceDB not available, using in-memory only');
        }
      } catch (err) {
        console.error('[ContextMemory] Init failed:', err);
      }

      try {
        const { memoryAutoUpgradeService } = await import('@/src/services/context/memoryAutoUpgrade');
        memoryAutoUpgradeService.start();
        console.log('[MemoryAutoUpgrade] Service started');
      } catch (err) {
        console.error('[MemoryAutoUpgrade] Start failed:', err);
      }

      try {
        await questionBankService.initialize();
        const banks = questionBankService.getAllBanks();
        setQuestionBanks(banks);
        console.log('[QuestionBank] Initialized with', banks.length, 'banks');
      } catch (err) {
        console.error('[QuestionBank] Init failed:', err);
      }
    };

    void initServices();
  }, []);
};
