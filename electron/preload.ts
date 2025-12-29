// Force this file to be treated as a module
export {};

console.log('[Preload] Script starting...');

const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Electron modules loaded, contextBridge:', !!contextBridge);

// Types are inlined to avoid ESM import issues in preload context
// These match the definitions in the respective repository files

interface MarkdownFile {
    id: string;
    name: string;
    content: string;
    path?: string;
    folderId?: string;
    createdAt: string;
    updatedAt: string;
}

interface AIConfig {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
}

interface AppTheme {
    id: string;
    name: string;
    type: 'light' | 'dark';
    colors: Record<string, string>;
    isBuiltin?: boolean;
}

interface MistakeRecord {
    id: string;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    explanation?: string;
    sourceFile?: string;
    createdAt: string;
}

interface AuthResult {
    success: boolean;
    error?: string;
}

interface FileFilter {
    name: string;
    extensions: string[];
}

interface FetchResult {
    status: number;
    data: unknown;
    headers: Record<string, string>;
}

interface DatabaseExport {
    version: number;
    exportedAt: string;
    files: MarkdownFile[];
    config: AIConfig;
    chatMessages: ChatMessage[];
    themes: AppTheme[];
    settings: Record<string, string>;
    mistakes: MistakeRecord[];
}

interface MCPTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    serverName?: string;
}

interface MCPServerStatus {
    name: string;
    connected: boolean;
    toolsCount: number;
    error?: string;
}

