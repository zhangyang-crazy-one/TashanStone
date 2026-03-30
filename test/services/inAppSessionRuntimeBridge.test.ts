import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import type {
  AIConfig,
  AIState,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
  AssistantSessionRecord,
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

function createResultEvent(
  request: AssistantRuntimeRequest,
  outputText: string,
): AssistantRuntimeEvent {
  return {
    type: 'result',
    requestId: request.requestId,
    sessionId: request.session.sessionId,
    timestamp: Date.now(),
    result: {
      status: 'success',
      sessionId: request.session.sessionId,
      outputText,
      completedAt: Date.now(),
    },
  };
}

function buildAssistantSession(): AssistantSessionRecord {
  return {
    sessionId: 'notebook:in-app-assistant:primary',
    scope: 'notebook',
    origin: 'app',
    route: {
      routeId: 'notebook:in-app-assistant:primary',
      kind: 'direct',
      routeKey: 'notebook:in-app-assistant:primary',
      transport: 'electron-ipc',
      origin: 'app',
      scope: 'notebook',
      participantIds: ['user-primary'],
    },
    status: 'active',
    title: 'Primary App Session',
    notebookId: 'in-app-notebook',
    startedAt: 1000,
    updatedAt: 1000,
  };
}

function createHarness() {
  let chatMessages: ChatMessage[] = [];
  const filesRef = {
    current: [
      {
        id: 'file-1',
        name: 'Daily Note',
        content: 'Runtime context',
        lastModified: 10,
      },
    ],
  } as MutableRefObject<MarkdownFile[]>;
  const abortControllerRef = { current: null } as MutableRefObject<AbortController | null>;
  const savedSessions: AssistantSessionRecord[] = [];

  return {
    savedSessions,
    requests: [] as AssistantRuntimeRequest[],
    options: {
      aiConfig: baseConfig,
      assistantSession: buildAssistantSession(),
      chatMessages,
      setChatMessages: vi.fn(update => {
        chatMessages = typeof update === 'function' ? update(chatMessages) : update;
      }),
      setAiState: vi.fn((_update: AIState | ((value: AIState) => AIState)) => undefined),
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
      saveAssistantSession: vi.fn(async (session: AssistantSessionRecord) => {
        savedSessions.push(session);
        return session;
      }),
      language: 'en' as const,
    },
  };
}

describe('in-app session runtime bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotebookContextAssemblerMock.mockReturnValue({
      assemble: vi.fn(),
    });
  });

  it('reuses the active canonical session across repeated app messages', async () => {
    const harness = createHarness();
    const requests: AssistantRuntimeRequest[] = [];

    createAssistantRuntimeMock.mockReturnValue({
      execute: vi.fn(async function* (
        request: AssistantRuntimeRequest,
      ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
        requests.push(request);
        yield createResultEvent(request, 'Runtime reply');
      }),
    });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('First prompt');
      await result.current.handleChatMessage('Second prompt');
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]?.session.sessionId).toBe('notebook:in-app-assistant:primary');
    expect(requests[1]?.session.sessionId).toBe('notebook:in-app-assistant:primary');
    expect(requests[0]?.caller.routeKey).toBe('notebook:in-app-assistant:primary');
    expect(requests[1]?.caller.routeKey).toBe('notebook:in-app-assistant:primary');
    expect(harness.savedSessions.map(session => session.sessionId)).toEqual([
      'notebook:in-app-assistant:primary',
      'notebook:in-app-assistant:primary',
      'notebook:in-app-assistant:primary',
      'notebook:in-app-assistant:primary',
    ]);
  });
});
