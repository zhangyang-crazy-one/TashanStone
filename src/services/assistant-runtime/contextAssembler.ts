import type { ChatMessage } from '@/types';
import {
  ContextInjector,
  DEFAULT_CONTEXT_BUDGET_RATIOS,
  DEFAULT_CONTEXT_CONFIG,
  formatProjectContextForInjection,
  type ApiMessage,
  type ContextConfig,
  type InjectedContext,
} from '@/src/services/context';

import type {
  AssistantContextAdapter,
  AssistantContextPayload,
  AssistantContextSection,
  AssistantRuntimeRequest,
} from './types';

export interface AssembledAssistantContext {
  prompt: string;
  systemInstruction?: string;
  retrievedContext?: string;
  conversationHistory: ChatMessage[];
  payloads: AssistantContextPayload[];
  sections: AssistantContextSection[];
  injectedContext: InjectedContext;
  metadata: {
    adapterIds: string[];
    budgetRatios: typeof DEFAULT_CONTEXT_BUDGET_RATIOS;
  };
}

export interface AssistantRuntimeContextAssembler {
  assemble: (request: AssistantRuntimeRequest) => Promise<AssembledAssistantContext>;
}

export interface ContextAssemblerDependencies {
  adapters?: AssistantContextAdapter[];
  contextInjector?: ContextInjector;
  now?: () => number;
}

function createApiConversationHistory(
  request: AssistantRuntimeRequest,
  now: () => number,
): ApiMessage[] {
  return (request.input.messages ?? []).map((message, index) => ({
    id: `${request.requestId}-ctx-${index}`,
    role: message.role,
    content: message.content,
    timestamp: now(),
    name: message.name,
  }));
}

function createContextConfig(request: AssistantRuntimeRequest): ContextConfig {
  const contextEngine = request.modelConfig.contextEngine;
  if (!contextEngine?.enabled) {
    return DEFAULT_CONTEXT_CONFIG;
  }

  return {
    ...DEFAULT_CONTEXT_CONFIG,
    max_tokens: contextEngine.maxTokens,
    reserved_output_tokens: contextEngine.modelOutputLimit ?? DEFAULT_CONTEXT_CONFIG.reserved_output_tokens,
    compact_threshold: contextEngine.compactThreshold,
    prune_threshold: contextEngine.pruneThreshold,
    truncate_threshold: contextEngine.truncateThreshold,
    messages_to_keep: contextEngine.messagesToKeep,
    checkpoint_interval: contextEngine.checkpointInterval,
  };
}

function formatPayloadBlock(payload: AssistantContextPayload): string {
  const lines = [`## ${payload.source} context`, ''];
  for (const section of payload.sections) {
    lines.push(`### ${section.label}`);
    lines.push(section.content);
    lines.push('');
  }
  return lines.join('\n').trim();
}

function buildProjectContext(
  request: AssistantRuntimeRequest,
  payloads: AssistantContextPayload[],
): string | undefined {
  if (payloads.length === 0) {
    return undefined;
  }

  return formatProjectContextForInjection({
    projectInfo: `Notebook ${request.notebook?.notebookId ?? 'unknown'} runtime context`,
    techStack: payloads.map(payload => payload.source),
    keyConcepts: payloads.flatMap(payload => payload.sections.map(section => section.label)),
    recentProgress: payloads.flatMap(payload =>
      payload.sections.map(section => `- [${payload.source}] ${section.label}: ${section.content}`),
    ),
    activeTasks: request.notebook?.selectedFileIds?.map(fileId => `- Selected file: ${fileId}`) ?? [],
    decisions: [],
  });
}

function createPromptFromInjectedContext(
  injectedContext: InjectedContext,
  currentPrompt: string,
): string {
  const lines = injectedContext.messages.map(message => `[${message.role}] ${message.content}`);
  lines.push(`[user] ${currentPrompt}`);
  return lines.join('\n\n');
}

export function createContextAssembler(
  dependencies: ContextAssemblerDependencies = {},
): AssistantRuntimeContextAssembler {
  const adapters = dependencies.adapters ?? [];
  const contextInjector = dependencies.contextInjector ?? new ContextInjector();
  const now = dependencies.now ?? (() => Date.now());

  return {
    async assemble(request) {
      const notebookInput = request.notebook;
      const payloads = notebookInput
        ? await Promise.all(
            adapters.map(adapter =>
              Promise.resolve(
                adapter.assemble(notebookInput, {
                  session: request.session,
                  caller: request.caller,
                  input: request.input,
                }),
              ),
            ),
          )
        : [];

      const sections = payloads.flatMap(payload => payload.sections);
      const conversationHistory = createApiConversationHistory(request, now);
      const injectedContext = await contextInjector.inject({
        systemPrompt: request.input.instructions?.join('\n\n') ?? 'You are the TashaStone assistant runtime.',
        projectContext: buildProjectContext(request, payloads),
        userContext: notebookInput?.selectedText,
        conversationHistory,
        config: createContextConfig(request),
      });

      const promptBlocks = payloads.map(formatPayloadBlock);
      const prompt = [createPromptFromInjectedContext(injectedContext, request.input.prompt), ...promptBlocks]
        .filter(Boolean)
        .join('\n\n');

      return {
        prompt,
        systemInstruction: undefined,
        retrievedContext: payloads.length > 0 ? promptBlocks.join('\n\n') : undefined,
        conversationHistory: [],
        payloads,
        sections,
        injectedContext,
        metadata: {
          adapterIds: adapters.map(adapter => adapter.adapterId),
          budgetRatios: DEFAULT_CONTEXT_BUDGET_RATIOS,
        },
      };
    },
  };
}
