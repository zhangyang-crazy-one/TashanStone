import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import type {
  AIConfig,
  AIState,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
  ChatMessage,
  JsonValue,
  MarkdownFile,
  MemoryCandidate,
  ToolCall,
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

vi.mock('@/src/services/assistant-runtime', () => ({
  createAssistantRuntime: createAssistantRuntimeMock,
  createNotebookContextAssembler: createNotebookContextAssemblerMock,
}));

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

interface HookHarness {
  options: Parameters<typeof useAIWorkflow>[0];
  getChatMessages: () => ChatMessage[];
  getFiles: () => MarkdownFile[];
  getAiState: () => AIState[];
  getStreamingStates: () => boolean[];
  filesRef: MutableRefObject<MarkdownFile[]>;
  vectorStore: {
    hasFilesToIndex: ReturnType<typeof vi.fn>;
    searchWithResults: ReturnType<typeof vi.fn>;
  };
  handleIndexKnowledgeBase: ReturnType<typeof vi.fn>;
  abortControllerRef: MutableRefObject<AbortController | null>;
}

const baseConfig: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  temperature: 0.4,
  language: 'en',
  enableStreaming: true,
  mcpTools: '[]',
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });

  return { promise, resolve };
}

function createAssistantMessage(messageId: string, content: string): ChatMessage {
  return {
    id: messageId,
    role: 'assistant',
    content,
    timestamp: Date.now(),
  };
}

function createStreamEvent(
  requestId: string,
  sessionId: string,
  delta: string,
  accumulatedText: string,
): AssistantRuntimeEvent {
  return {
    type: 'stream-delta',
    requestId,
    sessionId,
    timestamp: Date.now(),
    delta,
    accumulatedText,
  };
}

function createToolEvent(
  requestId: string,
  sessionId: string,
  toolCallId: string,
  toolName: string,
  status: ToolCall['status'],
  result?: JsonValue,
): AssistantRuntimeEvent {
  return {
    type: 'tool-status',
    requestId,
    sessionId,
    timestamp: Date.now(),
    toolCallId,
    toolName,
    status,
    result,
  };
}

function createResultEvent(
  requestId: string,
  sessionId: string,
  outputText: string,
  toolCalls?: Array<{ toolCallId: string; toolName: string; status: ToolCall['status']; result?: JsonValue }>,
): AssistantRuntimeEvent {
  return {
    type: 'result',
    requestId,
    sessionId,
    timestamp: Date.now(),
    result: {
      status: 'success',
      sessionId,
      outputText,
      completedAt: Date.now(),
      toolCalls: toolCalls?.map(toolCall => ({
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        status: toolCall.status,
        result: toolCall.result,
      })),
    },
  };
}

function createHookHarness(initialMessages: ChatMessage[] = []): HookHarness {
  let chatMessages = [...initialMessages];
  let files: MarkdownFile[] = [
    {
      id: 'file-1',
      name: 'Daily Note',
      content: 'Architecture notes',
      lastModified: 10,
      path: 'Daily Note.md',
    },
  ];
  const aiStates: AIState[] = [];
  const streamingStates: boolean[] = [];
  const filesRef = { current: files } as MutableRefObject<MarkdownFile[]>;
  const abortControllerRef = { current: null } as MutableRefObject<AbortController | null>;

  const setChatMessages = vi.fn(update => {
    chatMessages = typeof update === 'function' ? update(chatMessages) : update;
  });
  const setAiState = vi.fn(update => {
    const next = typeof update === 'function'
      ? update(aiStates.at(-1) ?? { isThinking: false, error: null, message: null })
      : update;
    aiStates.push(next);
  });
  const setFiles = vi.fn(update => {
    files = typeof update === 'function' ? update(files) : update;
    filesRef.current = files;
  });
  const setIsStreaming = vi.fn((update: boolean | ((value: boolean) => boolean)) => {
    const next = typeof update === 'function'
      ? update(streamingStates.at(-1) ?? false)
      : update;
    streamingStates.push(next);
  });

  const vectorStore = {
    hasFilesToIndex: vi.fn().mockResolvedValue(false),
    searchWithResults: vi.fn().mockResolvedValue({
      results: [
        {
          score: 0.92,
          chunk: {
            metadata: { fileName: 'Daily Note.md' },
            text: 'Runtime extraction details',
          },
        },
      ],
      context: 'Runtime extraction details',
    }),
  };

  const handleIndexKnowledgeBase = vi.fn().mockResolvedValue(undefined);

  return {
    options: {
      aiConfig: baseConfig,
      chatMessages,
      setChatMessages,
      setAiState,
      showToast: vi.fn(),
      vectorStore,
      filesRef,
      setFiles,
      handleIndexKnowledgeBase,
      scheduleStreamingMessageUpdate: (messageId: string, content: string) => {
        chatMessages = chatMessages.map(message =>
          message.id === messageId ? { ...message, content } : message,
        );
      },
      flushStreamingMessageUpdate: vi.fn(),
      maybeYieldToBrowser: vi.fn().mockResolvedValue(undefined),
      setIsStreaming,
      abortControllerRef,
      resetStreamYield: vi.fn(),
      setShowCompactMemoryPrompt: vi.fn(),
      compactMemoryCandidate: null as MemoryCandidate | null,
      setCompactMemoryCandidate: vi.fn(),
      setIsCompactSaving: vi.fn(),
      language: 'en',
    },
    getChatMessages: () => chatMessages,
    getFiles: () => files,
    getAiState: () => aiStates,
    getStreamingStates: () => streamingStates,
    filesRef,
    vectorStore,
    handleIndexKnowledgeBase,
    abortControllerRef,
  };
}