// Expose protected methods to renderer
console.log('[Preload] About to call contextBridge.exposeInMainWorld...');
try {
    contextBridge.exposeInMainWorld('electronAPI', {
    // Platform information
    platform: {
        isElectron: true,
        os: process.platform as 'win32' | 'darwin' | 'linux',
        arch: process.arch,
        version: process.versions.electron
    },

    // Paths (统一前后端数据目录)
    paths: {
        userData: process.env.APPDATA + (process.platform === 'win32' ? '\\tashanstone' : '/tashanstone')
    },

    // Window control (for custom title bar)
    window: {
        minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
        maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
        close: (): Promise<void> => ipcRenderer.invoke('window:close'),
        isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
        onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
            const handler = (_event: any, isMaximized: boolean) => callback(isMaximized);
            ipcRenderer.on('window:maximized', handler);
            return () => ipcRenderer.removeListener('window:maximized', handler);
        }
    },

    // Database operations
    db: {
        // Files
        files: {
            getAll: (): Promise<MarkdownFile[]> =>
                ipcRenderer.invoke('db:files:getAll'),
            get: (id: string): Promise<MarkdownFile | null> =>
                ipcRenderer.invoke('db:files:get', id),
            create: (file: MarkdownFile): Promise<MarkdownFile> =>
                ipcRenderer.invoke('db:files:create', file),
            update: (id: string, updates: Partial<MarkdownFile>): Promise<MarkdownFile | null> =>
                ipcRenderer.invoke('db:files:update', id, updates),
            delete: (id: string): Promise<boolean> =>
                ipcRenderer.invoke('db:files:delete', id)
        },

        // AI Config
        config: {
            get: (): Promise<AIConfig> =>
                ipcRenderer.invoke('db:config:get'),
            set: (config: AIConfig): Promise<AIConfig> =>
                ipcRenderer.invoke('db:config:set', config)
        },

        // Chat
        chat: {
            getAll: (conversationId?: string): Promise<ChatMessage[]> =>
                ipcRenderer.invoke('db:chat:getAll', conversationId),
            add: (message: ChatMessage, conversationId?: string): Promise<ChatMessage> =>
                ipcRenderer.invoke('db:chat:add', message, conversationId),
            clear: (conversationId?: string): Promise<void> =>
                ipcRenderer.invoke('db:chat:clear', conversationId)
        },

        // Themes
        themes: {
            getAll: (): Promise<AppTheme[]> =>
                ipcRenderer.invoke('db:themes:getAll'),
            save: (theme: AppTheme): Promise<AppTheme> =>
                ipcRenderer.invoke('db:themes:save', theme),
            delete: (id: string): Promise<boolean> =>
                ipcRenderer.invoke('db:themes:delete', id)
        },

        // Settings
        settings: {
            get: (key: string): Promise<string | null> =>
                ipcRenderer.invoke('db:settings:get', key),
            set: (key: string, value: string): Promise<void> =>
                ipcRenderer.invoke('db:settings:set', key, value)
        },

        // Mistakes
        mistakes: {
            getAll: (): Promise<MistakeRecord[]> =>
                ipcRenderer.invoke('db:mistakes:getAll'),
            add: (record: MistakeRecord): Promise<MistakeRecord> =>
                ipcRenderer.invoke('db:mistakes:add', record),
            delete: (id: string): Promise<boolean> =>
                ipcRenderer.invoke('db:mistakes:delete', id)
        },

        // Vectors
        vectors: {
            needsIndexing: (fileId: string, lastModified: number): Promise<boolean> =>
                ipcRenderer.invoke('db:vectors:needsIndexing', fileId, lastModified),
            getByFile: (fileId: string): Promise<any[]> =>
                ipcRenderer.invoke('db:vectors:getByFile', fileId),
            getAll: (): Promise<any[]> =>
                ipcRenderer.invoke('db:vectors:getAll'),
            save: (fileId: string, chunks: any[], lastModified: number, model?: string, provider?: string): Promise<void> =>
                ipcRenderer.invoke('db:vectors:save', fileId, chunks, lastModified, model, provider),
            deleteByFile: (fileId: string): Promise<void> =>
                ipcRenderer.invoke('db:vectors:deleteByFile', fileId),
            getMeta: (): Promise<any[]> =>
                ipcRenderer.invoke('db:vectors:getMeta'),
            clear: (): Promise<void> =>
                ipcRenderer.invoke('db:vectors:clear'),
            getStats: (): Promise<{ totalFiles: number; totalChunks: number }> =>
                ipcRenderer.invoke('db:vectors:getStats')
        },

        // Auth
        auth: {
            register: (username: string, password: string): Promise<AuthResult> =>
                ipcRenderer.invoke('db:auth:register', username, password),
            verify: (password: string): Promise<boolean> =>
                ipcRenderer.invoke('db:auth:verify', password),
            login: (password: string): Promise<boolean> =>
                ipcRenderer.invoke('db:auth:login', password),
            isRegistered: (): Promise<boolean> =>
                ipcRenderer.invoke('db:auth:isRegistered'),
            getUsername: (): Promise<string | null> =>
                ipcRenderer.invoke('db:auth:getUsername'),
            changePassword: (oldPassword: string, newPassword: string): Promise<AuthResult> =>
                ipcRenderer.invoke('db:auth:changePassword', oldPassword, newPassword),
            resetPassword: (newPassword: string): Promise<AuthResult> =>
                ipcRenderer.invoke('db:auth:resetPassword', newPassword),
            reset: (): Promise<AuthResult> =>
                ipcRenderer.invoke('db:auth:reset')
        }
    },

    // File system operations
    fs: {
        openDirectory: (): Promise<{ path: string; files: MarkdownFile[] } | null> =>
            ipcRenderer.invoke('fs:openDirectory'),
        readFile: (path: string): Promise<string> =>
            ipcRenderer.invoke('fs:readFile', path),
        writeFile: (path: string, content: string): Promise<boolean> =>
            ipcRenderer.invoke('fs:writeFile', path, content),
        selectFile: (filters?: FileFilter[]): Promise<{ path: string; content: string } | null> =>
            ipcRenderer.invoke('fs:selectFile', filters),
        saveFileAs: (content: string, defaultName: string): Promise<string | null> =>
            ipcRenderer.invoke('fs:saveFileAs', content, defaultName),
        selectPdf: (): Promise<{ path: string; name: string; buffer: string } | null> =>
            ipcRenderer.invoke('fs:selectPdf')
    },

    // File operations for persistent memory (mirrors fs but under 'file' namespace)
    file: {
        readFile: (path: string): Promise<string> =>
            ipcRenderer.invoke('fs:readFile', path),
        writeFile: (path: string, content: string): Promise<boolean> =>
            ipcRenderer.invoke('fs:writeFile', path, content),
        deleteFile: (path: string): Promise<boolean> =>
            ipcRenderer.invoke('fs:deleteFile', path),
        ensureDir: (dirPath: string): Promise<boolean> =>
            ipcRenderer.invoke('fs:ensureDir', dirPath),
        listFiles: (dirPath: string): Promise<Array<{ name: string; path: string; size: number; lastModified: number }>> =>
            ipcRenderer.invoke('fs:listFiles', dirPath),
        openPath: (filePath: string): Promise<boolean> =>
            ipcRenderer.invoke('fs:openPath', filePath)
    },

    // AI proxy for CORS-free requests
    ai: {
        fetch: (url: string, options: RequestInit): Promise<FetchResult> =>
            ipcRenderer.invoke('ai:fetch', url, options),
        // Streaming fetch - returns streamId, then listen for chunks via onStreamChunk
        streamFetch: (url: string, options: RequestInit): Promise<{ streamId: string; status: number; headers: Record<string, string> }> =>
            ipcRenderer.invoke('ai:streamFetch', url, options),
        // Listen for stream chunks
        onStreamChunk: (callback: (data: { streamId: string; chunk?: string; done: boolean; error?: string }) => void): (() => void) => {
            const handler = (_event: any, data: { streamId: string; chunk?: string; done: boolean; error?: string }) => callback(data);
            ipcRenderer.on('ai:streamChunk', handler);
            return () => ipcRenderer.removeListener('ai:streamChunk', handler);
        }
    },

    // Data sync operations
    sync: {
        exportData: (): Promise<DatabaseExport> =>
            ipcRenderer.invoke('sync:exportData'),
        importData: (jsonData: DatabaseExport): Promise<{ success: boolean; imported: Record<string, number>; errors: string[] }> =>
            ipcRenderer.invoke('sync:importData', jsonData)
    },

    // Backup operations (encrypted)
    backup: {
        export: (password: string): Promise<{ success: boolean; path?: string; size?: number; error?: string; canceled?: boolean }> =>
            ipcRenderer.invoke('backup:export', password),
        selectFile: (): Promise<{ success: boolean; filePath?: string; fileName?: string; fileSize?: number; modifiedAt?: number; error?: string; canceled?: boolean }> =>
            ipcRenderer.invoke('backup:selectFile'),
        import: (password: string, filePath?: string): Promise<{ success: boolean; timestamp?: number; itemsRestored?: Record<string, number>; error?: string; canceled?: boolean }> =>
            ipcRenderer.invoke('backup:import', password, filePath),
        getInfo: (filePath: string): Promise<{ success: boolean; version?: number; fileSize?: number; modifiedAt?: number; encrypted?: boolean; error?: string }> =>
            ipcRenderer.invoke('backup:getInfo', filePath)
    },

    // MCP operations
    mcp: {
        loadConfig: (configStr: string): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('mcp:loadConfig', configStr),
        getTools: (): Promise<MCPTool[]> =>
            ipcRenderer.invoke('mcp:getTools'),
        callTool: (name: string, args: any): Promise<{ success: boolean; result?: any; error?: string }> =>
            ipcRenderer.invoke('mcp:callTool', name, args),
        getStatuses: (): Promise<MCPServerStatus[]> =>
            ipcRenderer.invoke('mcp:getStatuses'),
        disconnectAll: (): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('mcp:disconnectAll')
    },

    // Whisper speech recognition (legacy Python-based)
    whisper: {
        isAvailable: (): Promise<boolean> =>
            ipcRenderer.invoke('whisper:isAvailable'),
        getRecommendedMethod: (): Promise<'webspeech' | 'whisper'> =>
            ipcRenderer.invoke('whisper:getRecommendedMethod'),
        transcribe: (audioBuffer: ArrayBuffer, language?: string): Promise<{ success: boolean; text?: string; language?: string; error?: string }> =>
            ipcRenderer.invoke('whisper:transcribe', audioBuffer, language)
    },

    // Sherpa-ONNX speech recognition (native, no Python required)
    sherpa: {
        isAvailable: (): Promise<boolean> =>
            ipcRenderer.invoke('sherpa:isAvailable'),
        getRecommendedMethod: (): Promise<'sherpa' | 'webspeech'> =>
            ipcRenderer.invoke('sherpa:getRecommendedMethod'),
        initialize: (config?: { modelDir?: string; language?: string; sampleRate?: number }): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('sherpa:initialize', config),
        isModelAvailable: (): Promise<boolean> =>
            ipcRenderer.invoke('sherpa:isModelAvailable'),
        getModelDownloadInfo: (): Promise<{ url: string; name: string; size: string }> =>
            ipcRenderer.invoke('sherpa:getModelDownloadInfo'),
        startSession: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('sherpa:startSession', sessionId),
        feedAudio: (sessionId: string, audioData: ArrayBuffer, sampleRate?: number): Promise<{ success: boolean; text?: string; isPartial?: boolean; error?: string }> =>
            ipcRenderer.invoke('sherpa:feedAudio', sessionId, audioData, sampleRate),
        endSession: (sessionId: string): Promise<{ success: boolean; text?: string; error?: string }> =>
            ipcRenderer.invoke('sherpa:endSession', sessionId),
        transcribe: (audioBuffer: ArrayBuffer, language?: string): Promise<{ success: boolean; text?: string; language?: string; error?: string }> =>
            ipcRenderer.invoke('sherpa:transcribe', audioBuffer, language),
        // New APIs for voice transcription feature
        selectAudioFile: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
            ipcRenderer.invoke('sherpa:selectAudioFile'),
        getAudioInfo: (filePath: string): Promise<{ success: boolean; duration?: number; sampleRate?: number; format?: string; error?: string }> =>
            ipcRenderer.invoke('sherpa:getAudioInfo', filePath),
        transcribeFile: (filePath: string, options?: { enableNoiseReduction?: boolean; language?: string }): Promise<{ success: boolean; text?: string; duration?: number; error?: string }> =>
            ipcRenderer.invoke('sherpa:transcribeFile', filePath, options),
        isFFmpegAvailable: (): Promise<boolean> =>
            ipcRenderer.invoke('sherpa:isFFmpegAvailable')
    },

    // OCR (PaddleOCR via esearch-ocr)
    ocr: {
        isAvailable: (): Promise<boolean> =>
            ipcRenderer.invoke('ocr:isAvailable'),
        isModelAvailable: (): Promise<boolean> =>
            ipcRenderer.invoke('ocr:isModelAvailable'),
        getModelDownloadInfo: (): Promise<{ url: string; name: string; size: string; files: string[] }> =>
            ipcRenderer.invoke('ocr:getModelDownloadInfo'),
        initialize: (config?: { modelDir?: string; backend?: 'directml' | 'cpu' }): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('ocr:initialize', config),
        reinitialize: (config?: { modelDir?: string; backend?: 'directml' | 'cpu' }): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('ocr:reinitialize', config),
        recognize: (imageData: string): Promise<{ success: boolean; text?: string; error?: string; duration?: number; backend?: string }> =>
            ipcRenderer.invoke('ocr:recognize', imageData),
        getStatus: (): Promise<{ available: boolean; initialized: boolean; backend: string; modelVersion: string | null; modelPath: string }> =>
            ipcRenderer.invoke('ocr:getStatus')
    },

        // LanceDB vector database
        lancedb: {
            init: (): Promise<void> =>
                ipcRenderer.invoke('lancedb:init'),
            add: (chunks: any[]): Promise<void> =>
                ipcRenderer.invoke('lancedb:add', chunks),
            search: (queryVector: number[], limit?: number): Promise<any[]> =>
                ipcRenderer.invoke('lancedb:search', queryVector, limit),
            deleteByFile: (fileId: string): Promise<void> =>
                ipcRenderer.invoke('lancedb:deleteByFile', fileId),
            deleteById: (id: string): Promise<void> =>
                ipcRenderer.invoke('lancedb:deleteById', id),
            clear: (): Promise<void> =>
                ipcRenderer.invoke('lancedb:clear'),
            getAll: (): Promise<any[]> =>
                ipcRenderer.invoke('lancedb:getAll'),
            getFileIds: (): Promise<string[]> =>
                ipcRenderer.invoke('lancedb:getFileIds'),
            getStats: (): Promise<{ totalFiles: number; totalChunks: number }> =>
                ipcRenderer.invoke('lancedb:getStats'),
            getFileNameMapping: (): Promise<Record<string, string[]>> =>
                ipcRenderer.invoke('lancedb:getFileNameMapping'),
            cleanDuplicateFileNames: (fileNameToKeepId: Record<string, string>): Promise<number> =>
                ipcRenderer.invoke('lancedb:cleanDuplicateFileNames', fileNameToKeepId),
            getFileMetadata: (): Promise<Record<string, number>> =>
                ipcRenderer.invoke('lancedb:getFileMetadata')
        },

        // Permanent Memory operations
        memory: {
            search: (query: string, limit?: number): Promise<any[]> =>
                ipcRenderer.invoke('memory:search', query, limit),
            save: (memory: any): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('memory:save', memory),
            getAll: (): Promise<any[]> =>
                ipcRenderer.invoke('memory:getAll'),
            checkSyncStatus: (): Promise<{ needsSync: boolean; outdatedFiles: string[] }> =>
                ipcRenderer.invoke('memory:checkSyncStatus'),
            update: (data: { id: string; content: string; updatedAt?: number }): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('memory:update', data),
            star: (id: string, isStarred: boolean): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('memory:star', id, isStarred),
            getMemories: (filters?: { isStarred?: boolean; importance?: string }): Promise<any[]> =>
                ipcRenderer.invoke('memory:getMemories', filters),
            savePermanent: (memoryData: any): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('memory:savePermanent', memoryData),
            markAsPromoted: (originalId: string): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('memory:markAsPromoted', originalId)
        },

        // Context Engineering (Phase 2)
        context: {
            getMessages: (sessionId: string): Promise<{ success: boolean; messages?: any[]; error?: string }> =>
                ipcRenderer.invoke('context:getMessages', sessionId),
            addMessage: (sessionId: string, message: any): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('context:addMessage', sessionId, message),
            addMessages: (sessionId: string, messages: any[]): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('context:addMessages', sessionId, messages),
            clear: (sessionId: string): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('context:clear', sessionId),
            updateMessageCompression: (messageId: string, updates: any): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('context:updateMessageCompression', messageId, updates),
            markMessagesAsCompacted: (messageIds: string[], summaryId: string): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('context:markMessagesAsCompacted', messageIds, summaryId),
            createCheckpoint: (sessionId: string, name: string, messages: any[]): Promise<{ success: boolean; checkpoint?: any; error?: string }> =>
                ipcRenderer.invoke('context:createCheckpoint', sessionId, name, messages),
            getCheckpoints: (sessionId: string): Promise<{ success: boolean; checkpoints?: any[]; error?: string }> =>
                ipcRenderer.invoke('context:getCheckpoints', sessionId),
            getCheckpoint: (checkpointId: string): Promise<{ success: boolean; checkpoint?: any; messages?: any[]; error?: string }> =>
                ipcRenderer.invoke('context:getCheckpoint', checkpointId),
            restoreCheckpoint: (checkpointId: string): Promise<{ success: boolean; checkpoint?: any; messages?: any[]; error?: string }> =>
                ipcRenderer.invoke('context:restoreCheckpoint', checkpointId),
            deleteCheckpoint: (checkpointId: string): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('context:deleteCheckpoint', checkpointId),
            saveCompactedSession: (session: any): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('context:saveCompactedSession', session),
            getCompactedSessions: (sessionId: string): Promise<{ success: boolean; sessions?: any[]; error?: string }> =>
                ipcRenderer.invoke('context:getCompactedSessions', sessionId),
            deleteCompactedSessions: (sessionId: string): Promise<{ success: boolean; deleted?: number; error?: string }> =>
                ipcRenderer.invoke('context:deleteCompactedSessions', sessionId)
        },

        // Menu event listeners
    onMenuEvent: (channel: string, callback: () => void) => {
        const validChannels = [
            'menu:newFile',
            'menu:openFolder',
            'menu:importFile',
            'menu:save',
            'menu:export',
            'menu:toggleSidebar',
            'menu:toggleChat'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, callback);
            return () => ipcRenderer.removeListener(channel, callback);
        }
        return () => {};
    }
});
    console.log('[Preload] contextBridge.exposeInMainWorld completed successfully!');
} catch (error) {
    console.error('[Preload] Error in exposeInMainWorld:', error);
}

