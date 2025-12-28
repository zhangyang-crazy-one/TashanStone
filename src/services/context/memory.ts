import {
  ApiMessage,
  CompactedSession,
  IndexedConversation,
  MemoryLayer,
  Checkpoint,
} from './types';
import { TokenBudget } from './token-budget';

export interface MemoryStorage {
  saveMidTerm(sessionId: string, session: CompactedSession): Promise<void>;
  getMidTerm(sessionId: string): Promise<CompactedSession[]>;
  clearMidTerm(sessionId?: string): Promise<void>;
}

export interface LongTermMemoryStorage {
  saveConversation(conversation: IndexedConversation): Promise<void>;
  searchConversations(queryEmbedding: number[], limit: number, sessionId?: string): Promise<IndexedConversation[]>;
  getConversationById(id: string): Promise<IndexedConversation | null>;
  clearConversations(sessionId?: string): Promise<number>;
  getStats(): Promise<{ totalConversations: number; totalSessions: number }>;
}

export class ThreeLayerMemory {
  private shortTerm: Map<string, ApiMessage[]> = new Map();
  private storage: MemoryStorage;
  private longTermStorage: LongTermMemoryStorage | null = null;
  private tokenBudget: TokenBudget;
  private sessionMaxTokens: number = 50000;
  private midTermMaxAge: number = 30 * 24 * 60 * 60 * 1000;

  constructor(
    storage: MemoryStorage,
    options?: {
      longTermStorage?: LongTermMemoryStorage;
      maxTokens?: number;
      midTermMaxAge?: number;
    }
  ) {
    this.storage = storage;
    this.longTermStorage = options?.longTermStorage ?? null;
    this.tokenBudget = new TokenBudget();
    this.sessionMaxTokens = options?.maxTokens ?? 50000;
    this.midTermMaxAge = options?.midTermMaxAge ?? (30 * 24 * 60 * 60 * 1000);
  }

  setLongTermStorage(storage: LongTermMemoryStorage): void {
    this.longTermStorage = storage;
  }

  pushMessage(sessionId: string, message: ApiMessage): void {
    const messages = this.shortTerm.get(sessionId) ?? [];
    messages.push(message);
    this.shortTerm.set(sessionId, messages);
    this.checkAutoPromote(sessionId);
  }

  pushMessages(sessionId: string, messages: ApiMessage[]): void {
    const existing = this.shortTerm.get(sessionId) ?? [];
    existing.push(...messages);
    this.shortTerm.set(sessionId, existing);
    this.checkAutoPromote(sessionId);
  }

  getMessages(sessionId: string): ApiMessage[] {
    return this.shortTerm.get(sessionId) ?? [];
  }

  getMemoryLayer(sessionId: string): Promise<MemoryLayer> {
    const shortTerm = this.shortTerm.get(sessionId) ?? [];

    return this.storage.getMidTerm(sessionId).then(midTerm => {
      return {
        shortTerm,
        midTerm: midTerm.filter(m => Date.now() - m.created_at < this.midTermMaxAge),
        longTerm: [],
      };
    });
  }

  async reconstructContext(
    sessionId: string,
    maxTokens?: number
  ): Promise<ApiMessage[]> {
    const layer = await this.getMemoryLayer(sessionId);
    const tokenLimit = maxTokens ?? this.sessionMaxTokens;

    const context: ApiMessage[] = [];

    for (const session of layer.midTerm) {
      const summaryMsg: ApiMessage = {
        id: session.id,
        role: 'system',
        content: `**[历史会话摘要 - ${new Date(session.created_at).toLocaleDateString()}]**\n\n${session.summary}`,
        timestamp: session.created_at,
        compressed: false,
      };
      context.push(summaryMsg);
    }

    let currentTokens = 0;
    for (let i = layer.shortTerm.length - 1; i >= 0; i--) {
      const msg = layer.shortTerm[i];
      const tokens = msg.token_count ?? await this.tokenBudget.estimateTokens(
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      );

      if (currentTokens + tokens > tokenLimit) {
        break;
      }

      context.unshift(msg);
      currentTokens += tokens;
    }

    return context;
  }

  async promoteToMidTerm(
    sessionId: string,
    summary: string,
    keyTopics: string[],
    decisions: string[]
  ): Promise<CompactedSession | null> {
    const messages = this.shortTerm.get(sessionId);
    if (!messages || messages.length < 5) return null;

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

    this.shortTerm.delete(sessionId);

    return session;
  }

