import { ApiMessage, ContextConfig, TokenUsage, getMessagePriority } from './types';
import { TokenBudget } from './token-budget';
import { Compaction, createPrunedPlaceholder } from './compaction';

export type ContextLayer = 
  | 'system' 
  | 'project' 
  | 'user' 
  | 'conversation' 
  | 'tools';

export interface ContextLayerInfo {
  layer: ContextLayer;
  priority: number;
  tokens: number;
  messages: ApiMessage[];
}

export interface InjectRequest {
  systemPrompt: string;
  projectContext?: string;
  userContext?: string;
  conversationHistory: ApiMessage[];
  toolOutputs?: ApiMessage[];
  config: ContextConfig;
}

export interface InjectedContext {
  messages: ApiMessage[];
  tokenUsage: TokenUsage;
  layers: ContextLayerInfo[];
  wasCompressed: boolean;
  compressionMethod?: 'pruned' | 'compacted' | 'truncated';
}

export const CONTEXT_LAYER_PRIORITIES: Record<ContextLayer, number> = {
  system: 0,
  project: 1,
  user: 2,
  conversation: 3,
  tools: 4,
};

export const DEFAULT_CONTEXT_BUDGET_RATIOS = {
  system: 0.10,
  project: 0.15,
  user: 0.05,
  conversation: 0.50,
  tools: 0.20,
};

export class ContextInjector {
  private tokenBudget: TokenBudget;
  private compaction: Compaction;

  constructor() {
    this.tokenBudget = new TokenBudget();
    this.compaction = new Compaction(this.tokenBudget);
  }

  async inject(request: InjectRequest): Promise<InjectedContext> {
    const layers: ContextLayerInfo[] = [];
    let totalTokens = 0;

    const systemTokens = Math.floor(request.config.max_tokens * DEFAULT_CONTEXT_BUDGET_RATIOS.system);
    const projectTokens = Math.floor(request.config.max_tokens * DEFAULT_CONTEXT_BUDGET_RATIOS.project);
    const userTokens = Math.floor(request.config.max_tokens * DEFAULT_CONTEXT_BUDGET_RATIOS.user);
    const conversationTokens = Math.floor(request.config.max_tokens * DEFAULT_CONTEXT_BUDGET_RATIOS.conversation);
    const toolsTokens = Math.floor(request.config.max_tokens * DEFAULT_CONTEXT_BUDGET_RATIOS.tools);

    const systemMessage: ApiMessage = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: request.systemPrompt,
      timestamp: Date.now(),
    };
    layers.push({
      layer: 'system',
      priority: CONTEXT_LAYER_PRIORITIES.system,
      tokens: await this.tokenBudget.estimateTokens(request.systemPrompt),
      messages: [systemMessage],
    });
    totalTokens += layers[layers.length - 1].tokens;

    if (request.projectContext) {
      const projectMessage: ApiMessage = {
        id: `project-${Date.now()}`,
        role: 'system',
        content: request.projectContext,
        timestamp: Date.now(),
      };
      layers.push({
        layer: 'project',
        priority: CONTEXT_LAYER_PRIORITIES.project,
        tokens: await this.tokenBudget.estimateTokens(request.projectContext),
        messages: [projectMessage],
      });
      totalTokens += layers[layers.length - 1].tokens;
    }

    if (request.userContext) {
      const userMessage: ApiMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: request.userContext,
        timestamp: Date.now(),
      };
      layers.push({
        layer: 'user',
        priority: CONTEXT_LAYER_PRIORITIES.user,
        tokens: await this.tokenBudget.estimateTokens(request.userContext),
        messages: [userMessage],
      });
      totalTokens += layers[layers.length - 1].tokens;
    }

    let processedHistory = [...request.conversationHistory];
    let wasCompressed = false;
    let compressionMethod: 'pruned' | 'compacted' | 'truncated' | undefined;

    const historyTokens = await this.tokenBudget.calculateMessagesTokenCount(processedHistory);
    const availableTokens = request.config.max_tokens - totalTokens - request.config.reserved_output_tokens;

    if (historyTokens > availableTokens) {
      const usagePercentage = historyTokens / request.config.max_tokens;
      compressionMethod = this.compaction.selectCompressionMethod(
        usagePercentage,
        request.config.prune_threshold,
        request.config.compact_threshold,
        request.config.truncate_threshold
      );

      if (compressionMethod === 'pruned') {
        const pruneResult = await this.compaction.prune(processedHistory);
        processedHistory = pruneResult.pruned_messages;
        wasCompressed = true;
      } else if (compressionMethod === 'compacted') {
        const compactResult = await this.compaction.compact(
          processedHistory,
          request.systemPrompt,
          async (prompt) => {
            throw new Error('AI compact function not provided');
          }
        );
        processedHistory = compactResult.retained_messages;
        wasCompressed = true;
      } else if (compressionMethod === 'truncated') {
        const truncateResult = await this.compaction.truncate(
          processedHistory,
          availableTokens
        );
        processedHistory = truncateResult.truncated_messages;
        wasCompressed = true;
      }
    }

    const conversationLayer: ContextLayerInfo = {
      layer: 'conversation',
      priority: CONTEXT_LAYER_PRIORITIES.conversation,
      tokens: await this.tokenBudget.calculateMessagesTokenCount(processedHistory),
      messages: processedHistory,
    };
    layers.push(conversationLayer);
    totalTokens += conversationLayer.tokens;

    if (request.toolOutputs && request.toolOutputs.length > 0) {
      const toolsLayer: ContextLayerInfo = {
        layer: 'tools',
        priority: CONTEXT_LAYER_PRIORITIES.tools,
        tokens: await this.tokenBudget.calculateMessagesTokenCount(request.toolOutputs),
        messages: request.toolOutputs,
      };
      layers.push(toolsLayer);
      totalTokens += toolsLayer.tokens;
    }

    const sortedLayers = [...layers].sort((a, b) => a.priority - b.priority);
    const allMessages = sortedLayers.flatMap(layer => layer.messages);

    const tokenUsage: TokenUsage = {
      prompt: totalTokens,
      completion: 0,
      total: totalTokens,
      limit: request.config.max_tokens,
      percentage: totalTokens / request.config.max_tokens,
    };

    return {
      messages: allMessages,
      tokenUsage,
      layers: sortedLayers,
      wasCompressed,
      compressionMethod,
    };
  }

  async injectWithDynamicBudget(request: InjectRequest): Promise<InjectedContext> {
    const config = { ...request.config };
    const historyTokens = await this.tokenBudget.calculateMessagesTokenCount(request.conversationHistory);

    if (historyTokens > request.config.max_tokens * 0.6) {
      config.max_tokens = Math.floor(request.config.max_tokens * 1.2);
    }

    return this.inject({ ...request, config });
  }

  getLayerInfo(layers: ContextLayerInfo[]): Record<ContextLayer, ContextLayerInfo | undefined> {
    return layers.reduce((acc, layer) => {
      acc[layer.layer] = layer;
      return acc;
    }, {} as Record<ContextLayer, ContextLayerInfo | undefined>);
  }

  calculateLayerBudgets(totalTokens: number): Record<ContextLayer, number> {
    return Object.entries(DEFAULT_CONTEXT_BUDGET_RATIOS).reduce((acc, [layer, ratio]) => {
      acc[layer as ContextLayer] = Math.floor(totalTokens * ratio);
      return acc;
    }, {} as Record<ContextLayer, number>);
  }
}

export const globalContextInjector = new ContextInjector();
