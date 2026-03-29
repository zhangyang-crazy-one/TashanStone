import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

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
import { useAssistantSessions } from '../../src/app/hooks/useAssistantSessions';
import { useAIWorkflow } from '../../src/app/hooks/useAIWorkflow';
import { useChatHistory } from '../../src/app/hooks/useChatHistory';
import type { StorageService } from '../../src/services/storage/storageService';

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

const baseConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.4,
  language: 'en',
  enableStreaming: true,
  mcpTools: '[]',
};

function createStorageHarness() {
  const sessions = new Map<string, AssistantSessionRecord>();
  const sessionMessages = new Map<string, ChatMessage[]>();
  const settings = new Map<string, string>();

  const storage = {
    getAssistantSessions: vi.fn(async () => Array.from(sessions.values())),
    getAssistantSession: vi.fn(async (sessionId: string) => sessions.get(sessionId) ?? null),
    saveAssistantSession: vi.fn(async (session: AssistantSessionRecord) => {
      sessions.set(session.sessionId, session);
      return session;
    }),
    deleteAssistantSession: vi.fn(async (sessionId: string) => {
      const existed = sessions.delete(sessionId);
      sessionMessages.delete(sessionId);
      return existed;
    }),
    getSessionMessages: vi.fn(async (sessionId: string) => sessionMessages.get(sessionId) ?? []),
    replaceSessionMessages: vi.fn(async (sessionId: string, messages: ChatMessage[]) => {
      sessionMessages.set(sessionId, messages);
      return messages;
    }),
    getSetting: vi.fn(async (key: string) => settings.get(key) ?? null),
    setSetting: vi.fn(async (key: string, value: string) => {
      settings.set(key, value);
    }),
  } as unknown as StorageService;

  return {
    sessionMessages,
    sessions,
    settings,
    storage,
  };
}

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

function useParityHarness(storage: StorageService) {
  const filesRef = React.useRef<MarkdownFile[]>([
    {
      id: 'note-1',
      name: 'Inbox',
      content: 'Unfocused note',
      lastModified: 1,
      path: 'Inbox.md',
    },
    {
      id: 'note-2',
      name: 'Focused Draft',
      content: 'Selected runtime content',
      lastModified: 2,
      path: 'Focused Draft.md',
    },
  ]);
  const [_aiState, setAiState] = React.useState<AIState>({ isThinking: false, error: null, message: null });
  const [_isStreaming, setIsStreaming] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const [compactMemoryCandidate, setCompactMemoryCandidate] = React.useState<MemoryCandidate | null>(null);
  const [, setShowCompactMemoryPrompt] = React.useState(false);
  const [, setIsCompactSaving] = React.useState(false);

  const sessionState = useAssistantSessions({ storage, workspaceId: 'workspace:focused' });
  const history = useChatHistory(sessionState.activeSessionId, storage);
  const vectorStore = React.useMemo(() => ({
    hasFilesToIndex: vi.fn().mockResolvedValue(false),
    searchWithResults: vi.fn().mockResolvedValue({ results: [], context: '' }),
  }), []);

  const workflow = useAIWorkflow({
    aiConfig: baseConfig,
    assistantSession: sessionState.activeSession,
    chatMessages: history.chatMessages,
    setChatMessages: history.setChatMessages,
    setAiState,
    showToast: vi.fn(),
    vectorStore,
    filesRef,
    setFiles: vi.fn(),
    handleIndexKnowledgeBase: vi.fn().mockResolvedValue(undefined),
    scheduleStreamingMessageUpdate: vi.fn(),
    flushStreamingMessageUpdate: vi.fn(),
    maybeYieldToBrowser: vi.fn().mockResolvedValue(undefined),
    setIsStreaming,
    abortControllerRef,
    resetStreamYield: vi.fn(),
    setShowCompactMemoryPrompt,
    compactMemoryCandidate,
    setCompactMemoryCandidate,
    setIsCompactSaving,
    saveAssistantSession: sessionState.saveSession,
    language: 'en',
    workspaceContext: {
      workspaceId: 'workspace:focused',
      activeFileId: 'note-2',
      selectedFileIds: ['note-2'],
      selectedText: 'Focused runtime paragraph',
    },
  });

  return {
    ...sessionState,
    ...history,
    ...workflow,
    vectorStore,
  };
}

describe('in-app assistant parity regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supportsNativeStreamingToolCallsMock.mockReturnValue(false);
    createNotebookContextAssemblerMock.mockReturnValue({
      assemble: vi.fn(),
    });
  });

  it('keeps session-scoped chat history on the shared runtime path while preserving focused workspace context', async () => {
    const storageHarness = createStorageHarness();
    const requests: AssistantRuntimeRequest[] = [];

    createAssistantRuntimeMock.mockReturnValue({
      execute: vi.fn(async function* (
        request: AssistantRuntimeRequest,
      ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
        requests.push(request);
        yield createResultEvent(request, `Reply ${requests.length}`);
      }),
    });

    const { result } = renderHook(() => useParityHarness(storageHarness.storage));

    await waitFor(() => {
      expect(result.current.activeSessionId).toBe('notebook:in-app-assistant:primary');
    });

    await act(async () => {
      await result.current.handleChatMessage('Search the focused runtime notes');
    });

    await waitFor(() => {
      expect(storageHarness.sessionMessages.get('notebook:in-app-assistant:primary')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Search the focused runtime notes', role: 'user' }),
          expect.objectContaining({ content: 'Reply 1', role: 'assistant' }),
        ]),
      );
    });

    const primaryRequest = requests[0];
    expect(primaryRequest?.notebook?.workspaceId).toBe('workspace:focused');
    expect(primaryRequest?.notebook?.activeFileId).toBe('note-2');
    expect(primaryRequest?.input.attachments?.map(attachment => attachment.fileId)).toEqual(['note-2']);
    expect(primaryRequest?.notebook?.knowledgeQuery).toBe('Search the focused runtime notes');
    expect(generateAIResponseMock).not.toHaveBeenCalled();
    expect(generateAIResponseStreamMock).not.toHaveBeenCalled();

    let secondarySession!: AssistantSessionRecord;
    await act(async () => {
      secondarySession = await result.current.createSession({
        routeKey: 'notebook:in-app-assistant:session:secondary',
        title: 'Secondary Session',
      });
    });

    await waitFor(() => {
      expect(result.current.activeSessionId).toBe(secondarySession.sessionId);
    });

    await act(async () => {
      await result.current.handleChatMessage('Second session prompt');
    });

    await waitFor(() => {
      expect(storageHarness.sessionMessages.get(secondarySession.sessionId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Second session prompt', role: 'user' }),
          expect.objectContaining({ content: 'Reply 2', role: 'assistant' }),
        ]),
      );
    });

    await act(async () => {
      await result.current.setActiveSessionId('notebook:in-app-assistant:primary');
    });

    await waitFor(() => {
      expect(result.current.chatMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ content: 'Search the focused runtime notes', role: 'user' }),
          expect.objectContaining({ content: 'Reply 1', role: 'assistant' }),
        ]),
      );
    });

    expect(result.current.chatMessages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: 'Second session prompt' }),
      ]),
    );
  });
});
