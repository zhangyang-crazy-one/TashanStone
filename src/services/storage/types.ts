import { MarkdownFile, AIConfig, AssistantSessionRecord, ChatMessage, AppTheme, MistakeRecord } from '../../../types';

/**
 * Export data structure for backup/restore
 */
export interface ExportData {
    version: number;
    exportedAt: number;
    files: MarkdownFile[];
    aiConfig: AIConfig;
    chatMessages: ChatMessage[];
    themes: AppTheme[];
    settings: Record<string, string>;
    mistakes: MistakeRecord[];
}

/**
 * Import result
 */
export interface ImportResult {
    success: boolean;
    filesImported: number;
    messagesImported: number;
    themesImported: number;
    errors: string[];
}

/**
 * Storage service interface
 * Abstraction layer for different storage backends (Electron SQLite, Mobile, Web localStorage)
 */
export interface StorageService {
    /**
     * Initialize the storage service
     */
    initialize(): Promise<void>;

    // ===== Files =====
    getFiles(): Promise<MarkdownFile[]>;
    getFile(id: string): Promise<MarkdownFile | null>;
    createFile(file: MarkdownFile): Promise<MarkdownFile>;
    updateFile(id: string, updates: Partial<MarkdownFile>): Promise<MarkdownFile | null>;
    deleteFile(id: string): Promise<boolean>;

    // ===== AI Config =====
    getAIConfig(): Promise<AIConfig>;
    setAIConfig(config: AIConfig): Promise<AIConfig>;

    // ===== Chat =====
    getChatMessages(conversationId?: string): Promise<ChatMessage[]>;
    addChatMessage(message: ChatMessage, conversationId?: string): Promise<ChatMessage>;
    clearChatMessages(conversationId?: string): Promise<void>;

    // ===== Assistant Sessions =====
    getAssistantSessions(): Promise<AssistantSessionRecord[]>;
    getAssistantSession(sessionId: string): Promise<AssistantSessionRecord | null>;
    saveAssistantSession(session: AssistantSessionRecord): Promise<AssistantSessionRecord>;
    deleteAssistantSession(sessionId: string): Promise<boolean>;
    getSessionMessages(sessionId: string): Promise<ChatMessage[]>;
    replaceSessionMessages(sessionId: string, messages: ChatMessage[]): Promise<ChatMessage[]>;

    // ===== Themes =====
    getThemes(): Promise<AppTheme[]>;
    saveTheme(theme: AppTheme): Promise<AppTheme>;
    deleteTheme(id: string): Promise<boolean>;
    getActiveThemeId(): Promise<string>;
    setActiveThemeId(id: string): Promise<void>;

    // ===== Settings =====
    getSetting(key: string): Promise<string | null>;
    setSetting(key: string, value: string): Promise<void>;

    // ===== Mistakes =====
    getMistakes(): Promise<MistakeRecord[]>;
    addMistake(record: MistakeRecord): Promise<MistakeRecord>;
    deleteMistake(id: string): Promise<boolean>;

    // ===== Export/Import =====
    exportAllData(): Promise<ExportData>;
    importData(data: ExportData): Promise<ImportResult>;
}
