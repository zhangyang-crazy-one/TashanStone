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

export interface SSEConfig {
  reconnectInterval: number;
  maxRetries: number;
  heartbeatInterval: number;
}

const DEFAULT_SSE_CONFIG: SSEConfig = {
  reconnectInterval: 3000,
  maxRetries: 5,
  heartbeatInterval: 30000,
};

export type StreamState = 'idle' | 'connecting' | 'streaming' | 'paused' | 'error';

export interface StreamEvent {
  type: 'chunk' | 'complete' | 'error' | 'heartbeat' | 'checkpoint';
  data: string;
  timestamp: number;
  checkpointId?: string;
}

export interface InterruptInfo {
  occurred: boolean;
  timestamp: number;
  reason?: string;
  recoveryPosition?: number;
}

export class SSEStreamHandler {
  private config: SSEConfig;
  private state: StreamState = 'idle';
  private eventSource: EventSource | null = null;
  private reconnectAttempts: number = 0;
  private listeners: Map<string, Set<(event: StreamEvent) => void>> = new Map();
  private accumulatedChunk: string = '';
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private interruptInfo: InterruptInfo = { occurred: false, timestamp: 0 };

  constructor(config?: Partial<SSEConfig>) {
    this.config = { ...DEFAULT_SSE_CONFIG, ...config };
  }

  connect(url: string, headers?: Record<string, string>): void {
    if (this.state === 'streaming') {
      this.disconnect();
    }

    this.state = 'connecting';
    this.reconnectAttempts = 0;
    this.emit({ type: 'checkpoint', data: 'connecting', timestamp: Date.now() });

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.state = 'streaming';
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit({ type: 'checkpoint', data: 'connected', timestamp: Date.now() });
      };

