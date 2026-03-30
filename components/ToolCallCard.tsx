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
  const displayName = toolCall.name.startsWith('media:')
    ? `Media • ${toolCall.name.replace('media:', '')}`
    : toolCall.name.startsWith('delivery:')
      ? `Delivery • ${toolCall.name.replace('delivery:', '')}`
      : toolCall.name;
  const progress = toolCall.result
    && typeof toolCall.result === 'object'
    && !Array.isArray(toolCall.result)
    && 'progress' in toolCall.result
    && typeof toolCall.result.progress === 'number'
      ? toolCall.result.progress
      : undefined;

  return (
    <StreamToolCard
      toolName={displayName}
      status={statusMap[toolCall.status] || 'executing'}
      result={toolCall.result ? (typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result)) : undefined}
      error={toolCall.error}
      args={toolCall.args}
      partialArgs={toolCall.partialArgs}
      rawArgs={toolCall.rawArgs}
      isStreaming={toolCall.status === 'pending'}
      progress={progress}
      language={language}
    />
  );
};

export default ToolCallCard;
