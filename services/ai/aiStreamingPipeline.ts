import type { AIConfig, ChatMessage, JsonValue, MarkdownFile, ToolCall, ToolEventCallback } from "../../types";
import { mcpService } from "../../src/services/mcpService";
import {
  createStreamingAdapterState,
  getStreamingToolCallAdapter,
  getToolCallAdapter,
} from "../toolCallAdapters";
import { RealMCPClient, VirtualMCPClient } from "./mcpClients";
import type { ToolCallback } from "./providerTypes";
import {
  streamAnthropic,
  streamGemini,
  streamOllama,
  streamOpenAICompatible,
  supportsNativeStreamingToolCalls,
} from "./streamingProviders";
import { buildAnthropicToolsForPrompt, buildOpenAIToolsForPrompt } from "./toolDefinitions";
import {
  applyToolCallFallbackArgs,
  buildOpenAIToolCallMessage,
  compactToolResultForStreaming,
  ensureJsonArguments,
  isOpenAICompatibleEndpoint,
} from "./aiToolCallPipeline";
import {
  buildFinalSystemInstruction,
  buildMcpPromptAddition,
  buildMcpToolDescriptions,
  buildMcpToolGuide,
  buildRagPrompt,
  normalizeMcpTools,
} from "./aiRequestBuilder";

/**
 * Stream AI response as it's being generated
 * @yields Text chunks as they arrive
 */
