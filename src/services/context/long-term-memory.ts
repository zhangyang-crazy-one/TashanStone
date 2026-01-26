import { IndexedConversation } from './types';
import { LANCEDB_CONTEXT_FILE_ID_PREFIX, stripLanceDbPrefix } from '@/utils/lanceDbPrefixes';
import type { LanceDbVectorChunk } from '@/src/types/electronAPI';

export interface LongTermMemoryStorage {
  saveConversation(conversation: IndexedConversation): Promise<void>;
  searchConversations(queryEmbedding: number[], limit: number, sessionId?: string): Promise<IndexedConversation[]>;
  getConversationById(id: string): Promise<IndexedConversation | null>;
  clearConversations(sessionId?: string): Promise<number>;
  getStats(): Promise<{ totalConversations: number; totalSessions: number }>;
}

export interface LanceDBStorageConfig {
  tableName?: string;
}

const getContextFileId = (sessionId: string): string =>
  `${LANCEDB_CONTEXT_FILE_ID_PREFIX}${sessionId}`;

const isContextFileId = (fileId: string): boolean =>
  fileId.startsWith(LANCEDB_CONTEXT_FILE_ID_PREFIX);

export class LanceDBMemoryStorage implements LongTermMemoryStorage {
  private tableName: string = 'context_memories';
  private isAvailable: boolean = false;

  constructor(config?: LanceDBStorageConfig) {
    this.tableName = config?.tableName ?? 'context_memories';
  }

  async initialize(): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        await window.electronAPI.lancedb.init();
        this.isAvailable = true;
      }
    } catch {
      this.isAvailable = false;
    }
    return this.isAvailable;
  }

  isReady(): boolean {
    return this.isAvailable;
  }

  async saveConversation(conversation: IndexedConversation): Promise<void> {
    if (!this.isAvailable) {
      console.warn('[LanceDBMemoryStorage] Not available, skipping save');
      return;
    }

    try {
      const chunk = {
        id: conversation.id,
        fileId: getContextFileId(conversation.session_id),
        fileName: `context-${conversation.session_id}`,
        content: conversation.content,
        vector: conversation.embedding,
        chunkIndex: 0,
        lastModified: conversation.metadata.date
      };

      await window.electronAPI.lancedb.add([chunk]);
    } catch (error) {
      console.error('[LanceDBMemoryStorage] Failed to save conversation:', error);
    }
  }

  async searchConversations(
    queryEmbedding: number[],
    limit: number,
    sessionId?: string
  ): Promise<IndexedConversation[]> {
    if (!this.isAvailable) {
      return [];
    }

    try {
      const results = await window.electronAPI.lancedb.search(queryEmbedding, limit);

      return results
        .filter((result: LanceDbVectorChunk) => {
          if (!isContextFileId(result.fileId)) return false;
          if (!sessionId) return true;
          return result.fileId === getContextFileId(sessionId);
        })
        .map((result: LanceDbVectorChunk) => ({
          id: result.id,
          session_id: stripLanceDbPrefix(result.fileId, LANCEDB_CONTEXT_FILE_ID_PREFIX),
          embedding: result.vector,
          content: result.content,
          metadata: {
            date: result.lastModified,
            topics: [],
          },
        }));
    } catch (error) {
      console.error('[LanceDBMemoryStorage] Failed to search conversations:', error);
      return [];
    }
  }

  async getConversationById(id: string): Promise<IndexedConversation | null> {
    if (!this.isAvailable) return null;

    try {
      const all = await window.electronAPI.lancedb.getAll();
      const found = all.find((chunk: LanceDbVectorChunk) =>
        chunk.id === id && isContextFileId(chunk.fileId)
      );

      if (found) {
        return {
          id: found.id,
          session_id: stripLanceDbPrefix(found.fileId, LANCEDB_CONTEXT_FILE_ID_PREFIX),
          embedding: found.vector,
          content: found.content,
          metadata: {
            date: found.lastModified,
            topics: [],
          },
        };
      }
    } catch (error) {
      console.error('[LanceDBMemoryStorage] Failed to get conversation:', error);
    }

    return null;
  }

  async clearConversations(sessionId?: string): Promise<number> {
    if (!this.isAvailable) return 0;

    try {
      if (sessionId) {
        await window.electronAPI.lancedb.deleteByFile(getContextFileId(sessionId));
        return 1;
      }
      const all = await window.electronAPI.lancedb.getAll();
      const contextFileIds = [...new Set(all.map((chunk: LanceDbVectorChunk) => chunk.fileId))]
        .filter((fileId: string) => isContextFileId(fileId));
      for (const fileId of contextFileIds) {
        await window.electronAPI.lancedb.deleteByFile(fileId);
      }
      return contextFileIds.length;
    } catch (error) {
      console.error('[LanceDBMemoryStorage] Failed to clear conversations:', error);
      return 0;
    }
  }

  async getStats(): Promise<{ totalConversations: number; totalSessions: number }> {
    if (!this.isAvailable) {
      return { totalConversations: 0, totalSessions: 0 };
    }

    try {
      const all = await window.electronAPI.lancedb.getAll();
      const contextChunks = all.filter((chunk: LanceDbVectorChunk) => isContextFileId(chunk.fileId));
      const totalSessions = new Set(contextChunks.map((chunk: LanceDbVectorChunk) => chunk.fileId)).size;
      return {
        totalConversations: contextChunks.length,
        totalSessions,
      };
    } catch {
      return { totalConversations: 0, totalSessions: 0 };
    }
  }
}

export class InMemoryLongTermStorage implements LongTermMemoryStorage {
  private conversations: Map<string, IndexedConversation> = new Map();

  async saveConversation(conversation: IndexedConversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async searchConversations(
    queryEmbedding: number[],
    limit: number,
    sessionId?: string
  ): Promise<IndexedConversation[]> {
    const entries = Array.from(this.conversations.values());

    const withScore = entries
      .filter(c => !sessionId || c.session_id === sessionId)
      .map(c => ({
        conversation: c,
        score: this.cosineSimilarity(queryEmbedding, c.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(c => c.conversation);

    return withScore;
  }

  async getConversationById(id: string): Promise<IndexedConversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async clearConversations(sessionId?: string): Promise<number> {
    const before = this.conversations.size;

    if (sessionId) {
      for (const [id, conv] of this.conversations) {
        if (conv.session_id === sessionId) {
          this.conversations.delete(id);
        }
      }
    } else {
      this.conversations.clear();
    }

    return before - this.conversations.size;
  }

  async getStats(): Promise<{ totalConversations: number; totalSessions: number }> {
    const sessions = new Set<string>();
    for (const conv of this.conversations.values()) {
      sessions.add(conv.session_id);
    }
    return {
      totalConversations: this.conversations.size,
      totalSessions: sessions.size,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
