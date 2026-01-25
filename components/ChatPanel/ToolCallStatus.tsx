import React from 'react';
import type { ToolCall } from '../../types';
import { ToolCallCard } from '../ToolCallCard';
import type { Language } from '../../utils/translations';

interface ToolCallStatusProps {
  toolCalls?: ToolCall[];
  compactMode: boolean;
  language: Language;
}

export const ToolCallStatus: React.FC<ToolCallStatusProps> = ({ toolCalls, compactMode, language }) => {
  if (!toolCalls || toolCalls.length === 0 || compactMode) return null;

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700">
      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">
        {language === 'zh' ? '工具调用' : 'Tool Calls'} ({toolCalls.length})
      </div>
      {toolCalls.map(tc => (
        <ToolCallCard
          key={tc.id}
          toolCall={tc}
          language={language}
        />
      ))}
    </div>
  );
};
