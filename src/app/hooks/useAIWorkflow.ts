import { useCallback, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type {
  AIConfig,
  AIState,
  AssistantRuntimeEvent,
  AssistantRuntimeToolInvocation,
  AssistantSessionRecord,
  ChatMessage,
  JsonValue,
  MarkdownFile,
  MemoryCandidate,
  ToolCall,
} from '@/types';
import {
  analyzeSessionForMemory,
  compactConversation,
  createMemoryFromCandidate,
  getEmbedding,
  initPersistentMemory,
} from '@/services/aiService';
import { generateId } from '@/src/app/appDefaults';
import type { AssistantRuntimeInspectionState } from '@/src/app/hooks/useAssistantRuntimeInspection';
import { useAssistantRuntimeInspection } from '@/src/app/hooks/useAssistantRuntimeInspection';
import {
  DEFAULT_ASSISTANT_CONTEXT_SCOPE,
  DEFAULT_INCLUDE_SELECTED_TEXT,
  type AssistantContextScope,
} from '@/src/app/hooks/useAppWorkspaceState';
import { useStreamingToolCalls } from '@/src/hooks/useStreamingToolCalls';
import {
  createAssistantRuntime,
  createNotebookContextAssembler,
  createNotebookToolExecutor,
  resolveAssistantSession,
  type AssistantRuntime,
} from '@/src/services/assistant-runtime';

type LanguageCode = 'zh' | 'en';

interface UseAIWorkflowOptions {
  aiConfig: AIConfig;
  assistantSession?: AssistantSessionRecord | null;
  chatMessages: ChatMessage[];
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setAiState: Dispatch<SetStateAction<AIState>>;
  showToast: (message: string, isError?: boolean) => void;
  vectorStore: {
    hasFilesToIndex: (files: MarkdownFile[]) => Promise<boolean>;
    searchWithResults: (query: string, config: AIConfig, maxResults: number) => Promise<{ results: Array<{ score: number; chunk: { metadata: { fileName: string }; text: string } }>; context: string }>;
  };
  filesRef: MutableRefObject<MarkdownFile[]>;
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  handleIndexKnowledgeBase: (forceList?: MarkdownFile[]) => Promise<void>;
  scheduleStreamingMessageUpdate: (messageId: string, content: string) => void;
  flushStreamingMessageUpdate: () => void;
  maybeYieldToBrowser: () => Promise<void>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  resetStreamYield: () => void;
  setShowCompactMemoryPrompt: Dispatch<SetStateAction<boolean>>;
  compactMemoryCandidate: MemoryCandidate | null;
  setCompactMemoryCandidate: Dispatch<SetStateAction<MemoryCandidate | null>>;
  setIsCompactSaving: Dispatch<SetStateAction<boolean>>;
  saveAssistantSession?: (session: AssistantSessionRecord) => Promise<AssistantSessionRecord>;
  language: LanguageCode;
  workspaceContext?: {
    workspaceId?: string;
    activeFileId?: string;
    selectedFileIds?: string[];
    selectedText?: string;
    contextScope?: AssistantContextScope;
    includeSelectedText?: boolean;
  };
}

interface UseAIWorkflowResult {
  assistantRuntimeInspection: AssistantRuntimeInspectionState;
  handleChatMessage: (text: string) => Promise<void>;
  handleStopStreaming: () => void;
  handleCompactChat: () => Promise<void>;
  handleCompactMemorySave: (editedSummary: string, autoInject: boolean, markImportant: boolean) => Promise<void>;
  handleCompactMemorySkip: () => Promise<void>;
}

const BASE_TOOL_INSTRUCTION = `You are ZhangNote AI assistant with the following tools:
- **read_file**: Read specific file content (use when user wants to read/view a file)
- **search_files**: Search keyword across all files (use when user wants to find/search text)
- **search_knowledge_base**: Semantic search in notes (use for general questions about notes)
- **create_file**, **update_file**, **delete_file**: File management`;

const mergeToolCalls = (existing: ToolCall[] | undefined, incoming: ToolCall): ToolCall[] => {
  const current = existing ? [...existing] : [];
  const index = current.findIndex(call => call.id === incoming.id);
  if (index >= 0) {
    current[index] = { ...current[index], ...incoming };
    return current;
  }
  return [...current, incoming];
};

const toUiToolCall = (
  toolCallId: string,
  toolName: string,
  status: ToolCall['status'],
  result?: JsonValue,
  error?: string,
): ToolCall => ({
  id: toolCallId,
  name: toolName,
  args: {},
  status,
  result,
  error,
});

const toUiResultToolCall = (invocation: AssistantRuntimeToolInvocation): ToolCall =>
  toUiToolCall(
    invocation.toolCallId,
    invocation.toolName,
    invocation.status,
    invocation.result,
    invocation.error?.message,
  );

const toUiMediaToolCall = (
  mediaId: string,
  kind: string,
  status: 'pending' | 'processing' | 'ready' | 'error',
  detail?: string,
  metadata?: Record<string, JsonValue>,
  error?: string,
): ToolCall => ({
  id: `media:${mediaId}`,
  name: `media:${kind}`,
  args: {},
  status: status === 'error'
    ? 'error'
    : status === 'ready'
      ? 'success'
      : 'running',
  result: {
    detail,
    ...(metadata ?? {}),
  },
  error,
});

const toUiDeliveryToolCall = (delivery: JsonValue): ToolCall | undefined => {
  if (!delivery || typeof delivery !== 'object' || Array.isArray(delivery)) {
    return undefined;
  }

  const policy = 'policy' in delivery ? delivery.policy : undefined;
  const units = 'units' in delivery && Array.isArray(delivery.units) ? delivery.units : [];
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return undefined;
  }

  const policyId = 'policyId' in policy && typeof policy.policyId === 'string'
    ? policy.policyId
    : 'delivery';
  const profile = 'metadata' in policy
    && policy.metadata
    && typeof policy.metadata === 'object'
    && !Array.isArray(policy.metadata)
    && 'profile' in policy.metadata
    && typeof policy.metadata.profile === 'string'
      ? policy.metadata.profile
      : 'in-app';

  return {
    id: `delivery:${policyId}`,
    name: `delivery:${profile}`,
    args: {},
    status: 'success',
    result: {
      policyId,
      profile,
      chunkCount: units.length,
      chunks: units.map(unit =>
        typeof unit === 'object' && unit !== null && 'content' in unit
          ? (typeof unit.content === 'string' ? unit.content : '')
          : '',
      ),
    },
  };
};

