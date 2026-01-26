import React, { memo } from 'react';

import type {
  AIConfig,
  EditorPane,
  ExamResult,
  GraphData,
  KnowledgePointStat,
  MarkdownFile,
  QuestionBank,
  Quiz,
  QuizQuestion,
  StudyPlan,
  Theme,
  CodeMirrorEditorRef
} from '../../types';
import { ViewMode } from '../../types';
import type { Language } from '../../utils/translations';
import { AnalyticsDashboard } from '../AnalyticsDashboard';
import { DiffView } from '../DiffView';
import { KnowledgeGraph } from '../KnowledgeGraph';
import { LearningRoadmap } from '../LearningRoadmap';
import { MindMap } from '../MindMap';
import { QuizPanel } from '../QuizPanel';
import { SplitEditor } from '../SplitEditor';

export interface AppViewRouterProps {
  viewMode: ViewMode;
  activeThemeId: string;
  themeType: Theme;
  graphData: GraphData;
  onNodeClick: (id: string) => void;
  currentQuiz: Quiz | null;
  aiConfig: AIConfig;
  quizContext: string;
  activeFileContent: string;
  onExitQuiz: () => void;
  questionBanks: QuestionBank[];
  onAddQuestionsToBank: (bankId: string, questions: QuizQuestion[]) => Promise<boolean>;
  onCreateQuestionBank: (name: string, description?: string) => Promise<QuestionBank | null>;
  mindMapContent: string;
  diffOriginal: string;
  diffModified: string;
  onApplyDiff: (text: string) => void;
  onCancelDiff: () => void;
  examHistory: ExamResult[];
  knowledgeStats: KnowledgePointStat[];
  studyPlans: StudyPlan[];
  onCompleteTask: (planId: string, taskId: string) => void;
  onCreatePlan: (sourceType: 'file' | 'mistake', sourceId: string, title: string) => void;
  onDeletePlan: (planId: string) => void;
  showConfirmDialog?: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string,
    cancelText?: string
  ) => void;
  openPanes: EditorPane[];
  activePaneId: string | null;
  files: MarkdownFile[];
  onContentChange: (fileId: string, content: string) => void;
  onCursorChange?: (fileId: string, position: { start: number; end: number }) => void;
  onCursorSave?: (fileId: string, position: { anchor: number; head: number }) => void;
  getCursorPosition?: (fileId: string) => { start: number; end: number } | undefined;
  onTogglePaneMode?: (paneId: string) => void;
  onSelectPane?: (paneId: string) => void;
  splitMode: 'none' | 'horizontal' | 'vertical';
  codeMirrorRef?: React.RefObject<CodeMirrorEditorRef>;
  language: Language;
}

export const AppViewRouter = memo((props: AppViewRouterProps) => {
  const {
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
  } = props;

  const quizContent = quizContext || activeFileContent;

  return (
    <>
      {viewMode === ViewMode.Graph && (
        <KnowledgeGraph
          key={activeThemeId}
          data={graphData}
          theme={themeType}
          onNodeClick={onNodeClick}
          language={language}
        />
      )}

      {viewMode === ViewMode.Quiz && currentQuiz && (
        <QuizPanel
          quiz={currentQuiz}
          aiConfig={aiConfig}
          theme={themeType}
          onClose={onExitQuiz}
          contextContent={quizContent}
          language={language}
          questionBanks={questionBanks}
          onAddQuestionsToBank={onAddQuestionsToBank}
          onCreateQuestionBank={onCreateQuestionBank}
          sourceFileId={currentQuiz.sourceFileId}
        />
      )}

      {viewMode === ViewMode.MindMap && (
        <MindMap
          key={activeThemeId}
          content={mindMapContent}
          theme={themeType}
          language={language}
        />
      )}

      {viewMode === ViewMode.Diff && (
        <DiffView
          originalText={diffOriginal}
          modifiedText={diffModified}
          onApply={onApplyDiff}
          onCancel={onCancelDiff}
          language={language}
        />
      )}

      {viewMode === ViewMode.Analytics && (
        <AnalyticsDashboard
          examResults={examHistory}
          knowledgeStats={knowledgeStats}
          totalStudyTime={0}
          language={language}
        />
      )}

      {viewMode === ViewMode.Roadmap && (
        <LearningRoadmap
          studyPlans={studyPlans}
          onCompleteTask={onCompleteTask}
          onCreatePlan={onCreatePlan}
          onDeletePlan={onDeletePlan}
          language={language}
          showConfirmDialog={showConfirmDialog}
        />
      )}

      {(viewMode === ViewMode.Editor || viewMode === ViewMode.Split || viewMode === ViewMode.Preview) && (
        <SplitEditor
          panes={openPanes}
          activePane={activePaneId}
          files={files}
          onContentChange={onContentChange}
          onCursorChange={onCursorChange}
          onCursorSave={onCursorSave}
          getCursorPosition={getCursorPosition}
          onToggleMode={onTogglePaneMode}
          onSelectPane={onSelectPane}
          splitMode={splitMode}
          viewMode={viewMode}
          language={language}
          codeMirrorRef={codeMirrorRef}
        />
      )}
    </>
  );
});

AppViewRouter.displayName = 'AppViewRouter';
