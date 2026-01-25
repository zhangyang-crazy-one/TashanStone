import React, { memo } from 'react';

import type {
  AIConfig,
  AppShortcut,
  AppTheme,
  DifficultyLevel,
  LinkInsertResult,
  MarkdownFile,
  MemoryCandidate,
  QuestionBank,
  Quiz,
  QuizQuestion,
  StudyPlan
} from '../../types';
import type { Language } from '../../utils/translations';
import { AISettingsModal } from '../AISettingsModal';
import { CompactMemoryPrompt } from '../CompactMemoryPrompt';
import { ConfirmDialog } from '../ConfirmDialog';
import { LinkInsertModal } from '../LinkInsertModal';
import { QuestionBankModal } from '../QuestionBankModal';
import { SearchModal } from '../SearchModal';
import { SmartOrganizeModal } from '../SmartOrganizeModal';
import { StudyPlanPanel } from '../StudyPlanPanel';
import { TagSuggestionModal } from '../TagSuggestionModal';
import { VoiceTranscriptionModal } from '../VoiceTranscriptionModal';

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
}

export interface AppOverlaysProps {
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  aiConfig: AIConfig;
  onSaveSettings: (config: AIConfig) => void;
  themes: AppTheme[];
  activeThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onImportTheme: (theme: AppTheme) => void;
  onDeleteTheme: (themeId: string) => void;
  shortcuts: AppShortcut[];
  onUpdateShortcut: (id: string, keys: string) => void;
  onResetShortcuts: () => void;
  showToast: (message: string, isError?: boolean) => void;
  onSettingsDataImported: () => void;
  showConfirmDialog: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string,
    cancelText?: string
  ) => void;
  confirmDialog: ConfirmDialogState;
  onCancelConfirm: () => void;
  isVoiceTranscriptionOpen: boolean;
  onCloseVoiceTranscription: () => void;
  files: MarkdownFile[];
  onTranscriptionSaveToFile: (fileId: string, content: string, mode: 'append' | 'replace') => void;
  onTranscriptionCreateNewFile: (content: string) => void;
  isQuestionBankOpen: boolean;
  onCloseQuestionBank: () => void;
  questionBanks: QuestionBank[];
  onCreateBank: (name: string, description?: string) => Promise<QuestionBank | null>;
  onDeleteBank: (bankId: string) => void;
  onUpdateBank: (bankId: string, updates: Partial<QuestionBank>) => void;
  onAddQuestionsToBank: (bankId: string, questions: QuizQuestion[]) => Promise<boolean>;
  onGenerateQuestions: (bankId: string, sourceFileId: string, count?: number, difficulty?: string) => Promise<void>;
  onRemoveQuestion: (bankId: string, questionId: string) => void;
  onCreateQuizFromBank: (bankId: string, count?: number, difficulty?: DifficultyLevel | 'mixed') => Promise<Quiz | null>;
  onCreateQuizFromSelection: (questions: QuizQuestion[], title?: string) => Promise<Quiz | null>;
  isTagSuggestionOpen: boolean;
  onCloseTagSuggestion: () => void;
  tagSuggestionContent: string;
  tagSuggestionExistingTags: string[];
  onApplyTags: (tags: string[]) => void;
  isSmartOrganizeOpen: boolean;
  onCloseSmartOrganize: () => void;
  smartOrganizeFile: MarkdownFile | null;
  fallbackFile: MarkdownFile;
  onUpdateFile: (fileId: string, updates: Partial<MarkdownFile>) => void;
  allFiles: MarkdownFile[];
  isSearchOpen: boolean;
  onCloseSearch: () => void;
  onSelectFile: (fileId: string) => void;
  isStudyPlanOpen: boolean;
  onCloseStudyPlan: () => void;
  studyPlans: StudyPlan[];
  onCompleteTask: (planId: string, taskId: string) => void;
  onCreatePlan: (sourceType: 'file' | 'mistake', sourceId: string, title: string) => void;
  onDeletePlan: (planId: string) => void;
  isLinkInsertOpen: boolean;
  linkInsertMode: 'wikilink' | 'blockref' | 'quick_link';
  activeFileId: string;
  onInsertLink: (result: LinkInsertResult) => void;
  onCloseLinkInsert: () => void;
  selectedText: string;
  showCompactMemoryPrompt: boolean;
  compactMemoryCandidate: MemoryCandidate | null;
  onCompactMemorySave: (editedSummary: string, autoInject: boolean, markImportant: boolean) => Promise<void>;
  onCompactMemorySkip: () => void | Promise<void>;
  onCloseCompactMemory: () => void;
  language: Language;
}

