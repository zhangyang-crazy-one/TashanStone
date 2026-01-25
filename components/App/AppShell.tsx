import React, { memo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type {
  AIProvider,
  AIState,
  ChatMessage,
  EditorPane,
  LinkInsertResult,
  MarkdownFile,
  OCRStats,
  RAGStats,
  Snippet,
  Theme,
  ViewMode
} from '../../types';
import type { Backlink } from '../../src/types/wiki';
import type { AppViewRouterProps } from './AppViewRouter';
import type { Language } from '../../utils/translations';
import { Sidebar } from '../Sidebar';
import { Toolbar } from '../Toolbar';
import { EditorTabs } from '../EditorTabs';
import { AppWorkspace } from './AppWorkspace';

export interface AppShellProps {
  files: MarkdownFile[];
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateItem: (type: 'file' | 'folder', name: string, parentPath: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveItem: (sourceId: string, targetFolderPath: string | null) => void;
  isSidebarOpen: boolean;
  onCloseSidebarMobile: () => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportPdf: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  ragStats: RAGStats;
  ocrStats: OCRStats;
  onRefreshIndex: () => void;
  snippets: Snippet[];
  onCreateSnippet: (snippet: Omit<Snippet, 'id'>) => void;
  onDeleteSnippet: (id: string) => void;
  onInsertSnippet: (content: string) => void;
  onOpenTagSuggestion: () => void;
  onOpenSmartOrganize: (file: MarkdownFile) => void;
  onOpenReview: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onClear: () => void;
  onExport: () => void;
  onAIPolish: () => void;
  onAIExpand: () => void;
  onBuildGraph: (useActiveFileOnly?: boolean, graphType?: 'concept' | 'filelink') => void;
  onSynthesize: () => void;
  onGenerateMindMap: () => void;
  onGenerateQuiz: () => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onUndo: () => void;
  onRedo: () => void;
  isAIThinking: boolean;
  theme: Theme;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleChat: () => void;
  toggleSettings: () => void;
  fileName: string;
  onRename: (newName: string) => void;
  activeProvider: AIProvider;
  splitMode: 'none' | 'horizontal' | 'vertical';
  onSplitModeChange: (mode: 'none' | 'horizontal' | 'vertical') => void;
  onVoiceTranscription: () => void;
  onOpenQuestionBank: () => void;
  panes: EditorPane[];
  activePane: string | null;
  onSelectPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onTogglePaneMode: (paneId: string) => void;
  viewRouterProps: AppViewRouterProps;
  isLinkInsertOpen: boolean;
  linkInsertMode: 'wikilink' | 'blockref' | 'quick_link';
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
  isStreaming: boolean;
  onStopStreaming?: () => void;
  showToast: (message: string, isError?: boolean) => void;
  language: Language;
}

const MemoSidebar = memo(Sidebar);
const MemoToolbar = memo(Toolbar);
const MemoEditorTabs = memo(EditorTabs);

export const AppShell = memo((props: AppShellProps) => {
  const {
    files,
    setFiles,
    activeFileId,
    onSelectFile,
    onCreateItem,
    onDeleteFile,
    onMoveItem,
    isSidebarOpen,
    onCloseSidebarMobile,
    onOpenFolder,
    onImportFolderFiles,
    onImportPdf,
    onImportQuiz,
    ragStats,
    ocrStats,
    onRefreshIndex,
    snippets,
    onCreateSnippet,
    onDeleteSnippet,
    onInsertSnippet,
    onOpenTagSuggestion,
    onOpenSmartOrganize,
    onOpenReview,
    viewMode,
    setViewMode,
    onClear,
    onExport,
    onAIPolish,
    onAIExpand,
    onBuildGraph,
    onSynthesize,
    onGenerateMindMap,
    onGenerateQuiz,
    onFormatBold,
    onFormatItalic,
    onUndo,
    onRedo,
    isAIThinking,
    theme,
    toggleTheme,
    toggleSidebar,
    toggleChat,
    toggleSettings,
    fileName,
    onRename,
    activeProvider,
    splitMode,
    onSplitModeChange,
    onVoiceTranscription,
    onOpenQuestionBank,
    panes,
    activePane,
    onSelectPane,
    onClosePane,
    onTogglePaneMode,
    viewRouterProps,
    isLinkInsertOpen,
    linkInsertMode,
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
    isStreaming,
    onStopStreaming,
    showToast,
    language
  } = props;

  return (
    <>
      <MemoSidebar
        files={files}
        setFiles={setFiles}
        activeFileId={activeFileId}
        onSelectFile={onSelectFile}
        onCreateItem={onCreateItem}
        onDeleteFile={onDeleteFile}
        onMoveItem={onMoveItem}
        isOpen={isSidebarOpen}
        onCloseMobile={onCloseSidebarMobile}
        onOpenFolder={onOpenFolder}
        onImportFolderFiles={onImportFolderFiles}
        onImportPdf={onImportPdf}
        onImportQuiz={onImportQuiz}
        language={language}
        ragStats={ragStats}
        ocrStats={ocrStats}
        onRefreshIndex={onRefreshIndex}
        snippets={snippets}
        onCreateSnippet={onCreateSnippet}
        onDeleteSnippet={onDeleteSnippet}
        onInsertSnippet={onInsertSnippet}
        onOpenTagSuggestion={onOpenTagSuggestion}
        onOpenSmartOrganize={onOpenSmartOrganize}
        onOpenReview={onOpenReview}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <MemoToolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          onClear={onClear}
          onExport={onExport}
          onAIPolish={onAIPolish}
          onAIExpand={onAIExpand}
          onBuildGraph={onBuildGraph}
          onSynthesize={onSynthesize}
          onGenerateMindMap={onGenerateMindMap}
          onGenerateQuiz={onGenerateQuiz}
          onFormatBold={onFormatBold}
          onFormatItalic={onFormatItalic}
          onUndo={onUndo}
          onRedo={onRedo}
          isAIThinking={isAIThinking}
          theme={theme}
          toggleTheme={toggleTheme}
          toggleSidebar={toggleSidebar}
          toggleChat={toggleChat}
          toggleSettings={toggleSettings}
          fileName={fileName}
          onRename={onRename}
          activeProvider={activeProvider}
          language={language}
          splitMode={splitMode}
          onSplitModeChange={onSplitModeChange}
          onVoiceTranscription={onVoiceTranscription}
          onOpenQuestionBank={onOpenQuestionBank}
        />

        <MemoEditorTabs
          panes={panes}
          activePane={activePane}
          files={files}
          onSelectPane={onSelectPane}
          onClosePane={onClosePane}
          onToggleMode={onTogglePaneMode}
          language={language}
        />

        <AppWorkspace
          viewRouterProps={viewRouterProps}
          viewMode={viewMode}
          isLinkInsertOpen={isLinkInsertOpen}
          linkInsertMode={linkInsertMode}
          files={files}
          activeFileId={activeFileId}
          selectedText={selectedText}
          onInsertLink={onInsertLink}
          onCloseLinkInsert={onCloseLinkInsert}
          backlinks={backlinks}
          activeFileName={activeFileName}
          onNavigateBacklink={onNavigateBacklink}
          isChatOpen={isChatOpen}
          onCloseChat={onCloseChat}
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
      </div>
    </>
  );
});

AppShell.displayName = 'AppShell';
MemoSidebar.displayName = 'MemoSidebar';
MemoToolbar.displayName = 'MemoToolbar';
MemoEditorTabs.displayName = 'MemoEditorTabs';
