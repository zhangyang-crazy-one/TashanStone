import {
  ContextConfig,
  TokenUsage,
  UsageStatus,
  ContextComponents,
  ApiMessage,
  DEFAULT_CONTEXT_CONFIG,
} from './types';

// 移除外部 tokenizer 加载，改用纯 JS 估算
// 外部 CDN 脚本在 Electron CSP 环境下被阻止

/**
 * 纯中文本 Token 估算函数
 * - 中文: 约 1 token/字符 (保守估算)
 * - 英文: 约 0.5 token/字符
 */
function estimateTokensFallback(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }

  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;

  // 使用更保守的估算: 中文 1 token/字符，英文 0.5 token/字符
  return Math.ceil(chineseChars * 1.0 + otherChars * 0.5);
}

export class TokenBudget {
  private config: ContextConfig;

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  updateConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // 🔧 添加公共 getter 以访问配置
  getConfig(): ContextConfig {
    return { ...this.config };
  }

  getContextLimit(): number {
    return this.config.max_tokens - this.config.reserved_output_tokens;
  }

  async estimateTokens(text: string): Promise<number> {
    // 直接使用 fallback 估算，放弃外部 tokenizer
    // 外部脚本在 Electron CSP 环境下无法加载
    return estimateTokensFallback(text);
  }

  estimateTokensSync(text: string): number {
    return estimateTokensFallback(text);
  }

  fallbackTokenCount(text: string): number {
    return estimateTokensFallback(text);
  }

  async calculateMessagesTokenCount(messages: ApiMessage[]): Promise<number> {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += await this.estimateTokens(content);
      total += 4; // Role/formatting overhead per message
    }
    total += 2; // Start/end tokens
    return total;
  }

  async calculateTokenUsage(messages: ApiMessage[], pendingPrompt?: string): Promise<TokenUsage> {
    let promptTokens = await this.calculateMessagesTokenCount(messages);
    
    // 🔧 添加待处理的 prompt 的 token 计数
    if (pendingPrompt) {
      const promptTokenCount = await this.estimateTokens(pendingPrompt);
      promptTokens += promptTokenCount;
    }
    
    const completionTokens = 0; // 未生成 completion

    const contextLimit = this.config.max_tokens - this.config.reserved_output_tokens;

    const total = promptTokens + completionTokens;
    const percentage = contextLimit > 0 ? total / contextLimit : 0;

    return {
      prompt: promptTokens,
      completion: completionTokens,
      total,
      limit: contextLimit,
      percentage,
    };
  }

  checkThresholds(usage: TokenUsage): UsageStatus {
    const percentage = usage.percentage;

    if (percentage >= this.config.truncate_threshold) {
      return {
        level: 'critical',
        should_truncate: true,
        should_compact: false,
        should_prune: false,
        message: `Context at ${(percentage * 100).toFixed(1)}% - critical, truncating`,
      };
    }

    if (percentage >= this.config.compact_threshold) {
      return {
        level: 'warning',
        should_truncate: false,
        should_compact: true,
        should_prune: false,
        message: `Context at ${(percentage * 100).toFixed(1)}% - compacting`,
      };
    }

    if (percentage >= this.config.prune_threshold) {
      return {
        level: 'warning',
        should_truncate: false,
        should_compact: false,
        should_prune: true,
        message: `Context at ${(percentage * 100).toFixed(1)}% - pruning`,
      };
    }

    return {
      level: 'normal',
      should_truncate: false,
      should_compact: false,
      should_prune: false,
      message: `Context at ${(percentage * 100).toFixed(1)}% - healthy`,
    };
  }

  calculateBudget(): {
    systemPrompt: number;
    conversationHistory: number;
    toolOutputs: number;
  } {
    const contextLimit = this.config.max_tokens - this.config.reserved_output_tokens;
    const bufferSize = Math.floor(contextLimit * this.config.buffer_percentage);

    const availableForContext = contextLimit - bufferSize;

    return {
      systemPrompt: Math.floor(availableForContext * 0.10), // 10% for system prompt
      conversationHistory: Math.floor(availableForContext * 0.65), // 65% for conversation history
      toolOutputs: Math.floor(availableForContext * 0.25), // 25% for tool outputs
    };
  }
}
