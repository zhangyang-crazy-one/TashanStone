import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Send, User, Sparkles, Bot, X, Trash2, Minimize2, Archive, Mic, MicOff, Loader2, Square, Maximize2, Clock, Brain, Search, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { List } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { ChatMessage, AIState } from '../types';
import { RAGResultsCard } from './RAGResultsCard';
import { ToolCallCard, StreamToolCard, parseToolCallsFromContent, ThinkingCard } from './ToolCallCard';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { CheckpointDrawer } from './context';
import { MemoryPreviewModal, MemoryItem } from './MemoryPreviewModal';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

interface Checkpoint {
  id: string;
  name: string;
  message_count: number;
  token_count: number;
  summary: string;
  created_at: number;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  onCompactChat?: () => Promise<void>;
  onPruneChat?: () => Promise<void>;
  onTruncateChat?: () => Promise<void>;
  onCreateCheckpoint?: (name: string) => Promise<void>;
  onRestoreCheckpoint?: (checkpointId: string) => Promise<void>;
  onDeleteCheckpoint?: (checkpointId: string) => Promise<void>;
  aiState: AIState;
  language?: Language;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  showToast?: (message: string, isError?: boolean) => void;
  tokenUsage?: number;
  maxTokens?: number;
  checkpoints?: Checkpoint[];
}

const SmartMessageContent: React.FC<{ content: string; isStreaming?: boolean; language: Language; disableToolParsing?: boolean }> = ({ content, isStreaming, language, disableToolParsing = false }) => {
  if (disableToolParsing) {
    return (
      <div className="chat-markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  const parts = parseToolCallsFromContent(content);

  if (parts.length === 1 && parts[0].type === 'text') {
    return (
      <div className="chat-markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {parts.map((part, idx) => {
        if (part.type === 'text' && part.content) {
          return (
            <div key={idx} className="chat-markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
            </div>
          );
        } else if (part.type === 'tool' && part.toolName) {
          return (
            <StreamToolCard
              key={idx}
              toolName={part.toolName}
              status={part.status || 'executing'}
              result={part.result}
              language={language}
            />
          );
        } else if (part.type === 'thinking' && part.content) {
          return (
            <ThinkingCard
              key={idx}
              content={part.content}
              defaultExpanded={false}
              language={language}
            />
          );
        }
        return null;
      })}
    </div>
  );
};

const MESSAGE_ITEM_HEIGHT = 80;

interface MessageItemProps {
  ariaAttributes: {
    "aria-posinset": number;
    "aria-setsize": number;
    role: "listitem";
  };
  index: number;
  style: React.CSSProperties;
  messages: ChatMessage[];
  isStreaming: boolean;
  compactMode: boolean;
  language: Language;
  onStopStreaming?: () => void;
  t: any;
}

