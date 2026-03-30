import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';

import type { AppViewRouterProps } from '@/components/App/AppViewRouter';
import type { CodeMirrorEditorRef } from '@/types';
import { extractTags } from '@/src/types/wiki';

export type AssistantContextScope = 'focused-note' | 'open-panes';

export const DEFAULT_ASSISTANT_CONTEXT_SCOPE: AssistantContextScope = 'open-panes';
export const DEFAULT_INCLUDE_SELECTED_TEXT = true;

export interface AssistantWorkspaceContext {
  activeFileId?: string;
  selectedFileIds: string[];
  selectedText?: string;
  contextScope: AssistantContextScope;
  includeSelectedText: boolean;
}

type ViewRouterInputs = Omit<AppViewRouterProps, 'codeMirrorRef'> & {
  codeMirrorRef: RefObject<CodeMirrorEditorRef>;
};

interface UseAppWorkspaceStateOptions extends ViewRouterInputs {
  activeFileId: string;
  contextScope: AssistantContextScope;
  getActivePaneFileId: () => string | undefined;
  includeSelectedText: boolean;
  isLinkInsertOpen: boolean;
  getActivePaneContent: () => string;
}

interface UseAppWorkspaceStateResult {
  selectedText: string;
  tagSuggestionContent: string;
  tagSuggestionExistingTags: string[];
  workspaceContext: AssistantWorkspaceContext;
  viewRouterProps: AppViewRouterProps;
}

export const useAppWorkspaceState = ({
  activeFileId,
  contextScope,
  getActivePaneFileId,
  includeSelectedText,
  isLinkInsertOpen,
  getActivePaneContent,
  viewMode,
  activeThemeId,
  themeType,
  graphData,
  onNodeClick,
  currentQuiz,
  aiConfig,
  quizContext,
  activeFileContent,
  onExitQuiz,
  questionBanks,
  onAddQuestionsToBank,
  onCreateQuestionBank,
  mindMapContent,
  diffOriginal,
  diffModified,
  onApplyDiff,
  onCancelDiff,
  examHistory,
  knowledgeStats,
  studyPlans,
  onCompleteTask,
  onCreatePlan,
  onDeletePlan,
  showConfirmDialog,
  openPanes,
  activePaneId,
  files,
  onContentChange,
  onCursorChange,
  onCursorSave,
  getCursorPosition,
  onTogglePaneMode,
  onSelectPane,
  splitMode,
  codeMirrorRef,
  language
}: UseAppWorkspaceStateOptions): UseAppWorkspaceStateResult => {
  const getSelectedText = useCallback(() => {
    if (codeMirrorRef.current) {
      return codeMirrorRef.current.getSelection() || '';
    }
    return '';
  }, [codeMirrorRef]);

  const selectedText = useMemo(() => getSelectedText(), [getSelectedText, isLinkInsertOpen]);
  const workspaceActiveFileId = useMemo(
    () => getActivePaneFileId() ?? activeFileId,
    [activeFileId, getActivePaneFileId],
  );
  const openPaneFileIds = useMemo(() => {
    const ids = new Set<string>();
    if (workspaceActiveFileId) {
      ids.add(workspaceActiveFileId);
    }
    openPanes.forEach(pane => {
      if (pane.fileId) {
        ids.add(pane.fileId);
      }
    });
    return Array.from(ids);
  }, [openPanes, workspaceActiveFileId]);
  const selectedFileIds = useMemo(() => (
    contextScope === 'focused-note'
      ? workspaceActiveFileId
        ? [workspaceActiveFileId]
        : []
      : openPaneFileIds
  ), [contextScope, openPaneFileIds, workspaceActiveFileId]);
  const tagSuggestionContent = getActivePaneContent();
  const tagSuggestionExistingTags = useMemo(
    () => extractTags(tagSuggestionContent),
    [tagSuggestionContent]
  );
  const workspaceContext = useMemo(
    () => ({
      activeFileId: workspaceActiveFileId,
      selectedFileIds,
      selectedText: includeSelectedText && selectedText ? selectedText : undefined,
      contextScope,
      includeSelectedText,
    }),
    [contextScope, includeSelectedText, selectedFileIds, selectedText, workspaceActiveFileId],
  );

  const viewRouterProps = useMemo<AppViewRouterProps>(() => ({
    viewMode,
    activeThemeId,
    themeType,
    graphData,
    onNodeClick,
    currentQuiz,
    aiConfig,
    quizContext,
    activeFileContent,
    onExitQuiz,
    questionBanks,
    onAddQuestionsToBank,
    onCreateQuestionBank,
    mindMapContent,
    diffOriginal,
    diffModified,
    onApplyDiff,
    onCancelDiff,
    examHistory,
    knowledgeStats,
    studyPlans,
    onCompleteTask,
    onCreatePlan,
    onDeletePlan,
    showConfirmDialog,
    openPanes,
    activePaneId,
    files,
    onContentChange,
    onCursorChange,
    onCursorSave,
    getCursorPosition,
    onTogglePaneMode,
    onSelectPane,
    splitMode,
    codeMirrorRef,
    language
  }), [
    viewMode,
    activeThemeId,
    themeType,
    graphData,
    onNodeClick,
    currentQuiz,
    aiConfig,
    quizContext,
    activeFileContent,
    onExitQuiz,
    questionBanks,
    onAddQuestionsToBank,
    onCreateQuestionBank,
    mindMapContent,
    diffOriginal,
    diffModified,
    onApplyDiff,
    onCancelDiff,
    examHistory,
    knowledgeStats,
    studyPlans,
    onCompleteTask,
    onCreatePlan,
    onDeletePlan,
    showConfirmDialog,
    openPanes,
    activePaneId,
    files,
    onContentChange,
    onCursorChange,
    onCursorSave,
    getCursorPosition,
    onTogglePaneMode,
    onSelectPane,
    splitMode,
    codeMirrorRef,
    language
  ]);

  return {
    selectedText,
    tagSuggestionContent,
    tagSuggestionExistingTags,
    workspaceContext,
    viewRouterProps
  };
};
