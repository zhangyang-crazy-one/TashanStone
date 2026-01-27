import React, { memo } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

import type { AIState, ChatMessage, LinkInsertResult, MarkdownFile } from '../../types';
import type { Backlink } from '../../src/types/wiki';
import { ViewMode } from '../../types';
import type { Language } from '../../utils/translations';
import { AppViewRouter, type AppViewRouterProps } from './AppViewRouter';
import { BacklinkPanel } from '../BacklinkPanel';
import { ChatPanel } from '../ChatPanel';
import { LinkInsertModal } from '../LinkInsertModal';

interface AppWorkspaceProps {
  viewRouterProps: AppViewRouterProps;
  viewMode: ViewMode;
  isLinkInsertOpen: boolean;
  linkInsertMode: 'wikilink' | 'blockref' | 'quick_link';
  files: MarkdownFile[];
  activeFileId: string;
  selectedText: string;
  onInsertLink: (result: LinkInsertResult) => void;
  onCloseLinkInsert: () => void;
  backlinks: Backlink[];
  activeFileName: string;
  onNavigateBacklink: (fileId: string) => void;
  isChatOpen: boolean;
  onCloseChat: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClearChat: () => void;
  onCompactChat?: () => Promise<void>;
  aiState: AIState;
  language: Language;
  isStreaming: boolean;
  onStopStreaming?: () => void;
  showToast: (message: string, isError?: boolean) => void;
}

export const AppWorkspace = memo((props: AppWorkspaceProps) => {
  const {
    viewRouterProps,
    viewMode,
    isLinkInsertOpen,
    linkInsertMode,
    files,
    activeFileId,
    selectedText,
    onInsertLink,
    onCloseLinkInsert,
    backlinks,
    activeFileName,
    onNavigateBacklink,
    isChatOpen,
    onCloseChat,
    messages,
    onSendMessage,
    onClearChat,
    onCompactChat,
    aiState,
    language,
    isStreaming,
    onStopStreaming,
    showToast
  } = props;

  const showBacklinks = backlinks.length > 0 && (
    viewMode === ViewMode.Editor || viewMode === ViewMode.Split || viewMode === ViewMode.Preview
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative min-w-0 min-h-0">
      <AppViewRouter {...viewRouterProps} />

      <LinkInsertModal
        isOpen={isLinkInsertOpen}
        mode={linkInsertMode}
        files={files}
        currentFileId={activeFileId}
        onInsert={onInsertLink}
        onClose={onCloseLinkInsert}
        selectedText={selectedText}
      />

      {showBacklinks && (
        <div className="w-64 border-l border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900 overflow-y-auto">
          <BacklinkPanel
            currentFileName={activeFileName}
            backlinks={backlinks}
            onNavigate={onNavigateBacklink}
          />
        </div>
      )}

      <ChatPanel
        isOpen={isChatOpen}
        onClose={onCloseChat}
        messages={messages}
        onSendMessage={onSendMessage}
        onClearChat={onClearChat}
        onCompactChat={onCompactChat}
        aiState={aiState}
        language={language}
        isStreaming={isStreaming}
        onStopStreaming={onStopStreaming}
        showToast={showToast}
      />

      {(aiState.message || aiState.error) && (
        <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 z-50 animate-bounce-in ${aiState.error ? 'bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-200' : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-800 dark:text-cyan-200'}`}>
          {aiState.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span className="text-sm font-medium">{aiState.message || aiState.error}</span>
        </div>
      )}
    </div>
  );
});

AppWorkspace.displayName = 'AppWorkspace';
