import type { ToolCallback } from '@/services/ai/providerTypes';
import type { AssistantRuntimeToolInvocation, JsonValue, ToolCall } from '@/types';

import {
  createContextAssembler,
  type AssembledAssistantContext,
  type AssistantRuntimeContextAssembler,
} from './contextAssembler';
import { createProviderExecution, type AssistantProviderExecution } from './providerExecution';
import type { AssistantMediaStatusRecord } from './toolMediaContracts';
import type { AssistantToolExecutor } from './toolExecutor';
import type {
  AssistantRuntimeError,
  AssistantRuntimeEvent,
  AssistantRuntimeInspectionContext,
  AssistantRuntimeInspectionContextSection,
  AssistantRuntimeInspectionMetadata,
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
  toolExecutor?: AssistantToolExecutor;
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

function toMediaRuntimeError(record: AssistantMediaStatusRecord): AssistantRuntimeError | undefined {
  if (!record.error) {
    return undefined;
  }

  return {
    code: record.error.code,
    message: record.error.message,
    retryable: record.error.retryable,
    details: record.error.details,
  };
}

function toRuntimeJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value as JsonValue;
  }

  if (Array.isArray(value)) {
    return value.map(item => toRuntimeJsonValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const jsonObject: Record<string, JsonValue> = {};
    Object.entries(value).forEach(([key, entryValue]) => {
      jsonObject[key] = toRuntimeJsonValue(entryValue);
    });
    return jsonObject;
  }

  return String(value);
}

function toJsonCompatibleDelivery(delivery: NonNullable<Awaited<ReturnType<AssistantProviderExecution>>['delivery']>) {
  return toRuntimeJsonValue({
    policy: {
      ...delivery.policy,
    },
    units: delivery.units.map(unit => ({
      ...unit,
    })),
  });
}

function createInspectionSectionPreview(content: string, maxLength = 180): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function createInspectionContext(
  assembledContext?: AssembledAssistantContext,
): AssistantRuntimeInspectionContext {
  if (!assembledContext) {
    return {
      adapterIds: [],
      sources: [],
      sectionCount: 0,
      sections: [],
    };
  }

  const sections: AssistantRuntimeInspectionContextSection[] = assembledContext.payloads.flatMap(payload =>
    payload.sections.map(section => ({
      id: section.id,
      label: section.label,
      source: payload.source,
      preview: createInspectionSectionPreview(section.content),
      charCount: section.content.length,
      ...(section.metadata ? { metadata: section.metadata } : {}),
    })),
  );

  return {
    adapterIds: assembledContext.metadata.adapterIds,
    sources: Array.from(new Set(assembledContext.payloads.map(payload => payload.source))),
    sectionCount: sections.length,
    sections,
  };
}

function createInspectionMetadata(
  request: AssistantRuntimeRequest,
  state: {
    phase: AssistantRuntimeInspectionMetadata['lifecycle']['phase'];
    detail?: string;
    streamed: boolean;
    deltaCount: number;
    accumulatedTextLength: number;
    lastDelta?: string;
    assembledContext?: AssembledAssistantContext;
  },
): AssistantRuntimeInspectionMetadata {
  return {
    requestId: request.requestId,
    session: {
      sessionId: request.session.sessionId,
      scope: request.session.scope,
      origin: request.session.origin,
      ...(request.session.threadId ? { threadId: request.session.threadId } : {}),
      ...(request.session.parentSessionId ? { parentSessionId: request.session.parentSessionId } : {}),
      ...(request.caller.routeKey ? { routeKey: request.caller.routeKey } : {}),
      callerId: request.caller.callerId,
      surface: request.caller.surface,
      transport: request.caller.transport,
    },
    lifecycle: {
      phase: state.phase,
      ...(state.detail ? { detail: state.detail } : {}),
    },
    streaming: {
      streamed: state.streamed,
      deltaCount: state.deltaCount,
      accumulatedTextLength: state.accumulatedTextLength,
      ...(state.lastDelta ? { lastDelta: state.lastDelta } : {}),
    },
    context: createInspectionContext(state.assembledContext),
  };
}