export const AppOverlays = memo((props: AppOverlaysProps) => {
  const {
    isSettingsOpen,
    onCloseSettings,
    aiConfig,
    onSaveSettings,
    themes,
    activeThemeId,
    onSelectTheme,
    onImportTheme,
    onDeleteTheme,
    shortcuts,
    onUpdateShortcut,
    onResetShortcuts,
    showToast,
    onSettingsDataImported,
    showConfirmDialog,
    confirmDialog,
    onCancelConfirm,
    isVoiceTranscriptionOpen,
    onCloseVoiceTranscription,
    files,
    onTranscriptionSaveToFile,
    onTranscriptionCreateNewFile,
    isQuestionBankOpen,
    onCloseQuestionBank,
    questionBanks,
    onCreateBank,
    onDeleteBank,
    onUpdateBank,
    onAddQuestionsToBank,
    onGenerateQuestions,
    onRemoveQuestion,
    onCreateQuizFromBank,
    onCreateQuizFromSelection,
    isTagSuggestionOpen,
    onCloseTagSuggestion,
    tagSuggestionContent,
    tagSuggestionExistingTags,
    onApplyTags,
    isSmartOrganizeOpen,
    onCloseSmartOrganize,
    smartOrganizeFile,
    fallbackFile,
    onUpdateFile,
    allFiles,
    isSearchOpen,
    onCloseSearch,
    onSelectFile,
    isStudyPlanOpen,
    onCloseStudyPlan,
    studyPlans,
    onCompleteTask,
    onCreatePlan,
    onDeletePlan,
    isLinkInsertOpen,
    linkInsertMode,
    activeFileId,
    onInsertLink,
    onCloseLinkInsert,
    selectedText,
    showCompactMemoryPrompt,
    compactMemoryCandidate,
    onCompactMemorySave,
    onCompactMemorySkip,
    onCloseCompactMemory,
    language
  } = props;

  return (
    <>
      <AISettingsModal
        isOpen={isSettingsOpen}
        onClose={onCloseSettings}
        config={aiConfig}
        onSave={onSaveSettings}
        themes={themes}
        activeThemeId={activeThemeId}
        onSelectTheme={onSelectTheme}
        onImportTheme={onImportTheme}
        onDeleteTheme={onDeleteTheme}
        language={language}
        shortcuts={shortcuts}
        onUpdateShortcut={onUpdateShortcut}
        onResetShortcuts={onResetShortcuts}
        showToast={showToast}
        onDataImported={onSettingsDataImported}
        showConfirmDialog={showConfirmDialog}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={onCancelConfirm}
      />

      <VoiceTranscriptionModal
        isOpen={isVoiceTranscriptionOpen}
        onClose={onCloseVoiceTranscription}
        files={files}
        onSaveToFile={onTranscriptionSaveToFile}
        onCreateNewFile={onTranscriptionCreateNewFile}
        language={language}
      />

      <QuestionBankModal
        isOpen={isQuestionBankOpen}
        onClose={onCloseQuestionBank}
        banks={questionBanks}
        onCreateBank={onCreateBank}
        onDeleteBank={onDeleteBank}
        onUpdateBank={onUpdateBank}
        onAddQuestionsToBank={onAddQuestionsToBank}
        onGenerateQuestions={onGenerateQuestions}
        onRemoveQuestion={onRemoveQuestion}
        onCreateQuizFromBank={onCreateQuizFromBank}
        onCreateQuizFromSelection={onCreateQuizFromSelection}
        files={files}
        onShowToast={showToast}
        language={language}
      />

      <TagSuggestionModal
        isOpen={isTagSuggestionOpen}
        onClose={onCloseTagSuggestion}
        content={tagSuggestionContent}
        aiConfig={aiConfig}
        existingTags={tagSuggestionExistingTags}
        onApplyTags={onApplyTags}
        onShowToast={showToast}
        language={language}
      />

      <SmartOrganizeModal
        isOpen={isSmartOrganizeOpen}
        onClose={onCloseSmartOrganize}
        file={smartOrganizeFile || fallbackFile}
        aiConfig={aiConfig}
        onUpdateFile={onUpdateFile}
        onApplySuggestions={() => { }}
        allFiles={allFiles}
        language={language}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={onCloseSearch}
        files={files}
        onSelectFile={onSelectFile}
      />

      <StudyPlanPanel
        isOpen={isStudyPlanOpen}
        onClose={onCloseStudyPlan}
        studyPlans={studyPlans}
        onCompleteTask={onCompleteTask}
        onCreatePlan={onCreatePlan}
        onDeletePlan={onDeletePlan}
        language={language}
      />

      <LinkInsertModal
        isOpen={isLinkInsertOpen}
        mode={linkInsertMode}
        files={files}
        currentFileId={activeFileId}
        onInsert={onInsertLink}
        onClose={onCloseLinkInsert}
        selectedText={selectedText}
      />

      <CompactMemoryPrompt
        isOpen={showCompactMemoryPrompt}
        candidate={compactMemoryCandidate}
        language={language}
        onSave={onCompactMemorySave}
        onSkip={onCompactMemorySkip}
        onClose={onCloseCompactMemory}
      />
    </>
  );
});

AppOverlays.displayName = 'AppOverlays';
