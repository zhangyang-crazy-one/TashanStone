import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, Bot, X, Trash2, Minimize2, Archive, Mic, MicOff, Loader2, Square, Maximize2, Clock, Brain, Search } from 'lucide-react';
import { ChatMessage, AIState } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { translations, Language } from '../utils/translations';
import { RAGResultsCard } from './RAGResultsCard';
import { ToolCallCard, StreamToolCard, parseToolCallsFromContent, ThinkingCard } from './ToolCallCard';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { CheckpointDrawer } from './context';

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

const SmartMessageContent: React.FC<{ content: string; isStreaming?: boolean }> = ({ content, isStreaming }) => {
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
            />
          );
        } else if (part.type === 'thinking' && part.content) {
          return (
            <ThinkingCard
              key={idx}
              content={part.content}
              defaultExpanded={false}
            />
          );
        }
        return null;
      })}
    </div>
  );
};

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleMemorySearch = async () => {
    if (!memorySearchQuery.trim()) return;
    
    setIsSearchingMemories(true);
    try {
      if (typeof window !== 'undefined' && (window as any).searchPermanentMemories) {
        const results = await (window as any).searchPermanentMemories(memorySearchQuery, 5);
        setMemorySearchResults(results);
      }
    } catch (error) {
      console.error('Memory search failed:', error);
    } finally {
      setIsSearchingMemories(false);
    }
  };

  const handleMemoryClick = (memory: any) => {
    if (memory.filePath && (window as any).electronAPI?.file?.readFile) {
      (window as any).electronAPI.file.readFile(memory.filePath).then((content: string) => {
        setInput(prev => prev ? `${prev}\n\n${content}` : content);
      });
    }
    setShowMemorySearch(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || aiState.isThinking) return;
    onSendMessage(input);
    setInput('');
  };

  return (
    <div
      className={`
        fixed inset-y-0 right-0 z-40 w-80 sm:w-96 transform transition-transform duration-300 ease-in-out shadow-2xl
        bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border-l border-paper-200 dark:border-cyber-700
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      <div className="flex flex-col h-full">
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
                      className={`h-full rounded-full transition-all ${
                        tokenUsage / maxTokens > 0.9 ? 'bg-red-500' :
                        tokenUsage / maxTokens > 0.7 ? 'bg-amber-500' :
                        'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min((tokenUsage / maxTokens) * 100, 100)}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-medium ${
                    tokenUsage / maxTokens > 0.9 ? 'text-red-500' :
                    tokenUsage / maxTokens > 0.7 ? 'text-amber-500' :
                    'text-emerald-500'
                  }`}>
                    {Math.round((tokenUsage / maxTokens) * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* Right: Action Buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Compact Context Button */}
              {(onCompactChat || onPruneChat || onTruncateChat) && messages.length > 3 && !aiState.isThinking && (
                <button
                  onClick={onCompactChat}
                  className="p-1.5 rounded-md text-violet-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
                  title={language === 'zh' ? '压缩上下文' : 'Compact Context'}
                >
                  <Archive size={15} />
                </button>
              )}

              {/* Checkpoint Button */}
              {(onCreateCheckpoint || onRestoreCheckpoint || onDeleteCheckpoint) && (
                <button
                  onClick={() => setShowCheckpointDrawer(true)}
                  disabled={aiState.isThinking}
                  className="p-1.5 rounded-md text-cyan-400 hover:text-cyan-500 hover:bg-cyan-100/50 dark:hover:bg-cyan-900/30 transition-all disabled:opacity-50"
                  title={language === 'zh' ? '检查点' : 'Checkpoints'}
                >
                  <Clock size={15} />
                </button>
              )}

              {/* Memory Search Button */}
              <button
                onClick={() => setShowMemorySearch(!showMemorySearch)}
                className={`p-1.5 rounded-md transition-all ${showMemorySearch ? 'text-violet-500 bg-violet-100/50 dark:bg-violet-900/30' : 'text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30'}`}
                title={language === 'zh' ? '搜索记忆' : 'Search Memories'}
              >
                <Brain size={15} />
              </button>

              {/* Compact Mode Toggle */}
              <button
                onClick={() => setCompactMode(!compactMode)}
                className="p-1.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-100/50 dark:hover:bg-violet-900/30 transition-all"
                title={compactMode ? t.expandView : t.compactView}
              >
                {compactMode ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
              </button>

              {/* Clear */}
              <button
                onClick={onClearChat}
                className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-all"
                title={t.clearHistory}
              >
                <Trash2 size={15} />
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 dark:hover:bg-slate-700/50 transition-all"
                title={language === 'zh' ? '关闭' : 'Close'}
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center space-y-2 opacity-60">
              <Bot size={48} />
              <p className="max-w-[80%]">{t.askMe}</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              // Check if this is the last assistant message and streaming is active
              const isLastMessage = index === messages.length - 1;
              const isStreamingMessage = msg.role === 'assistant' && isLastMessage && isStreaming;

              return (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} ${compactMode ? 'mb-2' : 'mb-4'}`}
              >
                {/* Only show avatar for non-RAG system messages */}
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

                {/* Message content or RAG card */}
                {msg.ragResults ? (
                  <div className="flex-1">
                    <RAGResultsCard
                      totalChunks={msg.ragResults.totalChunks}
                      queryTime={msg.ragResults.queryTime}
                      results={msg.ragResults.results}
                    />
                  </div>
                ) : isStreamingMessage ? (
                  // Streaming content - show with typing indicator if still empty or very short
                  <div
                    className={`
                      max-w-[85%] rounded-2xl text-sm leading-relaxed
                      ${compactMode ? 'p-2' : 'p-3'}
                      bg-white dark:bg-cyber-800/50 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 rounded-tl-none
                    `}
                  >
                    {msg.content.length === 0 ? (
                      // No content yet - show loading
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin text-violet-500" />
                        <span className="text-xs text-slate-500 italic">{language === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}</span>
                        {onStopStreaming && (
                          <button
                            onClick={onStopStreaming}
                            className="ml-2 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                            title={t.stopGeneration}
                          >
                            <Square size={12} />
                          </button>
                        )}
                      </div>
                    ) : (
                      // Has content - show with typing indicator at end
                      <div>
                        <SmartMessageContent content={msg.content} isStreaming={true} />
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-paper-100 dark:border-cyber-700">
                          <Loader2 size={12} className="animate-spin text-violet-400" />
                          <span className="text-[10px] text-slate-400 italic">{language === 'zh' ? '生成中...' : 'Generating...'}</span>
                          {onStopStreaming && (
                            <button
                              onClick={onStopStreaming}
                              className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                              title={t.stopGeneration}
                            >
                              <Square size={10} />
                            </button>
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
                    {/* 智能内容渲染：用户消息用普通 Markdown，助手消息解析工具调用 */}
                    {/* 非流式模式：如果是最后一条助手消息且内容为空，显示思考状态 */}
                    {msg.role === 'assistant' && isLastMessage && msg.content.length === 0 && !isStreaming ? (
                      <div className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin text-violet-500" />
                        <span className="text-xs text-slate-500 italic">{language === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}</span>
                      </div>
                    ) : msg.role === 'assistant' ? (
                      <SmartMessageContent content={msg.content} isStreaming={false} />
                    ) : (
                      <div className="chat-markdown-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // 自定义 pre 渲染，确保滚动生效
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
                            // 自定义 code 渲染
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
                            // 段落换行
                            p: ({ children, ...props }) => (
                              <p {...props} className="my-1 leading-relaxed break-words">
                                {children}
                              </p>
                            ),
                            // 列表样式
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
                            // 标题样式
                            h1: ({ children, ...props }) => (
                              <h1 {...props} className="text-lg font-bold my-2">{children}</h1>
                            ),
                            h2: ({ children, ...props }) => (
                              <h2 {...props} className="text-base font-bold my-2">{children}</h2>
                            ),
                            h3: ({ children, ...props }) => (
                              <h3 {...props} className="text-sm font-semibold my-1">{children}</h3>
                            ),
                            // 表格样式
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

                    {/* Tool Calls Display - 保留旧格式兼容 */}
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
            );})
          )}
          {aiState.isThinking && (
            <div className="flex gap-3">
              {!compactMode && (
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-violet-600 dark:text-violet-400" />
                </div>
              )}
              <div className="bg-white dark:bg-cyber-800/50 p-3 rounded-2xl rounded-tl-none border border-paper-200 dark:border-cyber-700 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-violet-500" />
                <span className="text-xs text-slate-500">{language === 'zh' ? 'AI 正在思考...' : 'AI is thinking...'}</span>
                {isStreaming && onStopStreaming && (
                  <button
                    onClick={onStopStreaming}
                    className="ml-2 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-500 transition-colors"
                    title={t.stopGeneration}
                  >
                    <Square size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50">
          <form onSubmit={handleSubmit} className="space-y-2">
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
                <button
                  type="button"
                  onClick={toggle}
                  disabled={aiState.isThinking || isProcessing}
                  className={`p-3 rounded-xl transition-all shrink-0 ${
                    isProcessing
                      ? 'bg-amber-500 text-white animate-pulse shadow-lg shadow-amber-500/50'
                      : isListening
                      ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50'
                      : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-50'
                  }`}
                  title={
                    isProcessing
                      ? (language === 'zh' ? '正在转录...' : 'Processing...')
                      : isListening
                      ? (t.voice?.stopRecording || 'Stop Recording')
                      : (t.voice?.startRecording || 'Start Recording')
                  }
                >
                  {isProcessing ? <Loader2 size={20} className="animate-spin" /> : isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
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
          onRestore={onRestoreCheckpoint || (async () => {})}
          onDelete={onDeleteCheckpoint || (async () => {})}
          onCreate={onCreateCheckpoint || (async () => {})}
        />

        {/* Memory Search Panel */}
        {showMemorySearch && (
          <div className="absolute inset-x-0 bottom-full mb-2 mx-2 bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-700 p-3 z-50">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={14} className="text-violet-500" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {language === 'zh' ? '搜索记忆' : 'Search Memories'}
              </span>
              <button
                onClick={() => setShowMemorySearch(false)}
                className="ml-auto p-1 hover:bg-slate-100 dark:hover:bg-cyber-700 rounded"
              >
                <X size={12} className="text-slate-400" />
              </button>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={memorySearchQuery}
                onChange={(e) => setMemorySearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMemorySearch()}
                placeholder={language === 'zh' ? '搜索...' : 'Search...'}
                className="flex-1 px-2 py-1 text-xs bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded focus:outline-none focus:border-violet-500"
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
            <div className="max-h-48 overflow-y-auto space-y-1">
              {memorySearchResults.map((memory) => (
                <div
                  key={memory.id}
                  onClick={() => handleMemoryClick(memory)}
                  className="px-2 py-1.5 rounded hover:bg-paper-200 dark:hover:bg-cyber-700 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <Sparkles size={10} className="text-violet-400" />
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                      {memory.filePath?.split('/').pop()?.replace('.md', '') || memory.id}
                    </span>
                  </div>
                  {memory.topics && memory.topics.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {memory.topics.slice(0, 3).map((topic: string, i: number) => (
                        <span key={i} className="text-[9px] px-1 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded">
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {memorySearchResults.length === 0 && memorySearchQuery && !isSearchingMemories && (
                <p className="text-xs text-slate-400 text-center py-2">
                  {language === 'zh' ? '未找到相关记忆' : 'No memories found'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};