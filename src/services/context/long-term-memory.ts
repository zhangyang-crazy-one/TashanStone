import { IndexedConversation } from './types';

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

export class LanceDBMemoryStorage implements LongTermMemoryStorage {
  private tableName: string = 'context_memories';
  private isAvailable: boolean = false;

  constructor(config?: LanceDBStorageConfig) {
    this.tableName = config?.tableName ?? 'context_memories';
  }

  async initialize(): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const result = await (window as any).electronAPI.lancedb.init();
        this.isAvailable = result === undefined || result.success !== false;
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
        fileId: conversation.session_id,
        text: conversation.content,
        embedding: conversation.embedding,
        chunkStart: 0,
        chunkEnd: conversation.content.length,
        fileName: `conversation-${conversation.session_id}`,
        fileLastModified: conversation.metadata.date,
        metadata: JSON.stringify({
          topics: conversation.metadata.topics,
          type: 'context_memory',
        }),
      };

      await (window as any).electronAPI.lancedb.add([chunk]);
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
      const results = await (window as any).electronAPI.lancedb.search(queryEmbedding, limit);

      return results
        .filter((r: any) => {
          if (!sessionId) return true;
          try {
            const metadata = JSON.parse(r.metadata || '{}');
            return metadata.type === 'context_memory' && r.file_id === sessionId;
          } catch {
            return r.file_id === sessionId;
          }
        })
        .map((r: any) => ({
          id: r.id,
          session_id: r.file_id,
          embedding: r.embedding,
          content: r.text,
          metadata: {
            date: r.file_last_modified,
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
      const all = await (window as any).electronAPI.lancedb.getAll();
      const found = all.find((c: any) => c.id === id);

      if (found) {
        return {
          id: found.id,
          session_id: found.file_id,
          embedding: found.embedding,
          content: found.text,
          metadata: {
            date: found.file_last_modified,
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
        await (window as any).electronAPI.lancedb.deleteByFile(sessionId);
      } else {
        await (window as any).electronAPI.lancedb.clear();
      }
      return 1;
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
      const stats = await (window as any).electronAPI.lancedb.getStats();
      return {
        totalConversations: stats.totalChunks,
        totalSessions: stats.totalFiles,
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
