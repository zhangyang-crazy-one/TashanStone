import { Checkpoint, ApiMessage } from './types';
import { CheckpointStorage, CheckpointManager } from './checkpoint';

export interface BatchCheckpointOptions {
  batchSize: number;
  parallel: boolean;
  onProgress?: (current: number, total: number) => void;
}

const DEFAULT_OPTIONS: BatchCheckpointOptions = {
  batchSize: 5,
  parallel: true,
};

export interface BatchResult<T> {
  success: T[];
  failed: Array<{ id: string; error: string }>;
  total: number;
  duration: number;
}

export class BatchCheckpointOperations {
  private storage: CheckpointStorage;
  private options: BatchCheckpointOptions;

  constructor(storage: CheckpointStorage, options?: Partial<BatchCheckpointOptions>) {
    this.storage = storage;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async createBatch(
    sessionId: string,
    checkpoints: Array<{ name: string; messages: ApiMessage[]; tokenCount: number }>
  ): Promise<BatchResult<Checkpoint>> {
    checkpoints: Array<{ name: string; messages: ApiMessage[]; tokenCount: number }>
  ): Promise<BatchResult<Checkpoint>> {
    const startTime = Date.now();
    const success: Checkpoint[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const createOne = async (
      item: typeof checkpoints[0],
      index: number
    ): Promise<Checkpoint | null> => {
      try {
        const checkpoint: Checkpoint = {
          id: `cp-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          session_id: sessionId,
          name: item.name,
          message_count: item.messages.length,
          token_count: item.tokenCount,
          created_at: Date.now(),
          summary: this.generateSummary(item.messages),
        };

        await this.storage.saveCheckpoint(checkpoint, item.messages);
        return checkpoint;
      } catch (error) {
        failed.push({
          id: item.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
      }
    };

    if (this.options.parallel) {
      const results = await Promise.all(
        checkpoints.map((item, index) => createOne(item, index))
      );

      for (let i = 0; i < results.length; i++) {
        if (results[i]) {
          success.push(results[i]);
        }
        this.options.onProgress?.(i + 1, checkpoints.length);
      }
    } else {
      for (let i = 0; i < checkpoints.length; i++) {
        const result = await createOne(checkpoints[i], i);
        if (result) {
          success.push(result);
        }
        this.options.onProgress?.(i + 1, checkpoints.length);
      }
    }

    return {
      success,
      failed,
      total: checkpoints.length,
      duration: Date.now() - startTime,
    };
  }

  async restoreBatch(
    checkpointIds: string[]
  ): Promise<BatchResult<{ checkpoint: Checkpoint; messages: ApiMessage[] }>> {
    const startTime = Date.now();
    const success: Array<{ checkpoint: Checkpoint; messages: ApiMessage[] }> = [];
    const failed: Array<{ id: string; error: string }> = [];

    const restoreOne = async (id: string): Promise<void> => {
      try {
        const result = await this.storage.getCheckpoint(id);
        if (result) {
          success.push(result);
        } else {
          failed.push({ id, error: 'Checkpoint not found' });
        }
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    if (this.options.parallel) {
      await Promise.all(checkpointIds.map(id => restoreOne(id)));
    } else {
      for (const id of checkpointIds) {
        await restoreOne(id);
      }
    }

    return {
      success,
      failed,
      total: checkpointIds.length,
      duration: Date.now() - startTime,
    };
  }

  async deleteBatch(checkpointIds: string[]): Promise<BatchResult<string>> {
    const startTime = Date.now();
    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    const deleteOne = async (id: string): Promise<void> => {
      try {
        const result = await this.storage.deleteCheckpoint(id);
        if (result) {
          success.push(id);
        } else {
          failed.push({ id, error: 'Failed to delete' });
        }
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    if (this.options.parallel) {
      await Promise.all(checkpointIds.map(id => deleteOne(id)));
    } else {
      for (const id of checkpointIds) {
        await deleteOne(id);
      }
    }

    return {
      success,
      failed,
      total: checkpointIds.length,
      duration: Date.now() - startTime,
    };
  }

  async listCheckpointsByDate(
    sessionId: string,
    startDate: number,
    endDate: number
  ): Promise<Checkpoint[]> {
    const all = await this.storage.listCheckpoints(sessionId);
    return all.filter(
      cp => cp.created_at >= startDate && cp.created_at <= endDate
    );
  }

  async getOldCheckpoints(
    sessionId: string,
    olderThanDays: number
  ): Promise<Checkpoint[]> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const all = await this.storage.listCheckpoints(sessionId);
    return all.filter(cp => cp.created_at < cutoff);
  }

  async cleanupOldCheckpoints(
    sessionId: string,
    keepCount: number,
    olderThanDays?: number
  ): Promise<BatchResult<string>> {
    let checkpoints = await this.storage.listCheckpoints(sessionId);

    if (olderThanDays) {
      const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
      checkpoints = checkpoints.filter(cp => cp.created_at < cutoff);
    }

    checkpoints.sort((a, b) => b.created_at - a.created_at);
    const toDelete = checkpoints.slice(keepCount).map(cp => cp.id);

    return this.deleteBatch(toDelete);
  }

  private generateSummary(messages: ApiMessage[]): string {
    const userMsgs = messages.filter(m => m.role === 'user');
    const lastMsg = userMsgs[userMsgs.length - 1];

    let summary = `会话快照 - ${messages.length} 条消息`;
    if (lastMsg) {
      const content = typeof lastMsg.content === 'string'
        ? lastMsg.content.substring(0, 80)
        : JSON.stringify(lastMsg.content).substring(0, 80);
      summary += `, 最后话题: "${content}..."`;
    }

    return summary;
  }
}

export interface CheckpointMaintenanceConfig {
  maxCheckpointsPerSession: number;
  maxTotalCheckpoints: number;
  autoCleanup: boolean;
  cleanupIntervalHours: number;
}

const DEFAULT_MAINTENANCE_CONFIG: CheckpointMaintenanceConfig = {
  maxCheckpointsPerSession: 50,
  maxTotalCheckpoints: 500,
  autoCleanup: true,
  cleanupIntervalHours: 24,
};

export class CheckpointMaintenance {
  private storage: CheckpointStorage;
  private config: CheckpointMaintenanceConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    storage: CheckpointStorage,
    config?: Partial<CheckpointMaintenanceConfig>
  ) {
    this.storage = storage;
    this.config = { ...DEFAULT_MAINTENANCE_CONFIG, ...config };
  }

  startAutoCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.performCleanup().catch(err => {
        console.error('[CheckpointMaintenance] Auto cleanup failed:', err);
      });
    }, this.config.cleanupIntervalHours * 60 * 60 * 1000);
  }

  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  async performCleanup(): Promise<{
    deletedCheckpoints: number;
    freedSpace: number;
  }> {
    let deletedCheckpoints = 0;
    let freedSpace = 0;

    const sessions = new Set<string>();

    const allCheckpoints = await this.storage.listCheckpoints('*');
    for (const cp of allCheckpoints) {
      sessions.add(cp.session_id);
    }

    for (const sessionId of sessions) {
      const sessionCheckpoints = await this.storage.listCheckpoints(sessionId);
      sessionCheckpoints.sort((a, b) => b.created_at - a.created_at);

      if (sessionCheckpoints.length > this.config.maxCheckpointsPerSession) {
        const toDelete = sessionCheckpoints.slice(this.config.maxCheckpointsPerSession);
        for (const cp of toDelete) {
          const result = await this.storage.deleteCheckpoint(cp.id);
          if (result) {
            deletedCheckpoints++;
            freedSpace += cp.token_count;
          }
        }
      }
    }

    return { deletedCheckpoints, freedSpace };
  }

  async getStorageStats(): Promise<{
    totalCheckpoints: number;
    totalSessions: number;
    totalTokens: number;
    oldestCheckpoint: number | null;
    newestCheckpoint: number | null;
  }> {
    const allCheckpoints = await this.storage.listCheckpoints('*');
    const sessions = new Set(allCheckpoints.map(cp => cp.session_id));
    const totalTokens = allCheckpoints.reduce((sum, cp) => sum + cp.token_count, 0);

    let oldest: number | null = null;
    let newest: number | null = null;

    for (const cp of allCheckpoints) {
      if (!oldest || cp.created_at < oldest) oldest = cp.created_at;
      if (!newest || cp.created_at > newest) newest = cp.created_at;
    }

    return {
      totalCheckpoints: allCheckpoints.length,
      totalSessions: sessions.size,
      totalTokens,
      oldestCheckpoint: oldest,
      newestCheckpoint: newest,
    };
  }
}
