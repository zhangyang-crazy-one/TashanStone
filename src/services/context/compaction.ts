import {
  ApiMessage,
  CompressionResult,
  PruneResult,
  TruncationResult,
  CompressionType,
  getMessagePriority,
  isCompressed,
} from './types';
import { TokenBudget } from './token-budget';

export interface CompactionConfig {
  maxTokensToRemove?: number;
  preserveRecentRounds?: number;
  minMessagesToKeep?: number;
}

export class Compaction {
  private tokenBudget: TokenBudget;

  constructor(tokenBudget?: TokenBudget) {
    this.tokenBudget = tokenBudget ?? new TokenBudget();
  }

  async prune(
    messages: ApiMessage[],
    config?: CompactionConfig
  ): Promise<PruneResult> {
    const options = {
      maxTokensToRemove: 50000,
      preserveRecentRounds: 2,
      minMessagesToKeep: 5,
      ...config,
    };

    const eligibleForPruning = messages.filter(msg =>
      msg.role === 'tool' && !isCompressed(msg)
    );

    if (eligibleForPruning.length === 0) {
      return {
        pruned_messages: messages,
        removed_count: 0,
        removed_tokens: 0,
        preserved_recent_count: options.preserveRecentRounds * 2,
      };
    }

    const recentCutoff = messages.length - (options.preserveRecentRounds * 2) - 1;
    const toPrune = eligibleForPruning.filter((_, idx) => idx < recentCutoff);

    let totalRemovedTokens = 0;
    const prunedMessages: ApiMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'tool' && toPrune.includes(msg)) {
        const tokens = await this.tokenBudget.estimateTokens(
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        );
        totalRemovedTokens += tokens;
        const prunedMsg: ApiMessage = {
          ...msg,
          compressed: true,
          compression_type: 'pruned',
        };
        prunedMessages.push(prunedMsg);
      } else {
        prunedMessages.push(msg);
      }
    }

    return {
      pruned_messages: prunedMessages,
      removed_count: toPrune.length,
      removed_tokens: totalRemovedTokens,
      preserved_recent_count: options.preserveRecentRounds * 2,
    };
  }

  async compact(
    messages: ApiMessage[],
    systemPrompt: string,
    aiCompactFn: (content: string) => Promise<string>,
    config?: CompactionConfig
  ): Promise<CompressionResult> {
    if (messages.length < 10) {
      return {
        original_count: messages.length,
        compressed_count: messages.length,
        saved_tokens: 0,
        method: 'compacted',
        retained_messages: messages,
      };
    }

    const options = {
      preserveRecentRounds: 2,
      ...config,
    };

    const preserveCount = options.preserveRecentRounds * 2;
    const toCompact = messages.slice(0, messages.length - preserveCount);

    if (toCompact.length < 5) {
      return {
        original_count: messages.length,
        compressed_count: messages.length,
        saved_tokens: 0,
        method: 'compacted',
        retained_messages: messages,
      };
    }

    const recentMessages = messages.slice(messages.length - preserveCount);

    const conversationText = toCompact
      .map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n\n');

    const summaryPrompt = `请将以下对话历史压缩为简洁的摘要，保留关键信息和决策。摘要应包含：

## 摘要
<200字以内的摘要>

## 保留要点
- <要点1>
- <要点2>
- <要点3>

对话历史：
${conversationText}`;

    let summary: string;
    try {
      summary = await aiCompactFn(summaryPrompt);
    } catch (error) {
      console.error('[Compaction] Failed to generate summary:', error);
      return {
        original_count: messages.length,
        compressed_count: messages.length,
        saved_tokens: 0,
        method: 'compacted',
        retained_messages: messages,
      };
    }

    const summaryTokens = await this.tokenBudget.estimateTokens(summary);
    const originalTokens = await this.tokenBudget.estimateTokens(conversationText);

    const summaryMessage: ApiMessage = {
      id: `compact-${Date.now()}`,
      role: 'system',
      content: `**[对话摘要]**\n\n${summary}`,
      timestamp: Date.now(),
      compressed: false,
      token_count: summaryTokens,
    };

    const compressedMessages = [summaryMessage, ...recentMessages];

    for (let i = 0; i < toCompact.length; i++) {
      if (!isCompressed(toCompact[i])) {
        toCompact[i] = {
          ...toCompact[i],
          compressed: true,
          compression_type: 'compacted',
          condense_id: summaryMessage.id,
        };
      }
    }

    return {
      original_count: messages.length,
      compressed_count: compressedMessages.length,
      saved_tokens: Math.max(0, originalTokens - summaryTokens),
      method: 'compacted',
      retained_messages: compressedMessages,
      summary,
    };
  }

  async truncate(
    messages: ApiMessage[],
    targetTokens: number,
    config?: CompactionConfig
  ): Promise<TruncationResult> {
    const options = {
      preserveRecentRounds: 1,
      minMessagesToKeep: 3,
      safetyMargin: 0.9,
      ...config,
    };

    const safeTargetTokens = Math.floor(targetTokens * options.safetyMargin);
    const currentTokens = await this.tokenBudget.calculateMessagesTokenCount(messages);

    if (currentTokens <= safeTargetTokens) {
      const marker: ApiMessage = {
        id: `trunc-${Date.now()}`,
        role: 'system',
        content: `**[早期对话已截断]** - 共 ${messages.length} 条消息`,
        timestamp: Date.now(),
        is_truncation_marker: true,
      };

      return {
        truncated_messages: [marker, ...messages],
        removed_count: 0,
        removed_tokens: 0,
        truncation_marker: marker,
      };
    }

    const preserveCount = Math.max(options.minMessagesToKeep, options.preserveRecentRounds * 2);
    const keepFromEnd = messages.slice(-preserveCount);

    let keptTokens = await this.tokenBudget.calculateMessagesTokenCount(keepFromEnd);
    const toRemove: ApiMessage[] = [];

    for (let i = 0; i < messages.length - preserveCount; i++) {
      const msg = messages[i];
      if (isCompressed(msg)) continue;

      const msgTokens = await this.tokenBudget.estimateTokens(
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      );

      if (keptTokens + msgTokens <= targetTokens) {
        keptTokens += msgTokens;
      } else {
        toRemove.push(msg);
      }
    }

    const truncationId = `trunc-${Date.now()}`;
    const truncationMarker: ApiMessage = {
      id: truncationId,
      role: 'system',
      content: `**[对话截断]** - 已移除 ${toRemove.length} 条早期消息`,
      timestamp: Date.now(),
      is_truncation_marker: true,
      truncation_id: truncationId,
    };

    const truncatedMessages = [truncationMarker, ...keepFromEnd];

    for (const msg of toRemove) {
      msg.is_truncation_marker = true;
      msg.truncation_parent = truncationMarker.id;
    }

    let removedTokens = 0;
    for (const msg of toRemove) {
      removedTokens += await this.tokenBudget.estimateTokens(
        typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      );
    }

    return {
      truncated_messages: truncatedMessages,
      removed_count: toRemove.length,
      removed_tokens: removedTokens,
      truncation_marker: truncationMarker,
    };
  }

  selectCompressionMethod(
    usagePercentage: number,
    pruneThreshold: number,
    compactThreshold: number,
    truncateThreshold: number
  ): CompressionType | null {
    if (usagePercentage >= truncateThreshold) {
      return 'truncated';
    }
    if (usagePercentage >= compactThreshold) {
      return 'compacted';
    }
    if (usagePercentage >= pruneThreshold) {
      return 'pruned';
    }
    return null;
  }

  async getEffectiveHistory(messages: ApiMessage[]): Promise<ApiMessage[]> {
    const effective: ApiMessage[] = [];

    for (const msg of messages) {
      if (msg.is_truncation_marker) {
        continue;
      }

      if (isCompressed(msg)) {
        if (msg.compression_type === 'compacted' && msg.condense_id) {
          continue;
        }
        if (msg.compression_type === 'truncated' && msg.truncation_parent) {
          continue;
        }
      }

      effective.push(msg);
    }

    return effective;
  }

  cleanupOrphanedTags(messages: ApiMessage[]): ApiMessage[] {
    const condenseIds = new Set<string>();
    const truncationIds = new Set<string>();

    for (const msg of messages) {
      if (msg.compression_type === 'compacted' && msg.condense_id) {
        condenseIds.add(msg.condense_id);
      }
      if (msg.is_truncation_marker && msg.truncation_id) {
        truncationIds.add(msg.truncation_id);
      }
    }

    return messages.map(msg => {
      const cleaned = { ...msg };

      if (msg.compression_type === 'compacted' && msg.condense_id && !condenseIds.has(msg.condense_id)) {
        cleaned.condense_id = undefined;
        cleaned.compressed = false;
        cleaned.compression_type = undefined;
      }

      if (msg.is_truncation_marker && msg.truncation_id && !truncationIds.has(msg.truncation_id)) {
        cleaned.is_truncation_marker = false;
        cleaned.truncation_id = undefined;
      }

      return cleaned;
    });
  }
}
