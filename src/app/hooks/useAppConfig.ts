import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { AIConfig } from '@/types';
import { DEFAULT_AI_CONFIG } from '@/src/app/appDefaults';
import { mcpService } from '@/src/services/mcpService';

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
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    try {
      const saved = localStorage.getItem('neon-ai-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_AI_CONFIG,
          ...parsed,
          customPrompts: { ...DEFAULT_AI_CONFIG.customPrompts, ...parsed.customPrompts },
          contextEngine: {
            ...(DEFAULT_AI_CONFIG.contextEngine || {}),
            ...(parsed.contextEngine || {})
          }
        };
      }
      return DEFAULT_AI_CONFIG;
    } catch {
      return DEFAULT_AI_CONFIG;
    }
  });

  useEffect(() => {
    localStorage.setItem('neon-ai-config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  const handleSettingsSave = useCallback(async (config: AIConfig) => {
    setAiConfig(config);
    if (config.mcpTools && config.mcpTools.trim() !== '[]' && mcpService.isAvailable()) {
      try {
        const result = await mcpService.loadConfig(config.mcpTools);
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
