import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ChatMessage } from '@/types';
import { getStorageService, type StorageService } from '@/src/services/storage/storageService';

interface UseChatHistoryResult {
  chatMessages: ChatMessage[];
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

export const useChatHistory = (
  activeSessionId: string | null,
  storage?: StorageService,
): UseChatHistoryResult => {
  const storageRef = useRef<StorageService>(storage ?? getStorageService());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [hydratedSessionId, setHydratedSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadChatHistory() {
      if (!activeSessionId) {
        setChatMessages([]);
        setHydratedSessionId(null);
        return;
      }

      const loaded = await storageRef.current.getSessionMessages(activeSessionId);
      if (cancelled) {
        return;
      }

      setChatMessages(loaded);
      setHydratedSessionId(activeSessionId);
    }

    void loadChatHistory();

    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId || hydratedSessionId !== activeSessionId) {
      return;
    }

    storageRef.current.replaceSessionMessages(activeSessionId, chatMessages).catch(error => {
      console.error('Failed to persist session chat history:', error);
    });
  }, [activeSessionId, chatMessages, hydratedSessionId]);

  return {
    chatMessages,
    setChatMessages,
  };
};
