import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import type {
  AIConfig,
  AIState,
  AssistantRuntimeEvent,
  AssistantRuntimeRequest,
  ChatMessage,
  MarkdownFile,
  MemoryCandidate,
} from '../../types';
import { createAssistantRuntime as createRuntimeWithRealExecutor } from '../../src/services/assistant-runtime/createAssistantRuntime';

const {
  createAssistantRuntimeMock,
  createNotebookContextAssemblerMock,
  createNotebookToolExecutorMock,
  compactConversationMock,
  createMemoryFromCandidateMock,
  getEmbeddingMock,
  analyzeSessionForMemoryMock,
  initPersistentMemoryMock,
  generateAIResponseMock,
  generateAIResponseStreamMock,
  supportsNativeStreamingToolCallsMock,
} = vi.hoisted(() => ({
  createAssistantRuntimeMock: vi.fn(),
  createNotebookContextAssemblerMock: vi.fn(),
  createNotebookToolExecutorMock: vi.fn(),
  compactConversationMock: vi.fn(),
  createMemoryFromCandidateMock: vi.fn(),
  getEmbeddingMock: vi.fn(),
  analyzeSessionForMemoryMock: vi.fn(),
  initPersistentMemoryMock: vi.fn(),
  generateAIResponseMock: vi.fn(),
  generateAIResponseStreamMock: vi.fn(),
  supportsNativeStreamingToolCallsMock: vi.fn(),
}));

vi.mock('@/src/services/assistant-runtime', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/assistant-runtime')>('@/src/services/assistant-runtime');
  return {
    ...actual,
    createAssistantRuntime: createAssistantRuntimeMock,
    createNotebookContextAssembler: createNotebookContextAssemblerMock,
    createNotebookToolExecutor: createNotebookToolExecutorMock,
  };
});

