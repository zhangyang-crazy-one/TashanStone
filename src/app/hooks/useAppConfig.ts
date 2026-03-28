import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { AIConfig } from '@/types';
import { DEFAULT_AI_CONFIG } from '@/src/app/appDefaults';
import { mcpService } from '@/src/services/mcpService';
import { getStorageService } from '@/src/services/storage/storageService';

interface UseAppConfigOptions {
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
}

interface UseAppConfigResult {
  aiConfig: AIConfig;
  setAiConfig: Dispatch<SetStateAction<AIConfig>>;
  handleSettingsSave: (config: AIConfig) => Promise<void>;
  handleSettingsDataImported: () => void;
}

export const useAppConfig = ({ setIsSettingsOpen }: UseAppConfigOptions): UseAppConfigResult => {
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const storageRef = useRef<ReturnType<typeof getStorageService> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      try {
        const storage = getStorageService();
        storageRef.current = storage;
        await storage.initialize();
        const storedConfig = await storage.getAIConfig();

        if (isMounted) {
          setAiConfig(storedConfig);
        }
      } catch (error) {
        console.error('[AppConfig] Failed to load stored AI config:', error);
      }
    };

    void loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSettingsSave = useCallback(async (config: AIConfig) => {
    const storage = storageRef.current ?? getStorageService();
    storageRef.current = storage;
    await storage.initialize();
    const savedConfig = await storage.setAIConfig(config);
    setAiConfig(savedConfig);
    if (savedConfig.mcpTools && savedConfig.mcpTools.trim() !== '[]' && mcpService.isAvailable()) {
      try {
        const result = await mcpService.loadConfig(savedConfig.mcpTools);
        if (result.success) {
          console.log('[MCP] Configuration loaded successfully');
        } else {
          console.warn('[MCP] Failed to load configuration:', result.error);
        }
      } catch (error) {
        console.error('[MCP] Error loading configuration:', error);
      }
    }
  }, []);

  const handleSettingsDataImported = useCallback(() => {
    setIsSettingsOpen(false);
    setTimeout(() => {
      window.location.reload();
    }, 300);
  }, [setIsSettingsOpen]);

  return {
    aiConfig,
    setAiConfig,
    handleSettingsSave,
    handleSettingsDataImported
  };
};