// Type declaration for renderer
declare global {
    interface Window {
        electronAPI: {
            platform: {
                isElectron: boolean;
                os: 'win32' | 'darwin' | 'linux';
                arch: string;
                version: string;
            };
            paths: {
                userData: string;
            };
            window: {
                minimize: () => Promise<void>;
                maximize: () => Promise<void>;
                close: () => Promise<void>;
                isMaximized: () => Promise<boolean>;
                onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
            };
            db: {
                files: {
                    getAll: () => Promise<MarkdownFile[]>;
                    get: (id: string) => Promise<MarkdownFile | null>;
                    create: (file: MarkdownFile) => Promise<MarkdownFile>;
                    update: (id: string, updates: Partial<MarkdownFile>) => Promise<MarkdownFile | null>;
                    delete: (id: string) => Promise<boolean>;
                };
                config: {
                    get: () => Promise<AIConfig>;
                    set: (config: AIConfig) => Promise<AIConfig>;
                };
                chat: {
                    getAll: (conversationId?: string) => Promise<ChatMessage[]>;
                    add: (message: ChatMessage, conversationId?: string) => Promise<ChatMessage>;
                    clear: (conversationId?: string) => Promise<void>;
                };
                themes: {
                    getAll: () => Promise<AppTheme[]>;
                    save: (theme: AppTheme) => Promise<AppTheme>;
                    delete: (id: string) => Promise<boolean>;
                };
                settings: {
                    get: (key: string) => Promise<string | null>;
                    set: (key: string, value: string) => Promise<void>;
                };
                mistakes: {
                    getAll: () => Promise<MistakeRecord[]>;
                    add: (record: MistakeRecord) => Promise<MistakeRecord>;
                    delete: (id: string) => Promise<boolean>;
                };
                vectors: {
                    needsIndexing: (fileId: string, lastModified: number) => Promise<boolean>;
                    getByFile: (fileId: string) => Promise<any[]>;
                    getAll: () => Promise<any[]>;
                    save: (fileId: string, chunks: any[], lastModified: number, model?: string, provider?: string) => Promise<void>;
                    deleteByFile: (fileId: string) => Promise<void>;
                    getMeta: () => Promise<any[]>;
                    clear: () => Promise<void>;
                    getStats: () => Promise<{ totalFiles: number; totalChunks: number }>;
                };
                auth: {
                    register: (username: string, password: string) => Promise<AuthResult>;
                    verify: (password: string) => Promise<boolean>;
                    login: (password: string) => Promise<boolean>;
                    isRegistered: () => Promise<boolean>;
                    getUsername: () => Promise<string | null>;
                    changePassword: (oldPassword: string, newPassword: string) => Promise<AuthResult>;
                    resetPassword: (newPassword: string) => Promise<AuthResult>;
                    reset: () => Promise<AuthResult>;
                };
            };
            fs: {
                openDirectory: () => Promise<{ path: string; files: MarkdownFile[] } | null>;
                readFile: (path: string) => Promise<string>;
                writeFile: (path: string, content: string) => Promise<boolean>;
                selectFile: (filters?: FileFilter[]) => Promise<{ path: string; content: string } | null>;
                saveFileAs: (content: string, defaultName: string) => Promise<string | null>;
                selectPdf: () => Promise<{ path: string; name: string; buffer: string } | null>;
            };
            file: {
                readFile: (path: string) => Promise<string>;
                writeFile: (path: string, content: string) => Promise<boolean>;
                deleteFile: (path: string) => Promise<boolean>;
                ensureDir: (dirPath: string) => Promise<boolean>;
                listFiles: (dirPath: string) => Promise<Array<{ name: string; path: string; size: number; lastModified: number }>>;
                openPath: (filePath: string) => Promise<boolean>;
            };
            ai: {
                fetch: (url: string, options: RequestInit) => Promise<FetchResult>;
                streamFetch: (url: string, options: RequestInit) => Promise<{ streamId: string; status: number; headers: Record<string, string> }>;
                onStreamChunk: (callback: (data: { streamId: string; chunk?: string; done: boolean; error?: string }) => void) => () => void;
            };
            sync: {
                exportData: () => Promise<DatabaseExport>;
                importData: (jsonData: DatabaseExport) => Promise<{ success: boolean; imported: Record<string, number>; errors: string[] }>;
            };
            backup: {
                export: (password: string) => Promise<{ success: boolean; path?: string; size?: number; error?: string; canceled?: boolean }>;
                selectFile: () => Promise<{ success: boolean; filePath?: string; fileName?: string; fileSize?: number; modifiedAt?: number; error?: string; canceled?: boolean }>;
                import: (password: string, filePath?: string) => Promise<{ success: boolean; timestamp?: number; itemsRestored?: Record<string, number>; error?: string; canceled?: boolean }>;
                getInfo: (filePath: string) => Promise<{ success: boolean; version?: number; fileSize?: number; modifiedAt?: number; encrypted?: boolean; error?: string }>;
            };
            mcp: {
                loadConfig: (configStr: string) => Promise<{ success: boolean; error?: string }>;
                getTools: () => Promise<MCPTool[]>;
                callTool: (name: string, args: any) => Promise<{ success: boolean; result?: any; error?: string }>;
                getStatuses: () => Promise<MCPServerStatus[]>;
                disconnectAll: () => Promise<{ success: boolean; error?: string }>;
            };
            whisper: {
                isAvailable: () => Promise<boolean>;
                getRecommendedMethod: () => Promise<'webspeech' | 'whisper'>;
                transcribe: (audioBuffer: ArrayBuffer, language?: string) => Promise<{ success: boolean; text?: string; language?: string; error?: string }>;
            };
            sherpa: {
                isAvailable: () => Promise<boolean>;
                getRecommendedMethod: () => Promise<'sherpa' | 'webspeech'>;
                initialize: (config?: { modelDir?: string; language?: string; sampleRate?: number }) => Promise<{ success: boolean; error?: string }>;
                isModelAvailable: () => Promise<boolean>;
                getModelDownloadInfo: () => Promise<{ url: string; name: string; size: string }>;
                startSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
                feedAudio: (sessionId: string, audioData: ArrayBuffer, sampleRate?: number) => Promise<{ success: boolean; text?: string; isPartial?: boolean; error?: string }>;
                endSession: (sessionId: string) => Promise<{ success: boolean; text?: string; error?: string }>;
                transcribe: (audioBuffer: ArrayBuffer, language?: string) => Promise<{ success: boolean; text?: string; language?: string; error?: string }>;
                selectAudioFile: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
                getAudioInfo: (filePath: string) => Promise<{ success: boolean; duration?: number; sampleRate?: number; format?: string; error?: string }>;
                transcribeFile: (filePath: string, options?: { enableNoiseReduction?: boolean; language?: string }) => Promise<{ success: boolean; text?: string; duration?: number; error?: string }>;
                isFFmpegAvailable: () => Promise<boolean>;
            };
            ocr: {
                isAvailable: () => Promise<boolean>;
                isModelAvailable: () => Promise<boolean>;
                getModelDownloadInfo: () => Promise<{ url: string; name: string; size: string; files: string[] }>;
                initialize: (config?: { modelDir?: string; backend?: 'directml' | 'cpu' }) => Promise<{ success: boolean; error?: string }>;
                reinitialize: (config?: { modelDir?: string; backend?: 'directml' | 'cpu' }) => Promise<{ success: boolean; error?: string }>;
                recognize: (imageData: string) => Promise<{ success: boolean; text?: string; error?: string; duration?: number; backend?: string }>;
                getStatus: () => Promise<{ available: boolean; initialized: boolean; backend: string; modelVersion: string | null; modelPath: string }>;
            };
            lancedb: {
                init: () => Promise<void>;
                add: (chunks: any[]) => Promise<void>;
                search: (queryVector: number[], limit?: number) => Promise<any[]>;
                deleteByFile: (fileId: string) => Promise<void>;
                deleteById: (id: string) => Promise<void>;
                clear: () => Promise<void>;
                getAll: () => Promise<any[]>;
                getFileIds: () => Promise<string[]>;
                getStats: () => Promise<{ totalFiles: number; totalChunks: number }>;
                getFileNameMapping: () => Promise<Record<string, string[]>>;
                cleanDuplicateFileNames: (fileNameToKeepId: Record<string, string>) => Promise<number>;
                getFileMetadata: () => Promise<Record<string, number>>;
            },

            // Permanent Memory operations
            memory: {
                search: (query: string, limit?: number) => Promise<any[]>;
                save: (memory: any) => Promise<{ success: boolean; error?: string }>;
                getAll: () => Promise<any[]>;
                checkSyncStatus: () => Promise<{ needsSync: boolean; outdatedFiles: string[] }>;
                update: (data: { id: string; content: string; updatedAt?: number }) => Promise<{ success: boolean; error?: string }>;
                star: (id: string, isStarred: boolean) => Promise<{ success: boolean; error?: string }>;
                getMemories: (filters?: { isStarred?: boolean; importance?: string }) => Promise<any[]>;
                savePermanent: (memoryData: any) => Promise<{ success: boolean; error?: string }>;
                markAsPromoted: (originalId: string) => Promise<{ success: boolean; error?: string }>;
            },

            // Context Engineering (Phase 2)
            context: {
                getMessages: (sessionId: string) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
                addMessage: (sessionId: string, message: any) => Promise<{ success: boolean; error?: string }>;
                addMessages: (sessionId: string, messages: any[]) => Promise<{ success: boolean; error?: string }>;
                clear: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
                updateMessageCompression: (messageId: string, updates: any) => Promise<{ success: boolean; error?: string }>;
                markMessagesAsCompacted: (messageIds: string[], summaryId: string) => Promise<{ success: boolean; error?: string }>;
                createCheckpoint: (sessionId: string, name: string, messages: any[]) => Promise<{ success: boolean; checkpoint?: any; error?: string }>;
                getCheckpoints: (sessionId: string) => Promise<{ success: boolean; checkpoints?: any[]; error?: string }>;
                getCheckpoint: (checkpointId: string) => Promise<{ success: boolean; checkpoint?: any; messages?: any[]; error?: string }>;
                restoreCheckpoint: (checkpointId: string) => Promise<{ success: boolean; checkpoint?: any; messages?: any[]; error?: string }>;
                deleteCheckpoint: (checkpointId: string) => Promise<{ success: boolean; error?: string }>;
                saveCompactedSession: (session: any) => Promise<{ success: boolean; error?: string }>;
                getCompactedSessions: (sessionId: string) => Promise<{ success: boolean; sessions?: any[]; error?: string }>;
                deleteCompactedSessions: (sessionId: string) => Promise<{ success: boolean; deleted?: number; error?: string }>;
            },
            onMenuEvent: (channel: string, callback: () => void) => () => void;
        };
    }
}
