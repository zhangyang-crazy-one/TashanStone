import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { AIConfig, AIState, ChatMessage, JsonValue, MarkdownFile, MemoryCandidate, ToolCall } from '@/types';
import { compactConversation, createMemoryFromCandidate, generateAIResponse, generateAIResponseStream, getEmbedding, analyzeSessionForMemory, initPersistentMemory, supportsNativeStreamingToolCalls } from '@/services/aiService';
import { extractToolCallsFromText } from '@/src/app/streamingUtils';
import { encodeBase64Utf8 } from '@/utils/base64';
import { generateId } from '@/src/app/appDefaults';
import { useStreamingToolCalls } from '@/src/hooks/useStreamingToolCalls';

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
    resetToolCalls: resetStreamingToolCalls,
    getToolCalls: getStreamingToolCalls
  } = useStreamingToolCalls();

  const buildToolResultBlock = useCallback((toolName: string, toolResult: { success: boolean; formatted: string }) => {
    const encoded = encodeBase64Utf8(toolResult.formatted);
    if (encoded) {
      const status = toolResult.success ? 'success' : 'error';
      return `<tool_result name="${toolName}" status="${status}" encoding="base64">${encoded}</tool_result>`;
    }

    return `🔧 **Tool: ${toolName}**\n\`\`\`json\n${toolResult.formatted}\n\`\`\``;
  }, []);

  const handleStopStreaming = useCallback(() => {
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

      const executeToolUnified = async (toolName: string, args: Record<string, JsonValue>): Promise<{ success: boolean; result: JsonValue; formatted: string }> => {
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
      };

      if (aiConfig.enableStreaming) {
        setIsStreaming(true);
        setAiState({ isThinking: false, message: null, error: null });
        abortControllerRef.current = new AbortController();
        resetStreamYield();

        const baseToolInstruction = `You are ZhangNote AI assistant with the following tools:
- **read_file**: Read specific file content (use when user wants to read/view a file)
- **search_files**: Search keyword across all files (use when user wants to find/search text)
- **search_knowledge_base**: Semantic search in notes (use for general questions about notes)
- **create_file**, **update_file**, **delete_file**: File management`;

        const supportsNativeStreamingTools = supportsNativeStreamingToolCalls(aiConfig);

        try {
          if (supportsNativeStreamingTools) {
            resetStreamingToolCalls();

            const handleToolEvent = (toolCall: ToolCall) => {
              upsertStreamingToolCall(toolCall);
              const updatedToolCalls = getStreamingToolCalls();
              setChatMessages(prev => prev.map(msg =>
                msg.id === aiMessageId
                  ? { ...msg, toolCalls: updatedToolCalls }
                  : msg
              ));
            };

            const nativeToolCallback = async (name: string, args: Record<string, JsonValue>) => {
              const result = await executeToolUnified(name, args);
              return result.result;
            };

            const stream = generateAIResponseStream(
              text,
              aiConfig,
              baseToolInstruction,
              [],
              undefined,
              historyForAI,
              nativeToolCallback,
              handleToolEvent
            );

            let streamingContent = '';
            for await (const chunk of stream) {
              streamingContent += chunk;
              scheduleStreamingMessageUpdate(aiMessageId, streamingContent);
              await maybeYieldToBrowser();
            }
            flushStreamingMessageUpdate();
          } else {
            let fullContent = '';
            let conversationHistory = [...historyForAI];
            let currentPrompt = text;

            const MAX_TOTAL_TIME = 10 * 60 * 1000;
            const ROUND_TIMEOUT = 60 * 1000;
            const startTime = Date.now();
            let toolRound = 0;

            while (true) {
              toolRound++;
              const roundStartTime = Date.now();

              if (Date.now() - startTime > MAX_TOTAL_TIME) {
                fullContent += '\n\n⏱️ **提示**: 对话已运行10分钟，自动结束以保护系统资源。如需继续，请发送新消息。';
                console.log('[Stream] Total timeout reached after 10 minutes');
                break;
              }

              console.log(`[Stream] Tool round ${toolRound}`);

              const stream = generateAIResponseStream(
                currentPrompt,
                aiConfig,
                `You are ZhangNote AI assistant. You can use tools to help users.

## Built-in Tools (应用内工具 - 最高优先级)

### File Operations (文件操作)
- **create_file**: Create a new file in the app (filename, content)
- **update_file**: Update an existing file (filename, content)
- **delete_file**: Delete a file (filename)
- **read_file**: Read specific file content with optional line range. Use when user asks to "read", "view", "show", "open" a specific file. Parameters: path (required), startLine (optional), endLine (optional)
- **search_files**: Search keyword across ALL files. Returns matching lines with line numbers. Use when user asks to "find", "search", "look for" a keyword. Parameters: keyword (required), filePattern (optional)

### Knowledge Base (知识库搜索)
- **search_knowledge_base**: Semantic search in user's notes using RAG vectors. Use when user asks general questions about their notes or needs relevant context. Parameters: query (required)

## When to Use Which Tool
- User says "read file X" / "show me X.md" → use **read_file**
- User says "search for keyword Y" / "find all mentions of Y" → use **search_files**
- User asks "what do my notes say about..." / "what documents mention..." → use **search_knowledge_base**
- User says "create a note about..." → use **create_file**

## Tool Call Format
When you need to use a tool, output EXACTLY:
\`\`\`tool_call
{"tool": "tool_name", "arguments": {"param": "value"}}
\`\`\`

## Task Completion Signal
When you have fully completed the user's request and no more tool calls are needed, end your response with:
[TASK_COMPLETE]

This signal tells the system you are done. Use it when:
- You have answered the user's question completely
- All requested operations have been performed
- No more tool calls are necessary

IMPORTANT:
- Use create_file/update_file for app files, NOT external MCP tools
- Use read_file to read specific files by name
- Use search_files to find keywords across all files
- Output COMPLETE JSON in tool_call block
- After tool result, continue your response
- End with [TASK_COMPLETE] when fully done`,
                [],
                undefined,
                conversationHistory
              );

              let roundContent = '';
              let inToolBlock = false;

              for await (const chunk of stream) {
                roundContent += chunk;

                const toolBlockMatch = roundContent.match(/```tool_call\s*\n/);
                if (toolBlockMatch && !inToolBlock) {
                  inToolBlock = true;
                }

                let displayContent = fullContent + roundContent;
                if (inToolBlock) {
                  const completeMatch = roundContent.match(/```tool_call\s*\n([\s\S]*?)```/);
                  if (!completeMatch) {
                    const beforeBlock = roundContent.substring(0, roundContent.indexOf('```tool_call'));
                    displayContent = fullContent + beforeBlock + '\n\n🔧 *Preparing tool call...*';
                  }
                }

                scheduleStreamingMessageUpdate(aiMessageId, displayContent);
                await maybeYieldToBrowser();
              }

              flushStreamingMessageUpdate();
              const toolCallMatches = extractToolCallsFromText(roundContent);

              if (roundContent.includes('[TASK_COMPLETE]')) {
                console.log('[Stream] AI signaled task completion');
                const cleanContent = roundContent.replace(/\[TASK_COMPLETE\]/g, '').trim();
                fullContent += cleanContent;
                break;
              }

              const roundDuration = Date.now() - roundStartTime;
              if (roundDuration > ROUND_TIMEOUT) {
                console.warn(`[Stream] Round ${toolRound} exceeded timeout (${roundDuration}ms)`);
                fullContent += roundContent + '\n\n⚠️ **警告**: 本轮响应超时（60秒），已自动结束。';
                break;
              }

              if (toolCallMatches.length > 0) {
                try {
                  let cursor = 0;
                  let appendedContent = '';
                  const toolResultsForHistory: string[] = [];

                  for (const toolCall of toolCallMatches) {
                    const toolName = toolCall.name;
                    const toolArgs = toolCall.args;
                    const beforeTool = roundContent.substring(cursor, toolCall.startIndex);

                    setChatMessages(prev => prev.map(msg =>
                      msg.id === aiMessageId
                        ? { ...msg, content: fullContent + appendedContent + beforeTool + `\n\n🔧 **Executing: ${toolName}**...\n` }
                        : msg
                    ));

                    const toolResult = await executeToolUnified(toolName, toolArgs);
                    const toolResultBlock = buildToolResultBlock(toolName, toolResult);

                    appendedContent += `${beforeTool}\n\n${toolResultBlock}\n`;
                    toolResultsForHistory.push(`Tool "${toolName}" result:\n${toolResult.formatted}`);
                    cursor = toolCall.endIndex;
                  }

                  const tailContent = roundContent.substring(cursor);
                  appendedContent += tailContent;
                  fullContent += appendedContent;

                  setChatMessages(prev => prev.map(msg =>
                    msg.id === aiMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  ));

                  const toolResultsMessage = `${toolResultsForHistory.join('\n\n')}\n\nContinue with the next step or provide your final answer.`;
                  conversationHistory = [
                    ...conversationHistory,
                    { id: generateId(), role: 'assistant' as const, content: roundContent, timestamp: Date.now() },
                    { id: generateId(), role: 'user' as const, content: toolResultsMessage, timestamp: Date.now() }
                  ];
                  currentPrompt = toolResultsMessage;
                } catch (parseError) {
                  console.error('[Stream] Tool call parse error:', parseError);
                  fullContent += roundContent;
                  break;
                }
              } else {
                fullContent += roundContent;
                break;
              }
            }

            setChatMessages(prev => prev.map(msg =>
              msg.id === aiMessageId
                ? { ...msg, content: fullContent }
                : msg
            ));
          }

        } finally {
          flushStreamingMessageUpdate();
          setIsStreaming(false);
          abortControllerRef.current = null;
        }

      } else {
        const upsertToolCall = (existing: ToolCall[] | undefined, toolCall: ToolCall): ToolCall[] => {
          const current = existing ? [...existing] : [];
          const index = current.findIndex(call => call.id === toolCall.id);
          if (index >= 0) {
            current[index] = { ...current[index], ...toolCall };
            return current;
          }
          return [...current, toolCall];
        };

        const handleToolEvent = (toolCall: ToolCall) => {
          setChatMessages(prev => prev.map(msg =>
            msg.id === aiMessageId
              ? { ...msg, toolCalls: upsertToolCall(msg.toolCalls, toolCall) }
              : msg
          ));
        };

        const nativeToolCallback = async (name: string, args: Record<string, JsonValue>) => {
          const result = await executeToolUnified(name, args);
          return result.result;
        };

        const response = await generateAIResponse(
          text,
          aiConfig,
          `You are ZhangNote AI assistant with the following tools:
- **read_file**: Read specific file content (use when user wants to read/view a file)
- **search_files**: Search keyword across all files (use when user wants to find/search text)
- **search_knowledge_base**: Semantic search in notes (use for general questions about notes)
- **create_file**, **update_file**, **delete_file**: File management`,
          false,
          [],
          nativeToolCallback,
          undefined,
          historyForAI,
          false,
          handleToolEvent
        );

        setChatMessages(prev => prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, content: response }
            : msg
        ));
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
    }
  }, [
    abortControllerRef,
    aiConfig,
    buildToolResultBlock,
    chatMessages,
    filesRef,
    flushStreamingMessageUpdate,
    getStreamingToolCalls,
    handleIndexKnowledgeBase,
    maybeYieldToBrowser,
    resetStreamYield,
    resetStreamingToolCalls,
    scheduleStreamingMessageUpdate,
    setAiState,
    setChatMessages,
    setFiles,
    setIsStreaming,
    upsertStreamingToolCall,
    vectorStore
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
