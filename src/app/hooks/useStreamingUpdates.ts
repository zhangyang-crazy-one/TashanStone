import { useCallback, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { ChatMessage } from '@/types';
import { STREAM_UPDATE_INTERVAL_MS } from '@/src/app/appDefaults';

interface StreamMessageUpdate {
  messageId: string;
  content: string;
}

interface UseStreamingUpdatesOptions {
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}

interface UseStreamingUpdatesResult {
  isStreaming: boolean;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  abortControllerRef: MutableRefObject<AbortController | null>;
  scheduleStreamingMessageUpdate: (messageId: string, content: string) => void;
  flushStreamingMessageUpdate: () => void;
  maybeYieldToBrowser: () => Promise<void>;
  resetStreamYield: () => void;
}

export const useStreamingUpdates = ({ setChatMessages }: UseStreamingUpdatesOptions): UseStreamingUpdatesResult => {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamMessageUpdateRef = useRef<StreamMessageUpdate | null>(null);
  const streamFrameRef = useRef<number | null>(null);
  const lastStreamYieldRef = useRef<number>(0);

  const scheduleStreamingMessageUpdate = useCallback((messageId: string, content: string) => {
    const pending = streamMessageUpdateRef.current;
    if (!pending || pending.messageId !== messageId) {
      streamMessageUpdateRef.current = { messageId, content };
    } else {
      pending.content = content;
    }

    if (streamFrameRef.current !== null) return;

    const scheduleFrame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback: FrameRequestCallback) => setTimeout(callback, 16);

    streamFrameRef.current = scheduleFrame(() => {
      const latest = streamMessageUpdateRef.current;
      streamMessageUpdateRef.current = null;
      streamFrameRef.current = null;
      if (!latest) return;
      setChatMessages(prev => prev.map(msg =>
        msg.id === latest.messageId ? { ...msg, content: latest.content } : msg
      ));
    });
  }, [setChatMessages]);

  const flushStreamingMessageUpdate = useCallback(() => {
    const pending = streamMessageUpdateRef.current;
    if (!pending) return;
    if (streamFrameRef.current !== null) {
      const cancelFrame = typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : (frameId: number) => clearTimeout(frameId);
      cancelFrame(streamFrameRef.current);
      streamFrameRef.current = null;
    }
    streamMessageUpdateRef.current = null;
    setChatMessages(prev => prev.map(msg =>
      msg.id === pending.messageId ? { ...msg, content: pending.content } : msg
    ));
  }, [setChatMessages]);

  const maybeYieldToBrowser = useCallback(async () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastStreamYieldRef.current < STREAM_UPDATE_INTERVAL_MS) {
      return;
    }
    lastStreamYieldRef.current = now;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => resolve());
    });
  }, []);

  const resetStreamYield = useCallback(() => {
    lastStreamYieldRef.current = 0;
  }, []);

  return {
    isStreaming,
    setIsStreaming,
    abortControllerRef,
    scheduleStreamingMessageUpdate,
    flushStreamingMessageUpdate,
    maybeYieldToBrowser,
    resetStreamYield
  };
};
