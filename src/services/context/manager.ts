import {
  ApiMessage,
  TokenUsage,
  ContextConfig,
  CompressionResult,
  UsageStatus,
  CompressionType,
  Checkpoint,
  DEFAULT_CONTEXT_CONFIG,
  PruneResult,
  TruncationResult,
} from './types';
import { TokenBudget } from './token-budget';
import { Compaction } from './compaction';
import { CheckpointStorage } from './checkpoint';

export interface ManageResult {
  messages: ApiMessage[];
  usage: TokenUsage;
  action: 'none' | 'prune' | 'compact' | 'truncate' | 'pruned' | 'compacted' | 'truncated';
  saved_tokens?: number;
  checkpoint?: Checkpoint;
}

export class ContextManager {
  private tokenBudget: TokenBudget;
  private compaction: Compaction;
  private config: ContextConfig;
  private messages: ApiMessage[] = [];
  private sessionId: string;
  private lastCheckpointIndex: number = 0;
  private checkpointStorage: CheckpointStorage | null = null;
  private autoSaveEnabled: boolean = false;
  private onCheckpointCreated?: (checkpoint: Checkpoint) => void;
  private onContextUpdated?: (messages: ApiMessage[]) => void;

  constructor(
    sessionId?: string,
    config?: Partial<ContextConfig>,
    options?: {
      checkpointStorage?: CheckpointStorage;
      autoSave?: boolean;
      onCheckpointCreated?: (checkpoint: Checkpoint) => void;
      onContextUpdated?: (messages: ApiMessage[]) => void;
    }
  ) {
    this.sessionId = sessionId ?? `session-${Date.now()}`;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
    this.tokenBudget = new TokenBudget(this.config);
    this.compaction = new Compaction(this.tokenBudget);
    this.checkpointStorage = options?.checkpointStorage ?? null;
    this.autoSaveEnabled = options?.autoSave ?? false;
    this.onCheckpointCreated = options?.onCheckpointCreated;
    this.onContextUpdated = options?.onContextUpdated;
  }

  enablePersistence(storage: CheckpointStorage, autoSave: boolean = true): void {
    this.checkpointStorage = storage;
    this.autoSaveEnabled = autoSave;
  }

  disablePersistence(): void {
    this.checkpointStorage = null;
    this.autoSaveEnabled = false;
  }

  setConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
    this.tokenBudget.updateConfig(this.config);
  }

  getConfig(): ContextConfig {
    return { ...this.config };
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  addMessage(message: ApiMessage): void {
    this.messages.push(message);
    this.onContextUpdated?.(this.messages);
    this.checkAutoSave();
  }

  addMessages(newMessages: ApiMessage[]): void {
    this.messages.push(...newMessages);
    this.onContextUpdated?.(this.messages);
    this.checkAutoSave();
  }

  getMessages(): ApiMessage[] {
    return [...this.messages];
  }

  getEffectiveHistory(): Promise<ApiMessage[]> {
    return this.compaction.getEffectiveHistory(this.messages);
  }

  setMessages(messages: ApiMessage[]): void {
    this.messages = messages;
    this.onContextUpdated?.(this.messages);
  }

  async calculateTokenUsage(systemPrompt: string): Promise<TokenUsage> {
    return this.tokenBudget.calculateUsage(systemPrompt, this.messages);
  }

  async analyzeUsage(systemPrompt: string): Promise<{
    usage: TokenUsage;
    status: UsageStatus;
  }> {
    const usage = await this.calculateTokenUsage(systemPrompt);
    const status = this.tokenBudget.checkThresholds(usage);
    return { usage, status };
  }

  shouldManageContext(usageStatus: UsageStatus): usageStatus is Required<UsageStatus> {
    return (
      usageStatus.should_prune ||
      usageStatus.should_compact ||
      usageStatus.should_truncate
    );
  }

  async manageContext(
    systemPrompt: string,
    aiCompactFn?: (content: string) => Promise<string>
  ): Promise<ManageResult> {
    const { usage, status } = await this.analyzeUsage(systemPrompt);

    if (!status.should_prune && !status.should_compact && !status.should_truncate) {
      return {
        messages: this.messages,
        usage,
        action: 'none',
      };
    }

    let result: CompressionResult;
    let action: CompressionType = 'pruned';

    if (status.should_truncate) {
      const targetTokens = Math.floor(this.config.max_tokens * this.config.truncate_threshold * 0.9);
      const truncateResult = await this.compaction.truncate(this.messages, targetTokens);
      this.messages = truncateResult.truncated_messages;
      result = {
        original_count: this.messages.length,
        compressed_count: this.messages.length,
        saved_tokens: truncateResult.removed_tokens,
        method: 'truncated',
        retained_messages: truncateResult.truncated_messages,
      };
      action = 'truncated';
    } else if (status.should_compact && aiCompactFn) {
      const compactResult = await this.compaction.compact(
        this.messages,
        systemPrompt,
        aiCompactFn
      );
      this.messages = compactResult.retained_messages;
      result = compactResult;
      action = 'compacted';
    } else {
      const pruneResult = await this.compaction.prune(this.messages);
      this.messages = pruneResult.pruned_messages;
      result = {
        original_count: this.messages.length,
        compressed_count: this.messages.length,
        saved_tokens: pruneResult.removed_tokens,
        method: 'pruned',
        retained_messages: pruneResult.pruned_messages,
      };
      action = 'pruned';
    }

    const newUsage = await this.calculateTokenUsage(systemPrompt);

    const checkpoint = await this.createCheckpoint(`Auto-${action}`);

    return {
      messages: this.messages,
      usage: newUsage,
      action,
      saved_tokens: result.saved_tokens,
      checkpoint,
    };
  }

  async prune(): Promise<CompressionResult> {
    const pruneResult = await this.compaction.prune(this.messages);
    this.messages = pruneResult.pruned_messages;
    this.onContextUpdated?.(this.messages);
    this.checkAutoSave();
    const compressionResult: CompressionResult = {
      original_count: pruneResult.pruned_messages.length + pruneResult.removed_count,
      compressed_count: pruneResult.pruned_messages.length,
      saved_tokens: pruneResult.removed_tokens,
      method: 'pruned',
      retained_messages: pruneResult.pruned_messages,
    };
    return compressionResult;
  }

  async compact(
    systemPrompt: string,
    aiCompactFn: (content: string) => Promise<string>
  ): Promise<CompressionResult> {
    const result = await this.compaction.compact(
      this.messages,
      systemPrompt,
      aiCompactFn
    );
    this.messages = result.retained_messages;
    this.onContextUpdated?.(this.messages);
    this.checkAutoSave();
    return result;
  }

  async truncate(targetTokens?: number): Promise<TruncationResult> {
    const target = targetTokens ?? Math.floor(this.config.max_tokens * this.config.truncate_threshold * 0.9);
    const result = await this.compaction.truncate(this.messages, target);
    this.messages = result.truncated_messages;
    this.onContextUpdated?.(this.messages);
    this.checkAutoSave();
    return result;
  }

  async createCheckpoint(name?: string): Promise<Checkpoint> {
    const usage = await this.calculateTokenUsage('');
    const messageCount = this.messages.length;

    const checkpoint: Checkpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      session_id: this.sessionId,
      name: name ?? `Checkpoint ${new Date().toLocaleString()}`,
      message_count: messageCount,
      token_count: usage.total,
      created_at: Date.now(),
      summary: this.generateCheckpointSummary(),
    };

    this.lastCheckpointIndex = messageCount;
    this.onCheckpointCreated?.(checkpoint);

    if (this.checkpointStorage) {
      await this.checkpointStorage.saveCheckpoint(checkpoint, this.messages);
    }

    return checkpoint;
  }

  private generateCheckpointSummary(): string {
    const userMessages = this.messages.filter(m => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1];
    const preview = lastUserMsg
      ? (typeof lastUserMsg.content === 'string'
          ? lastUserMsg.content.substring(0, 100)
          : JSON.stringify(lastUserMsg.content).substring(0, 100))
      : 'Empty session';

    return `会话检查点 - ${this.messages.length} 条消息. 最后用户消息: "${preview}..."`;
  }

  async restoreFromCheckpoint(
    checkpointId: string
  ): Promise<boolean> {
    if (!this.checkpointStorage) {
      console.warn('[ContextManager] No checkpoint storage available');
      return false;
    }

    const result = await this.checkpointStorage.getCheckpoint(checkpointId);
    if (!result) {
      console.warn('[ContextManager] Checkpoint not found:', checkpointId);
      return false;
    }

    this.messages = result.messages;
    this.sessionId = result.checkpoint.session_id;
    this.lastCheckpointIndex = 0;
    this.onContextUpdated?.(this.messages);

    return true;
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    if (!this.checkpointStorage) {
      return [];
    }
    return this.checkpointStorage.listCheckpoints(this.sessionId);
  }

  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    if (!this.checkpointStorage) {
      return false;
    }
    return this.checkpointStorage.deleteCheckpoint(checkpointId);
  }

  cleanupOrphanedTags(): ApiMessage[] {
    const cleaned = this.compaction.cleanupOrphanedTags(this.messages);
    this.messages = cleaned;
    this.onContextUpdated?.(this.messages);
    return cleaned;
  }

  clear(): void {
    this.messages = [];
    this.lastCheckpointIndex = 0;
    this.onContextUpdated?.(this.messages);
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  getLastCheckpointIndex(): number {
    return this.lastCheckpointIndex;
  }

  shouldCreateCheckpoint(): boolean {
    const sinceLastCheckpoint = this.messages.length - this.lastCheckpointIndex;
    return sinceLastCheckpoint >= this.config.checkpoint_interval;
  }

  private checkAutoSave(): void {
    if (this.autoSaveEnabled && this.checkpointStorage && this.shouldCreateCheckpoint()) {
      this.createCheckpoint('Auto-save').catch(err => {
        console.error('[ContextManager] Auto-save checkpoint failed:', err);
      });
    }
  }
}

export function createContextManager(
  sessionId?: string,
  config?: Partial<ContextConfig>,
  options?: {
    checkpointStorage?: CheckpointStorage;
    autoSave?: boolean;
    onCheckpointCreated?: (checkpoint: Checkpoint) => void;
    onContextUpdated?: (messages: ApiMessage[]) => void;
  }
): ContextManager {
  return new ContextManager(sessionId, config, options);
}