      this.eventSource.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.eventSource.onerror = (error) => {
        this.handleError(error);
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleMessage(data: string): void {
    if (data === 'heartbeat') {
      this.emit({ type: 'heartbeat', data: '', timestamp: Date.now() });
      return;
    }

    this.accumulatedChunk += data;
    this.emit({ type: 'chunk', data: data, timestamp: Date.now() });
  }

  private handleError(error: any): void {
    this.state = 'error';
    this.stopHeartbeat();
    this.emit({ type: 'error', data: JSON.stringify(error), timestamp: Date.now() });

    if (this.reconnectAttempts < this.config.maxRetries) {
      this.reconnectAttempts++;
      this.state = 'paused';
      setTimeout(() => {
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        this.state = 'connecting';
      }, this.config.reconnectInterval * this.reconnectAttempts);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.emit({ type: 'heartbeat', data: '', timestamp: Date.now() });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.state = 'idle';
    this.accumulatedChunk = '';
  }

  on(eventType: string, callback: (event: StreamEvent) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  off(eventType: string, callback: (event: StreamEvent) => void): void {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emit(event: StreamEvent): void {
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      callbacks.forEach(cb => cb(event));
    }
    const allCallbacks = this.listeners.get('*');
    if (allCallbacks) {
      allCallbacks.forEach(cb => cb(event));
    }
  }

  getState(): StreamState {
    return this.state;
  }

  recordInterrupt(reason?: string): void {
    this.interruptInfo = {
      occurred: true,
      timestamp: Date.now(),
      reason,
      recoveryPosition: this.accumulatedChunk.length,
    };
    this.emit({ type: 'checkpoint', data: 'interrupt', timestamp: Date.now(), checkpointId: 'interrupt' });
  }

  getInterruptInfo(): InterruptInfo {
    return { ...this.interruptInfo };
  }

  clearInterrupt(): void {
    this.interruptInfo = { occurred: false, timestamp: 0 };
  }

  getAccumulatedChunk(): string {
    return this.accumulatedChunk;
  }
}

export interface StreamRecoveryConfig {
  maxRecoveryAttempts: number;
  recoveryTimeout: number;
  checkpointInterval: number;
}

const DEFAULT_RECOVERY_CONFIG: StreamRecoveryConfig = {
  maxRecoveryAttempts: 3,
  recoveryTimeout: 10000,
  checkpointInterval: 5000,
};

export class StreamRecoveryManager {
  private config: StreamRecoveryConfig;
  private checkpoints: Map<string, { position: number; timestamp: number; data: string }> = new Map();
  private currentCheckpointId: string | null = null;
  private recoveryAttempts: number = 0;

  constructor(config?: Partial<StreamRecoveryConfig>) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  createCheckpoint(id: string, position: number, data: string): void {
    this.checkpoints.set(id, {
      position,
      timestamp: Date.now(),
      data,
    });
    this.currentCheckpointId = id;
  }

  getCheckpoint(id: string): { position: number; timestamp: number; data: string } | null {
    return this.checkpoints.get(id) || null;
  }

  getLatestCheckpoint(): string | null {
    return this.currentCheckpointId;
  }

  canRecover(): boolean {
    return this.recoveryAttempts < this.config.maxRecoveryAttempts;
  }

  recordRecoveryAttempt(): void {
    this.recoveryAttempts++;
  }

  resetRecoveryAttempts(): void {
    this.recoveryAttempts = 0;
  }

  getRecoveryAttempts(): number {
    return this.recoveryAttempts;
  }

  clearCheckpoints(): void {
    this.checkpoints.clear();
    this.currentCheckpointId = null;
  }

  async recover(
    checkpointId: string,
    resumeCallback: (position: number) => Promise<string>
  ): Promise<{ success: boolean; recoveredData: string }> {
    const checkpoint = this.getCheckpoint(checkpointId);
    if (!checkpoint) {
      return { success: false, recoveredData: '' };
    }

    if (!this.canRecover()) {
      return { success: false, recoveredData: '' };
    }

    this.recordRecoveryAttempt();

    try {
      const recoveredData = await resumeCallback(checkpoint.position);
      return { success: true, recoveredData };
    } catch (error) {
      return { success: false, recoveredData: '' };
    }
  }
}

export interface StreamingConfig {
  enableSSE: boolean;
  enableRecovery: boolean;
  bufferSize: number;
  reconnectAttempts: number;
}

export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  enableSSE: true,
  enableRecovery: true,
  bufferSize: 1024,
  reconnectAttempts: 3,
};

export class StreamingManager {
  private sseHandler: SSEStreamHandler;
  private recoveryManager: StreamRecoveryManager;
  private config: StreamingConfig;
  private outputBuffer: string = '';

  constructor(config?: Partial<StreamingConfig>) {
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
    this.sseHandler = new SSEStreamHandler();
    this.recoveryManager = new StreamRecoveryManager();
  }

  async *stream(
    input: AsyncIterable<string>,
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<string, void, unknown> {
    this.outputBuffer = '';

    for await (const chunk of input) {
      this.outputBuffer += chunk;

      if (onChunk) {
        onChunk(chunk);
      }

      yield chunk;
    }
  }

  connectToSSE(url: string): void {
    if (this.config.enableSSE) {
      this.sseHandler.connect(url);
    }
  }

  disconnectFromSSE(): void {
    this.sseHandler.disconnect();
  }

  async recoverFromInterrupt(
    checkpointId: string,
    resumeFn: (position: number) => Promise<string>
  ): Promise<{ success: boolean; recoveredData: string }> {
    const result = await this.recoveryManager.recover(checkpointId, resumeFn);
    if (result.success) {
      this.outputBuffer = result.recoveredData;
      this.sseHandler.clearInterrupt();
    }
    return result;
  }

  createCheckpoint(id: string): void {
    this.recoveryManager.createCheckpoint(id, this.outputBuffer.length, this.outputBuffer);
  }

  getOutputBuffer(): string {
    return this.outputBuffer;
  }

  clearOutputBuffer(): void {
    this.outputBuffer = '';
  }

  getState(): StreamState {
    return this.sseHandler.getState();
  }

  getRecoveryManager(): StreamRecoveryManager {
    return this.recoveryManager;
  }

  getSSEHandler(): SSEStreamHandler {
    return this.sseHandler;
  }
}