describe('in-app assistant runtime adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supportsNativeStreamingToolCallsMock.mockReturnValue(false);
    createNotebookContextAssemblerMock.mockReturnValue({
      assemble: vi.fn(),
    });
  });

  it('invokes the shared runtime instead of direct aiService execution from the hook', async () => {
    const harness = createHookHarness([
      {
        id: 'history-user',
        role: 'user',
        content: 'Previous notebook question',
        timestamp: 1,
      },
      createAssistantMessage('history-assistant', 'Previous notebook answer'),
    ]);

    const runtimeExecute = vi.fn(async function* (
      request: AssistantRuntimeRequest,
    ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
      expect(request.input.prompt).toBe('Summarize my notebook');
      expect(request.caller.surface).toBe('app-chat');
      expect(request.caller.transport).toBe('in-app');
      expect(request.modelConfig).toEqual(baseConfig);

      yield createStreamEvent(request.requestId, request.session.sessionId, 'Runtime ', 'Runtime ');
      yield createResultEvent(request.requestId, request.session.sessionId, 'Runtime answer');
    });

    createAssistantRuntimeMock.mockReturnValue({ execute: runtimeExecute });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('Summarize my notebook');
    });

    expect(createAssistantRuntimeMock).toHaveBeenCalledTimes(1);
    expect(runtimeExecute).toHaveBeenCalledTimes(1);
    expect(generateAIResponseMock).not.toHaveBeenCalled();
    expect(generateAIResponseStreamMock).not.toHaveBeenCalled();
    expect(harness.getChatMessages().at(-1)?.content).toBe('Runtime answer');
  });

  it('translates runtime streaming and tool-status events while preserving stop behavior for the UI', async () => {
    const harness = createHookHarness();
    const release = createDeferred<void>();

    const runtimeExecute = vi.fn(async function* (
      request: AssistantRuntimeRequest,
    ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
      yield createStreamEvent(request.requestId, request.session.sessionId, 'First chunk', 'First chunk');
      yield createToolEvent(
        request.requestId,
        request.session.sessionId,
        'tool-1',
        'search_knowledge_base',
        'running',
      );
      await release.promise;
    });

    createAssistantRuntimeMock.mockReturnValue({ execute: runtimeExecute });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.handleChatMessage('Stream this');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(harness.getChatMessages().at(-1)?.content).toBe('First chunk');
      expect(harness.getChatMessages().at(-1)?.toolCalls).toEqual([
        expect.objectContaining({
          id: 'tool-1',
          name: 'search_knowledge_base',
          status: 'running',
        }),
      ]);
    });

    act(() => {
      result.current.handleStopStreaming();
    });

    expect(harness.abortControllerRef.current?.signal.aborted).toBe(true);
    expect(harness.getStreamingStates()).toContain(false);
    expect(harness.getAiState()).toContainEqual(
      expect.objectContaining({
        isThinking: false,
      }),
    );

    release.resolve();
    await act(async () => {
      await pending;
    });
  });

  it('keeps notebook file mutations and knowledge search functional through the runtime tool bridge', async () => {
    const harness = createHookHarness();

    const runtimeExecute = vi.fn(async function* (
      request: AssistantRuntimeRequest,
      options?: { toolsCallback?: (name: string, args: Record<string, JsonValue>) => Promise<JsonValue> },
    ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
      const createResult = await options?.toolsCallback?.('create_file', {
        filename: 'runtime-note.md',
        content: 'Created from runtime',
      });
      const searchResult = await options?.toolsCallback?.('search_knowledge_base', {
        query: 'runtime bridge',
        maxResults: 5,
      });

      yield createToolEvent(
        request.requestId,
        request.session.sessionId,
        'tool-create',
        'create_file',
        'success',
        createResult,
      );
      yield createToolEvent(
        request.requestId,
        request.session.sessionId,
        'tool-search',
        'search_knowledge_base',
        'success',
        searchResult,
      );
      yield createResultEvent(request.requestId, request.session.sessionId, 'Notebook actions complete', [
        {
          toolCallId: 'tool-create',
          toolName: 'create_file',
          status: 'success',
          result: createResult,
        },
        {
          toolCallId: 'tool-search',
          toolName: 'search_knowledge_base',
          status: 'success',
          result: searchResult,
        },
      ]);
    });

    createAssistantRuntimeMock.mockReturnValue({ execute: runtimeExecute });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('Update my notebook');
    });

    expect(harness.getFiles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'runtime-note',
          path: 'runtime-note.md',
          content: 'Created from runtime',
        }),
      ]),
    );
    expect(harness.vectorStore.searchWithResults).toHaveBeenCalledWith(
      'runtime bridge',
      baseConfig,
      5,
    );
    expect(harness.getChatMessages().at(-1)?.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tool-create',
          name: 'create_file',
          status: 'success',
        }),
        expect.objectContaining({
          id: 'tool-search',
          name: 'search_knowledge_base',
          status: 'success',
        }),
      ]),
    );
  });

  it('builds the in-app runtime with a production context assembler wired to notebook and knowledge dependencies', async () => {
    const harness = createHookHarness();
    const contextAssembler = {
      assemble: vi.fn(),
    };
    createNotebookContextAssemblerMock.mockReturnValue(contextAssembler);
    createAssistantRuntimeMock.mockReturnValue({
      execute: vi.fn(async function* (): AsyncGenerator<AssistantRuntimeEvent, void, void> {}),
    });

    renderHook(() => useAIWorkflow(harness.options));

    expect(createNotebookContextAssemblerMock).toHaveBeenCalledTimes(1);
    expect(createAssistantRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contextAssembler,
      }),
    );

    const assemblerInput = createNotebookContextAssemblerMock.mock.calls[0]?.[0];
    expect(assemblerInput).toEqual(
      expect.objectContaining({
        notebookNotes: expect.any(Object),
        workspaceState: expect.any(Object),
        knowledge: expect.any(Object),
      }),
    );

    const notebook = {
      notebookId: 'in-app-notebook',
      workspaceId: 'workspace-7',
      activeFileId: 'file-1',
      selectedFileIds: ['file-1'],
      selectedText: 'Architecture notes',
      knowledgeQuery: 'runtime bridge',
    };

    await expect(assemblerInput.notebookNotes.getFiles(notebook)).resolves.toEqual(harness.getFiles());
    await expect(assemblerInput.workspaceState.getWorkspaceState(notebook)).resolves.toEqual(
      expect.objectContaining({
        activeFileId: 'file-1',
        activeFileName: 'Daily Note',
        selectedFileIds: ['file-1'],
        selectedFileNames: ['Daily Note'],
        selectedText: 'Architecture notes',
      }),
    );

    harness.vectorStore.hasFilesToIndex.mockResolvedValue(true);
    await assemblerInput.knowledge.getKnowledgeContext(notebook);

    expect(harness.handleIndexKnowledgeBase).toHaveBeenCalledWith(harness.filesRef.current);
    expect(harness.vectorStore.searchWithResults).toHaveBeenCalledWith(
      'runtime bridge',
      baseConfig,
      5,
    );
  });
});