export function createAssistantRuntime(
  dependencies: AssistantRuntimeDependencies = {},
): AssistantRuntime {
  const now = dependencies.now ?? (() => Date.now());
  const contextAssembler = dependencies.contextAssembler ?? createContextAssembler();
  const providerExecution = dependencies.providerExecution ?? createProviderExecution();
  const toolExecutor = dependencies.toolExecutor;

  return {
    execute(request, options = {}) {
      const queue = createRuntimeEventQueue();
      const toolInvocations = new Map<string, AssistantRuntimeToolInvocation>();
      let assembledContext: AssembledAssistantContext | undefined;
      const inspectionState = {
        phase: 'queued' as AssistantRuntimeInspectionMetadata['lifecycle']['phase'],
        detail: undefined as string | undefined,
        streamed: false,
        deltaCount: 0,
        accumulatedTextLength: 0,
        lastDelta: undefined as string | undefined,
      };
      let finalResult: AssistantRuntimeResult = {
        status: 'cancelled',
        sessionId: request.session.sessionId,
        outputText: '',
        completedAt: now(),
      };

      const emit = (event: AssistantRuntimeEvent) => {
        queue.push(event);
      };

      const getInspection = () =>
        createInspectionMetadata(request, {
          ...inspectionState,
          assembledContext,
        });

      const emitLifecycle = (
        phase: Extract<AssistantRuntimeEvent, { type: 'lifecycle' }>['phase'],
        detail?: string,
      ) => {
        inspectionState.phase = phase;
        inspectionState.detail = detail;
        emit({
          type: 'lifecycle',
          phase,
          detail,
          requestId: request.requestId,
          sessionId: request.session.sessionId,
          timestamp: now(),
          inspection: getInspection(),
        });
      };

      const execution = (async () => {
        try {
          emitLifecycle('queued');
          emitLifecycle('assembling-context');
          assembledContext = await contextAssembler.assemble(request);

          emitLifecycle('executing');
          let streamingLifecycleEmitted = false;
          const runtimeToolsCallback: ToolCallback | undefined = toolExecutor
            ? async (toolName, args) => {
                const executionResult = await toolExecutor.execute({
                  executionId: `${request.requestId}:${toolName}:${now()}`,
                  toolCallId: `${request.requestId}:${toolName}`,
                  toolName,
                  sessionId: request.session.sessionId,
                  callerId: request.caller.callerId,
                  transport: request.transport?.channel ?? 'internal',
                  arguments: args,
                  media: [],
                });

                if (executionResult.status === 'error') {
                  return {
                    success: false,
                    error: executionResult.error?.message ?? `Tool ${toolName} failed`,
                    code: executionResult.error?.code,
                  };
                }

                return executionResult.result ?? { success: true };
              }
            : options.toolsCallback;

          const providerResult = await providerExecution({
            prompt: assembledContext.prompt,
            request,
            systemInstruction: assembledContext.systemInstruction,
            retrievedContext: assembledContext.retrievedContext,
            conversationHistory: assembledContext.conversationHistory,
            toolsCallback: runtimeToolsCallback,
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
            onMediaStatus: record => {
              emit({
                type: 'media-status',
                requestId: request.requestId,
                sessionId: request.session.sessionId,
                timestamp: now(),
                mediaId: record.mediaId,
                kind: record.kind,
                status: record.status,
                detail: record.detail,
                metadata: record.metadata,
                error: toMediaRuntimeError(record),
              });
            },
            onStreamDelta: (delta, accumulatedText) => {
              if (!streamingLifecycleEmitted) {
                emitLifecycle('streaming');
                streamingLifecycleEmitted = true;
              }

              inspectionState.streamed = true;
              inspectionState.deltaCount += 1;
              inspectionState.accumulatedTextLength = accumulatedText.length;
              inspectionState.lastDelta = delta;
              emit({
                type: 'stream-delta',
                requestId: request.requestId,
                sessionId: request.session.sessionId,
                timestamp: now(),
                delta,
                accumulatedText,
                inspection: getInspection(),
              });
            },
          });

          inspectionState.phase = 'completed';
          inspectionState.detail = undefined;
          finalResult = {
            status: 'success',
            sessionId: request.session.sessionId,
            outputText: providerResult.outputText,
            completedAt: now(),
            toolCalls: Array.from(toolInvocations.values()),
            inspection: getInspection(),
            metadata: {
              streamed: providerResult.streamed,
              inspection: toRuntimeJsonValue(getInspection()),
              delivery: providerResult.delivery
                ? toJsonCompatibleDelivery(providerResult.delivery)
                : undefined,
            },
          };

          emit({
            type: 'result',
            requestId: request.requestId,
            sessionId: request.session.sessionId,
            timestamp: now(),
            result: finalResult,
            inspection: finalResult.inspection,
          });
          emitLifecycle('completed');
        } catch (error) {
          const runtimeError = createRuntimeError(error);
          inspectionState.phase = 'cancelled';
          inspectionState.detail = runtimeError.message;
          finalResult = {
            status: 'error',
            sessionId: request.session.sessionId,
            outputText: '',
            completedAt: now(),
            toolCalls: Array.from(toolInvocations.values()),
            error: runtimeError,
            inspection: getInspection(),
          };

          emit({
            type: 'error',
            requestId: request.requestId,
            sessionId: request.session.sessionId,
            timestamp: now(),
            error: runtimeError,
            inspection: getInspection(),
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
