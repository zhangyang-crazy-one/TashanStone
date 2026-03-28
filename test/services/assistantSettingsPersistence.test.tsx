import React from 'react';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Database from 'better-sqlite3';

import type { AIConfig, AppTheme } from '../../types';
import { translations } from '../../utils/translations';

const {
  getStorageServiceMock,
  mcpLoadConfigMock,
  mcpIsAvailableMock,
} = vi.hoisted(() => ({
  getStorageServiceMock: vi.fn(),
  mcpLoadConfigMock: vi.fn(),
  mcpIsAvailableMock: vi.fn(),
}));

vi.mock('@/src/services/storage/storageService', () => ({
  getStorageService: getStorageServiceMock,
}));

vi.mock('@/src/services/mcpService', () => ({
  mcpService: {
    isAvailable: mcpIsAvailableMock,
    loadConfig: mcpLoadConfigMock,
  },
}));

import { AISettingsModal } from '../../components/AISettingsModal';
import { useAppConfig } from '../../src/app/hooks/useAppConfig';
import { ASSISTANT_SETTINGS_DEFAULTS } from '../../src/services/assistant-runtime/defaults';
import { ConfigRepository } from '../../electron/database/repositories/configRepository';

function createFakeDatabase(): Database.Database {
  let aiConfigRow:
    | {
        id: number;
        provider: string;
        model: string;
        base_url: string | null;
        api_key_encrypted: string | null;
        temperature: number;
        language: string;
        updated_at: number;
      }
    | undefined;
  const settings = new Map<string, string>();

  return {
    prepare(sql: string) {
      if (sql.includes('FROM ai_config')) {
        return {
          get: () => aiConfigRow,
        };
      }

      if (sql.includes('INSERT OR REPLACE INTO ai_config')) {
        return {
          run: (
            provider: string,
            model: string,
            baseUrl: string | null,
            apiKey: string | null,
            temperature: number,
            language: string,
            updatedAt: number,
          ) => {
            aiConfigRow = {
              id: 1,
              provider,
              model,
              base_url: baseUrl,
              api_key_encrypted: apiKey,
              temperature,
              language,
              updated_at: updatedAt,
            };
          },
        };
      }

      if (sql.includes('SELECT value FROM settings WHERE key = ?')) {
        return {
          get: (key: string) => {
            const value = settings.get(key);
            return value ? { value } : undefined;
          },
        };
      }

      if (sql.includes('INSERT OR REPLACE INTO settings')) {
        return {
          run: (key: string, value: string) => {
            settings.set(key, value);
          },
        };
      }

      if (sql.includes('DELETE FROM settings')) {
        return {
          run: (key: string) => ({
            changes: settings.delete(key) ? 1 : 0,
          }),
        };
      }

      if (sql.includes('SELECT key, value FROM settings')) {
        return {
          all: () => Array.from(settings.entries()).map(([key, value]) => ({ key, value })),
        };
      }

      throw new Error(`Unhandled SQL in test database: ${sql}`);
    },
  } as unknown as Database.Database;
}

const persistedConfig: AIConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.example.com',
  apiKey: 'secret',
  temperature: 0.2,
  language: 'en',
  enableStreaming: true,
  enableWebSearch: true,
  mcpTools: '{"mcpServers":{"filesystem":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem"]}}}',
  compactModel: 'gpt-4o-mini',
  customPrompts: {
    polish: 'Polish prompt',
    expand: 'Expand prompt',
    enhance: 'Enhance prompt',
  },
  backup: {
    frequency: 'weekly',
    lastBackup: 123456789,
  },
  security: {
    enableLoginProtection: true,
  },
  contextEngine: {
    enabled: true,
    maxTokens: 24000,
    modelContextLimit: 200000,
    modelOutputLimit: 16000,
    compactThreshold: 0.8,
    pruneThreshold: 0.7,
    truncateThreshold: 0.9,
    messagesToKeep: 6,
    checkpointInterval: 15,
  },
  tagSuggestion: {
    enabled: true,
    autoSuggest: true,
  },
  assistantSettings: {
    surface: 'operator',
    sectionBySurface: {
      ...ASSISTANT_SETTINGS_DEFAULTS.sectionBySurface,
      notebook: 'backup',
    },
  },
};

