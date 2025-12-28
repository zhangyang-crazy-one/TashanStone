import { ApiMessage } from './types';

export interface CachedPrompt {
  key: string;
  content: string;
  hash: string;
  createdAt: number;
  accessCount: number;
  lastAccessed: number;
}

export interface PromptCacheConfig {
  maxEntries: number;
  ttlMinutes: number;
  enableCompression: boolean;
}

const DEFAULT_CONFIG: PromptCacheConfig = {
  maxEntries: 100,
  ttlMinutes: 60,
  enableCompression: true,
};

export class PromptCache {
  private cache: Map<string, CachedPrompt> = new Map();
  private config: PromptCacheConfig;
  private hits: number = 0;
  private misses: number = 0;

  constructor(config?: Partial<PromptCacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private generateKey(systemPrompt: string, toolsHash: string = ''): string {
    const combined = `${systemPrompt}:${toolsHash}`;
    return this.hashString(combined);
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private compressContent(content: string): string {
    if (!this.config.enableCompression) return content;
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  get(systemPrompt: string, toolsHash: string = ''): string | null {
    const key = this.generateKey(systemPrompt, toolsHash);
    const entry = this.cache.get(key);

    if (entry) {
      const age = Date.now() - entry.createdAt;
      const ttlMs = this.config.ttlMinutes * 60 * 1000;

      if (age < ttlMs) {
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        this.hits++;
        return entry.content;
      } else {
        this.cache.delete(key);
      }
    }

    this.misses++;
    return null;
  }

  set(systemPrompt: string, content: string, toolsHash: string = ''): void {
    const key = this.generateKey(systemPrompt, toolsHash);
    const compressed = this.compressContent(content);

    if (this.cache.size >= this.config.maxEntries) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      key,
      content: compressed,
      hash: this.hashString(compressed),
      createdAt: Date.now(),
      accessCount: 1,
      lastAccessed: Date.now(),
    });
  }

  private evictLeastUsed(): void {
    let oldestKey: string | null = null;
    let lowestScore = Infinity;

    for (const [key, entry] of this.cache) {
      const score = entry.accessCount / (1 + (Date.now() - entry.lastAccessed) / 1000);
      if (score < lowestScore) {
        lowestScore = score;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  getStats(): { size: number; hits: number; misses: number; hitRate: string } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  cleanup(): number {
    const ttlMs = this.config.ttlMinutes * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

export class MessageCache {
  private cache: Map<string, { messages: ApiMessage[]; hash: string; timestamp: number }> = new Map();
  private maxEntries: number = 50;
  private compressionEnabled: boolean = true;

  set(sessionId: string, messages: ApiMessage[]): void {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const hash = this.hashMessages(messages);
    this.cache.set(sessionId, {
      messages: this.compressionEnabled ? this.compressMessages(messages) : [...messages],
      hash,
      timestamp: Date.now(),
    });
  }

  get(sessionId: string): ApiMessage[] | null {
    const entry = this.cache.get(sessionId);
    return entry ? entry.messages : null;
  }

  hasChanged(sessionId: string, currentMessages: ApiMessage[]): boolean {
    const entry = this.cache.get(sessionId);
    if (!entry) return true;
    return this.hashMessages(currentMessages) !== entry.hash;
  }

  private hashMessages(messages: ApiMessage[]): string {
    const content = messages.map(m => `${m.role}:${m.content}`).join('|');
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private compressMessages(messages: ApiMessage[]): ApiMessage[] {
    return messages.map(m => ({
      ...m,
      content: typeof m.content === 'string'
        ? m.content.length > 1000
          ? m.content.substring(0, 500) + '...[truncated]'
          : m.content
        : m.content,
    }));
  }

  clear(): void {
    this.cache.clear();
  }
}

export const globalPromptCache = new PromptCache();
export const globalMessageCache = new MessageCache();
