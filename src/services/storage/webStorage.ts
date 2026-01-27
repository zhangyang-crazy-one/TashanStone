import { StorageService, ExportData, ImportResult } from './types';
import { MarkdownFile, AIConfig, ChatMessage, AppTheme, MistakeRecord } from '../../../types';

// Default themes - duplicated here to avoid circular import
const DEFAULT_THEMES: AppTheme[] = [
    {
        id: 'neon-cyber',
        name: 'Neon Cyber',
        type: 'dark',
        colors: {
            '--bg-main': '11 17 33',
            '--bg-panel': '21 30 50',
            '--bg-element': '42 59 85',
            '--border-main': '42 59 85',
            '--text-primary': '203 213 225',
            '--text-secondary': '148 163 184',
            '--primary-500': '6 182 212',
            '--primary-600': '34 211 238',
            '--secondary-500': '139 92 246',
            '--neutral-50': '248 250 252',
            '--neutral-100': '241 245 249',
            '--neutral-200': '226 232 240',
            '--neutral-300': '203 213 225',
            '--neutral-400': '148 163 184',
            '--neutral-500': '100 116 139',
            '--neutral-600': '71 85 105',
            '--neutral-700': '51 65 85',
            '--neutral-800': '30 41 59',
            '--neutral-900': '15 23 42',
        }
    },
    {
        id: 'clean-paper',
        name: 'Clean Paper',
        type: 'light',
        colors: {
            '--bg-main': '248 250 252',
            '--bg-panel': '241 245 249',
            '--bg-element': '226 232 240',
            '--border-main': '203 213 225',
            '--text-primary': '30 41 59',
            '--text-secondary': '71 85 105',
            '--primary-500': '6 182 212',
            '--primary-600': '8 145 178',
            '--secondary-500': '139 92 246',
            '--neutral-50': '248 250 252',
            '--neutral-100': '241 245 249',
            '--neutral-200': '226 232 240',
            '--neutral-300': '203 213 225',
            '--neutral-400': '148 163 184',
            '--neutral-500': '100 116 139',
            '--neutral-600': '71 85 105',
            '--neutral-700': '51 65 85',
            '--neutral-800': '30 41 59',
            '--neutral-900': '15 23 42',
        }
    },
    {
        id: 'midnight-dracula',
        name: 'Midnight Dracula',
        type: 'dark',
        colors: {
            '--bg-main': '40 42 54',
            '--bg-panel': '68 71 90',
            '--bg-element': '98 114 164',
            '--border-main': '98 114 164',
            '--text-primary': '248 248 242',
            '--text-secondary': '189 147 249',
            '--primary-500': '255 121 198',
            '--primary-600': '255 85 85',
            '--secondary-500': '139 233 253',
            '--neutral-50': '248 248 242',
            '--neutral-100': '248 248 242',
            '--neutral-200': '248 248 242',
            '--neutral-300': '248 248 242',
            '--neutral-400': '189 147 249',
            '--neutral-500': '98 114 164',
            '--neutral-600': '68 71 90',
            '--neutral-700': '40 42 54',
            '--neutral-800': '40 42 54',
            '--neutral-900': '25 25 35',
        }
    },
    {
        id: 'solarized-dawn',
        name: 'Solarized Dawn',
        type: 'light',
        colors: {
            '--bg-main': '253 246 227',
            '--bg-panel': '238 232 213',
            '--bg-element': '211 204 187',
            '--border-main': '191 183 166',
            '--text-primary': '101 123 131',
            '--text-secondary': '88 110 117',
            '--primary-500': '38 139 210',
            '--primary-600': '42 161 152',
            '--secondary-500': '211 54 130',
            '--neutral-50': '253 246 227',
            '--neutral-100': '238 232 213',
            '--neutral-200': '211 204 187',
            '--neutral-300': '147 161 161',
            '--neutral-400': '131 148 150',
            '--neutral-500': '101 123 131',
            '--neutral-600': '88 110 117',
            '--neutral-700': '7 54 66',
            '--neutral-800': '7 54 66',
            '--neutral-900': '0 43 54',
        }
    }
];

// LocalStorage keys
const KEYS = {
    FILES: 'neon-files',
    ACTIVE_ID: 'neon-active-id',
    AI_CONFIG: 'neon-ai-config',
    CHAT_HISTORY: 'neon-chat-history',
    ACTIVE_THEME: 'neon-active-theme-id',
    CUSTOM_THEMES: 'neon-custom-themes',
    MISTAKES: 'neon-quiz-mistakes'
};

/**
 * Web storage service - uses localStorage for browser-only mode
 * This is a fallback for when Electron is not available
 */
export class WebStorageService implements StorageService {
    async initialize(): Promise<void> {
        // Nothing to initialize for localStorage
    }

    // ===== Files =====
    async getFiles(): Promise<MarkdownFile[]> {
        try {
            const saved = localStorage.getItem(KEYS.FILES);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load files from localStorage:', e);
        }
        return [];
    }

    async getFile(id: string): Promise<MarkdownFile | null> {
        const files = await this.getFiles();
        return files.find(f => f.id === id) || null;
    }

