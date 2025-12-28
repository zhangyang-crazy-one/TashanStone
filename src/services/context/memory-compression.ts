import { IndexedConversation, ContextMemory } from './types';

export interface MemoryCompressionConfig {
  maxContentLength: number;
  summaryLength: number;
  preserveKeyInfo: boolean;
  compressOldSessions: boolean;
  oldSessionThresholdDays: number;
}

const DEFAULT_CONFIG: MemoryCompressionConfig = {
  maxContentLength: 2000,
  summaryLength: 500,
  preserveKeyInfo: true,
  compressOldSessions: true,
  oldSessionThresholdDays: 7,
};

export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  preservedInfo: string[];
  lostInfo: string[];
}

export class MemoryCompressor {
  private config: MemoryCompressionConfig;

  constructor(config?: Partial<MemoryCompressionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  compress(conversation: IndexedConversation): IndexedConversation {
    const originalSize = conversation.content.length;
    let content = conversation.content;

    const preservedInfo: string[] = [];
    const lostInfo: string[] = [];

    if (content.length > this.config.maxContentLength) {
      if (this.config.preserveKeyInfo) {
        const keyInfo = this.extractKeyInformation(content);
        content = this.summarize(content, this.config.summaryLength);
        content += `\n\n[Key Information Preserved]\n${keyInfo}`;
        preservedInfo.push('key_information');
      } else {
        content = this.summarize(content, this.config.maxContentLength);
      }
    }

    const compressedSize = content.length;

    return {
      ...conversation,
      content,
      metadata: {
        ...conversation.metadata,
        compressed: true,
        originalSize,
        compressedSize,
        compressedAt: Date.now(),
      },
    };
  }

  private extractKeyInformation(content: string): string {
    const lines = content.split('\n');
    const keyLines: string[] = [];

    const keyPatterns = [
      /^#{1,3}\s/,
      /^\d+\.\s/,
      /^[A-Z][A-Z\s]+:/,
      /important/i,
      /note:/i,
      /remember/i,
      /key/i,
    ];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      for (const pattern of keyPatterns) {
        if (pattern.test(trimmed)) {
          keyLines.push(trimmed.substring(0, 200));
          break;
        }
      }

      if (keyLines.length >= 10) break;
    }

    return keyLines.join('\n');
  }

  private summarize(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;

    const sentences = content.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length === 0) return content.substring(0, maxLength);

    const importantPatterns = [
      /^(what|how|why|when|where|who)/i,
      /important/i,
      /key/i,
      /result/i,
      /conclusion/i,
    ];

    const scored = sentences.map(s => ({
      sentence: s.trim(),
      score: importantPatterns.some(p => p.test(s)) ? 2 : 1,
    }));

    scored.sort((a, b) => b.score - a.score);

    let result = '';
    for (const item of scored) {
      if (result.length + item.sentence.length + 1 > maxLength) break;
      result += (result ? '. ' : '') + item.sentence;
    }

    return result || content.substring(0, maxLength);
  }

  compressBatch(
    conversations: IndexedConversation[]
  ): { compressed: IndexedConversation[]; stats: CompressionResult } {
    const compressed: IndexedConversation[] = [];
    let totalOriginal = 0;
    let totalCompressed = 0;
    const allPreserved: string[] = [];
    const allLost: string[] = [];

    for (const conv of conversations) {
      if (!this.shouldCompress(conv)) {
        compressed.push(conv);
        continue;
      }

      const result = this.compress(conv);
      compressed.push(result);

      totalOriginal += result.metadata.originalSize || result.content.length;
      totalCompressed += result.metadata.compressedSize || result.content.length;
    }

    return {
      compressed,
      stats: {
        originalSize: totalOriginal,
        compressedSize: totalCompressed,
        ratio: totalOriginal > 0 ? totalCompressed / totalOriginal : 1,
        preservedInfo: allPreserved,
        lostInfo: allLost,
      },
    };
  }

  private shouldCompress(conversation: IndexedConversation): boolean {
    if (!this.config.compressOldSessions) return false;

    const age = Date.now() - conversation.metadata.date;
    const ageDays = age / (1000 * 60 * 60 * 24);

    return (
      ageDays >= this.config.oldSessionThresholdDays &&
      conversation.content.length > this.config.maxContentLength
    );
  }
}

export interface MemoryPriorityConfig {
  maxEntries: number;
  priorityWeights: {
    recentAccess: number;
    conversationLength: number;
    embeddingSimilarity: number;
  };
}

