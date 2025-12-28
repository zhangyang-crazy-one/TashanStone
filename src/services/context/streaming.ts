interface StreamChunk {
  text: string;
  timestamp: number;
}

interface StreamBufferConfig {
  minChunkSize: number;
  maxDelayMs: number;
  batchSize: number;
}

const DEFAULT_BUFFER_CONFIG: StreamBufferConfig = {
  minChunkSize: 50,
  maxDelayMs: 100,
  batchSize: 5,
};

export class StreamBuffer {
  private chunks: StreamChunk[] = [];
  private config: StreamBufferConfig;
  private lastFlushTime: number = 0;
  private batchCount: number = 0;

  constructor(config?: Partial<StreamBufferConfig>) {
    this.config = { ...DEFAULT_BUFFER_CONFIG, ...config };
  }

  add(chunk: string): void {
    this.chunks.push({ text: chunk, timestamp: Date.now() });
    this.batchCount++;

    const shouldFlush =
      this.getBufferSize() >= this.config.minChunkSize ||
      this.batchCount >= this.config.batchSize ||
      this.shouldFlushByTime();

    if (shouldFlush) {
      this.flush();
    }
  }

  private getBufferSize(): number {
    return this.chunks.reduce((size, chunk) => size + chunk.text.length, 0);
  }

  private shouldFlushByTime(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastFlushTime;
    return elapsed >= this.config.maxDelayMs && this.chunks.length > 0;
  }

  flush(): string[] {
    if (this.chunks.length === 0) return [];

    const result = this.chunks.map(c => c.text);
    this.chunks = [];
    this.lastFlushTime = Date.now();
    this.batchCount = 0;

    return result;
  }

  drain(): string[] {
    const result = this.chunks.map(c => c.text);
    this.chunks = [];
    this.batchCount = 0;
    return result;
  }

  isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  get pendingChunks(): number {
    return this.chunks.length;
  }
}

export interface TokenEstimatorConfig {
  charsPerToken: number;
  lookaheadChars: number;
}

const DEFAULT_TOKEN_CONFIG: TokenEstimatorConfig = {
  charsPerToken: 4,
  lookaheadChars: 100,
};

export class TokenEstimator {
  private config: TokenEstimatorConfig;
  private lastEstimate: number = 0;
  private lastText: string = '';

  constructor(config?: Partial<TokenEstimatorConfig>) {
    this.config = { ...DEFAULT_TOKEN_CONFIG, ...config };
  }

  estimate(text: string): number {
    const now = Date.now();
    if (text === this.lastText && now - this.lastEstimate < 1000) {
      return Math.ceil(this.lastText.length / this.config.charsPerToken);
    }

    this.lastText = text;
    this.lastEstimate = now;

    return Math.ceil(text.length / this.config.charsPerToken);
  }

  estimateRemaining(text: string, currentTokens: number): number {
    const remainingText = text.length - Math.min(text.length, this.config.lookaheadChars);
    return currentTokens + Math.ceil(remainingText / this.config.charsPerToken);
  }
}

export interface StreamingStats {
  totalChunks: number;
  totalBytes: number;
  avgChunkSize: number;
  bufferEfficiency: number;
  estimatedTokens: number;
}

export class StreamingMetrics {
  private totalChunks: number = 0;
  private totalBytes: number = 0;
  private bufferedBytes: number = 0;
  private flushedBatches: number = 0;

  recordChunk(size: number): void {
    this.totalChunks++;
    this.totalBytes += size;
    this.bufferedBytes += size;
  }

  recordFlush(batchSize: number): void {
    this.flushedBatches++;
    this.bufferedBytes = 0;
  }

  getStats(): StreamingStats {
    return {
      totalChunks: this.totalChunks,
      totalBytes: this.totalBytes,
      avgChunkSize: this.totalChunks > 0 ? this.totalBytes / this.totalChunks : 0,
      bufferEfficiency: this.totalBytes > 0 ? (this.bufferedBytes / this.totalBytes) : 0,
      estimatedTokens: Math.ceil(this.totalBytes / 4),
    };
  }

  reset(): void {
    this.totalChunks = 0;
    this.totalBytes = 0;
    this.bufferedBytes = 0;
    this.flushedBatches = 0;
  }
}

export function createOptimizedStreamGenerator<T>(
  source: AsyncGenerator<T, void, unknown>,
  buffer?: StreamBuffer,
  metrics?: StreamingMetrics
): AsyncGenerator<T, void, unknown> {
  const generator = async function* (): AsyncGenerator<T, void, unknown> {
    for await (const chunk of source) {
      if (buffer) {
        const chunkStr = String(chunk);
        metrics?.recordChunk(chunkStr.length);
        buffer.add(chunkStr);
        const buffered = buffer.flush();
        for (const b of buffered) {
          yield b as T;
        }
        metrics?.recordFlush(buffered.length);
      } else {
        yield chunk;
      }
    }

    if (buffer && !buffer.isEmpty()) {
      const remaining = buffer.drain();
      for (const r of remaining) {
        yield r as T;
      }
    }
  };

  return generator();
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), waitMs);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limitMs);
    }
  };
}
