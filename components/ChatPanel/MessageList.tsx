import React, { useMemo } from 'react';
import { Bot, Loader2, Square } from 'lucide-react';
import type { AIState, ChatMessage } from '../../types';
import { ChatMessageRow } from './MessageItem';
import { List, type ListImperativeAPI, type RowComponentProps, useDynamicRowHeight } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import Tooltip from '../Tooltip';
import { translations, type Language } from '../../utils/translations';

const DEFAULT_ROW_HEIGHT = 80;

interface MessageListProps {
  messages: ChatMessage[];
  aiState: AIState;
  isStreaming: boolean;
  compactMode: boolean;
  language: Language;
  onStopStreaming?: () => void;
  listRef: React.RefObject<ListImperativeAPI | null>;
  onScroll?: () => void;
  onRowsRendered?: (visibleRows: { startIndex: number; stopIndex: number }) => void;
}

type TranslationDictionary = typeof translations.en;

type MessageRowProps = {
  messages: ChatMessage[];
  aiState: AIState;
  isStreaming: boolean;
  compactMode: boolean;
  language: Language;
  onStopStreaming?: () => void;
  t: TranslationDictionary;
};

const MessageRow = ({ index, style, ariaAttributes, ...rowProps }: RowComponentProps<MessageRowProps>) => {
  const { messages, aiState, isStreaming, compactMode, language, onStopStreaming, t } = rowProps;
  const isThinkingRow = index >= messages.length;

  if (!isThinkingRow) {
    const msg = messages[index];
    const isStreamingMessage = isStreaming && msg.role === 'assistant' && index === messages.length - 1;

    return (
      <div style={style} {...ariaAttributes}>
        <ChatMessageRow
          message={msg}
          isStreamingMessage={isStreamingMessage}
          compactMode={compactMode}
          language={language}
          onStopStreaming={onStopStreaming}
        />
      </div>
    );
  }

  if (!aiState.isThinking) return null;

  return (
    <div style={style} {...ariaAttributes}>
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
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  aiState,
  isStreaming,
  compactMode,
  language,
  onStopStreaming,
  listRef,
  onScroll,
  onRowsRendered
}) => {
  const t = translations[language];
  const rowCount = messages.length + (aiState.isThinking ? 1 : 0);
  const rowHeightKey = useMemo(
    () => `${messages.length}-${compactMode}-${aiState.isThinking}-${language}-${isStreaming}`,
    [messages.length, compactMode, aiState.isThinking, language, isStreaming]
  );
  const dynamicRowHeight = useDynamicRowHeight({ defaultRowHeight: DEFAULT_ROW_HEIGHT, key: rowHeightKey });

  return (
    <div className="flex-1 min-h-0">
      {rowCount === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center space-y-2 opacity-60">
          <Bot size={48} />
          <p className="max-w-[80%]">{t.askMe}</p>
        </div>
      ) : (
        <AutoSizer
          renderProp={({ height, width }) => {
            if (!height || !width) return null;
            return (
              <List
                className="custom-scrollbar"
                rowCount={rowCount}
                rowHeight={dynamicRowHeight}
                rowComponent={MessageRow}
                rowProps={{
                  messages,
                  aiState,
                  isStreaming,
                  compactMode,
                  language,
                  onStopStreaming,
                  t
                }}
                overscanCount={6}
                style={{ height, width }}
                listRef={listRef}
                onScroll={() => onScroll?.()}
                onRowsRendered={(visibleRows) => onRowsRendered?.(visibleRows)}
              />
            );
          }}
        />
      )}
    </div>
  );
};
