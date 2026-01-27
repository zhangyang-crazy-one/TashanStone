import React, { useEffect, useRef, useCallback } from 'react';

import type { CodeMirrorEditorRef, MarkdownFile } from './types';

import { LoginScreen } from './components/LoginScreen';
import { AppOverlaysContainer } from './components/App/AppOverlaysContainer';
import { AppShell } from './components/App/AppShell';

import { useAIWorkflow } from '@/src/app/hooks/useAIWorkflow';
import { useAppFeatureState } from '@/src/app/hooks/useAppFeatureState';
import { useEditorActions } from '@/src/app/hooks/useEditorActions';
import { useAuthState } from '@/src/app/hooks/useAuthState';
import { useThemeState } from '@/src/app/hooks/useThemeState';
import { useKnowledgeBase } from '@/src/app/hooks/useKnowledgeBase';
import { useFileOperations } from '@/src/app/hooks/useFileOperations';
import { useFileImports } from '@/src/app/hooks/useFileImports';
import { useKeyboardShortcuts } from '@/src/app/hooks/useKeyboardShortcuts';
import { useWikiLinks } from '@/src/app/hooks/useWikiLinks';
import { useAppServices } from '@/src/app/hooks/useAppServices';
import { useAppConfig } from '@/src/app/hooks/useAppConfig';
import { useChatHistory } from '@/src/app/hooks/useChatHistory';
import { useAppNotifications } from '@/src/app/hooks/useAppNotifications';
import { useAppShellState } from '@/src/app/hooks/useAppShellState';
import { useAppOverlaysState } from '@/src/app/hooks/useAppOverlaysState';
import { useToolbarActions } from '@/src/app/hooks/useToolbarActions';
import { useOverlayActions } from '@/src/app/hooks/useOverlayActions';
import { useAppWorkspaceState } from '@/src/app/hooks/useAppWorkspaceState';

import { DEFAULT_FILE } from './src/app/appDefaults';
import { useAppUiState } from './src/app/hooks/useAppUiState';
import { useFileState } from './src/app/hooks/useFileState';
import { useStreamingUpdates } from './src/app/hooks/useStreamingUpdates';

import { translations, Language } from './utils/translations';