  async promoteToLongTerm(
    sessionId: string,
    summary: string,
    embedding: number[],
    topics: string[]
  ): Promise<IndexedConversation | null> {
    if (!this.longTermStorage) return null;

    const conversation: IndexedConversation = {
      id: `long-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      session_id: sessionId,
      embedding,
      content: summary,
      metadata: {
        date: Date.now(),
        topics,
      },
    };

    await this.longTermStorage.saveConversation(conversation);

    return conversation;
  }

  async searchLongTerm(
    query: string,
    queryEmbedding: number[],
    limit: number = 5
  ): Promise<IndexedConversation[]> {
    if (!this.longTermStorage) return [];
    return this.longTermStorage.searchConversations(queryEmbedding, limit);
  }

  async createMemoryFromCheckpoint(
    checkpoint: Checkpoint,
    messages: ApiMessage[]
  ): Promise<void> {
    const sessionId = checkpoint.session_id;

    if (messages.length >= 10) {
      const recentUserMsgs = messages
        .filter(m => m.role === 'user')
        .slice(-5);

      const summary = recentUserMsgs.length > 0
        ? recentUserMsgs.map(m => m.content).join('\n---\n')
        : checkpoint.summary;

      await this.promoteToMidTerm(
        sessionId,
        summary,
        extractKeyTopics(messages),
        extractDecisions(messages)
      );
    }

    this.shortTerm.set(sessionId, messages.slice(-20));
  }

  clearSession(sessionId: string): void {
    this.shortTerm.delete(sessionId);
  }

  async clearAll(): Promise<void> {
    this.shortTerm.clear();
    await this.storage.clearMidTerm();
    if (this.longTermStorage) {
      await this.longTermStorage.clearConversations();
    }
  }

  getStats(): Promise<{
    shortTermSessions: number;
    midTermSessions: number;
    longTermConversations: number;
  }> {
    return Promise.resolve({
      shortTermSessions: this.shortTerm.size,
      midTermSessions: 0,
      longTermConversations: 0,
    });
  }

  private async checkAutoPromote(sessionId: string): Promise<void> {
    const messages = this.shortTerm.get(sessionId);
    if (!messages) return;

    const totalTokens = await this.calculateTotalTokens(messages);

    if (totalTokens > this.sessionMaxTokens * 0.8) {
      const summary = this.generateAutoSummary(messages);
      await this.promoteToMidTerm(
        sessionId,
        summary,
        [],
        []
      );
    }
  }

  private async calculateTotalTokens(messages: ApiMessage[]): Promise<number> {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
      total += await this.tokenBudget.estimateTokens(content);
    }
    return total;
  }

  private generateAutoSummary(messages: ApiMessage[]): string {
    const userMsgs = messages.filter(m => m.role === 'user');
    const lastFew = userMsgs.slice(-3);

    if (lastFew.length === 0) {
      return `会话包含 ${messages.length} 条消息`;
    }

    return `会话摘要 (${messages.length} 条消息, 最后用户消息: "${lastFew[lastFew.length - 1]?.content.substring(0, 50)}...")`;
  }
}

function extractKeyTopics(messages: ApiMessage[]): string[] {
  const topics: Set<string> = new Set();

  for (const msg of messages) {
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      const words = content.toLowerCase().split(/\s+/);
      if (words.length > 3) {
        topics.add(words.slice(0, 3).join(' '));
      }
    }
  }

  return Array.from(topics).slice(0, 5);
}

function extractDecisions(messages: ApiMessage[]): string[] {
  const decisions: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (content.includes('decision') || content.includes('decided')) {
        decisions.push(content.substring(0, 100));
      }
    }
  }

  return decisions.slice(0, 5);
}

export class InMemoryStorage implements MemoryStorage {
  private midTerm: Map<string, CompactedSession[]> = new Map();

  async saveMidTerm(sessionId: string, session: CompactedSession): Promise<void> {
    const existing = this.midTerm.get(sessionId) ?? [];
    existing.push(session);
    this.midTerm.set(sessionId, existing);
  }

  async getMidTerm(sessionId: string): Promise<CompactedSession[]> {
    return this.midTerm.get(sessionId) ?? [];
  }

  async clearMidTerm(sessionId?: string): Promise<void> {
    if (sessionId) {
      this.midTerm.delete(sessionId);
    } else {
      this.midTerm.clear();
    }
  }
}

export class ContextMemoryService {
  private memory: ThreeLayerMemory;
  private embeddingService: ((text: string) => Promise<number[]>) | null = null;

  constructor(
    storage: MemoryStorage,
    longTermStorage?: LongTermMemoryStorage
  ) {
    this.memory = new ThreeLayerMemory(storage, {
      longTermStorage: longTermStorage ?? undefined,
    });
  }

  setEmbeddingService(service: (text: string) => Promise<number[]>): void {
    this.embeddingService = service;
  }

  addMessage(sessionId: string, message: ApiMessage): void {
    this.memory.pushMessage(sessionId, message);
  }

  getContext(sessionId: string, maxTokens?: number): Promise<ApiMessage[]> {
    return this.memory.reconstructContext(sessionId, maxTokens);
  }

  async promoteToMidTerm(
    sessionId: string,
    summary: string,
    keyTopics: string[],
    decisions: string[]
  ): Promise<CompactedSession | null> {
    return this.memory.promoteToMidTerm(sessionId, summary, keyTopics, decisions);
  }

  async promoteToLongTerm(
    sessionId: string,
    summary: string,
    topics: string[]
  ): Promise<IndexedConversation | null> {
    if (!this.embeddingService) {
      console.warn('[ContextMemoryService] No embedding service configured');
      return null;
    }

    const embedding = await this.embeddingService(summary);
    return this.memory.promoteToLongTerm(sessionId, summary, embedding, topics);
  }

  async searchRelevantHistory(
    query: string,
    limit: number = 5
  ): Promise<IndexedConversation[]> {
    if (!this.embeddingService) return [];

    const embedding = await this.embeddingService(query);
    return this.memory.searchLongTerm(query, embedding, limit);
  }

  clearSession(sessionId: string): void {
    this.memory.clearSession(sessionId);
  }

  async createMemoryFromCheckpoint(
    checkpoint: Checkpoint,
    messages: ApiMessage[]
  ): Promise<void> {
    await this.memory.createMemoryFromCheckpoint(checkpoint, messages);
  }

  async getMemoryStats(): Promise<{
    shortTermSessions: number;
    midTermSessions: number;
    longTermConversations: number;
  }> {
    return this.memory.getStats();
  }
}
