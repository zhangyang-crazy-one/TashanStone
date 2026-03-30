import { generateAIResponse, generateAIResponseStream } from '@/services/aiService';
import type { ToolCallback } from '@/services/ai/providerTypes';
import type { ChatMessage, MarkdownFile, ToolEventCallback } from '@/types';
import { ocrServiceLocal } from '@/services/ocrService';

import { createDeliveryPlan, type AssistantDeliveryPlan } from './deliveryPolicy';
import { createMultimodalNormalizer, type AssistantMultimodalNormalizer } from './multimodalNormalizer';
import { createProviderInputAdapter, type AssistantProviderInputAdapter } from './providerInputAdapter';
import type { AssistantMediaStatusRecord } from './toolMediaContracts';
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
  onMediaStatus?: (record: AssistantMediaStatusRecord) => void;
  onStreamDelta?: (delta: string, accumulatedText: string) => void;
}

export interface ProviderExecutionResult {
  outputText: string;
  streamed: boolean;
  delivery?: AssistantDeliveryPlan;
}

export type AssistantProviderExecution = (
  request: ProviderExecutionRequest,
) => Promise<ProviderExecutionResult>;

export interface ProviderExecutionDependencies {
  generateResponse?: typeof generateAIResponse;
  generateResponseStream?: typeof generateAIResponseStream;
  multimodalNormalizer?: AssistantMultimodalNormalizer;
  providerInputAdapter?: AssistantProviderInputAdapter;
}

export function createProviderExecution(
  dependencies: ProviderExecutionDependencies = {},
): AssistantProviderExecution {
  const generateResponse = dependencies.generateResponse ?? generateAIResponse;
  const streamResponse = dependencies.generateResponseStream ?? generateAIResponseStream;
  const multimodalNormalizer = dependencies.multimodalNormalizer ?? createMultimodalNormalizer({
    recognizeImage: source => ocrServiceLocal.recognize(source),
    transcribeAudio: async attachment => {
      const filePath = typeof attachment.metadata?.path === 'string'
        ? attachment.metadata.path
        : typeof attachment.uri === 'string'
          ? attachment.uri
          : undefined;

      if (filePath && window.electronAPI?.sherpa?.transcribeFile) {
        const result = await window.electronAPI.sherpa.transcribeFile(filePath, {});
        return {
          success: result.success,
          text: result.text,
          error: result.error,
          duration: result.duration,
        };
      }

      return {
        success: false,
        error: 'Audio transcription unavailable',
      };
    },
  });
  const providerInputAdapter = dependencies.providerInputAdapter ?? createProviderInputAdapter();

  return async ({
    prompt,
    request,
    systemInstruction,
    retrievedContext,
    conversationHistory,
    contextFiles = [],
    toolsCallback,
    toolEventCallback,
    onMediaStatus,
    onStreamDelta,
  }) => {
    const normalizedEnvelope = await multimodalNormalizer.normalize(
      {
        input: request.input,
        notebook: request.notebook,
      },
      {
        onStatus: onMediaStatus,
      },
    );
    const preparedInput = providerInputAdapter.adapt(prompt, normalizedEnvelope);
    const shouldStream = Boolean(
      request.caller.capabilities.streaming && request.modelConfig.enableStreaming,
    );

    if (shouldStream) {
      let accumulatedText = '';
      const stream = streamResponse(
        preparedInput.prompt,
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
        delivery: createDeliveryPlan(accumulatedText, request),
      };
    }

    const outputText = await generateResponse(
      preparedInput.prompt,
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
      delivery: createDeliveryPlan(outputText, request),
    };
  };
}
