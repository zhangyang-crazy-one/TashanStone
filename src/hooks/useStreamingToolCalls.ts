import { useCallback, useRef } from 'react';
import { ToolCall } from '@/types';

const mergeToolCalls = (existing: ToolCall[], incoming: ToolCall): ToolCall[] => {
  const next = [...existing];
  const index = next.findIndex(call => call.id === incoming.id);
  if (index >= 0) {
    next[index] = { ...next[index], ...incoming };
    return next;
  }
  return [...next, incoming];
};

export const useStreamingToolCalls = () => {
  const toolCallsRef = useRef<ToolCall[]>([]);

  const upsertToolCall = useCallback((toolCall: ToolCall) => {
    toolCallsRef.current = mergeToolCalls(toolCallsRef.current, toolCall);
  }, []);

  const replaceToolCalls = useCallback((toolCalls: ToolCall[]) => {
    toolCallsRef.current = [...toolCalls];
  }, []);

  const resetToolCalls = useCallback(() => {
    toolCallsRef.current = [];
  }, []);

  const getToolCalls = useCallback(() => toolCallsRef.current, []);

  return {
    upsertToolCall,
    replaceToolCalls,
    resetToolCalls,
    getToolCalls
  };
};
