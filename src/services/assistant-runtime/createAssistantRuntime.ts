import type { ToolCallback } from '@/services/ai/providerTypes';
import type { AssistantRuntimeToolInvocation, JsonValue, ToolCall } from '@/types';

import {
  createContextAssembler,
  type AssistantRuntimeContextAssembler,
} from './contextAssembler';
import { createProviderExecution, type AssistantProviderExecution } from './providerExecution';
import type {
  AssistantRuntimeError,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
  AssistantRuntimeResult,
} from './types';

export interface AssistantRuntimeExecutionOptions {
  toolsCallback?: ToolCallback;
}

export interface AssistantRuntime {
  execute: (
    request: AssistantRuntimeRequest,
    options?: AssistantRuntimeExecutionOptions,
  ) => AsyncGenerator<AssistantRuntimeEvent, AssistantRuntimeResult, void>;
}

export interface AssistantRuntimeDependencies {
  now?: () => number;
  contextAssembler?: AssistantRuntimeContextAssembler;
  providerExecution?: AssistantProviderExecution;
}

interface RuntimeEventQueue {
  push: (event: AssistantRuntimeEvent) => void;
  finish: () => void;
  fail: (error: unknown) => void;
  next: () => Promise<IteratorResult<AssistantRuntimeEvent>>;
}

const DEFAULT_ERROR_CODE = 'PROVIDER_EXECUTION_FAILED';

function createRuntimeEventQueue(): RuntimeEventQueue {
  const pendingEvents: AssistantRuntimeEvent[] = [];
  const waitingResolvers: Array<(value: IteratorResult<AssistantRuntimeEvent>) => void> = [];
  let finished = false;

  const flush = () => {
    while (pendingEvents.length > 0 && waitingResolvers.length > 0) {
      const resolve = waitingResolvers.shift();
      const event = pendingEvents.shift();
      if (resolve && event) {
        resolve({ value: event, done: false });
      }
    }

    if (finished) {
      while (waitingResolvers.length > 0) {
        const resolve = waitingResolvers.shift();
        resolve?.({ value: undefined, done: true });
      }
    }
  };

  return {
    push(event) {
      pendingEvents.push(event);
      flush();
    },
    finish() {
      finished = true;
      flush();
    },
    fail() {
      finished = true;
      flush();
    },
    async next() {
      if (pendingEvents.length > 0) {
        const event = pendingEvents.shift();
        if (event) {
          return { value: event, done: false };
        }
      }

      if (finished) {
        return { value: undefined, done: true };
      }

      return new Promise<IteratorResult<AssistantRuntimeEvent>>(resolve => {
        waitingResolvers.push(resolve);
      });
    },
  };
}

function createRuntimeError(error: unknown, details?: Record<string, JsonValue>): AssistantRuntimeError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error && 'retryable' in error) {
    return error as AssistantRuntimeError;
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    code: DEFAULT_ERROR_CODE,
    message,
    retryable: false,
    details,
  };
}

function toRuntimeToolInvocation(toolCall: ToolCall): AssistantRuntimeToolInvocation {
  return {
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    status: toolCall.status,
    result: toolCall.result,
    error: toolCall.error
      ? createRuntimeError(toolCall.error, {
          provider: toolCall.provider ?? 'unknown',
        })
      : undefined,
  };
}

export function createAssistantRuntime(
  dependencies: AssistantRuntimeDependencies = {},
): AssistantRuntime {
  const now = dependencies.now ?? (() => Date.now());
  const contextAssembler = dependencies.contextAssembler ?? createContextAssembler();
  const providerExecution = dependencies.providerExecution ?? createProviderExecution();

  return {
    execute(request, options = {}) {
      const queue = createRuntimeEventQueue();
      const toolInvocations = new Map<string, AssistantRuntimeToolInvocation>();
      let finalResult: AssistantRuntimeResult = {
        status: 'cancelled',
        sessionId: request.session.sessionId,
        outputText: '',
        completedAt: now(),
      };

      const emit = (event: AssistantRuntimeEvent) => {
        queue.push(event);
      };

      const emitLifecycle = (
        phase: Extract<AssistantRuntimeEvent, { type: 'lifecycle' }>['phase'],
        detail?: string,
      ) => {
        emit({
          type: 'lifecycle',
          phase,
          detail,
          requestId: request.requestId,
          sessionId: request.session.sessionId,
          timestamp: now(),
        });
      };

      const execution = (async () => {
        try {
          emitLifecycle('queued');
          emitLifecycle('assembling-context');
          const assembledContext = await contextAssembler.assemble(request);

          emitLifecycle('executing');
          let streamingLifecycleEmitted = false;

          const providerResult = await providerExecution({
            prompt: assembledContext.prompt,
            request,
            systemInstruction: assembledContext.systemInstruction,
            retrievedContext: assembledContext.retrievedContext,
            conversationHistory: assembledContext.conversationHistory,
            toolsCallback: options.toolsCallback,
            toolEventCallback: toolCall => {
              const invocation = toRuntimeToolInvocation(toolCall);
              toolInvocations.set(invocation.toolCallId, invocation);
              emit({
                type: 'tool-status',
                requestId: request.requestId,
                sessionId: request.session.sessionId,
                timestamp: now(),
                toolCallId: invocation.toolCallId,
                toolName: invocation.toolName,
                status: invocation.status,
                result: invocation.result,
                error: invocation.error,
              });
            },
            onStreamDelta: (delta, accumulatedText) => {
              if (!streamingLifecycleEmitted) {
                emitLifecycle('streaming');
                streamingLifecycleEmitted = true;
              }

              emit({
                type: 'stream-delta',
                requestId: request.requestId,
                sessionId: request.session.sessionId,
                timestamp: now(),
                delta,
                accumulatedText,
              });
            },
          });

          finalResult = {
            status: 'success',
            sessionId: request.session.sessionId,
            outputText: providerResult.outputText,
            completedAt: now(),
            toolCalls: Array.from(toolInvocations.values()),
            metadata: {
              streamed: providerResult.streamed,
            },
          };

          emit({
            type: 'result',
            requestId: request.requestId,
            sessionId: request.session.sessionId,
            timestamp: now(),
            result: finalResult,
          });
          emitLifecycle('completed');
        } catch (error) {
          const runtimeError = createRuntimeError(error);
          finalResult = {
            status: 'error',
            sessionId: request.session.sessionId,
            outputText: '',
            completedAt: now(),
            toolCalls: Array.from(toolInvocations.values()),
            error: runtimeError,
          };

          emit({
            type: 'error',
            requestId: request.requestId,
            sessionId: request.session.sessionId,
            timestamp: now(),
            error: runtimeError,
          });
        } finally {
          queue.finish();
        }
      })();

      return (async function* run(): AsyncGenerator<AssistantRuntimeEvent, AssistantRuntimeResult, void> {
        while (true) {
          const next = await queue.next();
          if (next.done) {
            break;
          }
          yield next.value;
        }

        await execution;
        return finalResult;
      })();
    },
  };
}