vi.mock('@/services/aiService', () => ({
  compactConversation: compactConversationMock,
  createMemoryFromCandidate: createMemoryFromCandidateMock,
  analyzeSessionForMemory: analyzeSessionForMemoryMock,
  getEmbedding: getEmbeddingMock,
  initPersistentMemory: initPersistentMemoryMock,
  generateAIResponse: generateAIResponseMock,
  generateAIResponseStream: generateAIResponseStreamMock,
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

function createHookHarness() {
  let chatMessages: ChatMessage[] = [];
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

  return {
    options: {
      aiConfig: baseConfig,
      chatMessages,
      setChatMessages,
      setAiState,
      showToast: vi.fn(),
      vectorStore: {
        hasFilesToIndex: vi.fn().mockResolvedValue(false),
        searchWithResults: vi.fn().mockResolvedValue({
          results: [],
          context: '',
        }),
      },
      filesRef,
      setFiles,
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
    getChatMessages: () => chatMessages,
    getFiles: () => files,
  };
}

async function collectEvents(
  runtime: ReturnType<typeof createRuntimeWithRealExecutor>,
  request: AssistantRuntimeRequest,
) {
  const events: AssistantRuntimeEvent[] = [];
  for await (const event of runtime.execute(request)) {
    events.push(event);
  }
  return events;
}

describe('assistant tool status flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supportsNativeStreamingToolCallsMock.mockReturnValue(false);
    createNotebookContextAssemblerMock.mockReturnValue({
      assemble: vi.fn(),
    });
  });

  it('emits running, success, and error tool states through runtime-owned executor callbacks', async () => {
    const toolExecutor = {
      supports: vi.fn(() => true),
      execute: vi.fn()
        .mockResolvedValueOnce({
          executionId: 'exec-1',
          toolCallId: 'tool-create',
          toolName: 'create_file',
          status: 'success' as const,
          result: {
            success: true,
            message: 'Created file',
          },
        })
        .mockResolvedValueOnce({
          executionId: 'exec-2',
          toolCallId: 'tool-update',
          toolName: 'update_file',
          status: 'error' as const,
          error: {
            code: 'TOOL_EXECUTION_FAILED',
            message: 'File not found',
            retryable: false,
          },
        }),
    };
    const runtime = createRuntimeWithRealExecutor({
      toolExecutor,
      providerExecution: vi.fn(async ({ request, toolsCallback, toolEventCallback }) => {
        toolEventCallback?.({
          id: 'tool-create',
          name: 'create_file',
          args: { filename: 'runtime-note.md', content: 'Created from runtime' },
          provider: 'openai',
          status: 'running',
          startTime: 100,
        });
        const createResult = await toolsCallback?.('create_file', {
          filename: 'runtime-note.md',
          content: 'Created from runtime',
        });
        toolEventCallback?.({
          id: 'tool-create',
          name: 'create_file',
          args: { filename: 'runtime-note.md', content: 'Created from runtime' },
          provider: 'openai',
          status: 'success',
          result: createResult,
          startTime: 100,
          endTime: 120,
        });

        toolEventCallback?.({
          id: 'tool-update',
          name: 'update_file',
          args: { filename: 'missing.md', content: 'Nope' },
          provider: 'openai',
          status: 'running',
          startTime: 121,
        });
        const failedUpdateResult = await toolsCallback?.('update_file', {
          filename: 'missing.md',
          content: 'Nope',
        });
        toolEventCallback?.({
          id: 'tool-update',
          name: 'update_file',
          args: { filename: 'missing.md', content: 'Nope' },
          provider: 'openai',
          status: 'error',
          error: typeof failedUpdateResult === 'object' && failedUpdateResult && 'error' in failedUpdateResult
            ? String(failedUpdateResult.error)
            : 'File not found',
          startTime: 121,
          endTime: 130,
        });

        return {
          outputText: `Tool flow complete for ${request.requestId}`,
          streamed: false,
        };
      }),
    });

    const events = await collectEvents(runtime, {
      requestId: 'request-1',
      session: {
        sessionId: 'session-1',
        scope: 'notebook',
        origin: 'test',
      },
      caller: {
        callerId: 'status-flow-test',
        surface: 'automation',
        transport: 'cli',
        language: 'en',
        capabilities: {
          streaming: false,
          toolStatus: true,
          multimodalInput: false,
        },
      },
      modelConfig: baseConfig,
      input: {
        prompt: 'Run notebook tools',
      },
    });

    const toolEvents = events.filter((event): event is Extract<AssistantRuntimeEvent, { type: 'tool-status' }> => event.type === 'tool-status');
    expect(toolEvents.map(event => `${event.toolName}:${event.status}`)).toEqual([
      'create_file:running',
      'create_file:success',
      'update_file:running',
      'update_file:error',
    ]);
    expect(toolExecutor.execute).toHaveBeenNthCalledWith(1, expect.objectContaining({
      toolName: 'create_file',
      arguments: {
        filename: 'runtime-note.md',
        content: 'Created from runtime',
      },
    }));
    expect(toolExecutor.execute).toHaveBeenNthCalledWith(2, expect.objectContaining({
      toolName: 'update_file',
      arguments: {
        filename: 'missing.md',
        content: 'Nope',
      },
    }));
  });

  it('builds the in-app runtime with a notebook tool executor and executes without callback overrides', async () => {
    const harness = createHookHarness();
    const runtimeExecute = vi.fn(async function* (
      request: AssistantRuntimeRequest,
    ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
      yield {
        type: 'result',
        requestId: request.requestId,
        sessionId: request.session.sessionId,
        timestamp: Date.now(),
        result: {
          status: 'success',
          sessionId: request.session.sessionId,
          outputText: 'Runtime-owned tool bridge',
          completedAt: Date.now(),
        },
      };
    });
    const toolExecutor = {
      supports: vi.fn(() => true),
      execute: vi.fn(),
    };

    createNotebookToolExecutorMock.mockReturnValue(toolExecutor);
    createAssistantRuntimeMock.mockReturnValue({ execute: runtimeExecute });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('Use the runtime tool bridge');
    });

    expect(createNotebookToolExecutorMock).toHaveBeenCalledTimes(1);
    expect(createAssistantRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contextAssembler: expect.any(Object),
        toolExecutor,
      }),
    );
    expect(runtimeExecute).toHaveBeenCalledTimes(1);
    expect(runtimeExecute.mock.calls[0]).toHaveLength(1);
    expect(harness.getChatMessages().at(-1)?.content).toBe('Runtime-owned tool bridge');
  });
});
