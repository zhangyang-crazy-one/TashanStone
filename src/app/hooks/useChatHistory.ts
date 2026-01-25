import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ChatMessage } from '@/types';

interface UseChatHistoryResult {
  chatMessages: ChatMessage[];
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

export const useChatHistory = (): UseChatHistoryResult => {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('neon-chat-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('neon-chat-history', JSON.stringify(chatMessages));
  }, [chatMessages]);

  return {
    chatMessages,
    setChatMessages
  };
};
