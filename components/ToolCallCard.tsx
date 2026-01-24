import React from 'react';
import { ToolCall } from '../types';
import { StreamToolCard } from './StreamToolCard';
import { Language } from '../utils/translations';

export { StreamToolCard } from './StreamToolCard';
export { ThinkingCard } from './ThinkingCard';
export { parseToolCallsFromContent } from '../utils/parseToolCalls';

interface ToolCallCardProps {
  toolCall: ToolCall;
  isExpanded?: boolean;
  language?: Language;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall, language = 'en' }) => {
  const statusMap: Record<string, 'executing' | 'success' | 'error'> = {
    pending: 'executing',
    running: 'executing',
    success: 'success',
    error: 'error'
  };

  return (
    <StreamToolCard
      toolName={toolCall.name}
      status={statusMap[toolCall.status] || 'executing'}
      result={toolCall.result ? (typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result)) : undefined}
      args={toolCall.args}
      language={language}
    />
  );
};

export default ToolCallCard;