    async createFile(file: MarkdownFile): Promise<MarkdownFile> {
        const files = await this.getFiles();
        files.push(file);
        this.saveFiles(files);
        return file;
    }

    async updateFile(id: string, updates: Partial<MarkdownFile>): Promise<MarkdownFile | null> {
        const files = await this.getFiles();
        const index = files.findIndex(f => f.id === id);
        if (index === -1) return null;

        files[index] = { ...files[index], ...updates };
        this.saveFiles(files);
        return files[index];
    }

    async deleteFile(id: string): Promise<boolean> {
        const files = await this.getFiles();
        const newFiles = files.filter(f => f.id !== id);
        if (newFiles.length === files.length) return false;

        this.saveFiles(newFiles);
        return true;
    }

    private saveFiles(files: MarkdownFile[]): void {
        // Filter out handle property which cannot be serialized
        const toSave = files.map(f => {
            const { handle: _handle, ...rest } = f;
            return rest;
        });
        localStorage.setItem(KEYS.FILES, JSON.stringify(toSave));
    }

    // ===== AI Config =====
    async getAIConfig(): Promise<AIConfig> {
        try {
            const saved = localStorage.getItem(KEYS.AI_CONFIG);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load AI config:', e);
        }
        return {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            temperature: 0.7,
            language: 'en'
        };
    }

    async setAIConfig(config: AIConfig): Promise<AIConfig> {
        localStorage.setItem(KEYS.AI_CONFIG, JSON.stringify(config));
        return config;
    }

    // ===== Chat =====
    async getChatMessages(conversationId?: string): Promise<ChatMessage[]> {
        try {
            const saved = localStorage.getItem(KEYS.CHAT_HISTORY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load chat history:', e);
        }
        return [];
    }

    async addChatMessage(message: ChatMessage, conversationId?: string): Promise<ChatMessage> {
        const messages = await this.getChatMessages();
        messages.push(message);
        localStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify(messages));
        return message;
    }

    async clearChatMessages(conversationId?: string): Promise<void> {
        localStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify([]));
    }

    // ===== Themes =====
    async getThemes(): Promise<AppTheme[]> {
        const customThemes = await this.getCustomThemes();
        return [...DEFAULT_THEMES, ...customThemes];
    }

    private async getCustomThemes(): Promise<AppTheme[]> {
        try {
            const saved = localStorage.getItem(KEYS.CUSTOM_THEMES);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load custom themes:', e);
        }
        return [];
    }

    async saveTheme(theme: AppTheme): Promise<AppTheme> {
        const customThemes = await this.getCustomThemes();
        const index = customThemes.findIndex(t => t.id === theme.id);

        if (index >= 0) {
            customThemes[index] = theme;
        } else {
            customThemes.push({ ...theme, isCustom: true });
        }

        localStorage.setItem(KEYS.CUSTOM_THEMES, JSON.stringify(customThemes));
        return theme;
    }

    async deleteTheme(id: string): Promise<boolean> {
        const customThemes = await this.getCustomThemes();
        const newThemes = customThemes.filter(t => t.id !== id);

        if (newThemes.length === customThemes.length) return false;

        localStorage.setItem(KEYS.CUSTOM_THEMES, JSON.stringify(newThemes));
        return true;
    }

    async getActiveThemeId(): Promise<string> {
        return localStorage.getItem(KEYS.ACTIVE_THEME) || 'neon-cyber';
    }

    async setActiveThemeId(id: string): Promise<void> {
        localStorage.setItem(KEYS.ACTIVE_THEME, id);
    }

    // ===== Settings =====
    async getSetting(key: string): Promise<string | null> {
        return localStorage.getItem(`neon-setting-${key}`);
    }

    async setSetting(key: string, value: string): Promise<void> {
        localStorage.setItem(`neon-setting-${key}`, value);
    }

    // ===== Mistakes =====
    async getMistakes(): Promise<MistakeRecord[]> {
        try {
            const saved = localStorage.getItem(KEYS.MISTAKES);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load mistakes:', e);
        }
        return [];
    }

    async addMistake(record: MistakeRecord): Promise<MistakeRecord> {
        const mistakes = await this.getMistakes();
        mistakes.push(record);
        localStorage.setItem(KEYS.MISTAKES, JSON.stringify(mistakes));
        return record;
    }

    async deleteMistake(id: string): Promise<boolean> {
        const mistakes = await this.getMistakes();
        const newMistakes = mistakes.filter(m => m.id !== id);

        if (newMistakes.length === mistakes.length) return false;

        localStorage.setItem(KEYS.MISTAKES, JSON.stringify(newMistakes));
        return true;
    }

    // ===== Export/Import =====
    async exportAllData(): Promise<ExportData> {
        const [files, aiConfig, chatMessages, themes, mistakes] = await Promise.all([
            this.getFiles(),
            this.getAIConfig(),
            this.getChatMessages(),
            this.getCustomThemes(),
            this.getMistakes()
        ]);

        const activeThemeId = await this.getActiveThemeId();

        return {
            version: 1,
            exportedAt: Date.now(),
            files,
            aiConfig,
            chatMessages,
            themes,
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

            // Clear and import chat messages
            await this.clearChatMessages();
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
                    await this.saveTheme(theme);
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
