import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { ToolCall } from '../../types';
import { StreamToolCard, parseToolCallsFromContent, ThinkingCard } from '../ToolCallCard';
import { ToolCallStatus } from './ToolCallStatus';
import type { Language } from '../../utils/translations';

interface StreamingMessageContentProps {
  content: string;
}

const StreamingMessageContent: React.FC<StreamingMessageContentProps> = ({ content }) => (
  <div className="chat-markdown-content whitespace-pre-wrap break-words">
    {content}
  </div>
);

interface SmartMessageContentProps {
  content: string;
  isStreaming?: boolean;
  language: Language;
  disableToolParsing?: boolean;
}

const SmartMessageContent: React.FC<SmartMessageContentProps> = ({
  content,
  isStreaming,
  language,
  disableToolParsing = false
}) => {
  if (isStreaming) {
    return <StreamingMessageContent content={content} />;
  }

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
        }
        if (part.type === 'tool' && part.toolName) {
          return (
            <StreamToolCard
              key={idx}
              toolName={part.toolName}
              status={part.status || 'executing'}
              result={part.result}
              language={language}
            />
          );
        }
        if (part.type === 'thinking' && part.content) {
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

interface ToolCallDetailsProps {
  content: string;
  isStreaming?: boolean;
  language: Language;
  toolCalls?: ToolCall[];
  compactMode: boolean;
  disableToolParsing?: boolean;
  showStatus?: boolean;
}

export const ToolCallDetails: React.FC<ToolCallDetailsProps> = ({
  content,
  isStreaming,
  language,
  toolCalls,
  compactMode,
  disableToolParsing,
  showStatus = true
}) => {
  const shouldDisableToolParsing = disableToolParsing ?? Boolean(toolCalls?.length);

  return (
    <>
      <SmartMessageContent
        content={content}
        isStreaming={isStreaming}
        language={language}
        disableToolParsing={shouldDisableToolParsing}
      />
      {showStatus && (
        <ToolCallStatus toolCalls={toolCalls} language={language} compactMode={compactMode} />
      )}
    </>
  );
};
