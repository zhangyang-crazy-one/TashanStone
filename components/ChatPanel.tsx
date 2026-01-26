import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useListRef } from 'react-window';

import type { AIState, ChatMessage } from '../types';
import { ChatHeader } from './ChatPanel/ChatHeader';
import { ChatInput } from './ChatPanel/ChatInput';
import { MessageList } from './ChatPanel/MessageList';
import { useChatMemory } from './ChatPanel/useChatMemory';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { CheckpointDrawer } from './context';
import { MemoryPreviewModal } from './MemoryPreviewModal';
import { translations, type Language } from '../utils/translations';

export { MessageItem } from './ChatPanel/MessageItem';

interface Checkpoint {
  id: string;
  name: string;
  message_count: number;
  token_count: number;
  summary: string;
  created_at: number;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  onCompactChat?: () => Promise<void>;
  onPruneChat?: () => Promise<void>;
  onTruncateChat?: () => Promise<void>;
  onCreateCheckpoint?: (name: string) => Promise<void>;
  onRestoreCheckpoint?: (checkpointId: string) => Promise<void>;
  onDeleteCheckpoint?: (checkpointId: string) => Promise<void>;
  aiState: AIState;
  language?: Language;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  showToast?: (message: string, isError?: boolean) => void;
  tokenUsage?: number;
  maxTokens?: number;
  checkpoints?: Checkpoint[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onClearChat,
  onCompactChat,
  onPruneChat,
  onTruncateChat,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onDeleteCheckpoint,
  aiState,
  language = 'en',
  isStreaming = false,
  onStopStreaming,
  showToast,
  tokenUsage = 0,
  maxTokens = 200000,
  checkpoints = [],
}) => {
  const [input, setInput] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [compactMode, setCompactMode] = useState(false);
  const [showCheckpointDrawer, setShowCheckpointDrawer] = useState(false);
  const listRef = useListRef(null);
  const shouldAutoScrollRef = useRef(true);
  const forceAutoScrollRef = useRef(false);
  const t = translations[language];
  const {
    showMemorySearch,
    memorySearchQuery,
    setMemorySearchQuery,
    memorySearchResults,
    isSearchingMemories,
    injectedMemories,
    previewMemory,
    isPreviewOpen,
    handleToggleMemorySearch,
    handleCloseMemoryPanel,
    handleRemoveInjectedMemory,
    handleMemorySearch,
    buildInjectedMessage,
    handleMemoryClick,
    handleConfirmAddMemory,
    handleSaveMemory,
    handleStarMemory,
    handleCloseMemoryPreview
  } = useChatMemory({ language, showToast });

  // Voice input using speech recognition hook
  const { isListening, isProcessing, isSupported, toggle } = useSpeechRecognition({
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        // Append final transcript to input, add space if input exists
        setInput(prev => prev ? `${prev} ${transcript}` : transcript);
        setInterimTranscript('');
      } else {
        // Show interim transcript
        setInterimTranscript(transcript);
      }
    },
    onEnd: () => {
      setInterimTranscript('');
    },
    onError: (error) => {
      console.error('Speech recognition error:', error);
      setInterimTranscript('');
      // Use toast notification instead of alert
      showToast?.(`Voice recognition error: ${error}`, true);
    },
    continuous: true,
    language: language === 'zh' ? 'zh-CN' : 'en-US'
  });

  const scrollToBottom = useCallback((behavior?: ScrollBehavior) => {
    const scrollBehavior = behavior ?? (isStreaming ? 'auto' : 'smooth');
    const lastIndex = messages.length + (aiState.isThinking ? 1 : 0) - 1;
    if (lastIndex < 0) return;
    shouldAutoScrollRef.current = true;
    forceAutoScrollRef.current = true;
    listRef.current?.scrollToRow({
      index: lastIndex,
      align: 'end',
      behavior: scrollBehavior === 'smooth' ? 'smooth' : 'auto'
    });
  }, [aiState.isThinking, isStreaming, listRef, messages.length]);

  const rowCount = messages.length + (aiState.isThinking ? 1 : 0);

  const handleRowsRendered = useCallback((visibleRows: { startIndex: number; stopIndex: number }) => {
    if (forceAutoScrollRef.current) {
      shouldAutoScrollRef.current = true;
      if (visibleRows.stopIndex >= rowCount - 1) {
        forceAutoScrollRef.current = false;
      }
      return;
    }
    shouldAutoScrollRef.current = visibleRows.stopIndex >= rowCount - 1;
  }, [rowCount]);

  useEffect(() => {
    if (!isOpen || typeof ResizeObserver === 'undefined') return;
    const listElement = listRef.current?.element;
    if (!listElement) return;
    const sizingElement = listElement.lastElementChild;
    if (!(sizingElement instanceof HTMLElement)) return;

    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!shouldAutoScrollRef.current) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    });

    observer.observe(sizingElement);

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isOpen, aiState.isThinking, messages.length, scrollToBottom]);

  const handleToggleCompactMode = useCallback(() => {
    setCompactMode(prev => !prev);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    shouldAutoScrollRef.current = true;
    scrollToBottom('auto');
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    if (!isOpen || !shouldAutoScrollRef.current) return;
    scrollToBottom();
  }, [messages, isOpen, scrollToBottom]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || aiState.isThinking) return;

    const userQuery = input.trim();
    const messageContent = await buildInjectedMessage(userQuery);

    shouldAutoScrollRef.current = true;
    forceAutoScrollRef.current = true;
    onSendMessage(messageContent);
    setInput('');
  }, [input, aiState.isThinking, buildInjectedMessage, onSendMessage]);

  return (
    <div
      className={`
        fixed inset-y-0 right-0 z-40 w-80 sm:w-96 transform transition-transform duration-300 ease-in-out shadow-2xl
        bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border-l border-paper-200 dark:border-cyber-700
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      <div className="flex flex-col h-full relative">
        <ChatHeader
          aiState={aiState}
          language={language}
          t={t}
          tokenUsage={tokenUsage}
          maxTokens={maxTokens}
          messagesCount={messages.length}
          compactMode={compactMode}
          onToggleCompactMode={handleToggleCompactMode}
          onCompactChat={onCompactChat}
          showMemorySearch={showMemorySearch}
          onToggleMemorySearch={handleToggleMemorySearch}
          memorySearchQuery={memorySearchQuery}
          onMemorySearchQueryChange={setMemorySearchQuery}
          onMemorySearch={handleMemorySearch}
          isSearchingMemories={isSearchingMemories}
          memorySearchResults={memorySearchResults}
          onMemoryClick={handleMemoryClick}
          injectedMemories={injectedMemories}
          onRemoveInjectedMemory={handleRemoveInjectedMemory}
          onCloseMemoryPanel={handleCloseMemoryPanel}
          onClearChat={onClearChat}
          onClose={onClose}
        />

        <MessageList
          messages={messages}
          aiState={aiState}
          isStreaming={isStreaming}
          compactMode={compactMode}
          language={language}
          onStopStreaming={onStopStreaming}
          listRef={listRef}
          onRowsRendered={handleRowsRendered}
        />

        <ChatInput
          input={input}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          aiState={aiState}
          language={language}
          t={t}
          isSupported={isSupported}
          isProcessing={isProcessing}
          isListening={isListening}
          onToggleListening={toggle}
          interimTranscript={interimTranscript}
        />

        <CheckpointDrawer
          isOpen={showCheckpointDrawer}
          onClose={() => setShowCheckpointDrawer(false)}
          checkpoints={checkpoints}
          onRestore={onRestoreCheckpoint || (async () => { })}
          onDelete={onDeleteCheckpoint || (async () => { })}
          onCreate={onCreateCheckpoint || (async () => { })}
        />

        <MemoryPreviewModal
          memory={previewMemory}
          isOpen={isPreviewOpen}
          onClose={handleCloseMemoryPreview}
          onConfirm={handleConfirmAddMemory}
          onSave={handleSaveMemory}
          onStar={handleStarMemory}
          language={language}
        />
      </div>
    </div>
  );
};
