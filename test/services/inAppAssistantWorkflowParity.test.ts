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
  generateAIResponseMock,
  generateAIResponseStreamMock,
  compactConversationMock,
  createMemoryFromCandidateMock,
  getEmbeddingMock,
  analyzeSessionForMemoryMock,
  initPersistentMemoryMock,
  supportsNativeStreamingToolCallsMock,
} = vi.hoisted(() => ({
  createAssistantRuntimeMock: vi.fn(),
  createNotebookContextAssemblerMock: vi.fn(),
  generateAIResponseMock: vi.fn(),
  generateAIResponseStreamMock: vi.fn(),
  compactConversationMock: vi.fn(),
  createMemoryFromCandidateMock: vi.fn(),
  getEmbeddingMock: vi.fn(),
  analyzeSessionForMemoryMock: vi.fn(),
  initPersistentMemoryMock: vi.fn(),
  supportsNativeStreamingToolCallsMock: vi.fn(),
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
  generateAIResponse: generateAIResponseMock,
  generateAIResponseStream: generateAIResponseStreamMock,
  getEmbedding: getEmbeddingMock,
  analyzeSessionForMemory: analyzeSessionForMemoryMock,
  initPersistentMemory: initPersistentMemoryMock,
  supportsNativeStreamingToolCalls: supportsNativeStreamingToolCallsMock,
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

function createAssistantSession(): AssistantSessionRecord {
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
    workspaceId: 'workspace:focused',
    startedAt: 1000,
    updatedAt: 1000,
  };
}

function createHarness() {
  let chatMessages: ChatMessage[] = [
    {
      id: 'history-user',
      role: 'user',
      content: 'Previous workspace question',
      timestamp: 1,
    },
    {
      id: 'history-assistant',
      role: 'assistant',
      content: 'Previous workspace answer',
      timestamp: 2,
    },
  ];
  const files: MarkdownFile[] = [
    {
      id: 'note-1',
      name: 'Backlog',
      content: 'General backlog',
      lastModified: 1,
      path: 'Backlog.md',
    },
    {
      id: 'note-2',
      name: 'Focused Draft',
      content: 'Current draft content',
      lastModified: 2,
      path: 'Focused Draft.md',
    },
  ];

  const filesRef = { current: files } as MutableRefObject<MarkdownFile[]>;
  const abortControllerRef = { current: null } as MutableRefObject<AbortController | null>;

  return {
    requests: [] as AssistantRuntimeRequest[],
    options: {
      aiConfig: baseConfig,
      assistantSession: createAssistantSession(),
      chatMessages,
      setChatMessages: vi.fn((update: ChatMessage[] | ((value: ChatMessage[]) => ChatMessage[])) => {
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
      language: 'en' as const,
      workspaceContext: {
        workspaceId: 'workspace:focused',
        activeFileId: 'note-2',
        selectedFileIds: ['note-2'],
        selectedText: 'Focused runtime paragraph',
      },
    },
  };
}

describe('in-app assistant workflow parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supportsNativeStreamingToolCallsMock.mockReturnValue(false);
    createNotebookContextAssemblerMock.mockReturnValue({
      assemble: vi.fn(),
    });
  });

  it('preserves session history and knowledge-query workflow while staying on the shared runtime path', async () => {
    const harness = createHarness();

    createAssistantRuntimeMock.mockReturnValue({
      execute: vi.fn(async function* (
        request: AssistantRuntimeRequest,
      ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
        harness.requests.push(request);
        yield createResultEvent(request, 'Runtime reply');
      }),
    });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('Search the focused runtime notes');
    });

    const request = harness.requests[0];
    expect(request).toBeDefined();
    expect(request?.caller.routeKey).toBe('notebook:in-app-assistant:primary');
    expect(request?.notebook?.workspaceId).toBe('workspace:focused');
    expect(request?.notebook?.activeFileId).toBe('note-2');
    expect(request?.notebook?.knowledgeQuery).toBe('Search the focused runtime notes');
    expect(request?.input.messages).toEqual([
      {
        role: 'user',
        content: 'Previous workspace question',
      },
      {
        role: 'assistant',
        content: 'Previous workspace answer',
      },
    ]);
    expect(request?.input.attachments?.map(attachment => attachment.fileId)).toEqual(['note-2']);
    expect(createAssistantRuntimeMock).toHaveBeenCalledTimes(1);
    expect(generateAIResponseMock).not.toHaveBeenCalled();
    expect(generateAIResponseStreamMock).not.toHaveBeenCalled();
  });
});
