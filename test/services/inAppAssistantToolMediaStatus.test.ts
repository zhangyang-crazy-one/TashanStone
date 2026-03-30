import { act, renderHook, waitFor } from '@testing-library/react';
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
  };
}

describe('in-app assistant tool media status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supportsNativeStreamingToolCallsMock.mockReturnValue(false);
    createNotebookContextAssemblerMock.mockReturnValue({
      assemble: vi.fn(),
    });
    createNotebookToolExecutorMock.mockReturnValue({
      supports: vi.fn(() => true),
      execute: vi.fn(),
    });
  });

  it('surfaces media and delivery states through the existing in-app tool call stream', async () => {
    const harness = createHookHarness();
    const runtimeExecute = vi.fn(async function* (
      request: AssistantRuntimeRequest,
    ): AsyncGenerator<AssistantRuntimeEvent, void, void> {
      expect(request.caller.capabilities.multimodalInput).toBe(true);
      expect(request.input.attachments?.length).toBeGreaterThan(0);

      yield {
        type: 'media-status',
        requestId: request.requestId,
        sessionId: request.session.sessionId,
        timestamp: Date.now(),
        mediaId: 'image-1',
        kind: 'image',
        status: 'processing',
        detail: 'Running OCR',
      };
      yield {
        type: 'media-status',
        requestId: request.requestId,
        sessionId: request.session.sessionId,
        timestamp: Date.now(),
        mediaId: 'image-1',
        kind: 'image',
        status: 'ready',
        detail: 'OCR complete',
      };
      yield {
        type: 'tool-status',
        requestId: request.requestId,
        sessionId: request.session.sessionId,
        timestamp: Date.now(),
        toolCallId: 'tool-1',
        toolName: 'search_knowledge_base',
        status: 'success',
        result: { matches: 2 },
      };
      yield {
        type: 'result',
        requestId: request.requestId,
        sessionId: request.session.sessionId,
        timestamp: Date.now(),
        result: {
          status: 'success',
          sessionId: request.session.sessionId,
          outputText: 'Visible status proof',
          completedAt: Date.now(),
          metadata: {
            delivery: {
              policy: {
                policyId: 'in-app-default',
                metadata: { profile: 'in-app' },
              },
              units: [
                { unitId: '1', content: 'Chunk 1' },
                { unitId: '2', content: 'Chunk 2' },
              ],
            },
          },
        },
      };
    });

    createAssistantRuntimeMock.mockReturnValue({ execute: runtimeExecute });

    const { result } = renderHook(() => useAIWorkflow(harness.options));

    await act(async () => {
      await result.current.handleChatMessage('Show status');
    });

    await waitFor(() => {
      const toolCalls = harness.getChatMessages().at(-1)?.toolCalls ?? [];
      expect(toolCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'media:image',
            status: 'success',
          }),
          expect.objectContaining({
            name: 'search_knowledge_base',
            status: 'success',
          }),
          expect.objectContaining({
            name: 'delivery:in-app',
            status: 'success',
            result: expect.objectContaining({
              chunkCount: 2,
            }),
          }),
        ]),
      );
    });
  });
});
