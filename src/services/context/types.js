export const DEFAULT_CONTEXT_CONFIG = {
    max_tokens: 200000,
    reserved_output_tokens: 16000,
    compact_threshold: 0.85,
    prune_threshold: 0.70,
    truncate_threshold: 0.90,
    messages_to_keep: 3,
    buffer_percentage: 0.10,
    checkpoint_interval: 20,
};
export function isApiMessage(msg) {
    return (msg &&
        typeof msg === 'object' &&
        'id' in msg &&
        'role' in msg &&
        'content' in msg &&
        'timestamp' in msg);
}
export function isCompressed(msg) {
    return msg.compressed === true || msg.compression_type !== undefined;
}
export function getMessagePriority(role) {
    const priorities = {
        system: 0,
        user: 1,
        assistant: 2,
        tool: 3,
    };
    return priorities[role] ?? 4;
}
//# sourceMappingURL=types.js.map