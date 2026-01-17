import { getDatabase } from '../index.js';

export interface ChatMessageRow {
    id: string;
    role: string;
    content: string;
    timestamp: number;
    conversation_id: string;
    is_summary: number;
    condense_id: string | null;
    condense_parent: string | null;
    is_truncation_marker: number;
    truncation_id: string | null;
    truncation_parent: string | null;
    checkpoint_id: string | null;
    token_count: number | null;
}

export interface CheckpointRow {
    id: string;
    session_id: string;
    name: string;
    message_count: number;
    token_count: number;
    summary: string;
    messages_snapshot: string;
    created_at: number;
}

export interface CompactedSessionRow {
    id: string;
    session_id: string;
    summary: string;
    key_topics: string;
    decisions: string;
    message_start: number;
    message_end: number;
    created_at: number;
    last_accessed_at: number;
    access_count: number;
    tier: string;
    tier_updated_at: number;
    promotion_history: string;
}

export interface CompactedSession {
    id: string;
    session_id: string;
    summary: string;
    key_topics: string[];
    decisions: string[];
    message_start: number;
    message_end: number;
    created_at: number;
    last_accessed_at?: number;
    access_count?: number;
    tier?: string;
    tier_updated_at?: number;
    promotion_history?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    tool_call_id?: string;
    is_summary?: boolean;
    condense_id?: string;
    condense_parent?: string;
    is_truncation_marker?: boolean;
    truncation_id?: string;
    truncation_parent?: string;
    checkpoint_id?: string;
    token_count?: number;
}

export interface Checkpoint {
    id: string;
    session_id: string;
    name: string;
    message_count: number;
    token_count: number;
    summary: string;
    messages_snapshot: string;
    created_at: number;
}

export interface CompactedSession {
    id: string;
    session_id: string;
    summary: string;
    key_topics: string[];
    decisions: string[];
    message_start: number;
    message_end: number;
    created_at: number;
    last_accessed_at?: number;
    access_count?: number;
}

export class ChatRepository {
    getAll(conversationId: string = 'default'): ChatMessage[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT id, role, content, timestamp, conversation_id,
                   is_summary, condense_id, condense_parent,
                   is_truncation_marker, truncation_id, truncation_parent,
                   checkpoint_id, token_count
            FROM chat_messages
            WHERE conversation_id = ?
            ORDER BY timestamp ASC
        `).all(conversationId) as ChatMessageRow[];

        return rows.map(this.rowToMessage);
    }

    getMessagesSinceCheckpoint(conversationId: string, checkpointId: string): ChatMessage[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT id, role, content, timestamp, conversation_id,
                   is_summary, condense_id, condense_parent,
                   is_truncation_marker, truncation_id, truncation_parent,
                   checkpoint_id, token_count
            FROM chat_messages
            WHERE conversation_id = ? AND timestamp > (
                SELECT timestamp FROM chat_messages WHERE id = ?
            )
            ORDER BY timestamp ASC
        `).all(conversationId, checkpointId) as ChatMessageRow[];

