export class CheckpointManager {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async create(sessionId, name, messages, tokenCount) {
        const checkpoint = {
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
    async restore(checkpointId) {
        const result = await this.storage.getCheckpoint(checkpointId);
        return result;
    }
    async list(sessionId) {
        return this.storage.listCheckpoints(sessionId);
    }
    async delete(checkpointId) {
        return this.storage.deleteCheckpoint(checkpointId);
    }
    async saveCompactedSession(session) {
        await this.storage.saveCompactedSession(session);
    }
    async getCompactedSessions(sessionId) {
        return this.storage.getCompactedSessions(sessionId);
    }
    generateSummary(messages) {
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
export class MemoryCheckpointStorage {
    checkpoints = new Map();
    compactedSessions = new Map();
    async saveCheckpoint(checkpoint, messages) {
        this.checkpoints.set(checkpoint.id, { checkpoint, messages: [...messages] });
    }
    async getCheckpoint(checkpointId) {
        return this.checkpoints.get(checkpointId) ?? null;
    }
    async listCheckpoints(sessionId) {
        const all = [];
        for (const [, data] of this.checkpoints) {
            if (data.checkpoint.session_id === sessionId) {
                all.push(data.checkpoint);
            }
        }
        return all.sort((a, b) => b.created_at - a.created_at);
    }
    async deleteCheckpoint(checkpointId) {
        return this.checkpoints.delete(checkpointId);
    }
    async saveCompactedSession(session) {
        const existing = this.compactedSessions.get(session.session_id) ?? [];
        existing.push(session);
        this.compactedSessions.set(session.session_id, existing);
    }
    async getCompactedSessions(sessionId) {
        return this.compactedSessions.get(sessionId) ?? [];
    }
    clear() {
        this.checkpoints.clear();
        this.compactedSessions.clear();
    }
}
//# sourceMappingURL=checkpoint.js.map