export async function* generateAIResponseStream(
  prompt: string,
  config: AIConfig,
  systemInstruction?: string,
  contextFiles: MarkdownFile[] = [],
  retrievedContext?: string,
  conversationHistory?: ChatMessage[],
  toolsCallback?: ToolCallback,
  toolEventCallback?: ToolEventCallback
): AsyncGenerator<string, void, unknown> {
  const fullPrompt = buildRagPrompt({ prompt, config, contextFiles, retrievedContext });

  // Initialize MCP Client for tool descriptions - Use Real if available, fallback to Virtual
  let mcpClient: RealMCPClient | VirtualMCPClient;
  const realMCP = new RealMCPClient(config.mcpTools || '{}');

  console.log('[generateAIResponseStream] mcpService.isAvailable:', mcpService.isAvailable());
  console.log('[generateAIResponseStream] realMCP.isRealMCP:', realMCP.isRealMCP());

  if (realMCP.isRealMCP()) {
    mcpClient = realMCP;
    await mcpClient.connect();
    console.log('[generateAIResponseStream] RealMCP tools:', mcpClient.getTools().length);
  } else {
    mcpClient = new VirtualMCPClient(config.mcpTools || '{}');
    await mcpClient.connect();
    console.log('[generateAIResponseStream] VirtualMCP tools:', mcpClient.getTools().length);
  }

  // Generate MCP Tool Descriptions for System Prompt
  const rawTools = mcpClient ? mcpClient.getTools() : [];
  const normalizedTools = normalizeMcpTools(rawTools);
  const mcpToolDescriptions = buildMcpToolDescriptions(normalizedTools);
  const toolGuide = buildMcpToolGuide(normalizedTools, config.language);

  const supportsStreamingToolCalls = supportsNativeStreamingToolCalls(config);
  const canUseTools = Boolean(toolsCallback);
  const useNativeStreamingTools = supportsStreamingToolCalls && canUseTools;

  const mcpPromptAddition = buildMcpPromptAddition({
    toolCount: normalizedTools.length,
    toolDescriptions: mcpToolDescriptions,
    toolGuide,
    mode: 'streaming',
    useNativeStreamingTools,
  });
  const finalSystemInstruction = buildFinalSystemInstruction({
    systemInstruction,
    mcpPromptAddition,
    language: config.language,
  });

  if (useNativeStreamingTools) {
    const streamingAdapter = getStreamingToolCallAdapter(config.provider);
    const toolAdapter = getToolCallAdapter(config.provider);
    const shouldPromptForToolContinuation = config.provider === 'openai' && isOpenAICompatibleEndpoint(config);
    const toolContinuationPrompt = config.language === 'zh'
      ? '请继续下一步或给出最终答案。'
      : 'Continue with the next step or provide your final answer.';

    if (!streamingAdapter) {
      yield* streamOpenAICompatible(fullPrompt, config, finalSystemInstruction, conversationHistory);
      return;
    }

    if (config.provider === 'openai') {
      const tools = buildOpenAIToolsForPrompt(fullPrompt, mcpClient);
      const messages: Array<Record<string, unknown>> = [];
      if (finalSystemInstruction) {
        messages.push({ role: 'system', content: finalSystemInstruction });
      }
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
          } else if (msg.role === 'assistant') {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
      messages.push({ role: 'user', content: fullPrompt });

      while (true) {
        const adapterState = createStreamingAdapterState();
        yield* streamOpenAICompatible(fullPrompt, config, finalSystemInstruction, conversationHistory, {
          messagesOverride: messages,
          tools,
          streamingAdapter,
          adapterState,
          toolEventCallback
        });

        const toolCalls = streamingAdapter.getToolCalls(adapterState);
        const resolvedToolCalls = toolCalls.map(toolCall => applyToolCallFallbackArgs(toolCall, adapterState.accumulatedText));
        if (adapterState.isComplete && resolvedToolCalls.length > 0 && toolsCallback) {
          const toolCallPayload = resolvedToolCalls.map(toolCall => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: ensureJsonArguments(toolCall.rawArgs, toolCall.args)
            }
          }));

          const toolCallMessage = buildOpenAIToolCallMessage(
            toolCallPayload,
            adapterState.accumulatedText,
            config
          );
          messages.push(toolCallMessage);

          for (const toolCall of resolvedToolCalls) {
            const runningCall: ToolCall = {
              ...toolCall,
              status: 'running',
              startTime: Date.now()
            };
            toolEventCallback?.(runningCall);

            try {
              const result = await toolsCallback(toolCall.name, toolCall.args);
              const completedCall: ToolCall = {
                ...runningCall,
                status: 'success',
                result,
                endTime: Date.now()
              };
              toolEventCallback?.(completedCall);

              const compactResult = compactToolResultForStreaming(toolCall.name, result as JsonValue);
              const toolResultMessage = toolAdapter.formatResult(toolCall, compactResult);
              messages.push(toolResultMessage as Record<string, unknown>);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              toolEventCallback?.({
                ...runningCall,
                status: 'error',
                error: errorMessage,
                endTime: Date.now()
              });
              throw error;
            }
          }

          if (shouldPromptForToolContinuation) {
            messages.push({ role: 'user', content: toolContinuationPrompt });
          }
          continue;
        }

        return;
      }
    }

    if (config.provider === 'anthropic') {
      const tools = buildAnthropicToolsForPrompt(fullPrompt, mcpClient);
      const messages: Array<Record<string, unknown>> = [];
      if (conversationHistory && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
          } else if (msg.role === 'assistant') {
            messages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
      messages.push({ role: 'user', content: fullPrompt });

      while (true) {
        const adapterState = createStreamingAdapterState();
        yield* streamAnthropic(fullPrompt, config, finalSystemInstruction, conversationHistory, {
          messagesOverride: messages,
          tools,
          streamingAdapter,
          adapterState,
          toolEventCallback
        });

        const toolCalls = streamingAdapter.getToolCalls(adapterState);
        const resolvedToolCalls = toolCalls.map(toolCall => applyToolCallFallbackArgs(toolCall, adapterState.accumulatedText));
        if (adapterState.isComplete && resolvedToolCalls.length > 0 && toolsCallback) {
          const contentBlocks: Array<Record<string, unknown>> = [];
          if (adapterState.accumulatedText.trim()) {
            contentBlocks.push({ type: 'text', text: adapterState.accumulatedText });
          }
          for (const toolCall of resolvedToolCalls) {
            contentBlocks.push({
              type: 'tool_use',
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.args
            });
          }

          messages.push({ role: 'assistant', content: contentBlocks });

          const resultBlocks: Array<Record<string, unknown>> = [];
          for (const toolCall of resolvedToolCalls) {
            const runningCall: ToolCall = {
              ...toolCall,
              status: 'running',
              startTime: Date.now()
            };
            toolEventCallback?.(runningCall);

            try {
              const result = await toolsCallback(toolCall.name, toolCall.args);
              const completedCall: ToolCall = {
                ...runningCall,
                status: 'success',
                result,
                endTime: Date.now()
              };
              toolEventCallback?.(completedCall);

              const compactResult = compactToolResultForStreaming(toolCall.name, result as JsonValue);
              resultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: typeof compactResult === 'string' ? compactResult : JSON.stringify(compactResult)
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              toolEventCallback?.({
                ...runningCall,
                status: 'error',
                error: errorMessage,
                endTime: Date.now()
              });
              throw error;
            }
          }

          messages.push({ role: 'user', content: resultBlocks });
          continue;
        }

        return;
      }
    }
  }

  // Route to appropriate streaming function
  if (config.provider === 'gemini') {
    yield* streamGemini(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else if (config.provider === 'ollama') {
    yield* streamOllama(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else if (config.provider === 'openai') {
    yield* streamOpenAICompatible(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else if (config.provider === 'anthropic') {
    yield* streamAnthropic(fullPrompt, config, finalSystemInstruction, conversationHistory);
  } else {
    throw new Error(`Unsupported provider for streaming: ${config.provider}`);
  }
}