const App: React.FC = () => {
  const {
    themes,
    activeThemeId,
    themeType,
    handleThemeChange,
    toggleTheme,
    handleImportTheme,
    handleDeleteTheme
  } = useThemeState();

  // --- File System State ---
  const {
    files,
    setFiles,
    activeFileId,
    setActiveFileId,
    activeFile,
    history,
    setHistory,
    lastEditTimeRef,
    openPanes,
    setOpenPanes,
    activePaneId,
    setActivePaneId,
    splitMode,
    setSplitMode,
    filesRef,
    activeFileIdRef,
    cursorPositionsRef
  } = useFileState();

  const HISTORY_DEBOUNCE = 1000; // ms
  const MAX_HISTORY = 50;

  const {
    viewMode,
    setViewMode,
    isSaving,
    setIsSaving,
    isSidebarOpen,
    setIsSidebarOpen,
    isChatOpen,
    setIsChatOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isVoiceTranscriptionOpen,
    setIsVoiceTranscriptionOpen,
    isSearchOpen,
    setIsSearchOpen,
    aiState,
    setAiState,
    ragStats,
    setRagStats,
    ocrStats,
    setOcrStats,
    isQuestionBankOpen,
    setIsQuestionBankOpen,
    isTagSuggestionOpen,
    setIsTagSuggestionOpen,
    isSmartOrganizeOpen,
    setIsSmartOrganizeOpen,
    smartOrganizeFile,
    setSmartOrganizeFile,
    isStudyPlanOpen,
    setIsStudyPlanOpen,
    confirmDialog,
    setConfirmDialog,
    isLinkInsertOpen,
    setIsLinkInsertOpen,
    linkInsertMode,
    setLinkInsertMode,
    showCompactMemoryPrompt,
    setShowCompactMemoryPrompt,
    compactMemoryCandidate,
    setCompactMemoryCandidate,
    isCompactSaving,
    setIsCompactSaving
  } = useAppUiState();

  const { showToast, showConfirmDialog, closeConfirmDialog } = useAppNotifications({
    setAiState,
    setConfirmDialog
  });

  // --- Feature State ---
  const { aiConfig, handleSettingsSave, handleSettingsDataImported } = useAppConfig({
    setIsSettingsOpen
  });

  const { isAuthenticated, setIsAuthenticated, isCheckingAuth } = useAuthState({ aiConfig });

  const { chatMessages, setChatMessages } = useChatHistory();

  const { vectorStore, handleIndexKnowledgeBase } = useKnowledgeBase({
    aiConfig,
    files,
    filesRef,
    ragStats,
    setRagStats
  });

  // Handle Smart Organize file updates
  const handleSmartOrganizeUpdate = (fileId: string, updates: Partial<MarkdownFile>) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, ...updates } : f
    ));
  };

  const {
    isStreaming,
    setIsStreaming,
    abortControllerRef,
    scheduleStreamingMessageUpdate,
    flushStreamingMessageUpdate,
    maybeYieldToBrowser,
    resetStreamYield
  } = useStreamingUpdates({ setChatMessages });

  // Refs
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const codeMirrorRef = useRef<CodeMirrorEditorRef>(null);

  // Localization
  const lang: Language = aiConfig.language === 'zh' ? 'zh' : 'en';
  const t = translations[lang];

  // Event listener for editor action events (from CodeMirror shortcuts)
  useEffect(() => {
    const handleEditorAction = (e: Event) => {
      const event = e as CustomEvent;
      const action = event.detail;

      switch (action) {
        case 'insert_wikilink':
          setLinkInsertMode('wikilink');
          setIsLinkInsertOpen(true);
          break;
        case 'insert_blockref':
          setLinkInsertMode('blockref');
          setIsLinkInsertOpen(true);
          break;
        case 'quick_link':
          setLinkInsertMode('quick_link');
          setIsLinkInsertOpen(true);
          break;
      }
    };

    window.addEventListener('editor-action', handleEditorAction as EventListener);
    return () => window.removeEventListener('editor-action', handleEditorAction as EventListener);
  }, []);

  const {
    updateActiveFile,
    handleLinkInsert,
    handleCursorChange,
    handleCursorSave,
    getCursorPosition,
    handleUndo,
    handleRedo,
    saveSnapshot,
    renameActiveFile,
    openFileInPane,
    closePane,
    togglePaneMode,
    getActivePaneContent,
    getActivePaneFileId,
    handleTextFormat,
    handleExport,
    selectPane,
    handlePaneContentChange
  } = useEditorActions({
    files,
    setFiles,
    activeFile,
    activeFileId,
    setActiveFileId,
    filesRef,
    cursorPositionsRef,
    history,
    setHistory,
    lastEditTimeRef,
    historyDebounceMs: HISTORY_DEBOUNCE,
    maxHistory: MAX_HISTORY,
    openPanes,
    setOpenPanes,
    activePaneId,
    setActivePaneId,
    viewMode,
    editorRef,
    codeMirrorRef,
    showToast,
    downloadLabel: t.download
  });

  const {
    graphData,
    graphType,
    currentQuiz,
    quizContext,
    mindMapContent,
    mindMapDetailLevel,
    setMindMapDetailLevel,
    diffOriginal,
    diffModified,
    examHistory,
    knowledgeStats,
    studyPlans,
    snippets,
    questionBanks,
    setQuestionBanks,
    performGraph,
    performPolish,
    performSynthesize,
    handleAIExpand,
    handleGenerateMindMap,
    handleGenerateQuiz,
    handleImportQuiz,
    handleApplyTags,
    handleApplyDiff,
    handleCancelDiff,
    handleCompleteTask,
    handleCreatePlan,
    handleDeletePlan,
    handleCreateSnippet,
    handleDeleteSnippet,
    handleInsertSnippet,
    handleCreateQuestionBank,
    handleDeleteQuestionBank,
    handleUpdateQuestionBank,
    handleAddQuestionsToBank,
    handleGenerateQuestions,
    handleCreateQuizFromBank,
    handleCreateQuizFromSelection,
    handleRemoveQuestion,
    handleExitQuiz
  } = useAppFeatureState({
    aiConfig,
    activeFile,
    files,
    setFiles,
    setActiveFileId,
    getActivePaneContent,
    getActivePaneFileId,
    updateActiveFile,
    showToast,
    setAiState,
    setViewMode,
    viewMode,
    saveSnapshot,
    t
  });

  useAppServices({
    aiConfig,
    vectorStore,
    setQuestionBanks
  });

  // Memoized Node Click Handler to prevent Graph re-renders
  const handleNodeClick = useCallback((id: string) => {
    showToast(`Selected: ${id}`);
  }, [showToast]);

  const {
    handleCreateItem,
    handleMoveItem,
    handleDeleteFile
  } = useFileOperations({
    files,
    setFiles,
    activeFileId,
    setActiveFileId,
    vectorStore,
    showToast,
    showConfirmDialog,
    t
  });

  // --- New Features ---

  const {
    handleChatMessage,
    handleStopStreaming,
    handleCompactChat,
    handleCompactMemorySave,
    handleCompactMemorySkip
  } = useAIWorkflow({
    aiConfig,
    chatMessages,
    setChatMessages,
    setAiState,
    showToast,
    vectorStore,
    filesRef,
    setFiles,
    handleIndexKnowledgeBase,
    scheduleStreamingMessageUpdate,
    flushStreamingMessageUpdate,
    maybeYieldToBrowser,
    setIsStreaming,
    abortControllerRef,
    resetStreamYield,
    setShowCompactMemoryPrompt,
    compactMemoryCandidate,
    setCompactMemoryCandidate,
    setIsCompactSaving,
    language: lang
  });

  const {
    handleOpenFolder,
    handleImportFolderFiles,
    handleImportPdf
  } = useFileImports({
    aiConfig,
    setAiState,
    setOcrStats,
    setFiles,
    setActiveFileId,
    showToast,
    handleIndexKnowledgeBase,
    t
  });

  // DiffView handlers
  const {
    shortcuts,
    handleUpdateShortcut,
    handleResetShortcuts
  } = useKeyboardShortcuts({
    activeFile,
    activeFileId,
    aiState,
    files,
    handleCreateItem,
    performPolish,
    performGraph,
    showToast,
    setIsSaving,
    setIsSidebarOpen,
    setIsChatOpen,
    setIsSettingsOpen,
    setIsSearchOpen,
    setIsSmartOrganizeOpen,
    setSmartOrganizeFile,
    setLinkInsertMode,
    setIsLinkInsertOpen
  });

  const { backlinks, handleNavigateBacklink } = useWikiLinks({
    files,
    activeFile,
    activeFileId,
    openFileInPane,
    showToast
  });

  const {
    handleCloseSidebarMobile,
    handleToggleSidebar,
    handleToggleChat,
    handleOpenSettings,
    handleCloseSettings,
    handleOpenVoiceTranscription,
    handleCloseVoiceTranscription,
    handleOpenQuestionBank,
    handleCloseQuestionBank,
    handleOpenTagSuggestion,
    handleCloseTagSuggestion,
    handleOpenSmartOrganize,
    handleCloseSmartOrganize,
    handleOpenReview,
    handleCloseStudyPlan,
    handleCloseSearch,
    handleCloseCompactMemory,
    handleCloseLinkInsert,
    handleCloseChat,
    handleClearChat,
    handleTranscriptionSaveToFile,
    handleTranscriptionCreateNewFile
  } = useOverlayActions({
    files,
    activeFileId,
    setFiles,
    setActiveFileId,
    setIsSidebarOpen,
    setIsChatOpen,
    setIsSettingsOpen,
    setIsVoiceTranscriptionOpen,
    setIsQuestionBankOpen,
    setIsTagSuggestionOpen,
    setIsSmartOrganizeOpen,
    setSmartOrganizeFile,
    setIsStudyPlanOpen,
    setIsSearchOpen,
    setIsLinkInsertOpen,
    setShowCompactMemoryPrompt,
    setCompactMemoryCandidate,
    setChatMessages,
    showToast,
    t
  });

  const { handleClearEditor, handleFormatBold, handleFormatItalic } = useToolbarActions({
    updateActiveFile,
    handleTextFormat
  });

  const {
    selectedText,
    tagSuggestionContent,
    tagSuggestionExistingTags,
    viewRouterProps
  } = useAppWorkspaceState({
    isLinkInsertOpen,
    getActivePaneContent,
    viewMode,
    activeThemeId,
    themeType,
    graphData,
    onNodeClick: handleNodeClick,
    currentQuiz,
    aiConfig,
    quizContext,
    activeFileContent: activeFile.content,
    onExitQuiz: handleExitQuiz,
    questionBanks,
    onAddQuestionsToBank: handleAddQuestionsToBank,
    onCreateQuestionBank: handleCreateQuestionBank,
    mindMapContent,
    diffOriginal,
    diffModified,
    onApplyDiff: handleApplyDiff,
    onCancelDiff: handleCancelDiff,
    examHistory,
    knowledgeStats,
    studyPlans,
    onCompleteTask: handleCompleteTask,
    onCreatePlan: handleCreatePlan,
    onDeletePlan: handleDeletePlan,
    showConfirmDialog,
    openPanes,
    activePaneId,
    files,
    onContentChange: handlePaneContentChange,
    onCursorChange: handleCursorChange,
    onCursorSave: handleCursorSave,
    getCursorPosition,
    onTogglePaneMode: togglePaneMode,
    onSelectPane: selectPane,
    splitMode,
    codeMirrorRef,
    language: lang
  });

  const appShellProps = useAppShellState({
    handleIndexKnowledgeBase,
    files,
    setFiles,
    activeFileId,
    onSelectFile: openFileInPane,
    onCreateItem: handleCreateItem,
    onDeleteFile: handleDeleteFile,
    onMoveItem: handleMoveItem,
    isSidebarOpen,
    onCloseSidebarMobile: handleCloseSidebarMobile,
    onOpenFolder: handleOpenFolder,
    onImportFolderFiles: handleImportFolderFiles,
    onImportPdf: handleImportPdf,
    onImportQuiz: handleImportQuiz,
    ragStats,
    ocrStats,
    snippets,
    onCreateSnippet: handleCreateSnippet,
    onDeleteSnippet: handleDeleteSnippet,
    onInsertSnippet: handleInsertSnippet,
    onOpenTagSuggestion: handleOpenTagSuggestion,
    onOpenSmartOrganize: handleOpenSmartOrganize,
    onOpenReview: handleOpenReview,
    viewMode,
    setViewMode,
    onClear: handleClearEditor,
    onExport: handleExport,
    onAIPolish: performPolish,
    onAIExpand: handleAIExpand,
    onBuildGraph: performGraph,
    onSynthesize: performSynthesize,
    onGenerateMindMap: handleGenerateMindMap,
    mindMapDetailLevel,
    onMindMapDetailLevelChange: setMindMapDetailLevel,
    onGenerateQuiz: handleGenerateQuiz,
    onFormatBold: handleFormatBold,
    onFormatItalic: handleFormatItalic,
    onUndo: handleUndo,
    onRedo: handleRedo,
    isAIThinking: aiState.isThinking,
    theme: themeType,
    toggleTheme,
    toggleSidebar: handleToggleSidebar,
    toggleChat: handleToggleChat,
    toggleSettings: handleOpenSettings,
    fileName: activeFile.name,
    onRename: renameActiveFile,
    activeProvider: aiConfig.provider,
    splitMode,
    onSplitModeChange: setSplitMode,
    onVoiceTranscription: handleOpenVoiceTranscription,
    onOpenQuestionBank: handleOpenQuestionBank,
    panes: openPanes,
    activePane: activePaneId,
    onSelectPane: selectPane,
    onClosePane: closePane,
    onTogglePaneMode: togglePaneMode,
    viewRouterProps,
    isLinkInsertOpen,
    linkInsertMode,
    selectedText,
    onInsertLink: handleLinkInsert,
    onCloseLinkInsert: handleCloseLinkInsert,
    backlinks,
    activeFileName: activeFile.name,
    onNavigateBacklink: handleNavigateBacklink,
    isChatOpen,
    onCloseChat: handleCloseChat,
    messages: chatMessages,
    onSendMessage: handleChatMessage,
    onClearChat: handleClearChat,
    onCompactChat: handleCompactChat,
    aiState,
    isStreaming,
    onStopStreaming: handleStopStreaming,
    showToast,
    language: lang
  });

  const overlays = useAppOverlaysState({
    isSettingsOpen,
    onCloseSettings: handleCloseSettings,
    aiConfig,
    onSaveSettings: handleSettingsSave,
    themes,
    activeThemeId,
    onSelectTheme: handleThemeChange,
    onImportTheme: handleImportTheme,
    onDeleteTheme: handleDeleteTheme,
    shortcuts,
    onUpdateShortcut: handleUpdateShortcut,
    onResetShortcuts: handleResetShortcuts,
    showToast,
    onSettingsDataImported: handleSettingsDataImported,
    showConfirmDialog,
    confirmDialog,
    onCancelConfirm: closeConfirmDialog,
    isVoiceTranscriptionOpen,
    onCloseVoiceTranscription: handleCloseVoiceTranscription,
    files,
    onTranscriptionSaveToFile: handleTranscriptionSaveToFile,
    onTranscriptionCreateNewFile: handleTranscriptionCreateNewFile,
    isQuestionBankOpen,
    onCloseQuestionBank: handleCloseQuestionBank,
    questionBanks,
    onCreateBank: handleCreateQuestionBank,
    onDeleteBank: handleDeleteQuestionBank,
    onUpdateBank: handleUpdateQuestionBank,
    onAddQuestionsToBank: handleAddQuestionsToBank,
    onGenerateQuestions: handleGenerateQuestions,
    onRemoveQuestion: handleRemoveQuestion,
    onCreateQuizFromBank: handleCreateQuizFromBank,
    onCreateQuizFromSelection: handleCreateQuizFromSelection,
    isTagSuggestionOpen,
    onCloseTagSuggestion: handleCloseTagSuggestion,
    tagSuggestionContent,
    tagSuggestionExistingTags,
    onApplyTags: handleApplyTags,
    isSmartOrganizeOpen,
    onCloseSmartOrganize: handleCloseSmartOrganize,
    smartOrganizeFile,
    fallbackFile: DEFAULT_FILE,
    onUpdateFile: handleSmartOrganizeUpdate,
    allFiles: files,
    isSearchOpen,
    onCloseSearch: handleCloseSearch,
    onSelectFile: openFileInPane,
    isStudyPlanOpen,
    onCloseStudyPlan: handleCloseStudyPlan,
    studyPlans,
    onCompleteTask: handleCompleteTask,
    onCreatePlan: handleCreatePlan,
    onDeletePlan: handleDeletePlan,
    isLinkInsertOpen,
    linkInsertMode,
    activeFileId,
    onInsertLink: handleLinkInsert,
    onCloseLinkInsert: handleCloseLinkInsert,
    selectedText,
    showCompactMemoryPrompt,
    compactMemoryCandidate,
    onCompactMemorySave: handleCompactMemorySave,
    onCompactMemorySkip: handleCompactMemorySkip,
    onCloseCompactMemory: handleCloseCompactMemory,
    language: lang
  });

  // Loading Screen
  if (isCheckingAuth) {
    return (
      <div className="flex w-full h-screen bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))] items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[rgb(var(--primary-500))] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={() => setIsAuthenticated(true)}
        showConfirmDialog={showConfirmDialog}
      />
    );
  }

  // Main Application
  return (
    <>
      <a href="#main-content" className="skip-link app-no-drag">
        {t.skipToContent || 'Skip to content'}
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex w-full h-screen bg-paper-50 dark:bg-cyber-900 text-slate-800 dark:text-slate-200 overflow-hidden transition-colors duration-300"
      >
        <AppShell {...appShellProps} />
        <AppOverlaysContainer overlays={overlays} />
      </main>
    </>
  );
};

export default App;