function MessageItemComponent(props: MessageItemProps): React.ReactElement {
  const { index, style, messages, isStreaming, compactMode, language, onStopStreaming, t } = props;
  const msg = messages[index];
  const isLastMessage = index === messages.length - 1;
  const isStreamingMessage = msg.role === 'assistant' && isLastMessage && isStreaming;

  return (
    <div style={style} className="px-4">
      <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} ${compactMode ? 'mb-2' : 'mb-4'}`}>
        {!msg.ragResults && !compactMode && (
          <div
            className={`
              w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${msg.role === 'user'
                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400'
                : msg.role === 'system'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'}
            `}
          >
            {msg.role === 'user' ? <User size={16} /> : (msg.role === 'system' ? <Sparkles size={16} /> : <Bot size={16} />)}
          </div>
        )}

        {msg.ragResults ? (
          <div className="flex-1">
            <RAGResultsCard
              totalChunks={msg.ragResults.totalChunks}
              queryTime={msg.ragResults.queryTime}
              results={msg.ragResults.results}
            />
          </div>
        ) : isStreamingMessage ? (
          <div
            className={`
              max-w-[85%] rounded-2xl text-sm leading-relaxed
              ${compactMode ? 'p-2' : 'p-3'}
              bg-white dark:bg-cyber-800/50 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 rounded-tl-none
            `}
          >
            {msg.content.length === 0 ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-violet-500" />
                <span className="text-xs text-slate-500 italic">{language === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}</span>
                {onStopStreaming && (
                  <Tooltip content={t.stopGeneration}>
                    <button
                      onClick={onStopStreaming}
                      className="ml-2 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                      aria-label={t.stopGeneration}
                    >
                      <Square size={12} />
                    </button>
                  </Tooltip>
                )}
              </div>
            ) : (
              <div>
                <SmartMessageContent content={msg.content} isStreaming={true} language={language} disableToolParsing={Boolean(msg.toolCalls?.length)} />
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-paper-100 dark:border-cyber-700">
                  <Loader2 size={12} className="animate-spin text-violet-400" />
                  <span className="text-[10px] text-slate-400 italic">{language === 'zh' ? '生成中...' : 'Generating...'}</span>
                  {onStopStreaming && (
                    <Tooltip content={t.stopGeneration}>
                      <button
                        onClick={onStopStreaming}
                        className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                        aria-label={t.stopGeneration}
                      >
                        <Square size={10} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`
              max-w-[85%] rounded-2xl text-sm leading-relaxed
              ${compactMode ? 'p-2' : 'p-3'}
              ${msg.role === 'user'
                ? 'bg-cyan-50 dark:bg-cyber-800 text-slate-800 dark:text-slate-200 rounded-tr-none'
                : msg.role === 'system'
                  ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-300 italic text-xs'
                  : 'bg-white dark:bg-cyber-800/50 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 rounded-tl-none'}
            `}
          >
            {msg.role === 'assistant' && isLastMessage && msg.content.length === 0 && !isStreaming ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-violet-500" />
                <span className="text-xs text-slate-500 italic">{language === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}</span>
              </div>
            ) : msg.role === 'assistant' ? (
              <SmartMessageContent content={msg.content} isStreaming={false} language={language} disableToolParsing={Boolean(msg.toolCalls?.length)} />
            ) : (
              <div className="chat-markdown-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: ({ children, ...props }) => (
                      <pre
                        {...props}
                        style={{
                          maxWidth: '100%',
                          overflowX: 'auto',
                          whiteSpace: 'pre',
                          backgroundColor: 'var(--pre-bg)',
                          padding: '0.75rem',
                          borderRadius: '0.5rem',
                          margin: '0.5rem 0',
                          fontSize: '0.75rem',
                        }}
                        className="bg-slate-200 dark:bg-slate-800"
                      >
                        {children}
                      </pre>
                    ),
                    code: ({ inline, children, ...props }: any) => (
                      inline ? (
                        <code
                          {...props}
                          className="text-xs px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800"
                        >
                          {children}
                        </code>
                      ) : (
                        <code {...props}>{children}</code>
                      )
                    ),
                    p: ({ children, ...props }) => (
                      <p {...props} className="my-1 leading-relaxed break-words">
                        {children}
                      </p>
                    ),
                    ul: ({ children, ...props }) => (
                      <ul {...props} className="my-1 ml-4 list-disc">
                        {children}
                      </ul>
                    ),
                    ol: ({ children, ...props }) => (
                      <ol {...props} className="my-1 ml-4 list-decimal">
                        {children}
                      </ol>
                    ),
                    li: ({ children, ...props }) => (
                      <li {...props} className="my-0.5 break-words">
                        {children}
                      </li>
                    ),
                    h1: ({ children, ...props }) => (
                      <h1 {...props} className="text-lg font-bold my-2">{children}</h1>
                    ),
                    h2: ({ children, ...props }) => (
                      <h2 {...props} className="text-base font-bold my-2">{children}</h2>
                    ),
                    h3: ({ children, ...props }) => (
                      <h3 {...props} className="text-sm font-semibold my-1">{children}</h3>
                    ),
                    table: ({ children, ...props }) => (
                      <div className="overflow-x-auto my-2">
                        <table {...props} className="min-w-full text-xs border-collapse border border-slate-300 dark:border-slate-600">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children, ...props }) => (
                      <thead {...props} className="bg-slate-100 dark:bg-slate-700">
                        {children}
                      </thead>
                    ),
                    tbody: ({ children, ...props }) => (
                      <tbody {...props}>{children}</tbody>
                    ),
                    tr: ({ children, ...props }) => (
                      <tr {...props} className="border-b border-slate-300 dark:border-slate-600">
                        {children}
                      </tr>
                    ),
                    th: ({ children, ...props }) => (
                      <th {...props} className="px-2 py-1 text-left font-semibold border border-slate-300 dark:border-slate-600">
                        {children}
                      </th>
                    ),
                    td: ({ children, ...props }) => (
                      <td {...props} className="px-2 py-1 border border-slate-300 dark:border-slate-600">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            )}

            {msg.toolCalls && msg.toolCalls.length > 0 && !compactMode && (
              <div className="space-y-2 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                  {language === 'zh' ? '工具调用' : 'Tool Calls'} ({msg.toolCalls.length})
                </div>
                {msg.toolCalls.map(tc => (
                  <ToolCallCard
                    key={tc.id}
                    toolCall={tc}
                    language={language}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageItem = React.memo(MessageItemComponent) as React.ComponentType<MessageItemProps>;

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onClearChat,
  onCompactChat,
  onPruneChat,
  onTruncateChat,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onDeleteCheckpoint,
  aiState,
  language = 'en',
  isStreaming = false,
  onStopStreaming,
  showToast,
  tokenUsage = 0,
  maxTokens = 200000,
  checkpoints = [],
}) => {
  const [input, setInput] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [compactMode, setCompactMode] = useState(false);
  const [showCheckpointDrawer, setShowCheckpointDrawer] = useState(false);
  const [showMemorySearch, setShowMemorySearch] = useState(false);
  const [memorySearchQuery, setMemorySearchQuery] = useState('');
  const [memorySearchResults, setMemorySearchResults] = useState<any[]>([]);
  const [isSearchingMemories, setIsSearchingMemories] = useState(false);
  const [injectedMemories, setInjectedMemories] = useState<any[]>([]);
  const [memorySearchQueryAdded, setMemorySearchQueryAdded] = useState(false);
  const [previewMemory, setPreviewMemory] = useState<MemoryItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  // Voice input using speech recognition hook
  const { isListening, isProcessing, isSupported, toggle } = useSpeechRecognition({
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        // Append final transcript to input, add space if input exists
        setInput(prev => prev ? `${prev} ${transcript}` : transcript);
        setInterimTranscript('');
      } else {
        // Show interim transcript
        setInterimTranscript(transcript);
      }
    },
    onEnd: () => {
      setInterimTranscript('');
    },
    onError: (error) => {
      console.error('Speech recognition error:', error);
      setInterimTranscript('');
      // Use toast notification instead of alert
      showToast?.(`Voice recognition error: ${error}`, true);
    },
    continuous: true,
    language: language === 'zh' ? 'zh-CN' : 'en-US'
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const injectedMemoryCount = injectedMemories.length;

  const handleRemoveInjectedMemory = useCallback((memoryId: string) => {
    setInjectedMemories(prev => prev.filter(m => m.id !== memoryId));
    console.log('[Memory] Removed memory:', memoryId);
  }, []);

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, scrollToBottom]);

  const handleMemorySearch = useCallback(async () => {
    if (!memorySearchQuery.trim()) return;

    setIsSearchingMemories(true);
    setMemorySearchQueryAdded(true);

    const logger = {
      info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
      error: (msg: string, error?: any) => console.error(`[ERROR] ${msg}`, error || ''),
      warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || '')
    };

    try {
      let results: any[] = [];
      let searchMethod = 'unknown';

      logger.info('MemorySearch Starting', { query: memorySearchQuery });

      if (typeof window !== 'undefined') {
        if ((window as any).searchPermanentMemories) {
          searchMethod = 'window.searchPermanentMemories';
          logger.info('Using window search method');
          results = await (window as any).searchPermanentMemories(memorySearchQuery, 10);
        }
        else if ((window as any).electronAPI?.memory?.search) {
          searchMethod = 'electronAPI.memory.search';
          logger.info('Using IPC search method');
          results = await (window as any).electronAPI.memory.search(memorySearchQuery, 10);
        }
        else {
          logger.warn('No search function available');
          showToast?.(language === 'zh' ? '记忆服务暂不可用' : 'Memory service unavailable', true);
          setIsSearchingMemories(false);
          return;
        }
      }

      if (!Array.isArray(results)) {
        logger.error('Invalid results format', { results });
        results = [];
      }

      setMemorySearchResults(results);
      logger.info('MemorySearch Complete', { method: searchMethod, count: results.length });

      if (results.length === 0) {
        showToast?.(language === 'zh' ? '未找到相关记忆' : 'No memories found');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('MemorySearch Failed', { error: errorMessage });

      showToast?.(
        language === 'zh'
          ? `记忆搜索失败: ${errorMessage}`
          : `Memory search failed: ${errorMessage}`,
        true
      );
    } finally {
      setIsSearchingMemories(false);
    }
  }, [memorySearchQuery, language, showToast]);


  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || aiState.isThinking) return;

    const userQuery = input.trim();
    let messageContent = userQuery;

    try {
      if ((window as any).searchPermanentMemories || (window as any).electronAPI?.memory?.search) {
        console.log('[MemoryAuto] Searching for relevant memories based on user query...');
        const autoResults = await (window as any).searchPermanentMemories?.(userQuery, 5)
          || await (window as any).electronAPI.memory.search(userQuery, 5);

        if (autoResults && autoResults.length > 0) {
          console.log('[MemoryAuto] Found', autoResults.length, 'relevant memories');

          const autoMemoryIds = new Set(autoResults.map((r: any) => r.id || r.filePath));
          const manualMemories = injectedMemories.filter(m => !autoMemoryIds.has(m.id));

          const allMemories = [
            ...injectedMemories,
            ...autoResults.filter((r: any) => !injectedMemories.some(m => m.id === (r.id || r.filePath)))
          ];

          if (allMemories.length > 0) {
            const memoryContents = allMemories.map((m, index) => {
              let content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              content = content.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').replace(/\\"/g, '"');

              return `【记忆片段 ${index + 1}】━━━━━━━━━━━━━━━━━━━━
📁 来源：${m.fileName || m.filePath?.split('/').pop()?.replace('.md', '') || '未知'}
🏷️ 标签：${m.topics?.join(', ') || '无'}
📄 内容：
${content}
━━━━━━━━━━━━━━━━━━━━━`;
            }).join('\n\n');

            messageContent = `【系统提示】以下持久记忆已根据您的问题自动检索并注入到对话上下文中，供参考使用：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 基于问题检索：${autoResults.length} 条
📊 手动添加：${injectedMemories.length} 条
📊 总计注入：${allMemories.length} 条
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${memoryContents}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 **重要提示**：以上记忆信息已完整注入，包含用户需要的知识。
❌ 请勿再用 read_file 或 search_files 重复读取这些记忆文件。
✅ 请直接使用注入的信息回答用户问题。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用户问题：` + userQuery;

            console.log('[MemoryAuto] Total memories injected:', allMemories.length);
          }
        }
      }
    } catch (error) {
      console.error('[MemoryAuto] Auto-inject failed:', error);
      showToast?.(
        language === 'zh' ? '自动记忆注入失败，请手动添加' : 'Auto memory injection failed, please add manually',
        true
      );
    }

    onSendMessage(messageContent);
    setInput('');
  }, [input, aiState.isThinking, injectedMemories, onSendMessage, showToast, language]);

  const handleMemoryClick = useCallback((memory: any) => {
    setPreviewMemory({
      id: memory.id || memory.filePath,
      fileName: memory.filePath?.split('/').pop()?.replace('.md', '') || memory.id,
      content: memory.content || '',
      topics: memory.topics || [],
      filePath: memory.filePath,
      summary: memory.summary,
      isStarred: memory.isStarred || false,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt
    });
    setIsPreviewOpen(true);
    console.log('[Memory] Opening preview:', memory.id);
  }, []);

  const handleConfirmAddMemory = useCallback((memory: MemoryItem) => {
    const memoryId = memory.id;

    if (injectedMemories.some(m => m.id === memoryId)) {
      showToast?.(language === 'zh' ? '该记忆已在注入列表中' : 'Memory already in injected list');
      return;
    }

    setInjectedMemories(prev => [...prev, {
      id: memoryId,
      fileName: memory.fileName,
      content: memory.content,
      topics: memory.topics || [],
      filePath: memory.filePath,
      injectedAt: Date.now()
    }]);

    console.log('[Memory] Added to injected list:', memory.fileName);
    showToast?.(language === 'zh' ? '已添加到注入列表' : 'Added to injected list');
  }, [injectedMemories, showToast, language]);

  const handleSaveMemory = useCallback(async (memory: MemoryItem) => {
    try {
      if ((window as any).electronAPI?.memory?.update) {
        console.log('[Memory] 调用 update IPC, id:', memory.id);
        const result = await (window as any).electronAPI.memory.update({
          id: memory.id,
          content: memory.content,
          updatedAt: Date.now()
        });
        console.log('[Memory] update 返回值:', JSON.stringify(result));

        if (result?.success) {
          console.log('[Memory] Saved:', memory.id);

          if (previewMemory?.id === memory.id) {
            setPreviewMemory(prev => prev ? {
              ...prev,
              content: memory.content,
              updatedAt: Date.now()
            } : null);
          }

          showToast?.(language === 'zh' ? '保存成功' : 'Saved successfully');
        } else {
          console.error('[Memory] 保存失败:', result?.error);
          showToast?.(language === 'zh' ? '保存失败' : 'Save failed', true);
        }
      } else {
        console.warn('[Memory] Update IPC not available');
        showToast?.(language === 'zh' ? '保存功能暂不可用' : 'Save not available', true);
      }
    } catch (error) {
      console.error('[Memory] Save failed:', error);
      showToast?.(language === 'zh' ? '保存失败' : 'Save failed', true);
    }
  }, [previewMemory, showToast, language]);

  const handleStarMemory = useCallback(async (memoryId: string, isStarred: boolean) => {
    try {
      if ((window as any).electronAPI?.memory?.star) {
        console.log('[Memory] 调用 star IPC, id:', memoryId, 'isStarred:', isStarred);
        const result = await (window as any).electronAPI.memory.star(memoryId, isStarred);
        console.log('[Memory] star 返回值:', JSON.stringify(result));

        if (result?.success) {
          console.log('[Memory] Star toggled:', memoryId, isStarred);
          showToast?.(isStarred
            ? (language === 'zh' ? '已标星' : 'Starred')
            : (language === 'zh' ? '取消标星' : 'Unstarred'));

          if (previewMemory?.id === memoryId) {
            setPreviewMemory(prev => prev ? { ...prev, isStarred } : null);
          }
        } else {
          console.error('[Memory] 标星失败:', result?.error);
        }
      } else {
        console.warn('[Memory] Star IPC not available');
      }
    } catch (error) {
      console.error('[Memory] Star toggle failed:', error);
    }
  }, [previewMemory, showToast, language]);

  return (
    <div
      className={`
        fixed inset-y-0 right-0 z-40 w-80 sm:w-96 transform transition-transform duration-300 ease-in-out shadow-2xl
        bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border-l border-paper-200 dark:border-cyber-700
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      <div className="flex flex-col h-full relative">
        {/* Header - Compact Clean Design */}
        <div className="relative bg-gradient-to-r from-violet-500/5 via-transparent to-cyan-500/5 dark:from-violet-600/10 dark:to-cyan-600/10 border-b border-violet-200/30 dark:border-violet-700/30">
          <div className="h-12 flex items-center justify-between px-3">
            {/* Left: Icon + Title + Token */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-lg flex items-center justify-center shrink-0 shadow-sm shadow-violet-500/20">
                <Sparkles size={14} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-violet-600 dark:text-violet-400 truncate">
                {t.aiCompanion}
              </span>
              {tokenUsage > 0 && maxTokens > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <div className="h-1.5 w-12 bg-slate-200/50 dark:bg-slate-700/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${tokenUsage / maxTokens > 0.9 ? 'bg-red-500' :
                          tokenUsage / maxTokens > 0.7 ? 'bg-amber-500' :
                            'bg-emerald-500'
                        }`}
                      style={{ width: `${Math.min((tokenUsage / maxTokens) * 100, 100)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${tokenUsage / maxTokens > 0.9 ? 'text-red-500' :
                      tokenUsage / maxTokens > 0.7 ? 'text-amber-500' :
                        'text-emerald-500'
                    }`}>
                    {Math.round((tokenUsage / maxTokens) * 100)}%
                  </span>
                </div>
              )}

              {/* Compact Context Button - Show when there are enough messages */}
              {onCompactChat && messages.length >= 2 && !aiState.isThinking && (
                <Tooltip content={t.tooltips?.compactContext || (language === 'zh' ? '压缩上下文' : 'Compact Context')}>
                  <button
                    onClick={onCompactChat}
                    className="p-1.5 rounded-md text-violet-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
                    aria-label={t.tooltips?.compactContext || (language === 'zh' ? '压缩上下文' : 'Compact Context')}
                  >
                    <Archive size={15} />
                  </button>
                </Tooltip>
              )}

              {/* Compact Mode Toggle */}
              <Tooltip content={compactMode ? t.expandView : t.compactView}>
                <button
                  onClick={() => setCompactMode(!compactMode)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
                  aria-label={compactMode ? t.expandView : t.compactView}
                >
                  {compactMode ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
                </button>
              </Tooltip>

              {/* Memory Management Button */}
              <Tooltip content={t.tooltips?.manageMemories || (language === 'zh' ? '管理记忆' : 'Manage Memories')}>
                <button
                  onClick={() => {
                    console.log('[Brain] Toggle Memory Management clicked, current state:', showMemorySearch);
                    setShowMemorySearch(!showMemorySearch);
                  }}
                  className={`p-1.5 rounded-md transition-all relative ${showMemorySearch
                      ? 'text-violet-500 bg-violet-100/50 dark:bg-violet-900/30'
                      : 'text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30'
                    }`}
                  aria-label={t.tooltips?.manageMemories || (language === 'zh' ? '管理记忆' : 'Manage Memories')}
                >
                  <Brain size={15} />
                  {/* Badge showing number of injected memories */}
                  {injectedMemoryCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {injectedMemoryCount > 9 ? '9+' : injectedMemoryCount}
                    </span>
                  )}
                </button>
              </Tooltip>

              {/* Memory Management Panel */}
              {showMemorySearch && (
                <div className="absolute top-full right-0 mt-1 w-[calc(100vw-2rem)] sm:w-[22rem] max-w-[calc(100%-0.5rem)] bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-700 p-3 z-50 max-h-96 overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-paper-200 dark:border-cyber-700">
                    <Brain size={14} className="text-violet-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
                      {language === 'zh' ? '持久记忆管理' : 'Persistent Memory'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {injectedMemoryCount} {language === 'zh' ? '条已注入' : 'injected'}
                    </span>
                    <button
                      onClick={() => setShowMemorySearch(false)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-cyber-700 rounded"
                    >
                      <X size={12} className="text-slate-400" />
                    </button>
                  </div>

                  {/* Auto-injected notice */}
                  <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-700 dark:text-amber-400">
                    💡 {language === 'zh'
                      ? 'AI 会自动根据对话内容注入相关记忆'
                      : 'AI automatically injects relevant memories based on your messages'}
                  </div>

                  {/* Search to add memories */}
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={memorySearchQuery}
                      onChange={(e) => setMemorySearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleMemorySearch()}
                      placeholder={language === 'zh' ? '搜索并添加记忆...' : 'Search and add memories...'}
                      className="flex-1 px-2 py-1.5 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded focus:outline-none focus:border-violet-500"
                    />
                    <button
                      onClick={handleMemorySearch}
                      disabled={isSearchingMemories || !memorySearchQuery.trim()}
                      className="p-1.5 bg-violet-500 hover:bg-violet-600 text-white rounded disabled:opacity-50"
                    >
                      {isSearchingMemories ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Search size={12} />
                      )}
                    </button>
                  </div>

                  {/* Search results (to add) */}
                  {memorySearchResults.length > 0 && (
                    <div className="mb-3 max-h-32 overflow-y-auto space-y-1 border-t border-paper-200 dark:border-cyber-700 pt-2">
                      <div className="text-xs text-slate-500 mb-1">
                        {language === 'zh' ? '点击添加到对话' : 'Click to add to conversation'}
                      </div>
                      {memorySearchResults.map((memory) => (
                        <div
                          key={memory.id}
                          onClick={() => handleMemoryClick(memory)}
                          className="px-2 py-1.5 rounded hover:bg-paper-200 dark:hover:bg-cyber-700 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-1">
                            <FileText size={10} className="text-violet-400" />
                            <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                              {memory.filePath?.split('/').pop()?.replace('.md', '') || memory.id}
                            </span>
                          </div>
                          {memory.topics && memory.topics.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {memory.topics.slice(0, 2).map((topic: string, i: number) => (
                                <span key={i} className="text-[9px] px-1 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t border-paper-200 dark:border-cyber-700 my-2"></div>

                  {/* Currently injected memories */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="text-xs text-slate-500 mb-2 flex-shrink-0">
                      {language === 'zh' ? '已注入的记忆（点击移除）' : 'Injected memories (click to remove)'}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1">
                      {injectedMemories.length === 0 ? (
                        <div className="text-center py-4 text-slate-400 text-xs">
                          {language === 'zh' ? '暂无注入记忆' : 'No memories injected'}
                        </div>
                      ) : (
                        injectedMemories.map((memory) => (
                          <div
                            key={memory.id}
                            onClick={() => handleRemoveInjectedMemory(memory.id)}
                            className="group px-2 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer transition-colors flex items-start gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <FileText size={10} className="text-amber-500 shrink-0" />
                                <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                                  {memory.fileName || memory.id}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                {memory.topics?.join(', ') || ''}
                              </div>
                            </div>
                            <X size={10} className="text-slate-400 group-hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5" />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Clear */}
              <Tooltip content={t.clearHistory}>
                <button
                  onClick={onClearChat}
                  className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-all"
                  aria-label={t.clearHistory}
                >
                  <Trash2 size={15} />
                </button>
              </Tooltip>

              {/* Close */}
              <Tooltip content={t.close || (language === 'zh' ? '关闭' : 'Close')}>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 dark:hover:bg-slate-700/50 transition-all"
                  aria-label={t.close || (language === 'zh' ? '关闭' : 'Close')}
                >
                  <X size={15} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Messages - Normal scrollable list instead of virtual list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center space-y-2 opacity-60">
              <Bot size={48} />
              <p className="max-w-[80%]">{t.askMe}</p>
            </div>
          ) : (
            <div className="py-4">
              {messages.map((msg, index) => {
                const isLastMessage = index === messages.length - 1;
                const isStreamingMessage = msg.role === 'assistant' && isLastMessage && isStreaming;

                return (
                  <div key={msg.id || index} className="px-4">
                    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} ${compactMode ? 'mb-2' : 'mb-4'}`}>
                      {!msg.ragResults && !compactMode && (
                        <div
                          className={`
                            w-8 h-8 rounded-full flex items-center justify-center shrink-0
                            ${msg.role === 'user'
                              ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400'
                              : msg.role === 'system'
                                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'}
                          `}
                        >
                          {msg.role === 'user' ? <User size={16} /> : (msg.role === 'system' ? <Sparkles size={16} /> : <Bot size={16} />)}
                        </div>
                      )}

                      {msg.ragResults ? (
                        <div className="flex-1">
                          <RAGResultsCard
                            totalChunks={msg.ragResults.totalChunks}
                            queryTime={msg.ragResults.queryTime}
                            results={msg.ragResults.results}
                          />
                        </div>
                      ) : isStreamingMessage ? (
                        <div
                          className={`
                            max-w-[85%] rounded-2xl text-sm leading-relaxed
                            ${compactMode ? 'p-2' : 'p-3'}
                            bg-white dark:bg-cyber-800/50 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 rounded-tl-none
                          `}
                        >
                          {msg.content.length === 0 ? (
                            <div className="flex items-center gap-2">
                              <Loader2 size={14} className="animate-spin text-violet-500" />
                              <span className="text-xs text-slate-500 italic">{language === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}</span>
                              {onStopStreaming && (
                                <Tooltip content={t.stopGeneration}>
                                  <button
                                    onClick={onStopStreaming}
                                    className="ml-2 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                                    aria-label={t.stopGeneration}
                                  >
                                    <Square size={12} />
                                  </button>
                                </Tooltip>
                              )}
                            </div>
                          ) : (
                            <div>
                              <SmartMessageContent content={msg.content} isStreaming={true} language={language} disableToolParsing={Boolean(msg.toolCalls?.length)} />
                              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-paper-100 dark:border-cyber-700">
                                <Loader2 size={12} className="animate-spin text-violet-400" />
                                <span className="text-[10px] text-slate-400 italic">{language === 'zh' ? '生成中...' : 'Generating...'}</span>
                                {onStopStreaming && (
                                  <Tooltip content={t.stopGeneration}>
                                    <button
                                      onClick={onStopStreaming}
                                      className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                                      aria-label={t.stopGeneration}
                                    >
                                      <Square size={10} />
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`
                            max-w-[85%] rounded-2xl text-sm leading-relaxed
                            ${compactMode ? 'p-2' : 'p-3'}
                            ${msg.role === 'user'
                              ? 'bg-cyan-50 dark:bg-cyber-800 text-slate-800 dark:text-slate-200 rounded-tr-none'
                              : msg.role === 'system'
                                ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-slate-700 dark:text-slate-300 italic text-xs'
                                : 'bg-white dark:bg-cyber-800/50 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 rounded-tl-none'}
                          `}
                        >
                          {msg.role === 'assistant' ? (
                            <SmartMessageContent content={msg.content} isStreaming={false} language={language} disableToolParsing={Boolean(msg.toolCalls?.length)} />
                          ) : (
                            <div className="chat-markdown-content">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          )}

                          {msg.toolCalls && msg.toolCalls.length > 0 && !compactMode && (
                            <div className="space-y-2 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
                              <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
                                {language === 'zh' ? '工具调用' : 'Tool Calls'} ({msg.toolCalls.length})
                              </div>
                              {msg.toolCalls.map(tc => (
                                <ToolCallCard
                                  key={tc.id}
                                  toolCall={tc}
                                  language={language}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Thinking indicator after the list */}
          {aiState.isThinking && (
            <div className="flex gap-3 px-4 py-2">
              {!compactMode && (
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-violet-600 dark:text-violet-400" />
                </div>
              )}
              <div className="bg-white dark:bg-cyber-800/50 p-3 rounded-2xl rounded-tl-none border border-paper-200 dark:border-cyber-700 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-violet-500" />
                <span className="text-xs text-slate-500">{language === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}</span>
                {isStreaming && onStopStreaming && (
                  <Tooltip content={t.stopGeneration}>
                    <button
                      onClick={onStopStreaming}
                      className="ml-2 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                      aria-label={t.stopGeneration}
                    >
                      <Square size={12} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50">
          <form onSubmit={handleSubmit} className="relative space-y-2">
            <div className="relative flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={aiState.isThinking}
                placeholder={t.typeMessage}
                className="flex-1 pl-4 pr-4 py-3 rounded-xl bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 transition-all shadow-sm"
              />

              {/* Voice Input Button */}
              {isSupported && (
                <Tooltip
                  content={
                    isProcessing
                      ? (language === 'zh' ? '正在转录...' : 'Processing...')
                      : isListening
                        ? (t.voice?.stopRecording || 'Stop Recording')
                        : (t.voice?.startRecording || 'Start Recording')
                  }
                >
                  <button
                    type="button"
                    onClick={toggle}
                    disabled={aiState.isThinking || isProcessing}
                    className={`p-3 rounded-xl transition-all shrink-0 ${isProcessing
                        ? 'bg-amber-500 text-white animate-pulse shadow-lg shadow-amber-500/50'
                        : isListening
                          ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
                          : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-50'
                      }`}
                    aria-label={
                      isProcessing
                        ? (language === 'zh' ? '正在转录...' : 'Processing...')
                        : isListening
                          ? (t.voice?.stopRecording || 'Stop Recording')
                          : (t.voice?.startRecording || 'Start Recording')
                    }
                  >
                    {isProcessing ? <Loader2 size={20} className="animate-spin" /> : isListening ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                </Tooltip>
              )}

              {/* Send Button */}
              <button
                type="submit"
                disabled={!input.trim() || aiState.isThinking}
                className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/25 transition-all shrink-0"
              >
                <Send size={20} />
              </button>
            </div>

            {/* Real-time Transcript Display */}
            {interimTranscript && (
              <div className="text-sm text-neutral-400 dark:text-neutral-500 italic px-3 py-1 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <span>{interimTranscript}...</span>
              </div>
            )}

            {/* Listening Indicator */}
            {isListening && !interimTranscript && (
              <div className="text-sm text-neutral-400 dark:text-neutral-500 italic px-3 py-1 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <span>{t.voice?.listening || (language === 'zh' ? '正在录音...' : 'Recording...')}</span>
              </div>
            )}

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="text-sm text-amber-500 dark:text-amber-400 italic px-3 py-1 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span>{language === 'zh' ? '正在转录...' : 'Transcribing...'}</span>
              </div>
            )}
          </form>
        </div>

        <CheckpointDrawer
          isOpen={showCheckpointDrawer}
          onClose={() => setShowCheckpointDrawer(false)}
          checkpoints={checkpoints}
          onRestore={onRestoreCheckpoint || (async () => { })}
          onDelete={onDeleteCheckpoint || (async () => { })}
          onCreate={onCreateCheckpoint || (async () => { })}
        />

        <MemoryPreviewModal
          memory={previewMemory}
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setPreviewMemory(null);
          }}
          onConfirm={handleConfirmAddMemory}
          onSave={handleSaveMemory}
          onStar={handleStarMemory}
          language={language}
        />
      </div>
    </div>
  );
};
