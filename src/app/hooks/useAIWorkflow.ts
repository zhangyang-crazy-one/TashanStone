import { useCallback, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type {
  AIConfig,
  AIState,
  AssistantRuntimeEvent,
  AssistantRuntimeToolInvocation,
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
import { useStreamingToolCalls } from '@/src/hooks/useStreamingToolCalls';
import { createAssistantRuntime } from '@/src/services/assistant-runtime';

type LanguageCode = 'zh' | 'en';

interface UseAIWorkflowOptions {
  aiConfig: AIConfig;
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
  language: LanguageCode;
}

interface UseAIWorkflowResult {
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

export const useAIWorkflow = ({
  aiConfig,
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
  language
}: UseAIWorkflowOptions): UseAIWorkflowResult => {
  const {
    upsertToolCall: upsertStreamingToolCall,
    replaceToolCalls: replaceStreamingToolCalls,
    resetToolCalls: resetStreamingToolCalls,
    getToolCalls: getStreamingToolCalls
  } = useStreamingToolCalls();

  const runtimeRef = useRef(createAssistantRuntime());
  const stopRequestedRef = useRef(false);

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
  ) => {
    if (toolCalls) {
      replaceStreamingToolCalls(toolCalls.map(toUiResultToolCall));
    }

    setChatMessages(prev => prev.map(message =>
      message.id === messageId
        ? {
            ...message,
            content: outputText,
            toolCalls: toolCalls ? getStreamingToolCalls() : message.toolCalls,
          }
        : message
    ));
  }, [getStreamingToolCalls, replaceStreamingToolCalls, setChatMessages]);

  const executeToolUnified = useCallback(async (toolName: string, args: Record<string, JsonValue>): Promise<{ success: boolean; result: JsonValue; formatted: string }> => {
    console.log('[Tool] Executing:', toolName, args);
    const getString = (value: JsonValue | undefined): string =>
      typeof value === 'string' ? value : '';
    const getNumber = (value: JsonValue | undefined): number | undefined =>
      typeof value === 'number' ? value : undefined;

    if (toolName === 'search_knowledge_base') {
      try {
        if (await vectorStore.hasFilesToIndex(filesRef.current)) {
          await handleIndexKnowledgeBase();
        }
        const maxResultsValue = getNumber(args.maxResults) ?? 5;
        const maxResults = Math.min(maxResultsValue, 8);
        const ragResponse = await vectorStore.searchWithResults(
          getString(args.query),
          aiConfig,
          maxResults
        );

        const result: JsonValue = {
          success: true,
          query: getString(args.query),
          matchCount: ragResponse.results.length,
          sources: ragResponse.results.map(r => ({
            file: r.chunk.metadata.fileName,
            relevance: Math.round(r.score * 100) + '%',
            excerpt: r.chunk.text.substring(0, 100).replace(/\n/g, ' ').trim() + '...'
          })),
          summary: ragResponse.context.length > 500
            ? ragResponse.context.substring(0, 500) + '...(truncated)'
            : ragResponse.context
        };
        return { success: true, result, formatted: JSON.stringify(result) };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, result: { error: message }, formatted: JSON.stringify({ success: false, error: message }) };
      }
    }

    if (toolName === 'create_file') {
      const filename = getString(args.filename);
      const content = getString(args.content);
      if (!filename) {
        return { success: false, result: { error: 'Missing filename' }, formatted: JSON.stringify({ success: false, error: 'Missing filename' }) };
      }
      const newFile: MarkdownFile = {
        id: generateId(),
        name: filename.replace('.md', ''),
        content,
        lastModified: Date.now(),
        path: filename
      };
      setFiles(prev => [...prev, newFile]);
      const result: JsonValue = { success: true, message: `Created file: ${filename}` };
      return { success: true, result, formatted: JSON.stringify(result) };
    }

    if (toolName === 'update_file') {
      const filename = getString(args.filename);
      const content = getString(args.content);
      const targetFile = filesRef.current.find(f =>
        f.name === filename.replace('.md', '') ||
        f.name === filename ||
        f.path === filename ||
        f.path?.endsWith(filename)
      );

      if (targetFile) {
        setFiles(prev => prev.map(f =>
          f.id === targetFile.id
            ? { ...f, content, lastModified: Date.now() }
            : f
        ));
        const result: JsonValue = { success: true, message: `Updated file: ${filename}` };
        return { success: true, result, formatted: JSON.stringify(result) };
      }
      return { success: false, result: { error: 'File not found' }, formatted: JSON.stringify({ success: false, error: 'File not found' }) };
    }

    if (toolName === 'delete_file') {
      const filename = getString(args.filename);
      const targetFile = filesRef.current.find(f =>
        f.name === filename.replace('.md', '') ||
        f.name === filename ||
        f.path === filename ||
        f.path?.endsWith(filename)
      );

      if (targetFile) {
        setFiles(prev => prev.filter(f => f.id !== targetFile.id));
        const result: JsonValue = { success: true, message: `Deleted file: ${filename}` };
        return { success: true, result, formatted: JSON.stringify(result) };
      }
      return { success: false, result: { error: 'File not found' }, formatted: JSON.stringify({ success: false, error: 'File not found' }) };
    }

    if (toolName === 'read_file') {
      const path = getString(args.path);
      const targetFile = filesRef.current.find(f =>
        f.name === path.replace('.md', '') ||
        f.name === path ||
        f.path === path ||
        f.path?.endsWith(path)
      );

      if (!targetFile) {
        const availableFiles = filesRef.current.map(f => f.name || f.path).filter(Boolean);
        return {
          success: false,
          result: { error: 'File not found', availableFiles },
          formatted: JSON.stringify({ error: 'File not found', availableFiles })
        };
      }

      const lines = targetFile.content.split('\n');
      const startLineValue = getNumber(args.startLine) ?? 1;
      const endLineValue = getNumber(args.endLine) ?? lines.length;
      const startLine = Math.max(0, startLineValue - 1);
      const endLine = Math.min(lines.length, endLineValue);
      const selectedContent = lines.slice(startLine, endLine).join('\n');

      const result: JsonValue = {
        success: true,
        fileName: targetFile.name || targetFile.path,
        content: selectedContent,
        lineRange: { start: startLine + 1, end: endLine },
        totalLines: lines.length
      };
      return { success: true, result, formatted: JSON.stringify(result, null, 2) };
    }

    if (toolName === 'search_files') {
      const keyword = getString(args.keyword);
      const filePattern = getString(args.filePattern);
      if (!keyword) {
        return {
          success: false,
          result: { error: 'Missing keyword parameter' },
          formatted: JSON.stringify({ error: 'Missing keyword parameter' })
        };
      }

      const results: Array<{ fileName: string; matches: Array<{ line: number; content: string }> }> = [];

      for (const file of filesRef.current) {
        const fileName = file.name || file.path || '';
        if (filePattern && !fileName.includes(filePattern)) continue;

        const lines = file.content.split('\n');
        const matches: Array<{ line: number; content: string }> = [];

        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(keyword.toLowerCase())) {
            matches.push({
              line: idx + 1,
              content: line.trim()
            });
          }
        });

        if (matches.length > 0) {
          results.push({
            fileName,
            matches: matches.slice(0, 10)
          });
        }
      }

      const result: JsonValue = {
        success: true,
        keyword,
        filePattern: filePattern || null,
        totalFiles: results.length,
        totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
        results: results.slice(0, 20)
      };
      return { success: true, result, formatted: JSON.stringify(result, null, 2) };
    }

    try {
      const mcpResult = await window.electronAPI?.mcp?.callTool(toolName, args);
      if (mcpResult?.success) {
        return { success: true, result: mcpResult.result as JsonValue, formatted: JSON.stringify(mcpResult.result, null, 2) };
      }
      const errorMessage = mcpResult?.error || 'Unknown error';
      return { success: false, result: { error: errorMessage }, formatted: `Error: ${errorMessage}` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, result: { error: message }, formatted: `Error: ${message}` };
    }
  }, [aiConfig, filesRef, handleIndexKnowledgeBase, setFiles, vectorStore]);

  const handleStopStreaming = useCallback(() => {
    stopRequestedRef.current = true;
    flushStreamingMessageUpdate();
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setAiState(prev => ({ ...prev, isThinking: false }));
  }, [abortControllerRef, flushStreamingMessageUpdate, setAiState, setIsStreaming]);

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
      const sessionId = `app-chat-${requestId}`;
      const runtimeRequest = {
        requestId,
        session: {
          sessionId,
          scope: 'notebook' as const,
          origin: 'app' as const,
        },
        caller: {
          callerId: 'in-app-assistant',
          surface: 'app-chat' as const,
          transport: 'in-app' as const,
          language,
          capabilities: {
            streaming: Boolean(aiConfig.enableStreaming),
            toolStatus: true,
            multimodalInput: false,
          },
        },
        modelConfig: aiConfig,
        input: {
          prompt: text,
          messages: historyForAI.map(message => ({
            role: message.role,
            content: message.content,
          })),
          instructions: [BASE_TOOL_INSTRUCTION],
          locale: language,
        },
        notebook: {
          notebookId: 'in-app-notebook',
          activeFileId: filesRef.current[0]?.id,
          selectedFileIds: filesRef.current.map(file => file.id),
          knowledgeQuery: text,
        },
      };

      for await (const event of runtimeRef.current.execute(runtimeRequest, {
        toolsCallback: async (toolName, args) => {
          const toolResult = await executeToolUnified(toolName, args);
          return toolResult.result;
        },
      })) {
        if (stopRequestedRef.current) {
          break;
        }

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

        if (event.type === 'result') {
          flushStreamingMessageUpdate();
          applyRuntimeResult(aiMessageId, event.result.outputText, event.result.toolCalls);
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
    abortControllerRef,
    aiConfig,
    applyRuntimeResult,
    chatMessages,
    executeToolUnified,
    filesRef,
    flushStreamingMessageUpdate,
    language,
    maybeYieldToBrowser,
    resetStreamYield,
    resetStreamingToolCalls,
    scheduleStreamingMessageUpdate,
    setAiState,
    setChatMessages,
    setIsStreaming,
    updateAssistantToolCall,
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
    handleChatMessage,
    handleStopStreaming,
    handleCompactChat,
    handleCompactMemorySave,
    handleCompactMemorySkip
  };
};
