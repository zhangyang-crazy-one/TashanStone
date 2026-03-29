import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import type {
  AIConfig,
  AIState,
  AssistantRuntimeEvent,
  AssistantRuntimeInspectionMetadata,
  AssistantRuntimeRequest,
  ChatMessage,
  MarkdownFile,
  MemoryCandidate,
} from '../../types';

const {
  createAssistantRuntimeMock,
  createNotebookContextAssemblerMock,
  compactConversationMock,
  createMemoryFromCandidateMock,
  getEmbeddingMock,
  analyzeSessionForMemoryMock,
  initPersistentMemoryMock,
} = vi.hoisted(() => ({
  createAssistantRuntimeMock: vi.fn(),
  createNotebookContextAssemblerMock: vi.fn(),
  compactConversationMock: vi.fn(),
  createMemoryFromCandidateMock: vi.fn(),
  getEmbeddingMock: vi.fn(),
  analyzeSessionForMemoryMock: vi.fn(),
  initPersistentMemoryMock: vi.fn(),
}));

vi.mock('@/src/services/assistant-runtime', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/assistant-runtime')>('@/src/services/assistant-runtime');
  return {
    ...actual,
    createAssistantRuntime: createAssistantRuntimeMock,
    createNotebookContextAssembler: createNotebookContextAssemblerMock,
  };
});

vi.mock('@/services/aiService', () => ({
  compactConversation: compactConversationMock,
  createMemoryFromCandidate: createMemoryFromCandidateMock,
  getEmbedding: getEmbeddingMock,
  analyzeSessionForMemory: analyzeSessionForMemoryMock,
  initPersistentMemory: initPersistentMemoryMock,
}));

import { useAIWorkflow } from '../../src/app/hooks/useAIWorkflow';

const baseConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.4,
  language: 'en',
  enableStreaming: true,
  mcpTools: '[]',
};

function createInspection(
  request: AssistantRuntimeRequest,
  overrides: Partial<AssistantRuntimeInspectionMetadata> = {},
): AssistantRuntimeInspectionMetadata {
  return {
    requestId: request.requestId,
    session: {
      sessionId: request.session.sessionId,
      scope: request.session.scope,
      origin: request.session.origin,
      routeKey: request.caller.routeKey,
      callerId: request.caller.callerId,
      surface: request.caller.surface,
      transport: request.caller.transport,
    },
    lifecycle: {
      phase: 'queued',
    },
    streaming: {
      streamed: false,
      deltaCount: 0,
      accumulatedTextLength: 0,
    },
    context: {
      adapterIds: [],
      sources: [],
      sectionCount: 0,
      sections: [],
    },
    ...overrides,
  };
}

function createHarness() {
  let chatMessages: ChatMessage[] = [];
  const aiStates: AIState[] = [];
  const filesRef = {
    current: [
      {
        id: 'file-1',
        name: 'Daily Note',
        content: 'Inspection bridge context',
        lastModified: 10,
      },
    ],
  } as MutableRefObject<MarkdownFile[]>;
  const abortControllerRef = { current: null } as MutableRefObject<AbortController | null>;

  return {
    getAiStates: () => aiStates,
    options: {
      aiConfig: baseConfig,
      chatMessages,
      setChatMessages: vi.fn(update => {
        chatMessages = typeof update === 'function' ? update(chatMessages) : update;
      }),
      setAiState: vi.fn(update => {
        const next = typeof update === 'function'
          ? update(aiStates.at(-1) ?? { isThinking: false, error: null, message: null })
          : update;
        aiStates.push(next);
      }),
      showToast: vi.fn(),
      vectorStore: {
        hasFilesToIndex: vi.fn().mockResolvedValue(false),
        searchWithResults: vi.fn().mockResolvedValue({ results: [], context: '' }),
      },
      filesRef,
      setFiles: vi.fn(),
      handleIndexKnowledgeBase: vi.fn().mockResolvedValue(undefined),
      scheduleStreamingMessageUpdate: vi.fn(),
      flushStreamingMessageUpdate: vi.fn(),
      maybeYieldToBrowser: vi.fn().mockResolvedValue(undefined),
      setIsStreaming: vi.fn(),
      abortControllerRef,
      resetStreamYield: vi.fn(),
      setShowCompactMemoryPrompt: vi.fn(),
      compactMemoryCandidate: null as MemoryCandidate | null,
      setCompactMemoryCandidate: vi.fn(),
      setIsCompactSaving: vi.fn(),
      language: 'en' as const,
    },
  };
}

