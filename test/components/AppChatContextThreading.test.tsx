import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutableRefObject } from 'react';

import App from '../../App';
import { ViewMode } from '../../types';

const {
  chatPanelPropsSpy,
  useAIWorkflowMock,
  useAppWorkspaceStateMock,
} = vi.hoisted(() => ({
  chatPanelPropsSpy: vi.fn(),
  useAIWorkflowMock: vi.fn(),
  useAppWorkspaceStateMock: vi.fn(),
}));

vi.mock('../../components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar-probe" />,
}));

vi.mock('../../components/Toolbar', () => ({
  Toolbar: () => <div data-testid="toolbar-probe" />,
}));

vi.mock('../../components/EditorTabs', () => ({
  EditorTabs: () => <div data-testid="editor-tabs-probe" />,
}));

vi.mock('../../components/App/AppViewRouter', () => ({
  AppViewRouter: () => <div data-testid="view-router-probe" />,
}));

vi.mock('../../components/BacklinkPanel', () => ({
  BacklinkPanel: () => null,
}));

vi.mock('../../components/LinkInsertModal', () => ({
  LinkInsertModal: () => null,
}));

vi.mock('../../components/LoginScreen', () => ({
  LoginScreen: () => <div data-testid="login-screen-probe" />,
}));

vi.mock('../../components/App/AppOverlaysContainer', () => ({
  AppOverlaysContainer: () => <div data-testid="app-overlays-probe" />,
}));

vi.mock('../../components/ChatPanel', () => ({
  ChatPanel: (props: unknown) => {
    chatPanelPropsSpy(props);
    return <div data-testid="chat-panel-probe" />;
  },
}));

vi.mock('@/src/app/hooks/useThemeState', () => ({
  useThemeState: () => ({
    themes: [],
    activeThemeId: 'theme-default',
    themeType: 'light',
    handleThemeChange: vi.fn(),
    toggleTheme: vi.fn(),
    handleImportTheme: vi.fn(),
    handleDeleteTheme: vi.fn(),
  }),
}));

vi.mock('../../src/app/hooks/useFileState', () => {
  const files = [
    {
      id: 'note-2',
      name: 'Focused Draft',
      content: 'Focused draft content',
      lastModified: 2,
      path: 'Focused Draft.md',
    },
    {
      id: 'note-3',
      name: 'Reference',
      content: 'Reference details',
      lastModified: 3,
      path: 'Reference.md',
    },
  ];

  return {
    useFileState: () => ({
      files,
      setFiles: vi.fn(),
      activeFileId: 'note-2',
      setActiveFileId: vi.fn(),
      activeFile: files[0],
      history: [],
      setHistory: vi.fn(),
      lastEditTimeRef: { current: 0 },
      openPanes: [{ id: 'pane-1', fileId: 'note-2' }, { id: 'pane-2', fileId: 'note-3' }],
      setOpenPanes: vi.fn(),
      activePaneId: 'pane-1',
      setActivePaneId: vi.fn(),
      splitMode: 'vertical',
      setSplitMode: vi.fn(),
      filesRef: { current: files } as MutableRefObject<typeof files>,
      activeFileIdRef: { current: 'note-2' },
      cursorPositionsRef: { current: {} },
    }),
  };
});

