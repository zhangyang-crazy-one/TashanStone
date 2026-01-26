import type { AIConfig, AppTheme, ChatMessage, MarkdownFile, MistakeRecord } from '../../types';
import type { FetchResult } from '../services/ai/platformFetch';
import type { MemoryDocument as BaseMemoryDocument } from '../services/context/types';
import type { MidTermMemoryRecord, PermanentMemoryTemplate } from '../services/context/memoryAutoUpgrade';

export interface AuthResult {
  success: boolean;
  error?: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface BatchFileMetadata {
  path: string;
  size: number;
  lastModified: number;
  content?: string;
  error?: string;
}

export interface DatabaseExport {
  version: number;
  exportedAt: number;
  data: {
    files: MarkdownFile[];
    aiConfig: AIConfig;
    chatMessages: { conversationId: string; messages: ChatMessage[] }[];
    themes: AppTheme[];
    settings: Record<string, string>;
    mistakes: MistakeRecord[];
  };
}

export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface LanceDbVectorChunk {
  id: string;
  fileId: string;
  fileName: string;
  content: string;
  vector: number[];
  chunkIndex?: number;
  lastModified?: number;
  _distance?: number;
}

export type MemoryDocument = BaseMemoryDocument & {
  title?: string;
  summary?: string;
  category?: string;
  isStarred?: boolean;
  accessCount?: number;
  promotedFrom?: string;
  promotedAt?: number;
  sourcePath?: string;
  sourceType?: 'file' | 'conversation' | 'manual';
  lastAccessedAt?: number;
};

export interface MemorySaveRequest {
  id?: string;
  content: string;
  title?: string;
  topics?: string[];
  importance?: 'low' | 'medium' | 'high';
  summary?: string;
  category?: string;
}

export interface MemoryUpdateRequest {
  id: string;
  content: string;
  updatedAt?: number;
}

export interface MemoryFilters {
  isStarred?: boolean;
  importance?: string;
}

export interface MemoryPromotionData {
  success: boolean;
  originalId: string;
  newTier: string;
  promotedAt: number;
}

export interface OcrTextLine {
  text: string;
  confidence: number;
  points: number[][];
}

export interface OcrResult {
  success: boolean;
  text?: string;
  lines?: OcrTextLine[];
  error?: string;
  duration?: number;
  boxCount?: number;
  backend?: string;
}

export interface OcrStatus {
  available: boolean;
  initialized: boolean;
  backend: string;
  modelVersion: string | null;
  modelPath: string;
}

export interface ElectronAPI {
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
      getByFile: (fileId: string) => Promise<unknown[]>;
      getAll: () => Promise<unknown[]>;
      save: (fileId: string, chunks: unknown[], lastModified: number, model?: string, provider?: string) => Promise<void>;
      deleteByFile: (fileId: string) => Promise<void>;
      getMeta: () => Promise<unknown[]>;
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
    getBatchMetadata: (paths: string[], includeContent?: boolean) => Promise<BatchFileMetadata[]>;
    openPath: (filePath: string) => Promise<boolean>;
  };
  ai: {
    fetch: (url: string, options: RequestInit) => Promise<FetchResult>;
    streamFetch: (url: string, options: RequestInit) => Promise<{ streamId: string; status: number; headers: Record<string, string>; errorText?: string }>;
    onStreamChunk: (callback: (data: { streamId: string; chunk?: string; done: boolean; error?: string }) => void) => () => void;
    generateSummary?: (params: { content: string; maxLength?: number; language?: string }) => Promise<{ summary?: string; error?: string }>;
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
    getTools: () => Promise<unknown[]>;
    callTool: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    getStatuses: () => Promise<unknown[]>;
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
    recognize: (imageData: string) => Promise<OcrResult>;
    getStatus: () => Promise<OcrStatus>;
  };
  lancedb: {
    init: () => Promise<void>;
    add: (chunks: LanceDbVectorChunk[]) => Promise<void>;
    search: (queryVector: number[], limit?: number) => Promise<LanceDbVectorChunk[]>;
    deleteByFile: (fileId: string) => Promise<void>;
    deleteById: (id: string) => Promise<void>;
    clear: () => Promise<void>;
    getAll: () => Promise<LanceDbVectorChunk[]>;
    getFileIds: () => Promise<string[]>;
    getStats: () => Promise<{ totalFiles: number; totalChunks: number }>;
    getFileNameMapping: () => Promise<Record<string, string[]>>;
    cleanDuplicateFileNames: (fileNameToKeepId: Record<string, string>) => Promise<number>;
    getFileMetadata: () => Promise<Record<string, number>>;
  };
  memory: {
    search: (query: string, limit?: number) => Promise<MemoryDocument[]>;
    save: (memory: MemorySaveRequest) => Promise<IpcResult<boolean>>;
    getAll: () => Promise<MemoryDocument[]>;
    checkSyncStatus: () => Promise<{ needsSync: boolean; outdatedFiles: string[] }>;
    update: (data: MemoryUpdateRequest) => Promise<IpcResult<boolean>>;
    star: (id: string, isStarred: boolean) => Promise<IpcResult<boolean>>;
    getMemories: (filters?: MemoryFilters) => Promise<MemoryDocument[]>;
    getMidTermMemories: () => Promise<MidTermMemoryRecord[]>;
    getStarredMemories: () => Promise<MidTermMemoryRecord[]>;
    updateMemoryAccess: (sessionId: string) => Promise<boolean>;
    savePermanent: (memoryData: PermanentMemoryTemplate) => Promise<IpcResult<{ id: string }>>;
    markAsPromoted: (originalId: string) => Promise<IpcResult<MemoryPromotionData>>;
    runCleanup: () => Promise<{
      expiredMidTerm: number;
      orphanedVectors: number;
      danglingPromotions: number;
      errors: string[];
      freedSpace: number;
    }>;
    getCleanupStats: () => Promise<{
      expiredCount: number;
      orphanedCount: number;
      danglingCount: number;
      totalMidTerm: number;
      totalLongTerm: number;
      persistentFiles?: number;
    }>;
    cleanupOrphanedVectors: () => Promise<{ deleted: number; errors: string[] }>;
  };
  context: {
    getMessages: (sessionId: string) => Promise<{ success: boolean; messages?: unknown[]; error?: string }>;
    addMessage: (sessionId: string, message: unknown) => Promise<{ success: boolean; error?: string }>;
    addMessages: (sessionId: string, messages: unknown[]) => Promise<{ success: boolean; error?: string }>;
    clear: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
    updateMessageCompression: (messageId: string, updates: unknown) => Promise<{ success: boolean; error?: string }>;
    markMessagesAsCompacted: (messageIds: string[], summaryId: string) => Promise<{ success: boolean; error?: string }>;
    createCheckpoint: (sessionId: string, name: string, messages: unknown[]) => Promise<{ success: boolean; checkpoint?: unknown; error?: string }>;
    getCheckpoints: (sessionId: string) => Promise<{ success: boolean; checkpoints?: unknown[]; error?: string }>;
    getCheckpoint: (checkpointId: string) => Promise<{ success: boolean; checkpoint?: unknown; messages?: unknown[]; error?: string }>;
    restoreCheckpoint: (checkpointId: string) => Promise<{ success: boolean; checkpoint?: unknown; messages?: unknown[]; error?: string }>;
    deleteCheckpoint: (checkpointId: string) => Promise<{ success: boolean; error?: string }>;
    saveCompactedSession: (session: unknown) => Promise<{ success: boolean; error?: string }>;
    getCompactedSessions: (sessionId: string) => Promise<{ success: boolean; sessions?: unknown[]; error?: string }>;
    deleteCompactedSessions: (sessionId: string) => Promise<{ success: boolean; deleted?: number; error?: string }>;
  };
  onMenuEvent: (channel: 'menu:newFile' | 'menu:openFolder' | 'menu:importFile' | 'menu:save' | 'menu:export' | 'menu:toggleSidebar' | 'menu:toggleChat', callback: () => void) => () => void;
  ipcInvoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
}