describe('in-app assistant inspection bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotebookContextAssemblerMock.mockReturnValue({
      assemble: vi.fn(),
    });
  });

  it('captures canonical runtime inspection data without expanding AIState into parity state', async () => {
    const harness = createHarness();

    createAssistantRuntimeMock.mockReturnValue({
      execute: vi.fn(async function* (
        request: AssistantRuntimeRequest,
      ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
        yield {
          type: 'lifecycle',
          requestId: request.requestId,
          sessionId: request.session.sessionId,
          timestamp: 1,
          phase: 'queued',
          inspection: createInspection(request),
        };
        yield {
          type: 'stream-delta',
          requestId: request.requestId,
          sessionId: request.session.sessionId,
          timestamp: 2,
          delta: 'Context',
          accumulatedText: 'Context',
          inspection: createInspection(request, {
            lifecycle: { phase: 'streaming' },
            streaming: {
              streamed: true,
              deltaCount: 1,
              accumulatedTextLength: 7,
              lastDelta: 'Context',
            },
          }),
        };
        yield {
          type: 'result',
          requestId: request.requestId,
          sessionId: request.session.sessionId,
          timestamp: 3,
          inspection: createInspection(request, {
            lifecycle: { phase: 'completed' },
            streaming: {
              streamed: true,
              deltaCount: 1,
              accumulatedTextLength: 15,
              lastDelta: 'Context',
            },
            context: {
              adapterIds: ['workspace-state'],
              sources: ['workspace'],
              sectionCount: 1,
              sections: [
                {
                  id: 'workspace-state',
                  label: 'Workspace State',
                  source: 'workspace',
                  preview: 'Active File: Daily Note',
                  charCount: 23,
                },
              ],
            },
          }),
          result: {
            status: 'success',
            sessionId: request.session.sessionId,
            outputText: 'Context inspected',
            completedAt: 4,
            inspection: createInspection(request, {
              lifecycle: { phase: 'completed' },
              streaming: {
                streamed: true,
                deltaCount: 1,
                accumulatedTextLength: 15,
                lastDelta: 'Context',
              },
              context: {
                adapterIds: ['workspace-state'],
                sources: ['workspace'],
                sectionCount: 1,
                sections: [
                  {
                    id: 'workspace-state',
                    label: 'Workspace State',
                    source: 'workspace',
                    preview: 'Active File: Daily Note',
                    charCount: 23,
                  },
                ],
              },
            }),
          },
        };
      }),
    });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('Inspect the runtime context');
    });

    expect(result.current.assistantRuntimeInspection.sessionId).toBe('notebook:in-app-assistant:primary');
    expect(result.current.assistantRuntimeInspection.lifecyclePhase).toBe('completed');
    expect(result.current.assistantRuntimeInspection.streamDeltaCount).toBe(1);
    expect(result.current.assistantRuntimeInspection.contextAdapterIds).toEqual(['workspace-state']);
    expect(result.current.assistantRuntimeInspection.contextSections).toEqual([
      expect.objectContaining({
        id: 'workspace-state',
        label: 'Workspace State',
        source: 'workspace',
      }),
    ]);

    const lastAiState = harness.getAiStates().at(-1);
    expect(lastAiState).toEqual({
      isThinking: false,
      error: null,
      message: null,
    });
  });

  it('keeps session id lifecycle phase and context summaries readable without parsing chat content', async () => {
    const harness = createHarness();

    createAssistantRuntimeMock.mockReturnValue({
      execute: vi.fn(async function* (
        request: AssistantRuntimeRequest,
      ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
        yield {
          type: 'result',
          requestId: request.requestId,
          sessionId: request.session.sessionId,
          timestamp: 1,
          inspection: createInspection(request, {
            lifecycle: { phase: 'completed' },
            context: {
              adapterIds: ['workspace-state', 'knowledge-context'],
              sources: ['workspace', 'knowledge'],
              sectionCount: 2,
              sections: [
                {
                  id: 'workspace-state',
                  label: 'Workspace State',
                  source: 'workspace',
                  preview: 'Selected Text: runtime ownership',
                  charCount: 32,
                },
                {
                  id: 'knowledge-context',
                  label: 'Knowledge Context',
                  source: 'knowledge',
                  preview: 'Parity notes',
                  charCount: 12,
                },
              ],
            },
          }),
          result: {
            status: 'success',
            sessionId: request.session.sessionId,
            outputText: 'Done',
            completedAt: 2,
            inspection: createInspection(request, {
              lifecycle: { phase: 'completed' },
              context: {
                adapterIds: ['workspace-state', 'knowledge-context'],
                sources: ['workspace', 'knowledge'],
                sectionCount: 2,
                sections: [
                  {
                    id: 'workspace-state',
                    label: 'Workspace State',
                    source: 'workspace',
                    preview: 'Selected Text: runtime ownership',
                    charCount: 32,
                  },
                  {
                    id: 'knowledge-context',
                    label: 'Knowledge Context',
                    source: 'knowledge',
                    preview: 'Parity notes',
                    charCount: 12,
                  },
                ],
              },
            }),
          },
        };
      }),
    });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('Summarize inspection state');
    });

    expect(result.current.assistantRuntimeInspection.sessionId).toBe('notebook:in-app-assistant:primary');
    expect(result.current.assistantRuntimeInspection.lifecyclePhase).toBe('completed');
    expect(result.current.assistantRuntimeInspection.contextSections.map(section => section.label)).toEqual([
      'Workspace State',
      'Knowledge Context',
    ]);
  });
});