vi.mock('../../src/app/hooks/useAppUiState', () => ({
  useAppUiState: () => ({
    viewMode: ViewMode.Editor,
    setViewMode: vi.fn(),
    isSaving: false,
    setIsSaving: vi.fn(),
    isSidebarOpen: true,
    setIsSidebarOpen: vi.fn(),
    isChatOpen: true,
    setIsChatOpen: vi.fn(),
    isSettingsOpen: false,
    setIsSettingsOpen: vi.fn(),
    isVoiceTranscriptionOpen: false,
    setIsVoiceTranscriptionOpen: vi.fn(),
    isSearchOpen: false,
    setIsSearchOpen: vi.fn(),
    aiState: { isThinking: false, error: null, message: null },
    setAiState: vi.fn(),
    ragStats: { indexedFiles: 0, totalChunks: 0 },
    setRagStats: vi.fn(),
    ocrStats: { totalFiles: 0, processedFiles: 0 },
    setOcrStats: vi.fn(),
    isQuestionBankOpen: false,
    setIsQuestionBankOpen: vi.fn(),
    isTagSuggestionOpen: false,
    setIsTagSuggestionOpen: vi.fn(),
    isSmartOrganizeOpen: false,
    setIsSmartOrganizeOpen: vi.fn(),
    smartOrganizeFile: null,
    setSmartOrganizeFile: vi.fn(),
    isStudyPlanOpen: false,
    setIsStudyPlanOpen: vi.fn(),
    confirmDialog: null,
    setConfirmDialog: vi.fn(),
    isLinkInsertOpen: false,
    setIsLinkInsertOpen: vi.fn(),
    linkInsertMode: 'wikilink',
    setLinkInsertMode: vi.fn(),
    showCompactMemoryPrompt: false,
    setShowCompactMemoryPrompt: vi.fn(),
    compactMemoryCandidate: null,
    setCompactMemoryCandidate: vi.fn(),
    isCompactSaving: false,
    setIsCompactSaving: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useAppNotifications', () => ({
  useAppNotifications: () => ({
    showToast: vi.fn(),
    showConfirmDialog: vi.fn(),
    closeConfirmDialog: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useAppConfig', () => ({
  useAppConfig: () => ({
    aiConfig: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      language: 'en',
      enableStreaming: true,
      mcpTools: '[]',
    },
    handleSettingsSave: vi.fn(),
    handleSettingsDataImported: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useAuthState', () => ({
  useAuthState: () => ({
    isAuthenticated: true,
    setIsAuthenticated: vi.fn(),
    isCheckingAuth: false,
  }),
}));

vi.mock('@/src/app/hooks/useAssistantSessions', () => ({
  useAssistantSessions: () => ({
    activeSession: {
      sessionId: 'session-primary',
      workspaceId: 'workspace:assistant',
      title: 'Primary App Session',
      route: {
        routeKey: 'session-primary',
        kind: 'direct',
        threadId: 'thread-primary',
      },
    },
    activeSessionId: 'session-primary',
    createSession: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    sessions: [],
    saveSession: vi.fn().mockResolvedValue(undefined),
    setActiveSessionId: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/src/app/hooks/useChatHistory', () => ({
  useChatHistory: () => ({
    chatMessages: [],
    setChatMessages: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useKnowledgeBase', () => ({
  useKnowledgeBase: () => ({
    vectorStore: {
      hasFilesToIndex: vi.fn().mockResolvedValue(false),
      searchWithResults: vi.fn().mockResolvedValue({ results: [], context: '' }),
    },
    handleIndexKnowledgeBase: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../src/app/hooks/useStreamingUpdates', () => ({
  useStreamingUpdates: () => ({
    isStreaming: false,
    setIsStreaming: vi.fn(),
    abortControllerRef: { current: null },
    scheduleStreamingMessageUpdate: vi.fn(),
    flushStreamingMessageUpdate: vi.fn(),
    maybeYieldToBrowser: vi.fn().mockResolvedValue(undefined),
    resetStreamYield: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useEditorActions', () => ({
  useEditorActions: () => ({
    updateActiveFile: vi.fn(),
    handleLinkInsert: vi.fn(),
    handleCursorChange: vi.fn(),
    handleCursorSave: vi.fn(),
    getCursorPosition: vi.fn(),
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    saveSnapshot: vi.fn(),
    renameActiveFile: vi.fn(),
    openFileInPane: vi.fn(),
    closePane: vi.fn(),
    togglePaneMode: vi.fn(),
    getActivePaneContent: vi.fn().mockReturnValue('Focused draft content'),
    getActivePaneFileId: vi.fn().mockReturnValue('note-2'),
    handleTextFormat: vi.fn(),
    handleExport: vi.fn(),
    selectPane: vi.fn(),
    handlePaneContentChange: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useAppFeatureState', () => ({
  useAppFeatureState: () => ({
    graphData: null,
    graphType: 'concept',
    currentQuiz: null,
    quizContext: null,
    mindMapContent: '',
    mindMapDetailLevel: 'standard',
    setMindMapDetailLevel: vi.fn(),
    diffOriginal: '',
    diffModified: '',
    examHistory: [],
    knowledgeStats: null,
    studyPlans: [],
    snippets: [],
    questionBanks: [],
    setQuestionBanks: vi.fn(),
    performGraph: vi.fn(),
    performPolish: vi.fn(),
    performSynthesize: vi.fn(),
    handleAIExpand: vi.fn(),
    handleGenerateMindMap: vi.fn(),
    handleGenerateQuiz: vi.fn(),
    handleImportQuiz: vi.fn(),
    handleApplyTags: vi.fn(),
    handleApplyDiff: vi.fn(),
    handleCancelDiff: vi.fn(),
    handleCompleteTask: vi.fn(),
    handleCreatePlan: vi.fn(),
    handleDeletePlan: vi.fn(),
    handleCreateSnippet: vi.fn(),
    handleDeleteSnippet: vi.fn(),
    handleInsertSnippet: vi.fn(),
    handleCreateQuestionBank: vi.fn(),
    handleDeleteQuestionBank: vi.fn(),
    handleUpdateQuestionBank: vi.fn(),
    handleAddQuestionsToBank: vi.fn(),
    handleGenerateQuestions: vi.fn(),
    handleCreateQuizFromBank: vi.fn(),
    handleCreateQuizFromSelection: vi.fn(),
    handleRemoveQuestion: vi.fn(),
    handleExitQuiz: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useAppServices', () => ({
  useAppServices: vi.fn(),
}));

vi.mock('@/src/app/hooks/useFileOperations', () => ({
  useFileOperations: () => ({
    handleCreateItem: vi.fn(),
    handleMoveItem: vi.fn(),
    handleDeleteFile: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useFileImports', () => ({
  useFileImports: () => ({
    handleOpenFolder: vi.fn().mockResolvedValue(undefined),
    handleImportFolderFiles: vi.fn(),
    handleImportPdf: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({
    shortcuts: [],
    handleUpdateShortcut: vi.fn(),
    handleResetShortcuts: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useWikiLinks', () => ({
  useWikiLinks: () => ({
    backlinks: [],
    handleNavigateBacklink: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useOverlayActions', () => ({
  useOverlayActions: () => ({
    handleCloseSidebarMobile: vi.fn(),
    handleToggleSidebar: vi.fn(),
    handleToggleChat: vi.fn(),
    handleOpenSettings: vi.fn(),
    handleCloseSettings: vi.fn(),
    handleOpenVoiceTranscription: vi.fn(),
    handleCloseVoiceTranscription: vi.fn(),
    handleOpenQuestionBank: vi.fn(),
    handleCloseQuestionBank: vi.fn(),
    handleOpenTagSuggestion: vi.fn(),
    handleCloseTagSuggestion: vi.fn(),
    handleOpenSmartOrganize: vi.fn(),
    handleCloseSmartOrganize: vi.fn(),
    handleOpenReview: vi.fn(),
    handleCloseStudyPlan: vi.fn(),
    handleCloseSearch: vi.fn(),
    handleCloseCompactMemory: vi.fn(),
    handleCloseLinkInsert: vi.fn(),
    handleCloseChat: vi.fn(),
    handleClearChat: vi.fn(),
    handleTranscriptionSaveToFile: vi.fn(),
    handleTranscriptionCreateNewFile: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useToolbarActions', () => ({
  useToolbarActions: () => ({
    handleClearEditor: vi.fn(),
    handleFormatBold: vi.fn(),
    handleFormatItalic: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useAppWorkspaceState', () => ({
  DEFAULT_ASSISTANT_CONTEXT_SCOPE: 'open-panes',
  DEFAULT_INCLUDE_SELECTED_TEXT: true,
  useAppWorkspaceState: useAppWorkspaceStateMock,
}));

vi.mock('@/src/app/hooks/useAIWorkflow', () => ({
  useAIWorkflow: useAIWorkflowMock,
}));

vi.mock('@/src/app/hooks/useAppShellState', () => ({
  useAppShellState: ({ handleIndexKnowledgeBase: _ignored, ...rest }: Record<string, unknown>) => ({
    ...rest,
    onRefreshIndex: vi.fn(),
  }),
}));

vi.mock('@/src/app/hooks/useAppOverlaysState', () => ({
  useAppOverlaysState: () => ({}),
}));

describe('App chat context threading', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAppWorkspaceStateMock.mockImplementation(({ contextScope, includeSelectedText }: Record<string, unknown>) => ({
      selectedText: 'Selected evidence',
      tagSuggestionContent: 'Focused draft content',
      tagSuggestionExistingTags: [],
      workspaceContext: {
        activeFileId: 'note-2',
        selectedFileIds: contextScope === 'focused-note' ? ['note-2'] : ['note-2', 'note-3'],
        selectedText: includeSelectedText ? 'Selected evidence' : undefined,
        contextScope,
        includeSelectedText,
      },
      viewRouterProps: {},
    }));

    useAIWorkflowMock.mockReturnValue({
      assistantRuntimeInspection: {
        lifecyclePhase: 'idle',
        streamed: false,
        streamDeltaCount: 0,
        accumulatedTextLength: 0,
        contextAdapterIds: [],
        contextSources: [],
        contextSections: [],
        updatedAt: Date.now(),
      },
      handleChatMessage: vi.fn(),
      handleStopStreaming: vi.fn(),
      handleCompactChat: vi.fn().mockResolvedValue(undefined),
      handleCompactMemorySave: vi.fn().mockResolvedValue(undefined),
      handleCompactMemorySkip: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('threads top-level workspace context controls through AppShell into ChatPanel', () => {
    render(<App />);

    expect(screen.getByTestId('chat-panel-probe')).toBeInTheDocument();
    expect(useAppWorkspaceStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contextScope: 'open-panes',
        includeSelectedText: true,
      }),
    );

    const chatPanelProps = chatPanelPropsSpy.mock.calls.at(-1)?.[0] as {
      activeFileName?: string;
      contextScope: string;
      includeSelectedText: boolean;
      setContextScope: unknown;
      setIncludeSelectedText: unknown;
      workspaceContext: {
        activeFileId?: string;
        selectedFileIds?: string[];
        selectedText?: string;
        contextScope?: string;
        includeSelectedText?: boolean;
      };
    };

    expect(chatPanelProps.contextScope).toBe('open-panes');
    expect(chatPanelProps.includeSelectedText).toBe(true);
    expect(chatPanelProps.activeFileName).toBe('Focused Draft');
    expect(chatPanelProps.activeFileName).not.toBe(chatPanelProps.workspaceContext.activeFileId);
    expect(chatPanelProps.workspaceContext).toMatchObject({
      activeFileId: 'note-2',
      selectedFileIds: ['note-2', 'note-3'],
      selectedText: 'Selected evidence',
      contextScope: 'open-panes',
      includeSelectedText: true,
    });
    expect(typeof chatPanelProps.setContextScope).toBe('function');
    expect(typeof chatPanelProps.setIncludeSelectedText).toBe('function');
  });
});