const findNotebookFile = (files: MarkdownFile[], reference?: string): MarkdownFile | undefined => {
  if (!reference) {
    return undefined;
  }

  return files.find(file =>
    file.id === reference ||
    file.path === reference ||
    file.name === reference ||
    file.name === reference.replace(/\.md$/i, '') ||
    file.path?.endsWith(reference),
  );
};

const toNotebookAttachment = (file: MarkdownFile) => ({
  kind: 'file' as const,
  fileId: file.id,
  uri: file.path,
  label: file.name,
  mimeType: file.path?.endsWith('.md') ? 'text/markdown' : undefined,
  metadata: file.path ? { path: file.path } : undefined,
});

export const useAIWorkflow = ({
  aiConfig,
  assistantSession,
  chatMessages,
  setChatMessages,
  setAiState,
  showToast,
  vectorStore,
  filesRef,
  setFiles,
  handleIndexKnowledgeBase,
  scheduleStreamingMessageUpdate,
  flushStreamingMessageUpdate,
  maybeYieldToBrowser,
  setIsStreaming,
  abortControllerRef,
  resetStreamYield,
  setShowCompactMemoryPrompt,
  compactMemoryCandidate,
  setCompactMemoryCandidate,
  setIsCompactSaving,
  saveAssistantSession,
  language,
  workspaceContext,
}: UseAIWorkflowOptions): UseAIWorkflowResult => {
  const {
    upsertToolCall: upsertStreamingToolCall,
    replaceToolCalls: replaceStreamingToolCalls,
    resetToolCalls: resetStreamingToolCalls,
    getToolCalls: getStreamingToolCalls
  } = useStreamingToolCalls();
  const {
    assistantRuntimeInspection,
    beginAssistantRuntimeInspection,
    applyRuntimeInspectionEvent,
    applyRuntimeInspectionResult,
    markAssistantRuntimeInspectionCancelled,
    markAssistantRuntimeInspectionError,
  } = useAssistantRuntimeInspection();

  const aiConfigRef = useRef(aiConfig);
  aiConfigRef.current = aiConfig;

  const runtimeRef = useRef<AssistantRuntime | null>(null);
  if (!runtimeRef.current) {
    const contextAssembler = createNotebookContextAssembler({
      notebookNotes: {
        getFiles: () => filesRef.current,
      },
      workspaceState: {
        getWorkspaceState: input => {
          const files = filesRef.current;
          const selectedFiles = (input.selectedFileIds ?? [])
            .map(fileId => findNotebookFile(files, fileId))
            .filter((file): file is MarkdownFile => Boolean(file));
          const activeFile = findNotebookFile(files, input.activeFileId);

          return {
            notebookId: input.notebookId,
            workspaceId: input.workspaceId,
            activeFileId: input.activeFileId,
            activeFileName: activeFile?.name,
            selectedFileIds: input.selectedFileIds,
            selectedFileNames: selectedFiles.map(file => file.name),
            selectedText: input.selectedText,
          };
        },
      },
      knowledge: {
        getKnowledgeContext: async input => {
          const knowledgeQuery = input.knowledgeQuery?.trim();
          if (!knowledgeQuery) {
            return undefined;
          }

          if (await vectorStore.hasFilesToIndex(filesRef.current)) {
            await handleIndexKnowledgeBase(filesRef.current);
          }

          const ragResponse = await vectorStore.searchWithResults(
            knowledgeQuery,
            aiConfigRef.current,
            5,
          );

          return {
            context: ragResponse.context,
            results: ragResponse.results,
          };
        },
      },
    });

    const toolExecutor = createNotebookToolExecutor({
      aiConfig,
      getAiConfig: () => aiConfigRef.current,
      files: {
        getFiles: () => filesRef.current,
        setFiles,
        createId: generateId,
      },
      knowledge: {
        prepareSearch: async () => {
          if (await vectorStore.hasFilesToIndex(filesRef.current)) {
            await handleIndexKnowledgeBase(filesRef.current);
          }
        },
        search: (query, maxResults, config) =>
          vectorStore.searchWithResults(query, config, maxResults),
      },
      mcp: {
        callTool: async (toolName, args) => {
          const mcpResult = await window.electronAPI?.mcp?.callTool(toolName, args);
          if (mcpResult?.success) {
            return mcpResult.result as JsonValue;
          }

          throw new Error(mcpResult?.error || `Tool ${toolName} failed`);
        },
      },
    });

    runtimeRef.current = createAssistantRuntime({
      contextAssembler,
      toolExecutor,
    });
  }
  const stopRequestedRef = useRef(false);

  const resolveWorkspaceFiles = useCallback((files: MarkdownFile[]) => {
    const resolvedContextScope = workspaceContext?.contextScope ?? DEFAULT_ASSISTANT_CONTEXT_SCOPE;
    const activeFile = findNotebookFile(files, workspaceContext?.activeFileId);
    const selectedFiles = (workspaceContext?.selectedFileIds ?? [])
      .map(fileId => findNotebookFile(files, fileId))
      .filter((file): file is MarkdownFile => Boolean(file));

    const dedupedSelectedFiles = selectedFiles.filter((file, index, current) =>
      current.findIndex(candidate => candidate.id === file.id) === index,
    );

    const openPaneFiles = dedupedSelectedFiles.length > 0
      ? dedupedSelectedFiles
      : activeFile
        ? [activeFile]
        : files[0]
          ? [files[0]]
          : [];
    const scopedFiles = resolvedContextScope === 'focused-note'
      ? activeFile
        ? [activeFile]
        : openPaneFiles.slice(0, 1)
      : openPaneFiles;

    const resolvedActiveFile = activeFile ?? scopedFiles[0];

    return {
      activeFile: resolvedActiveFile,
      scopedFiles,
    };
  }, [workspaceContext?.activeFileId, workspaceContext?.contextScope, workspaceContext?.selectedFileIds]);

  const updateAssistantToolCall = useCallback((messageId: string, toolCall: ToolCall) => {
    upsertStreamingToolCall(toolCall);
    const updatedToolCalls = getStreamingToolCalls();
    setChatMessages(prev => prev.map(message =>
      message.id === messageId
        ? { ...message, toolCalls: updatedToolCalls }
        : message
    ));
  }, [getStreamingToolCalls, setChatMessages, upsertStreamingToolCall]);

  const applyRuntimeResult = useCallback((
    messageId: string,
    outputText: string,
    toolCalls?: AssistantRuntimeToolInvocation[],
    metadata?: Record<string, JsonValue>,
  ) => {
    const mergedToolCalls = getStreamingToolCalls().reduce<ToolCall[]>(
      (current, call) => mergeToolCalls(current, call),
      [],
    );

    if (toolCalls) {
      toolCalls
        .map(toUiResultToolCall)
        .forEach(toolCall => {
          mergedToolCalls.splice(0, mergedToolCalls.length, ...mergeToolCalls(mergedToolCalls, toolCall));
        });
    }

    const deliveryToolCall = toUiDeliveryToolCall(metadata?.delivery);
    if (deliveryToolCall) {
      mergedToolCalls.splice(
        0,
        mergedToolCalls.length,
        ...mergeToolCalls(mergedToolCalls, deliveryToolCall),
      );
    }

    if (mergedToolCalls.length > 0) {
      replaceStreamingToolCalls(mergedToolCalls);
    }

    setChatMessages(prev => prev.map(message =>
      message.id === messageId
        ? {
            ...message,
            content: outputText,
            toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : message.toolCalls,
          }
        : message
    ));
  }, [getStreamingToolCalls, replaceStreamingToolCalls, setChatMessages]);

  const handleStopStreaming = useCallback(() => {
    stopRequestedRef.current = true;
    flushStreamingMessageUpdate();
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setAiState(prev => ({ ...prev, isThinking: false }));
    markAssistantRuntimeInspectionCancelled('Streaming stopped by user.');
  }, [
    abortControllerRef,
    flushStreamingMessageUpdate,
    markAssistantRuntimeInspectionCancelled,
    setAiState,
    setIsStreaming,
  ]);

  const handleChatMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, userMsg]);

    const aiMessageId = generateId();
    const aiMsg: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, aiMsg]);

    try {
      const historyForAI = chatMessages
        .filter(m => !m.ragResults)
        .slice(-20);

      stopRequestedRef.current = false;
      resetStreamingToolCalls();
      abortControllerRef.current = new AbortController();

      if (aiConfig.enableStreaming) {
        setIsStreaming(true);
        setAiState({ isThinking: false, message: null, error: null });
        resetStreamYield();
      }

      const requestId = generateId();
      const resolvedSession = resolveAssistantSession({
        caller: {
          callerId: 'in-app-assistant',
          surface: 'app-chat',
          transport: 'in-app',
          routeKey: assistantSession?.route.routeKey,
        },
        metadata: assistantSession?.metadata,
        notebookId: assistantSession?.notebookId ?? 'in-app-notebook',
        now: userMsg.timestamp,
        participantIds: assistantSession?.route.participantIds,
        participants: assistantSession?.route.participants,
        replyContext: assistantSession?.replyContext,
        routeKind: assistantSession?.route.kind,
        routeMetadata: assistantSession?.route.metadata,
        session: assistantSession ? {
          scope: assistantSession.scope,
          origin: assistantSession.origin,
          parentSessionId: assistantSession.parentSessionId,
        } : undefined,
        sessionId: assistantSession?.sessionId,
        startedAt: assistantSession?.startedAt,
        threadId: assistantSession?.threadId ?? assistantSession?.route.threadId,
        title: assistantSession?.title ?? 'Primary App Session',
        transport: {
          channel: 'electron-ipc',
        },
        updatedAt: userMsg.timestamp,
        workspaceId: assistantSession?.workspaceId,
      });
      const runtimeSession = {
        ...resolvedSession.session,
        lastMessageAt: userMsg.timestamp,
        updatedAt: userMsg.timestamp,
      };

      if (saveAssistantSession) {
        await saveAssistantSession(runtimeSession);
      }

      const { activeFile, scopedFiles } = resolveWorkspaceFiles(filesRef.current);
      const selectedText = (workspaceContext?.includeSelectedText ?? DEFAULT_INCLUDE_SELECTED_TEXT)
        ? workspaceContext?.selectedText
        : undefined;
      const notebookAttachments = scopedFiles.map(toNotebookAttachment);
      const runtimeRequest = {
        requestId,
        session: {
          sessionId: runtimeSession.sessionId,
          threadId: runtimeSession.threadId,
          scope: runtimeSession.scope,
          origin: runtimeSession.origin,
          parentSessionId: runtimeSession.parentSessionId,
        },
        caller: {
          callerId: 'in-app-assistant',
          surface: 'app-chat' as const,
          transport: 'in-app' as const,
          routeKey: resolvedSession.route.routeKey,
          language,
          capabilities: {
            streaming: Boolean(aiConfig.enableStreaming),
            toolStatus: true,
            multimodalInput: true,
          },
        },
        modelConfig: aiConfig,
        input: {
          prompt: text,
          attachments: notebookAttachments,
          messages: historyForAI.map(message => ({
            role: message.role,
            content: message.content,
          })),
          instructions: [BASE_TOOL_INSTRUCTION],
          locale: language,
        },
        notebook: {
          notebookId: runtimeSession.notebookId ?? 'in-app-notebook',
          workspaceId: workspaceContext?.workspaceId ?? runtimeSession.workspaceId,
          activeFileId: activeFile?.id,
          selectedFileIds: scopedFiles.map(file => file.id),
          selectedText,
          attachments: notebookAttachments,
          knowledgeQuery: text,
        },
      };

      beginAssistantRuntimeInspection({
        requestId,
        session: runtimeRequest.session,
        routeKey: runtimeRequest.caller.routeKey,
        callerId: runtimeRequest.caller.callerId,
        surface: runtimeRequest.caller.surface,
        transport: runtimeRequest.caller.transport,
      });

      for await (const event of runtimeRef.current!.execute(runtimeRequest)) {
        if (stopRequestedRef.current) {
          break;
        }

        applyRuntimeInspectionEvent(event);

        if (event.type === 'stream-delta') {
          scheduleStreamingMessageUpdate(aiMessageId, event.accumulatedText);
          await maybeYieldToBrowser();
          continue;
        }

        if (event.type === 'tool-status') {
          updateAssistantToolCall(
            aiMessageId,
            toUiToolCall(
              event.toolCallId,
              event.toolName,
              event.status,
              event.result,
              event.error?.message,
            ),
          );
          continue;
        }

        if (event.type === 'media-status') {
          updateAssistantToolCall(
            aiMessageId,
            toUiMediaToolCall(
              event.mediaId,
              event.kind,
              event.status,
              event.detail,
              event.metadata,
              event.error?.message,
            ),
          );
          continue;
        }

        if (event.type === 'result') {
          applyRuntimeInspectionResult(event.result);
          flushStreamingMessageUpdate();
          applyRuntimeResult(
            aiMessageId,
            event.result.outputText,
            event.result.toolCalls,
            event.result.metadata,
          );
          if (saveAssistantSession) {
            await saveAssistantSession({
              ...runtimeSession,
              updatedAt: event.result.completedAt,
              lastMessageAt: event.result.completedAt,
            });
          }
          continue;
        }

        if (event.type === 'error') {
          throw new Error(event.error.message);
        }
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Chat error';
      console.error('Chat error:', err);
      setAiState({ isThinking: false, message: null, error: message });
      markAssistantRuntimeInspectionError(message);

      setChatMessages(prev => prev.map(msg =>
        msg.id === aiMessageId
          ? { ...msg, content: `**Error**: ${message}` }
          : msg
      ));
    } finally {
      flushStreamingMessageUpdate();
      setIsStreaming(false);
      abortControllerRef.current = null;
      stopRequestedRef.current = false;
    }
  }, [
    assistantSession,
    abortControllerRef,
    aiConfig,
    applyRuntimeResult,
    chatMessages,
    filesRef,
    flushStreamingMessageUpdate,
    language,
    maybeYieldToBrowser,
    resetStreamYield,
    resetStreamingToolCalls,
    scheduleStreamingMessageUpdate,
    saveAssistantSession,
    applyRuntimeInspectionEvent,
    applyRuntimeInspectionResult,
    beginAssistantRuntimeInspection,
    markAssistantRuntimeInspectionError,
    resolveWorkspaceFiles,
    setAiState,
    setChatMessages,
    setIsStreaming,
    updateAssistantToolCall,
    workspaceContext?.includeSelectedText,
    workspaceContext?.workspaceId,
  ]);

  const performCompact = useCallback(async () => {
    setAiState({ isThinking: true, message: 'Summarizing conversation...', error: null });
    try {
      const compacted = await compactConversation(chatMessages, aiConfig);
      setChatMessages(compacted);
      showToast('Context compacted.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Compaction failed';
      showToast(message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [aiConfig, chatMessages, setAiState, setChatMessages, showToast]);

  const handleCompactChat = useCallback(async () => {
    if (chatMessages.length <= 3) {
      showToast('Not enough history to compact.', true);
      return;
    }

    if (chatMessages.length >= 5) {
      setAiState({ isThinking: true, message: 'Analyzing conversation...', error: null });

      try {
        const candidate = analyzeSessionForMemory(
          chatMessages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: m.timestamp
          }))
        );

        setCompactMemoryCandidate(candidate);
        setShowCompactMemoryPrompt(true);
        setAiState(prev => ({ ...prev, isThinking: false, message: null }));
      } catch (error: unknown) {
        console.error('[CompactChat] Analysis failed:', error);
        await performCompact();
      }
    } else {
      await performCompact();
    }
  }, [chatMessages, performCompact, setAiState, setCompactMemoryCandidate, setShowCompactMemoryPrompt, showToast]);

  const handleCompactMemorySave = useCallback(async (editedSummary: string, autoInject: boolean, markImportant: boolean) => {
    if (!compactMemoryCandidate) return;
    void autoInject;
    void markImportant;

    setIsCompactSaving(true);
    try {
      const sessionId = `session_${Date.now()}`;

      const embeddingService = async (text: string): Promise<number[]> => {
        try {
          return await getEmbedding(text, aiConfig);
        } catch (error) {
          console.warn('[CompactMemory] Embedding failed:', error);
          return [];
        }
      };

      await initPersistentMemory();

      const memory = await createMemoryFromCandidate(
        sessionId,
        compactMemoryCandidate,
        editedSummary,
        embeddingService
      );

      if (memory) {
        showToast(language === 'zh'
          ? `已创建永久记忆: ${memory.topics.slice(0, 2).join(', ')}`
          : `Created permanent memory: ${memory.topics.slice(0, 2).join(', ')}`);
      }

      setShowCompactMemoryPrompt(false);
      setCompactMemoryCandidate(null);
      await performCompact();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save memory';
      showToast(message, true);
    } finally {
      setIsCompactSaving(false);
    }
  }, [
    aiConfig,
    compactMemoryCandidate,
    language,
    performCompact,
    setCompactMemoryCandidate,
    setIsCompactSaving,
    setShowCompactMemoryPrompt,
    showToast
  ]);

  const handleCompactMemorySkip = useCallback(async () => {
    setShowCompactMemoryPrompt(false);
    setCompactMemoryCandidate(null);
    await performCompact();
  }, [performCompact, setCompactMemoryCandidate, setShowCompactMemoryPrompt]);

  return {
    assistantRuntimeInspection,
    handleChatMessage,
    handleStopStreaming,
    handleCompactChat,
    handleCompactMemorySave,
    handleCompactMemorySkip
  };
};
