import { useCallback, useState } from 'react';

import type {
  AssistantCallerSurface,
  AssistantCallerTransport,
  AssistantContextAdapterKind,
  AssistantRuntimeError,
  AssistantRuntimeEvent,
  AssistantRuntimeInspectionContextSection,
  AssistantRuntimeInspectionMetadata,
  AssistantRuntimeLifecyclePhase,
  AssistantRuntimeResult,
  AssistantSessionRef,
} from '@/types';

export interface AssistantRuntimeInspectionState {
  requestId: string | null;
  sessionId: string | null;
  threadId: string | null;
  parentSessionId: string | null;
  routeKey: string | null;
  callerId: string | null;
  surface: AssistantCallerSurface | null;
  transport: AssistantCallerTransport | null;
  lifecyclePhase: AssistantRuntimeLifecyclePhase | 'idle';
  lifecycleDetail: string | null;
  streamed: boolean;
  streamDeltaCount: number;
  accumulatedTextLength: number;
  lastDelta: string | null;
  contextAdapterIds: string[];
  contextSources: AssistantContextAdapterKind[];
  contextSections: AssistantRuntimeInspectionContextSection[];
  lastError: AssistantRuntimeError | null;
  updatedAt: number | null;
  completedAt: number | null;
}

interface AssistantRuntimeInspectionStart {
  requestId: string;
  session: AssistantSessionRef;
  routeKey?: string;
  callerId: string;
  surface: AssistantCallerSurface;
  transport: AssistantCallerTransport;
}

export function createInitialAssistantRuntimeInspectionState(): AssistantRuntimeInspectionState {
  return {
    requestId: null,
    sessionId: null,
    threadId: null,
    parentSessionId: null,
    routeKey: null,
    callerId: null,
    surface: null,
    transport: null,
    lifecyclePhase: 'idle',
    lifecycleDetail: null,
    streamed: false,
    streamDeltaCount: 0,
    accumulatedTextLength: 0,
    lastDelta: null,
    contextAdapterIds: [],
    contextSources: [],
    contextSections: [],
    lastError: null,
    updatedAt: null,
    completedAt: null,
  };
}

function applyInspectionMetadata(
  previous: AssistantRuntimeInspectionState,
  metadata: AssistantRuntimeInspectionMetadata,
  updatedAt: number,
  completedAt?: number | null,
  lastError?: AssistantRuntimeError | null,
): AssistantRuntimeInspectionState {
  return {
    requestId: metadata.requestId,
    sessionId: metadata.session.sessionId,
    threadId: metadata.session.threadId ?? null,
    parentSessionId: metadata.session.parentSessionId ?? null,
    routeKey: metadata.session.routeKey ?? null,
    callerId: metadata.session.callerId ?? previous.callerId,
    surface: metadata.session.surface ?? previous.surface,
    transport: metadata.session.transport ?? previous.transport,
    lifecyclePhase: metadata.lifecycle.phase,
    lifecycleDetail: metadata.lifecycle.detail ?? null,
    streamed: metadata.streaming.streamed,
    streamDeltaCount: metadata.streaming.deltaCount,
    accumulatedTextLength: metadata.streaming.accumulatedTextLength,
    lastDelta: metadata.streaming.lastDelta ?? null,
    contextAdapterIds: metadata.context.adapterIds,
    contextSources: metadata.context.sources,
    contextSections: metadata.context.sections,
    lastError: lastError ?? previous.lastError,
    updatedAt,
    completedAt: completedAt ?? previous.completedAt,
  };
}

function reduceAssistantRuntimeInspectionEvent(
  previous: AssistantRuntimeInspectionState,
  event: AssistantRuntimeEvent,
): AssistantRuntimeInspectionState {
  if (event.inspection) {
    return applyInspectionMetadata(
      previous,
      event.inspection,
      event.timestamp,
      previous.completedAt,
      event.type === 'error' ? event.error : null,
    );
  }

  if (event.type === 'error') {
    return {
      ...previous,
      lifecyclePhase: 'cancelled',
      lifecycleDetail: event.error.message,
      lastError: event.error,
      updatedAt: event.timestamp,
    };
  }

  return previous;
}

function reduceAssistantRuntimeInspectionResult(
  previous: AssistantRuntimeInspectionState,
  result: AssistantRuntimeResult,
): AssistantRuntimeInspectionState {
  if (!result.inspection) {
    return previous;
  }

  return applyInspectionMetadata(
    previous,
    result.inspection,
    result.completedAt,
    result.completedAt,
    result.error ?? null,
  );
}

export function useAssistantRuntimeInspection() {
  const [assistantRuntimeInspection, setAssistantRuntimeInspection] = useState<AssistantRuntimeInspectionState>(
    createInitialAssistantRuntimeInspectionState,
  );

  const beginAssistantRuntimeInspection = useCallback((input: AssistantRuntimeInspectionStart) => {
    setAssistantRuntimeInspection({
      ...createInitialAssistantRuntimeInspectionState(),
      requestId: input.requestId,
      sessionId: input.session.sessionId,
      threadId: input.session.threadId ?? null,
      parentSessionId: input.session.parentSessionId ?? null,
      routeKey: input.routeKey ?? null,
      callerId: input.callerId,
      surface: input.surface,
      transport: input.transport,
      lifecyclePhase: 'queued',
    });
  }, []);

  const applyRuntimeInspectionEvent = useCallback((event: AssistantRuntimeEvent) => {
    setAssistantRuntimeInspection(previous => reduceAssistantRuntimeInspectionEvent(previous, event));
  }, []);

  const applyRuntimeInspectionResult = useCallback((result: AssistantRuntimeResult) => {
    setAssistantRuntimeInspection(previous => reduceAssistantRuntimeInspectionResult(previous, result));
  }, []);

  const markAssistantRuntimeInspectionCancelled = useCallback((detail?: string) => {
    setAssistantRuntimeInspection(previous => ({
      ...previous,
      lifecyclePhase: 'cancelled',
      lifecycleDetail: detail ?? previous.lifecycleDetail,
      updatedAt: Date.now(),
    }));
  }, []);

  const markAssistantRuntimeInspectionError = useCallback((message: string) => {
    setAssistantRuntimeInspection(previous => ({
      ...previous,
      lifecyclePhase: previous.lifecyclePhase === 'idle' ? 'cancelled' : previous.lifecyclePhase,
      lifecycleDetail: message,
      lastError: {
        code: 'APP_RUNTIME_BRIDGE_ERROR',
        message,
        retryable: false,
      },
      updatedAt: Date.now(),
    }));
  }, []);

  return {
    assistantRuntimeInspection,
    beginAssistantRuntimeInspection,
    applyRuntimeInspectionEvent,
    applyRuntimeInspectionResult,
    markAssistantRuntimeInspectionCancelled,
    markAssistantRuntimeInspectionError,
  };
}