describe('assistant settings persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpIsAvailableMock.mockReturnValue(false);
    mcpLoadConfigMock.mockResolvedValue({ success: true });
  });

  it('round-trips phase-1 runtime and shell fields through config repository persistence', () => {
    const repository = new ConfigRepository(() => createFakeDatabase());

    repository.setAIConfig(persistedConfig);
    const loaded = repository.getAIConfig();

    expect(loaded).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini',
      enableStreaming: true,
      enableWebSearch: true,
      mcpTools: persistedConfig.mcpTools,
      compactModel: 'gpt-4o-mini',
      customPrompts: persistedConfig.customPrompts,
      backup: persistedConfig.backup,
      security: persistedConfig.security,
      contextEngine: persistedConfig.contextEngine,
      tagSuggestion: persistedConfig.tagSuggestion,
      assistantSettings: persistedConfig.assistantSettings,
    });
  });

  it('loads and saves app config through the shared storage service instead of localStorage', async () => {
    const storage = {
      initialize: vi.fn().mockResolvedValue(undefined),
      getAIConfig: vi.fn().mockResolvedValue(persistedConfig),
      setAIConfig: vi.fn().mockResolvedValue({
        ...persistedConfig,
        temperature: 0.55,
      }),
    };
    getStorageServiceMock.mockReturnValue(storage);

    const localStorageGetSpy = vi.spyOn(window.localStorage, 'getItem');
    const localStorageSetSpy = vi.spyOn(window.localStorage, 'setItem');

    const { result } = renderHook(() => useAppConfig({
      setIsSettingsOpen: vi.fn(),
    }));

    await waitFor(() => {
      expect(result.current.aiConfig).toMatchObject({
        provider: 'openai',
        assistantSettings: persistedConfig.assistantSettings,
      });
    });

    await result.current.handleSettingsSave({
      ...result.current.aiConfig,
      temperature: 0.55,
    });

    expect(storage.initialize).toHaveBeenCalled();
    expect(storage.getAIConfig).toHaveBeenCalled();
    expect(storage.setAIConfig).toHaveBeenCalledWith(expect.objectContaining({
      temperature: 0.55,
      assistantSettings: persistedConfig.assistantSettings,
    }));
    expect(localStorageGetSpy).not.toHaveBeenCalled();
    expect(localStorageSetSpy).not.toHaveBeenCalled();
  });

  it('renders descriptor-backed operator and notebook shell metadata while deferred sections stay metadata-only', () => {
    render(
      <AISettingsModal
        isOpen={true}
        onClose={vi.fn()}
        config={persistedConfig}
        onSave={vi.fn()}
        themes={[] as AppTheme[]}
        activeThemeId="neon-cyber"
        onSelectTheme={vi.fn()}
        onImportTheme={vi.fn()}
        onDeleteTheme={vi.fn()}
        language="en"
        shortcuts={[]}
      />,
    );

    expect(screen.getByText(translations.en.assistantSettings.surfaces.operator.title)).toBeInTheDocument();
    expect(screen.getByText(translations.en.assistantSettings.surfaces.notebook.title)).toBeInTheDocument();
    expect(screen.getByText(translations.en.assistantSettings.operator.sections.runtime.title)).toBeInTheDocument();
    expect(screen.getByText(translations.en.assistantSettings.notebook.sections.workspace.title)).toBeInTheDocument();
    expect(screen.getAllByText(translations.en.assistantSettings.phaseLabels.laterPhase).length).toBeGreaterThan(0);
  });
});
