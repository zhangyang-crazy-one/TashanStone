import React from 'react';
import { Bot, Loader2, Square } from 'lucide-react';
import type { AIState, ChatMessage } from '../../types';
import { ChatMessageRow } from './MessageItem';
import Tooltip from '../Tooltip';
import { translations, type Language } from '../../utils/translations';

interface MessageListProps {
  messages: ChatMessage[];
  aiState: AIState;
  isStreaming: boolean;
  compactMode: boolean;
  language: Language;
  onStopStreaming?: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  aiState,
  isStreaming,
  compactMode,
  language,
  onStopStreaming,
  scrollContainerRef,
  messagesEndRef,
  onScroll
}) => {
  const t = translations[language];

  return (
    <div
      className="flex-1 overflow-y-auto custom-scrollbar"
      ref={scrollContainerRef}
      onScroll={onScroll}
    >
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center space-y-2 opacity-60">
          <Bot size={48} />
          <p className="max-w-[80%]">{t.askMe}</p>
        </div>
      ) : (
        <div className="py-4">
          {messages.map((msg, index) => {
            const isStreamingMessage = isStreaming && msg.role === 'assistant' && index === messages.length - 1;

            return (
              <ChatMessageRow
                key={msg.id || index}
                message={msg}
                isStreamingMessage={isStreamingMessage}
                compactMode={compactMode}
                language={language}
                onStopStreaming={onStopStreaming}
              />
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
  );
};
