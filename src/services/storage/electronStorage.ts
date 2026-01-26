import { StorageService, ExportData, ImportResult } from './types';
import { MarkdownFile, AIConfig, ChatMessage, AppTheme, MistakeRecord } from '../../../types';

/**
 * Electron storage service - uses IPC to communicate with SQLite in main process
 */
export class ElectronStorageService implements StorageService {
    async initialize(): Promise<void> {
        // Database is initialized in main process
        // Just verify connection works
        await window.electronAPI.db.config.get();
    }

    // ===== Files =====
    async getFiles(): Promise<MarkdownFile[]> {
        return await window.electronAPI.db.files.getAll();
    }

    async getFile(id: string): Promise<MarkdownFile | null> {
        return await window.electronAPI.db.files.get(id);
    }

    async createFile(file: MarkdownFile): Promise<MarkdownFile> {
        return await window.electronAPI.db.files.create(file);
    }

    async updateFile(id: string, updates: Partial<MarkdownFile>): Promise<MarkdownFile | null> {
        return await window.electronAPI.db.files.update(id, updates);
    }

    async deleteFile(id: string): Promise<boolean> {
        return window.electronAPI.db.files.delete(id);
    }

    // ===== AI Config =====
    async getAIConfig(): Promise<AIConfig> {
        return await window.electronAPI.db.config.get();
    }

    async setAIConfig(config: AIConfig): Promise<AIConfig> {
        return await window.electronAPI.db.config.set(config);
    }

    // ===== Chat =====
    async getChatMessages(conversationId?: string): Promise<ChatMessage[]> {
        return await window.electronAPI.db.chat.getAll(conversationId);
    }

    async addChatMessage(message: ChatMessage, conversationId?: string): Promise<ChatMessage> {
        return await window.electronAPI.db.chat.add(message, conversationId);
    }

    async clearChatMessages(conversationId?: string): Promise<void> {
        return window.electronAPI.db.chat.clear(conversationId);
    }

    // ===== Themes =====
    async getThemes(): Promise<AppTheme[]> {
        return await window.electronAPI.db.themes.getAll();
    }

    async saveTheme(theme: AppTheme): Promise<AppTheme> {
        return await window.electronAPI.db.themes.save(theme);
    }

    async deleteTheme(id: string): Promise<boolean> {
        return window.electronAPI.db.themes.delete(id);
    }

    async getActiveThemeId(): Promise<string> {
        const themeId = await window.electronAPI.db.settings.get('activeThemeId');
        return themeId || 'neon-cyber';
    }

    async setActiveThemeId(id: string): Promise<void> {
        await window.electronAPI.db.settings.set('activeThemeId', id);
    }

    // ===== Settings =====
    async getSetting(key: string): Promise<string | null> {
        return window.electronAPI.db.settings.get(key);
    }

    async setSetting(key: string, value: string): Promise<void> {
        await window.electronAPI.db.settings.set(key, value);
    }

    // ===== Mistakes =====
    async getMistakes(): Promise<MistakeRecord[]> {
        return await window.electronAPI.db.mistakes.getAll();
    }

    async addMistake(record: MistakeRecord): Promise<MistakeRecord> {
        return await window.electronAPI.db.mistakes.add(record);
    }

    async deleteMistake(id: string): Promise<boolean> {
        return window.electronAPI.db.mistakes.delete(id);
    }

    // ===== Export/Import =====
    async exportAllData(): Promise<ExportData> {
        const [files, aiConfig, chatMessages, themes, mistakes] = await Promise.all([
            this.getFiles(),
            this.getAIConfig(),
            this.getChatMessages(),
            this.getThemes(),
            this.getMistakes()
        ]);

        const activeThemeId = await this.getActiveThemeId();

        return {
            version: 1,
            exportedAt: Date.now(),
            files,
            aiConfig,
            chatMessages,
            themes: themes.filter(t => t.isCustom),  // Only export custom themes
            settings: { activeThemeId },
            mistakes
        };
    }

    async importData(data: ExportData): Promise<ImportResult> {
        const errors: string[] = [];
        let filesImported = 0;
        let messagesImported = 0;
        let themesImported = 0;

        try {
            // Import files
            for (const file of data.files) {
                try {
                    await this.createFile(file);
                    filesImported++;
                } catch (e) {
                    errors.push(`Failed to import file: ${file.name}`);
                }
            }

            // Import chat messages
            for (const message of data.chatMessages) {
                try {
                    await this.addChatMessage(message);
                    messagesImported++;
                } catch (e) {
                    errors.push(`Failed to import message: ${message.id}`);
                }
            }

            // Import custom themes
            for (const theme of data.themes) {
                try {
                    await this.saveTheme({ ...theme, isCustom: true });
                    themesImported++;
                } catch (e) {
                    errors.push(`Failed to import theme: ${theme.name}`);
                }
            }

            // Import AI config
            if (data.aiConfig) {
                await this.setAIConfig(data.aiConfig);
            }

            // Import settings
            if (data.settings?.activeThemeId) {
                await this.setActiveThemeId(data.settings.activeThemeId);
            }

            return {
                success: errors.length === 0,
                filesImported,
                messagesImported,
                themesImported,
                errors
            };
        } catch (error) {
            return {
                success: false,
                filesImported,
                messagesImported,
                themesImported,
                errors: [...errors, `Import failed: ${error}`]
            };
        }
    }
}
