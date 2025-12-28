import {
  ApiMessage,
  CompactedSession,
  IndexedConversation,
  MemoryLayer,
} from './types';

export interface MemoryStorage {
  saveMidTerm(sessionId: string, session: CompactedSession): Promise<void>;
  getMidTerm(sessionId: string): Promise<CompactedSession[]>;
  saveLongTerm(conversation: IndexedConversation): Promise<void>;
  searchLongTerm(queryEmbedding: number[], limit: number): Promise<IndexedConversation[]>;
  clearMidTerm(sessionId?: string): Promise<void>;
  clearLongTerm(sessionId?: string): Promise<void>;
}

export class MemoryManager {
  private shortTerm: Map<string, ApiMessage[]> = new Map();
  private storage: MemoryStorage;

  constructor(storage: MemoryStorage) {
    this.storage = storage;
  }

  pushToShortTerm(sessionId: string, message: ApiMessage): void {
    const messages = this.shortTerm.get(sessionId) ?? [];
    messages.push(message);
    this.shortTerm.set(sessionId, messages);
  }

  pushMultipleToShortTerm(sessionId: string, newMessages: ApiMessage[]): void {
    const messages = this.shortTerm.get(sessionId) ?? [];
    messages.push(...newMessages);
    this.shortTerm.set(sessionId, messages);
  }

  getShortTerm(sessionId: string): ApiMessage[] {
    return this.shortTerm.get(sessionId) ?? [];
  }

  clearShortTerm(sessionId?: string): void {
    if (sessionId) {
      this.shortTerm.delete(sessionId);
    } else {
      this.shortTerm.clear();
    }
  }

  async promoteToMidTerm(
    sessionId: string,
    messages: ApiMessage[],
    summary: string,
    keyTopics: string[],
    decisions: string[]
  ): Promise<CompactedSession> {
    const session: CompactedSession = {
      id: `mid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      session_id: sessionId,
      summary,
      key_topics: keyTopics,
      decisions: decisions,
      message_range: { start: 0, end: messages.length },
      created_at: Date.now(),
    };

    await this.storage.saveMidTerm(sessionId, session);

    this.clearShortTerm(sessionId);

    return session;
  }

  async getMidTerm(sessionId: string): Promise<CompactedSession[]> {
    return this.storage.getMidTerm(sessionId);
  }

  async promoteToLongTerm(
    sessionId: string,
    embedding: number[],
    content: string,
    topics: string[]
  ): Promise<IndexedConversation> {
    const conversation: IndexedConversation = {
      id: `long-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      session_id: sessionId,
      embedding,
      content,
      metadata: {
        date: Date.now(),
        topics,
      },
    };

    await this.storage.saveLongTerm(conversation);

    return conversation;
  }

  async searchLongTerm(queryEmbedding: number[], limit: number = 10): Promise<IndexedConversation[]> {
    return this.storage.searchLongTerm(queryEmbedding, limit);
  }

  async getLayer(sessionId: string): Promise<MemoryLayer> {
    const [short, mid] = await Promise.all([
      Promise.resolve(this.getShortTerm(sessionId)),
      this.getMidTerm(sessionId),
    ]);

    return {
      shortTerm: short,
      midTerm: mid,
      longTerm: [],
    };
  }

  async reconstructContext(
    sessionId: string,
    maxTokens: number
  ): Promise<ApiMessage[]> {
    const shortTerm = this.getShortTerm(sessionId);
    const midTerm = await this.getMidTerm(sessionId);

    const context: ApiMessage[] = [];

    for (const session of midTerm) {
      const summaryMsg: ApiMessage = {
        id: session.id,
        role: 'system',
        content: `**[历史会话摘要]**\n\n${session.summary}`,
        timestamp: session.created_at,
      };
      context.push(summaryMsg);
    }

    context.push(...shortTerm);

    return context;
  }

  async cleanup(sessionId: string, olderThan?: number): Promise<void> {
    if (olderThan) {
      await this.storage.clearMidTerm(sessionId);
    } else {
      this.clearShortTerm(sessionId);
      await this.storage.clearMidTerm(sessionId);
    }
  }
}

export class InMemoryStorage implements MemoryStorage {
  private midTerm: Map<string, CompactedSession[]> = new Map();
  private longTerm: IndexedConversation[] = [];

  async saveMidTerm(sessionId: string, session: CompactedSession): Promise<void> {
    const existing = this.midTerm.get(sessionId) ?? [];
    existing.push(session);
    this.midTerm.set(sessionId, existing);
  }

  async getMidTerm(sessionId: string): Promise<CompactedSession[]> {
    return this.midTerm.get(sessionId) ?? [];
  }

  async saveLongTerm(conversation: IndexedConversation): Promise<void> {
    this.longTerm.push(conversation);
  }

  async searchLongTerm(queryEmbedding: number[], limit: number): Promise<IndexedConversation[]> {
    const similarities = this.longTerm.map(conv => ({
      conversation: conv,
      similarity: this.cosineSimilarity(queryEmbedding, conv.embedding),
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, limit).map(s => s.conversation);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

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

  async clearMidTerm(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.midTerm.delete(sessionId);
    } else {
      this.midTerm.clear();
    }
  }

  async clearLongTerm(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.longTerm = this.longTerm.filter(c => c.session_id !== sessionId);
    } else {
      this.longTerm = [];
    }
  }

  clearAll(): void {
    this.midTerm.clear();
    this.longTerm = [];
  }
}
