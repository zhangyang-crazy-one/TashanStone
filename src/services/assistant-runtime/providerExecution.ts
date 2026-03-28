import { generateAIResponse, generateAIResponseStream } from '@/services/aiService';
import type { ToolCallback } from '@/services/ai/providerTypes';
import type { ChatMessage, MarkdownFile, ToolEventCallback } from '@/types';

import type { AssistantRuntimeRequest } from './types';

export interface ProviderExecutionRequest {
  prompt: string;
  request: AssistantRuntimeRequest;
  systemInstruction?: string;
  retrievedContext?: string;
  conversationHistory?: ChatMessage[];
  contextFiles?: MarkdownFile[];
  toolsCallback?: ToolCallback;
  toolEventCallback?: ToolEventCallback;
  onStreamDelta?: (delta: string, accumulatedText: string) => void;
}

export interface ProviderExecutionResult {
  outputText: string;
  streamed: boolean;
}

export type AssistantProviderExecution = (
  request: ProviderExecutionRequest,
) => Promise<ProviderExecutionResult>;

export interface ProviderExecutionDependencies {
  generateResponse?: typeof generateAIResponse;
  generateResponseStream?: typeof generateAIResponseStream;
}

export function createProviderExecution(
  dependencies: ProviderExecutionDependencies = {},
): AssistantProviderExecution {
  const generateResponse = dependencies.generateResponse ?? generateAIResponse;
  const streamResponse = dependencies.generateResponseStream ?? generateAIResponseStream;

  return async ({
    prompt,
    request,
    systemInstruction,
    retrievedContext,
    conversationHistory,
    contextFiles = [],
    toolsCallback,
    toolEventCallback,
    onStreamDelta,
  }) => {
    const shouldStream = Boolean(
      request.caller.capabilities.streaming && request.modelConfig.enableStreaming,
    );

    if (shouldStream) {
      let accumulatedText = '';
      const stream = streamResponse(
        prompt,
        request.modelConfig,
        systemInstruction,
        contextFiles,
        retrievedContext,
        conversationHistory,
        toolsCallback,
        toolEventCallback,
      );

      for await (const delta of stream) {
        accumulatedText += delta;
        onStreamDelta?.(delta, accumulatedText);
      }

      return {
        outputText: accumulatedText,
        streamed: true,
      };
    }

    const outputText = await generateResponse(
      prompt,
      request.modelConfig,
      systemInstruction,
      false,
      contextFiles,
      toolsCallback,
      retrievedContext,
      conversationHistory,
      false,
      toolEventCallback,
    );

    return {
      outputText,
      streamed: false,
    };
  };
}
