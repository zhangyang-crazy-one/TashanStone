import { useCallback, useMemo } from 'react';
import type { RefObject } from 'react';

import type { AppViewRouterProps } from '@/components/App/AppViewRouter';
import type { CodeMirrorEditorRef } from '@/types';
import { extractTags } from '@/src/types/wiki';

type ViewRouterInputs = Omit<AppViewRouterProps, 'codeMirrorRef'> & {
  codeMirrorRef: RefObject<CodeMirrorEditorRef>;
};

interface UseAppWorkspaceStateOptions extends ViewRouterInputs {
  isLinkInsertOpen: boolean;
  getActivePaneContent: () => string;
}

interface UseAppWorkspaceStateResult {
  selectedText: string;
  tagSuggestionContent: string;
  tagSuggestionExistingTags: string[];
  viewRouterProps: AppViewRouterProps;
}

export const useAppWorkspaceState = ({
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
  const tagSuggestionContent = getActivePaneContent();
  const tagSuggestionExistingTags = useMemo(
    () => extractTags(tagSuggestionContent),
    [tagSuggestionContent]
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
    viewRouterProps
  };
};
