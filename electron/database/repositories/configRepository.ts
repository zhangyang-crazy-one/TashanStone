import type Database from 'better-sqlite3';

import type { AIConfig as SharedAIConfig } from '../../../types';
import { getDatabase } from '../index.js';

export type AIProvider = 'gemini' | 'ollama' | 'openai';
export type AIConfig = SharedAIConfig;

const EXTENDED_CONFIG_KEY = 'ai_config:extended';

export interface AIConfigRow {
    id: number;
    provider: string;
    model: string;
    base_url: string | null;
    api_key_encrypted: string | null;
    temperature: number;
    language: string;
    updated_at: number;
}

function mergeAIConfig(baseConfig: AIConfig, overrides?: Partial<AIConfig>): AIConfig {
    if (!overrides) {
        return baseConfig;
    }

    return {
        ...baseConfig,
        ...overrides,
        customPrompts: {
            ...baseConfig.customPrompts,
            ...overrides.customPrompts,
        },
        backup: overrides.backup ?? baseConfig.backup,
        security: {
            ...baseConfig.security,
            ...overrides.security,
        },
        contextEngine: {
            ...baseConfig.contextEngine,
            ...overrides.contextEngine,
        },
        tagSuggestion: {
            ...baseConfig.tagSuggestion,
            ...overrides.tagSuggestion,
        },
        assistantSettings: overrides.assistantSettings
            ? {
                surface: overrides.assistantSettings.surface,
                sectionBySurface: {
                    ...baseConfig.assistantSettings?.sectionBySurface,
                    ...overrides.assistantSettings.sectionBySurface,
                },
            }
            : baseConfig.assistantSettings,
    };
}

export class ConfigRepository {
    constructor(private readonly databaseProvider: () => Database.Database = getDatabase) {}

    getAIConfig(): AIConfig {
        const db = this.databaseProvider();
        const row = db.prepare(`
            SELECT id, provider, model, base_url, api_key_encrypted, temperature, language, updated_at
            FROM ai_config
            WHERE id = 1
        `).get() as AIConfigRow | undefined;

        const extendedConfig = db.prepare('SELECT value FROM settings WHERE key = ?')
            .get(EXTENDED_CONFIG_KEY) as { value: string } | undefined;
        const parsedExtendedConfig = extendedConfig ? this.parseExtendedConfig(extendedConfig.value) : undefined;

        if (!row) {
            return mergeAIConfig({
                provider: 'gemini',
                model: 'gemini-2.5-flash',
                temperature: 0.7,
                language: 'en'
            }, parsedExtendedConfig);
        }

        return mergeAIConfig(this.rowToConfig(row), parsedExtendedConfig);
    }

    setAIConfig(config: AIConfig): AIConfig {
        const db = this.databaseProvider();
        const now = Date.now();

        db.prepare(`
            INSERT OR REPLACE INTO ai_config (id, provider, model, base_url, api_key_encrypted, temperature, language, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            config.provider,
            config.model,
            config.baseUrl || null,
            config.apiKey || null,  // TODO: Encrypt in production
            config.temperature,
            config.language,
            now
        );

        db.prepare(`
            INSERT OR REPLACE INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
        `).run(EXTENDED_CONFIG_KEY, JSON.stringify(config), now);

        return this.getAIConfig();
    }

    private rowToConfig(row: AIConfigRow): AIConfig {
        return {
            provider: row.provider as AIProvider,
            model: row.model,
            baseUrl: row.base_url || undefined,
            apiKey: row.api_key_encrypted || undefined,  // TODO: Decrypt in production
            temperature: row.temperature,
            language: row.language as 'en' | 'zh'
        };
    }

    private parseExtendedConfig(rawConfig: string): Partial<AIConfig> | undefined {
        try {
            return JSON.parse(rawConfig) as Partial<AIConfig>;
        } catch {
            return undefined;
        }
    }
}

export class SettingsRepository {
    get(key: string): string | null {
        const db = getDatabase();
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
        return row?.value || null;
    }

    set(key: string, value: string): void {
        const db = getDatabase();
        const now = Date.now();

        db.prepare(`
            INSERT OR REPLACE INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
        `).run(key, value, now);
    }

    delete(key: string): boolean {
        const db = getDatabase();
        const result = db.prepare('DELETE FROM settings WHERE key = ?').run(key);
        return result.changes > 0;
    }

    getAll(): Record<string, string> {
        const db = getDatabase();
        const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
        const result: Record<string, string> = {};
        for (const row of rows) {
            result[row.key] = row.value;
        }
        return result;
    }
}

export const configRepository = new ConfigRepository();
export const settingsRepository = new SettingsRepository();
