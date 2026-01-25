import React, { memo } from 'react';
import { Bot, Loader2, Sparkles, Square, User } from 'lucide-react';

import type { ChatMessage } from '../../types';
import { RAGResultsCard } from '../RAGResultsCard';
import Tooltip from '../Tooltip';
import { MessageMarkdown } from './MessageMarkdown';
import { ToolCallDetails } from './ToolCallDetails';
import { translations, type Language } from '../../utils/translations';

interface ChatMessageRowProps {
  message: ChatMessage;
  isStreamingMessage: boolean;
  compactMode: boolean;
  language: Language;
  onStopStreaming?: () => void;
}

export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  isStreamingMessage,
  compactMode,
  language,
  onStopStreaming
}: ChatMessageRowProps) {
  const t = translations[language];
  const msg = message;

  return (
    <div className="px-4">
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
                <ToolCallDetails
                  content={msg.content}
                  isStreaming
                  language={language}
                  toolCalls={msg.toolCalls}
                  compactMode={compactMode}
                  disableToolParsing={Boolean(msg.toolCalls?.length)}
                  showStatus={false}
                />
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
              <ToolCallDetails
                content={msg.content}
                language={language}
                toolCalls={msg.toolCalls}
                compactMode={compactMode}
                disableToolParsing={Boolean(msg.toolCalls?.length)}
              />
            ) : (
              <MessageMarkdown content={msg.content} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => (
  prev.message === next.message &&
  prev.isStreamingMessage === next.isStreamingMessage &&
  prev.compactMode === next.compactMode &&
  prev.language === next.language &&
  prev.onStopStreaming === next.onStopStreaming
));

const MESSAGE_ITEM_HEIGHT = 80;

type TranslationDictionary = typeof translations.en;

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
  t: TranslationDictionary;
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
                <ToolCallDetails
                  content={msg.content}
                  isStreaming
                  language={language}
                  toolCalls={msg.toolCalls}
                  compactMode={compactMode}
                  disableToolParsing={Boolean(msg.toolCalls?.length)}
                  showStatus={false}
                />
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
              <ToolCallDetails
                content={msg.content}
                language={language}
                toolCalls={msg.toolCalls}
                compactMode={compactMode}
                disableToolParsing={Boolean(msg.toolCalls?.length)}
              />
            ) : (
              <MessageMarkdown content={msg.content} useCustomComponents />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageItem = React.memo(MessageItemComponent) as React.ComponentType<MessageItemProps>;
