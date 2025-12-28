import { chatRepository, ChatMessage, Checkpoint, CompactedSession } from './chatRepository.js';
import { CheckpointStorage as ICheckpointStorage } from '../../../src/services/context/checkpoint.js';
import { ApiMessage, CompactedSession as ContextCompactedSession } from '../../../src/services/context/types.js';

export class SQLiteCheckpointStorage implements ICheckpointStorage {
  async saveCheckpoint(checkpoint: Checkpoint, messages: ApiMessage[]): Promise<void> {
    const serializedMessages = JSON.stringify(messages.map(this.serializeMessage));
    chatRepository.saveCheckpoint({
      ...checkpoint,
      messages_snapshot: serializedMessages,
    });
  }

  async getCheckpoint(checkpointId: string): Promise<{ checkpoint: Checkpoint; messages: ApiMessage[] } | null> {
    const checkpoint = chatRepository.getCheckpoint(checkpointId);
    if (!checkpoint) return null;

    try {
      const serializedMessages = JSON.parse(checkpoint.messages_snapshot);
      const messages = serializedMessages.map(this.deserializeMessage);
      return { checkpoint, messages };
    } catch {
      console.error('[SQLiteCheckpointStorage] Failed to parse messages_snapshot');
      return { checkpoint, messages: [] };
    }
  }

  async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
    return chatRepository.listCheckpoints(sessionId);
  }

  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    return chatRepository.deleteCheckpoint(checkpointId);
  }

  async saveCompactedSession(session: ContextCompactedSession): Promise<void> {
    chatRepository.saveCompactedSession({
      id: session.id,
      session_id: session.session_id,
      summary: session.summary,
      key_topics: session.key_topics,
      decisions: session.decisions,
      message_start: session.message_range.start,
      message_end: session.message_range.end,
      created_at: session.created_at,
    });
  }

  async getCompactedSessions(sessionId: string): Promise<ContextCompactedSession[]> {
    const sessions = chatRepository.getCompactedSessions(sessionId);
    return sessions.map(session => ({
      id: session.id,
      session_id: session.session_id,
      summary: session.summary,
      key_topics: this.parseJsonSafe(session.key_topics, []),
      decisions: this.parseJsonSafe(session.decisions, []),
      message_range: {
        start: session.message_start,
        end: session.message_end,
      },
      created_at: session.created_at,
    }));
  }

  private parseJsonSafe<T>(json: string | T, defaultValue: T): T {
    if (typeof json !== 'string') return json;
    try {
      return JSON.parse(json);
    } catch {
      return defaultValue;
    }
  }

  private serializeMessage(msg: ApiMessage): object {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      name: msg.name,
      token_count: msg.token_count,
      compressed: msg.compressed,
      compression_type: msg.compression_type,
      condense_id: msg.condense_id,
      condense_parent: msg.condense_parent,
      is_truncation_marker: msg.is_truncation_marker,
      truncation_id: msg.truncation_id,
      truncation_parent: msg.truncation_parent,
      checkpoint_id: msg.checkpoint_id,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
    };
  }

  private deserializeMessage(data: any): ApiMessage {
    return {
      id: data.id,
      role: data.role,
      content: data.content,
      timestamp: data.timestamp,
      name: data.name,
      token_count: data.token_count,
      compressed: data.compressed,
      compression_type: data.compression_type,
      condense_id: data.condense_id,
      condense_parent: data.condense_parent,
      is_truncation_marker: data.is_truncation_marker,
      truncation_id: data.truncation_id,
      truncation_parent: data.truncation_parent,
      checkpoint_id: data.checkpoint_id,
      tool_calls: data.tool_calls,
      tool_call_id: data.tool_call_id,
    };
  }
}

export class MemoryCheckpointStorage implements ICheckpointStorage {
  private checkpoints: Map<string, { checkpoint: Checkpoint; messages: ApiMessage[] }> = new Map();
  private compactedSessions: Map<string, ContextCompactedSession[]> = new Map();

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

  async saveCompactedSession(session: ContextCompactedSession): Promise<void> {
    const existing = this.compactedSessions.get(session.session_id) ?? [];
    existing.push(session);
    this.compactedSessions.set(session.session_id, existing);
  }

  async getCompactedSessions(sessionId: string): Promise<ContextCompactedSession[]> {
    return this.compactedSessions.get(sessionId) ?? [];
  }

  clear(): void {
    this.checkpoints.clear();
    this.compactedSessions.clear();
  }
}

export const sqliteCheckpointStorage = new SQLiteCheckpointStorage();
export const memoryCheckpointStorage = new MemoryCheckpointStorage();
