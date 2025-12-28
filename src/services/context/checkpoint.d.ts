import { Checkpoint, ApiMessage, CompactedSession } from './types';
export interface CheckpointStorage {
    saveCheckpoint(checkpoint: Checkpoint, messages: ApiMessage[]): Promise<void>;
    getCheckpoint(checkpointId: string): Promise<{
        checkpoint: Checkpoint;
        messages: ApiMessage[];
    } | null>;
    listCheckpoints(sessionId: string): Promise<Checkpoint[]>;
    deleteCheckpoint(checkpointId: string): Promise<boolean>;
    saveCompactedSession(session: CompactedSession): Promise<void>;
    getCompactedSessions(sessionId: string): Promise<CompactedSession[]>;
}
export declare class CheckpointManager {
    private storage;
    constructor(storage: CheckpointStorage);
    create(sessionId: string, name: string, messages: ApiMessage[], tokenCount: number): Promise<Checkpoint>;
    restore(checkpointId: string): Promise<{
        checkpoint: Checkpoint;
        messages: ApiMessage[];
    } | null>;
    list(sessionId: string): Promise<Checkpoint[]>;
    delete(checkpointId: string): Promise<boolean>;
    saveCompactedSession(session: CompactedSession): Promise<void>;
    getCompactedSessions(sessionId: string): Promise<CompactedSession[]>;
    private generateSummary;
}
export declare class MemoryCheckpointStorage implements CheckpointStorage {
    private checkpoints;
    private compactedSessions;
    saveCheckpoint(checkpoint: Checkpoint, messages: ApiMessage[]): Promise<void>;
    getCheckpoint(checkpointId: string): Promise<{
        checkpoint: Checkpoint;
        messages: ApiMessage[];
    } | null>;
    listCheckpoints(sessionId: string): Promise<Checkpoint[]>;
    deleteCheckpoint(checkpointId: string): Promise<boolean>;
    saveCompactedSession(session: CompactedSession): Promise<void>;
    getCompactedSessions(sessionId: string): Promise<CompactedSession[]>;
    clear(): void;
}
//# sourceMappingURL=checkpoint.d.ts.map