const DEFAULT_PRIORITY_CONFIG: MemoryPriorityConfig = {
  maxEntries: 1000,
  priorityWeights: {
    recentAccess: 0.4,
    conversationLength: 0.3,
    embeddingSimilarity: 0.3,
  },
};

export class MemoryPrioritizer {
  private config: MemoryPriorityConfig;
  private accessLog: Map<string, number> = new Map();

  constructor(config?: Partial<MemoryPriorityConfig>) {
    this.config = { ...DEFAULT_PRIORITY_CONFIG, ...config };
  }

  recordAccess(memoryId: string): void {
    this.accessLog.set(memoryId, Date.now());
  }

  calculatePriority(
    memory: ContextMemory,
    querySimilarity?: number
  ): number {
    const recencyScore = this.calculateRecencyScore(memory.id);
    const lengthScore = this.calculateLengthScore(memory);
    const similarityScore = querySimilarity ?? 0.5;

    return (
      recencyScore * this.config.priorityWeights.recentAccess +
      lengthScore * this.config.priorityWeights.conversationLength +
      similarityScore * this.config.priorityWeights.embeddingSimilarity
    );
  }

  private calculateRecencyScore(memoryId: string): number {
    const lastAccess = this.accessLog.get(memoryId);
    if (!lastAccess) return 0.5;

    const age = Date.now() - lastAccess;
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    return Math.max(0, 1 - age / maxAge);
  }

  private calculateLengthScore(memory: ContextMemory): number {
    const maxLength = 10000;
    return Math.min(1, memory.content.length / maxLength);
  }

  prioritize(
    memories: ContextMemory[],
    limit?: number
  ): ContextMemory[] {
    const withPriority = memories.map(m => ({
      memory: m,
      priority: this.calculatePriority(m),
    }));

    withPriority.sort((a, b) => b.priority - a.priority);

    const limited = limit ?? this.config.maxEntries;
    return withPriority.slice(0, limited).map(w => w.memory);
  }
}

export class CompressedMemoryStorage {
  private compressor: MemoryCompressor;
  private prioritizer: MemoryPrioritizer;
  private compressedMemories: Map<string, ContextMemory> = new Map();

  constructor(
    compressorConfig?: Partial<MemoryCompressionConfig>,
    priorityConfig?: Partial<MemoryPriorityConfig>
  ) {
    this.compressor = new MemoryCompressor(compressorConfig);
    this.prioritizer = new MemoryPrioritizer(priorityConfig);
  }

  store(memory: ContextMemory): void {
    this.prioritizer.recordAccess(memory.id);

    const existing = this.compressedMemories.get(memory.id);
    if (existing) {
      if (existing.metadata.compressed) {
        return;
      }
    }

    const compressed = this.compressor.compress({
      ...memory,
      id: memory.id,
      session_id: memory.session_id,
      content: memory.content,
      embedding: memory.embedding,
      metadata: {
        ...memory.metadata,
        compressed: false,
        compressedAt: undefined,
      },
    } as IndexedConversation) as ContextMemory;

    this.compressedMemories.set(memory.id, compressed);
  }

  storeBatch(memories: ContextMemory[]): number {
    let stored = 0;
    for (const memory of memories) {
      this.store(memory);
      stored++;
    }
    return stored;
  }

  retrieve(id: string): ContextMemory | null {
    this.prioritizer.recordAccess(id);
    return this.compressedMemories.get(id) ?? null;
  }

  search(queryEmbedding: number[], limit: number): ContextMemory[] {
    const all = Array.from(this.compressedMemories.values());
    const prioritized = this.prioritizer.prioritize(all, limit * 2);

    return prioritized.slice(0, limit);
  }

  getStats(): {
    totalMemories: number;
    totalCompressed: number;
    avgCompressionRatio: number;
  } {
    let totalOriginal = 0;
    let totalCompressed = 0;
    let compressedCount = 0;

    for (const memory of this.compressedMemories.values()) {
      if (memory.metadata.compressed) {
        totalOriginal += memory.metadata.originalSize || memory.content.length;
        totalCompressed += memory.metadata.compressedSize || memory.content.length;
        compressedCount++;
      }
    }

    return {
      totalMemories: this.compressedMemories.size,
      totalCompressed: compressedCount,
      avgCompressionRatio:
        totalOriginal > 0 ? totalCompressed / totalOriginal : 1,
    };
  }

  clear(): void {
    this.compressedMemories.clear();
  }
}