        return rows.map(this.rowToMessage);
    }

    add(message: ChatMessage, conversationId: string = 'default'): ChatMessage {
        const db = getDatabase();

        db.prepare(`
            INSERT INTO chat_messages (id, role, content, timestamp, conversation_id,
                is_summary, condense_id, condense_parent, is_truncation_marker,
                truncation_id, truncation_parent, checkpoint_id, token_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            message.id,
            message.role,
            message.content,
            message.timestamp,
            conversationId,
            message.is_summary ? 1 : 0,
            message.condense_id || null,
            message.condense_parent || null,
            message.is_truncation_marker ? 1 : 0,
            message.truncation_id || null,
            message.truncation_parent || null,
            message.checkpoint_id || null,
            message.token_count || null
        );

        return message;
    }

    addBatch(messages: ChatMessage[], conversationId: string = 'default'): void {
        const db = getDatabase();
        const insert = db.prepare(`
            INSERT INTO chat_messages (id, role, content, timestamp, conversation_id,
                is_summary, condense_id, condense_parent, is_truncation_marker,
                truncation_id, truncation_parent, checkpoint_id, token_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const transaction = db.transaction(() => {
            for (const message of messages) {
                insert.run(
                    message.id,
                    message.role,
                    message.content,
                    message.timestamp,
                    conversationId,
                    message.is_summary ? 1 : 0,
                    message.condense_id || null,
                    message.condense_parent || null,
                    message.is_truncation_marker ? 1 : 0,
                    message.truncation_id || null,
                    message.truncation_parent || null,
                    message.checkpoint_id || null,
                    message.token_count || null
                );
            }
        });

        transaction();
    }

    clear(conversationId: string = 'default'): void {
        const db = getDatabase();
        db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').run(conversationId);
    }

    clearAll(): void {
        const db = getDatabase();
        db.prepare('DELETE FROM chat_messages').run();
    }

    deleteById(id: string): boolean {
        const db = getDatabase();
        const result = db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id);
        return result.changes > 0;
    }

    getConversationIds(): string[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT DISTINCT conversation_id FROM chat_messages
        `).all() as { conversation_id: string }[];

        return rows.map(row => row.conversation_id);
    }

    updateMessageCompression(
        messageId: string,
        updates: {
            is_summary?: boolean;
            condense_id?: string;
            condense_parent?: string;
            is_truncation_marker?: boolean;
            truncation_id?: string;
            truncation_parent?: string;
            token_count?: number;
        }
    ): void {
        const db = getDatabase();
        const sets: string[] = [];
        const values: (string | number | null)[] = [];

        if (updates.is_summary !== undefined) {
            sets.push('is_summary = ?');
            values.push(updates.is_summary ? 1 : 0);
        }
        if (updates.condense_id !== undefined) {
            sets.push('condense_id = ?');
            values.push(updates.condense_id);
        }
        if (updates.condense_parent !== undefined) {
            sets.push('condense_parent = ?');
            values.push(updates.condense_parent);
        }
        if (updates.is_truncation_marker !== undefined) {
            sets.push('is_truncation_marker = ?');
            values.push(updates.is_truncation_marker ? 1 : 0);
        }
        if (updates.truncation_id !== undefined) {
            sets.push('truncation_id = ?');
            values.push(updates.truncation_id);
        }
        if (updates.truncation_parent !== undefined) {
            sets.push('truncation_parent = ?');
            values.push(updates.truncation_parent);
        }
        if (updates.token_count !== undefined) {
            sets.push('token_count = ?');
            values.push(updates.token_count);
        }

        if (sets.length === 0) return;

        values.push(messageId);
        db.prepare(`
            UPDATE chat_messages SET ${sets.join(', ')} WHERE id = ?
        `).run(...values);
    }

    markMessagesAsCompacted(
        messageIds: string[],
        summaryId: string
    ): void {
        if (messageIds.length === 0) return;

        const db = getDatabase();
        const placeholders = messageIds.map(() => '?').join(',');

        db.prepare(`
            UPDATE chat_messages
            SET is_summary = 1, condense_id = ?
            WHERE id IN (${placeholders})
        `).run(summaryId, ...messageIds);
    }

    private rowToMessage(row: ChatMessageRow): ChatMessage {
        return {
            id: row.id,
            role: row.role as 'user' | 'assistant' | 'system' | 'tool',
            content: row.content,
            timestamp: row.timestamp,
            is_summary: row.is_summary === 1,
            condense_id: row.condense_id || undefined,
            condense_parent: row.condense_parent || undefined,
            is_truncation_marker: row.is_truncation_marker === 1,
            truncation_id: row.truncation_id || undefined,
            truncation_parent: row.truncation_parent || undefined,
            checkpoint_id: row.checkpoint_id || undefined,
            token_count: row.token_count || undefined,
        };
    }

    // ========================
    // Checkpoint Methods
    // ========================

    saveCheckpoint(checkpoint: Checkpoint): void {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO chat_checkpoints (id, session_id, name, message_count, token_count, summary, messages_snapshot, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            checkpoint.id,
            checkpoint.session_id,
            checkpoint.name,
            checkpoint.message_count,
            checkpoint.token_count,
            checkpoint.summary,
            checkpoint.messages_snapshot,
            checkpoint.created_at
        );
    }

    getCheckpoint(checkpointId: string): Checkpoint | null {
        const db = getDatabase();
        const row = db.prepare(`
            SELECT id, session_id, name, message_count, token_count, summary, messages_snapshot, created_at
            FROM chat_checkpoints
            WHERE id = ?
        `).get(checkpointId) as CheckpointRow | undefined;

        return row ? this.rowToCheckpoint(row) : null;
    }

    listCheckpoints(sessionId: string): Checkpoint[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT id, session_id, name, message_count, token_count, summary, messages_snapshot, created_at
            FROM chat_checkpoints
            WHERE session_id = ?
            ORDER BY created_at DESC
        `).all(sessionId) as CheckpointRow[];

        return rows.map(row => this.rowToCheckpoint(row));
    }

    deleteCheckpoint(checkpointId: string): boolean {
        const db = getDatabase();
        const result = db.prepare('DELETE FROM chat_checkpoints WHERE id = ?').run(checkpointId);
        return result.changes > 0;
    }

    deleteCheckpointsBySession(sessionId: string): number {
        const db = getDatabase();
        const result = db.prepare('DELETE FROM chat_checkpoints WHERE session_id = ?').run(sessionId);
        return result.changes;
    }

    private rowToCheckpoint(row: CheckpointRow): Checkpoint {
        return {
            id: row.id,
            session_id: row.session_id,
            name: row.name,
            message_count: row.message_count,
            token_count: row.token_count,
            summary: row.summary,
            messages_snapshot: row.messages_snapshot,
            created_at: row.created_at,
        };
    }

    // ========================
    // Compacted Session Methods (Mid-term Memory)
    // ========================

    saveCompactedSession(session: CompactedSession): void {
        const db = getDatabase();
        db.prepare(`
            INSERT INTO compacted_sessions (id, session_id, summary, key_topics, decisions, message_start, message_end, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            session.id,
            session.session_id,
            session.summary,
            JSON.stringify(session.key_topics),
            JSON.stringify(session.decisions),
            session.message_start,
            session.message_end,
            session.created_at
        );
    }

    getCompactedSessions(sessionId: string): CompactedSession[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT id, session_id, summary, key_topics, decisions, message_start, message_end, created_at
            FROM compacted_sessions
            WHERE session_id = ?
            ORDER BY created_at DESC
        `).all(sessionId) as CompactedSessionRow[];

        return rows.map(row => this.rowToCompactedSession(row));
    }

    getAllCompactedSessions(): CompactedSession[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT id, session_id, summary, key_topics, decisions, message_start, message_end, created_at
            FROM compacted_sessions
            ORDER BY created_at DESC
        `).all() as CompactedSessionRow[];

        return rows.map(row => this.rowToCompactedSession(row));
    }

    deleteCompactedSession(sessionId: string): number {
        const db = getDatabase();
        const result = db.prepare('DELETE FROM compacted_sessions WHERE session_id = ?').run(sessionId);
        return result.changes;
    }

    private rowToCompactedSession(row: CompactedSessionRow): CompactedSession {
        return {
            id: row.id,
            session_id: row.session_id,
            summary: row.summary,
            key_topics: JSON.parse(row.key_topics || '[]'),
            decisions: JSON.parse(row.decisions || '[]'),
            message_start: row.message_start,
            message_end: row.message_end,
            created_at: row.created_at,
            last_accessed_at: row.last_accessed_at || row.created_at,
            access_count: row.access_count || 0,
            tier: row.tier || 'mid-term',
            tier_updated_at: row.tier_updated_at || undefined,
            promotion_history: row.promotion_history || undefined,
        };
    }

    // 🔧 新增: 更新记忆层级状态
    updateMemoryTier(sessionId: string, tier: string, promotionHistory: object[]): void {
        const db = getDatabase();
        db.prepare(`
            UPDATE compacted_sessions
            SET tier = ?, tier_updated_at = ?, promotion_history = ?
            WHERE id = ?
        `).run(
            tier,
            Date.now(),
            JSON.stringify(promotionHistory),
            sessionId
        );
    }

    // 🔧 新增: 获取需要升级的记忆
    getMemoriesForPromotion(limit: number = 10): CompactedSession[] {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT id, session_id, summary, key_topics, decisions, message_start, message_end, 
                   created_at, last_accessed_at, access_count, tier, tier_updated_at, promotion_history
            FROM compacted_sessions
            WHERE tier = 'mid-term'
            ORDER BY access_count DESC, last_accessed_at ASC
            LIMIT ?
        `).all(limit) as CompactedSessionRow[];

        return rows.map(row => this.rowToCompactedSession(row));
    }

    // 🔧 新增: 更新记忆访问信息
    updateMemoryAccess(sessionId: string): void {
        const db = getDatabase();
        db.prepare(`
            UPDATE compacted_sessions
            SET last_accessed_at = ?, access_count = access_count + 1
            WHERE session_id = ?
        `).run(Date.now(), sessionId);
    }

    // 🔧 新增: 获取记忆的访问信息
    getMemoryAccessInfo(sessionId: string): { lastAccessedAt: number; accessCount: number } | null {
        const db = getDatabase();
        const row = db.prepare(`
            SELECT last_accessed_at, access_count
            FROM compacted_sessions
            WHERE session_id = ?
        `).get(sessionId) as { last_accessed_at: number; access_count: number } | undefined;

        return row ? {
            lastAccessedAt: row.last_accessed_at,
            accessCount: row.access_count,
        } : null;
    }
}

export const chatRepository = new ChatRepository();
