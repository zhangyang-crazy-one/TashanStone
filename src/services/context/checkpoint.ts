import { Checkpoint, ApiMessage, CompactedSession } from './types';

export interface CheckpointStorage {
  saveCheckpoint(checkpoint: Checkpoint, messages: ApiMessage[]): Promise<void>;
  getCheckpoint(checkpointId: string): Promise<{ checkpoint: Checkpoint; messages: ApiMessage[] } | null>;
  listCheckpoints(sessionId: string): Promise<Checkpoint[]>;
  deleteCheckpoint(checkpointId: string): Promise<boolean>;
  saveCompactedSession(session: CompactedSession): Promise<void>;
  getCompactedSessions(sessionId: string): Promise<CompactedSession[]>;
}

export class CheckpointManager {
  private storage: CheckpointStorage;

  constructor(storage: CheckpointStorage) {
    this.storage = storage;
  }

  async create(
    sessionId: string,
    name: string,
    messages: ApiMessage[],
    tokenCount: number
  ): Promise<Checkpoint> {
    const checkpoint: Checkpoint = {
      id: `cp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      session_id: sessionId,
      name,
      message_count: messages.length,
      token_count: tokenCount,
      created_at: Date.now(),
      summary: this.generateSummary(messages),
    };

    await this.storage.saveCheckpoint(checkpoint, messages);
    return checkpoint;
  }

  async restore(checkpointId: string): Promise<{ checkpoint: Checkpoint; messages: ApiMessage[] } | null> {
    const result = await this.storage.getCheckpoint(checkpointId);
    return result;
  }

  async list(sessionId: string): Promise<Checkpoint[]> {
    return this.storage.listCheckpoints(sessionId);
  }

  async delete(checkpointId: string): Promise<boolean> {
    return this.storage.deleteCheckpoint(checkpointId);
  }

  async saveCompactedSession(session: CompactedSession): Promise<void> {
    await this.storage.saveCompactedSession(session);
  }

  async getCompactedSessions(sessionId: string): Promise<CompactedSession[]> {
    return this.storage.getCompactedSessions(sessionId);
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

export class MemoryCheckpointStorage implements CheckpointStorage {
  private checkpoints: Map<string, { checkpoint: Checkpoint; messages: ApiMessage[] }> = new Map();
  private compactedSessions: Map<string, CompactedSession[]> = new Map();

  async saveCheckpoint(checkpoint: Checkpoint, messages: ApiMessage[]): Promise<void> {
    this.checkpoints.set(checkpoint.id, { checkpoint, messages: [...messages] });
  }

  async getCheckpoint(checkpointId: string): Promise<{ checkpoint: Checkpoint; messages: ApiMessage[] } | null> {
    return this.checkpoints.get(checkpointId) ?? null;
  }

  async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    const all: Checkpoint[] = [];
    for (const [, data] of this.checkpoints) {
      if (data.checkpoint.session_id === sessionId) {
        all.push(data.checkpoint);
      }
    }
    return all.sort((a, b) => b.created_at - a.created_at);
  }

  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    return this.checkpoints.delete(checkpointId);
  }

  async saveCompactedSession(session: CompactedSession): Promise<void> {
    const existing = this.compactedSessions.get(session.session_id) ?? [];
    existing.push(session);
    this.compactedSessions.set(session.session_id, existing);
  }

  async getCompactedSessions(sessionId: string): Promise<CompactedSession[]> {
    return this.compactedSessions.get(sessionId) ?? [];
  }

  clear(): void {
    this.checkpoints.clear();
    this.compactedSessions.clear();
  }
}
