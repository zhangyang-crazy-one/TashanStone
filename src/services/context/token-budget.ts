import {
  ContextConfig,
  TokenUsage,
  UsageStatus,
  ContextComponents,
  ApiMessage,
  DEFAULT_CONTEXT_CONFIG,
} from './types';

const GPT2_TOKENIZER_URL = 'https://cdn.jsdelivr.net/npm/gpt2-tokenizer@1.1.5/build';

let tokenEncoder: any = null;
let encoderLoadingPromise: Promise<any> | null = null;

async function loadEncoder(): Promise<any> {
  if (tokenEncoder) return tokenEncoder;
  if (encoderLoadingPromise) return encoderLoadingPromise;

  encoderLoadingPromise = new Promise(async (resolve, reject) => {
    try {
      const GPT2Tokenizer = (await import(/* webpackIgnore: true */ `${GPT2_TOKENIZER_URL}/tokenizer`)).default;
      tokenEncoder = new GPT2Tokenizer(true);
      resolve(tokenEncoder);
    } catch (error) {
      console.warn('[TokenBudget] Failed to load GPT2Tokenizer, using fallback');
      tokenEncoder = null;
      resolve(null);
    }
  });

  return encoderLoadingPromise;
}

export class TokenBudget {
  private config: ContextConfig;

  constructor(config?: Partial<ContextConfig>) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  updateConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async estimateTokens(text: string): Promise<number> {
    const encoder = await loadEncoder();
    if (encoder) {
      try {
        const tokens = encoder.encode(text);
        return tokens.length;
      } catch {
        return this.fallbackTokenCount(text);
      }
    }
    return this.fallbackTokenCount(text);
  }

  fallbackTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async calculateMessagesTokenCount(messages: ApiMessage[]): Promise<number> {
    let total = 0;
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      total += await this.estimateTokens(content);
      total += 4;
    }
    total += 2;
    return total;
  }

  async calculateUsage(
    systemPrompt: string,
    messages: ApiMessage[],
    reservedOutput?: number
  ): Promise<TokenUsage> {
    const [systemTokens, messagesTokens] = await Promise.all([
      this.estimateTokens(systemPrompt),
      this.calculateMessagesTokenCount(messages),
    ]);

    const outputReserved = reservedOutput ?? this.config.reserved_output_tokens;
    const promptTotal = systemTokens + messagesTokens;
    const totalWithBuffer = promptTotal + outputReserved;

    return {
      prompt: promptTotal,
      completion: 0,
      total: totalWithBuffer,
      limit: this.config.max_tokens,
      percentage: totalWithBuffer / this.config.max_tokens,
    };
  }

  calculateBudget(): {
    systemPrompt: number;
    conversationHistory: number;
    toolOutputs: number;
    outputReserved: number;
    buffer: number;
  } {
    const bufferSize = Math.floor(this.config.max_tokens * this.config.buffer_percentage);
    const availableForContext = this.config.max_tokens - bufferSize - this.config.reserved_output_tokens;

    const systemRatio = 0.10;
    const historyRatio = 0.65;
    const toolsRatio = 0.25;

    return {
      systemPrompt: Math.floor(availableForContext * systemRatio),
      conversationHistory: Math.floor(availableForContext * historyRatio),
      toolOutputs: Math.floor(availableForContext * toolsRatio),
      outputReserved: this.config.reserved_output_tokens,
      buffer: bufferSize,
    };
  }

  allocateTokens(usage: TokenUsage): ContextComponents {
    const budget = this.calculateBudget();
    const remainingAfterSystem = usage.prompt - budget.systemPrompt;

    const historyRatio = budget.conversationHistory / (budget.conversationHistory + budget.toolOutputs);
    const toolsRatio = budget.toolOutputs / (budget.conversationHistory + budget.toolOutputs);

    return {
      system_prompt: '',
      project_context: '',
      conversation_history: [],
      tool_outputs: [],
      output_reserved: budget.outputReserved,
    };
  }

  checkThresholds(usage: TokenUsage): UsageStatus {
    const percentage = usage.total / usage.limit;

    if (percentage >= this.config.truncate_threshold) {
      return {
        level: 'critical',
        should_truncate: true,
        should_compact: false,
        should_prune: false,
        message: `Token usage critical (${(percentage * 100).toFixed(1)}%). Truncation required.`,
      };
    }

    if (percentage >= this.config.compact_threshold) {
      return {
        level: 'warning',
        should_compact: true,
        should_truncate: false,
        should_prune: false,
        message: `Token usage high (${(percentage * 100).toFixed(1)}%). Compression recommended.`,
      };
    }

    if (percentage >= this.config.prune_threshold) {
      return {
        level: 'warning',
        should_prune: true,
        should_compact: false,
        should_truncate: false,
        message: `Token usage elevated (${(percentage * 100).toFixed(1)}%). Pruning tool outputs.`,
      };
    }

    return {
      level: 'normal',
      should_prune: false,
      should_compact: false,
      should_truncate: false,
      message: `Token usage normal (${(percentage * 100).toFixed(1)}%).`,
    };
  }

  getConfig(): ContextConfig {
    return { ...this.config };
  }

  async calculateCompactSummaryTokens(
    historyCount: number,
    summaryLength?: number
  ): Promise<number> {
    const avgMessageTokens = 100;
    const targetSummaryTokens = summaryLength ?? Math.floor(historyCount * avgMessageTokens * 0.15);
    return targetSummaryTokens;
  }
}
