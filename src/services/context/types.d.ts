export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export interface ApiMessage {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: number;
    name?: string;
    token_count?: number;
    compressed?: boolean;
    compression_type?: CompressionType;
    condense_id?: string;
    condense_parent?: string;
    is_truncation_marker?: boolean;
    truncation_id?: string;
    truncation_parent?: string;
    checkpoint_id?: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}
export type CompressionType = 'pruned' | 'compacted' | 'truncated';
export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
    result?: string;
}
export interface TokenUsage {
    prompt: number;
    completion: number;
    total: number;
    limit: number;
    percentage: number;
}
export interface ContextConfig {
    max_tokens: number;
    reserved_output_tokens: number;
    compact_threshold: number;
    prune_threshold: number;
    truncate_threshold: number;
    messages_to_keep: number;
    buffer_percentage: number;
    checkpoint_interval: number;
}
export interface CompressionResult {
    original_count: number;
    compressed_count: number;
    saved_tokens: number;
    method: CompressionType;
    retained_messages: ApiMessage[];
    summary?: string;
}
export interface TruncationResult {
    truncated_messages: ApiMessage[];
    removed_count: number;
    removed_tokens: number;
    truncation_marker: ApiMessage;
}
export interface PruneResult {
    pruned_messages: ApiMessage[];
    removed_count: number;
    removed_tokens: number;
    preserved_recent_count: number;
}
export interface Checkpoint {
    id: string;
    session_id: string;
    name: string;
    message_count: number;
    token_count: number;
    created_at: number;
    summary: string;
}
export interface SessionState {
    checkpoint_id: string;
    messages: ApiMessage[];
    token_usage: TokenUsage;
    created_at: number;
}
export interface CompactedSession {
    id: string;
    session_id: string;
    summary: string;
    key_topics: string[];
    decisions: string[];
    message_range: {
        start: number;
        end: number;
    };
    created_at: number;
}
export interface IndexedConversation {
    id: string;
    session_id: string;
    embedding: number[];
    content: string;
    metadata: {
        date: number;
        topics: string[];
    };
}
export interface MemoryLayer {
    shortTerm: ApiMessage[];
    midTerm: CompactedSession[];
    longTerm: IndexedConversation[];
}
export interface ContextComponents {
    system_prompt: string;
    project_context: string;
    conversation_history: ApiMessage[];
    tool_outputs: string[];
    output_reserved: number;
}
export interface UsageStatus {
    level: 'normal' | 'warning' | 'critical';
    should_prune: boolean;
    should_compact: boolean;
    should_truncate: boolean;
    message: string;
}
export declare const DEFAULT_CONTEXT_CONFIG: ContextConfig;
export declare function isApiMessage(msg: any): msg is ApiMessage;
export declare function isCompressed(msg: ApiMessage): boolean;
export declare function getMessagePriority(role: MessageRole): number;
//# sourceMappingURL=types.d.ts.map