import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type {
  AIConfig,
  AIState,
  ExamResult,
  GraphData,
  KnowledgePointStat,
  MarkdownFile,
  MindMapDetailLevel,
  QuestionBank,
  DifficultyLevel,
  Quiz,
  QuizQuestion,
  Snippet,
  StudyPlan
} from '@/types';
import { ViewMode } from '@/types';
import { extractTags } from '@/src/types/wiki';
import { parseCsvToQuiz, extractTextFromFile } from '@/services/fileService';
import {
  extractQuizFromRawContent,
  generateKnowledgeGraph,
  generateMindMap,
  generateQuiz,
  polishContent,
  expandContent,
  synthesizeKnowledgeBase
} from '@/services/aiService';
import { questionBankService } from '@/src/services/quiz/questionBankService';
import { buildKnowledgeIndexFromFiles, generateFileLinkGraph } from '@/src/services/wiki/wikiLinkService';
import type { TranslationMap } from '@/utils/translations';

interface UseAppFeatureStateOptions {
  aiConfig: AIConfig;
  activeFile: MarkdownFile;
  files: MarkdownFile[];
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  setActiveFileId: Dispatch<SetStateAction<string>>;
  getActivePaneContent: () => string;
  getActivePaneFileId: () => string | undefined;
  updateActiveFile: (content: string, cursorPosition?: { start: number; end: number }, skipHistory?: boolean) => void;
  showToast: (message: string, isError?: boolean) => void;
  setAiState: Dispatch<SetStateAction<AIState>>;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  viewMode: ViewMode;
  saveSnapshot: () => void;
  t: TranslationMap;
}

interface UseAppFeatureStateResult {
  graphData: GraphData;
  graphType: 'concept' | 'filelink';
  currentQuiz: Quiz | null;
  quizContext: string;
  mindMapContent: string;
  mindMapDetailLevel: MindMapDetailLevel;
  setMindMapDetailLevel: Dispatch<SetStateAction<MindMapDetailLevel>>;
  diffOriginal: string;
  diffModified: string;
  examHistory: ExamResult[];
  knowledgeStats: KnowledgePointStat[];
  studyPlans: StudyPlan[];
  snippets: Snippet[];
  questionBanks: QuestionBank[];
  setQuestionBanks: Dispatch<SetStateAction<QuestionBank[]>>;
  performGraph: (useActiveFileOnly?: boolean, graphTypeOverride?: 'concept' | 'filelink') => Promise<void>;
  performPolish: () => Promise<void>;
  performSynthesize: () => Promise<void>;
  handleAIExpand: () => Promise<void>;
  handleGenerateMindMap: () => Promise<void>;
  handleGenerateQuiz: () => Promise<void>;
  handleImportQuiz: (file: File) => Promise<void>;
  handleApplyTags: (tags: string[]) => void;
  handleApplyDiff: (text: string) => void;
  handleCancelDiff: () => void;
  handleCompleteTask: (planId: string, taskId: string) => void;
  handleCreatePlan: (sourceType: 'file' | 'mistake', sourceId: string, title: string) => void;
  handleDeletePlan: (planId: string) => void;
  handleCreateSnippet: (snippet: Omit<Snippet, 'id'>) => void;
  handleDeleteSnippet: (id: string) => void;
  handleInsertSnippet: (content: string) => void;
  handleCreateQuestionBank: (name: string, description?: string) => Promise<QuestionBank | null>;
  handleDeleteQuestionBank: (bankId: string) => Promise<void>;
  handleUpdateQuestionBank: (bankId: string, updates: Partial<QuestionBank>) => Promise<void>;
  handleAddQuestionsToBank: (bankId: string, questions: QuizQuestion[]) => Promise<boolean>;
  handleGenerateQuestions: (bankId: string, sourceFileId: string, count?: number, difficulty?: string) => Promise<void>;
  handleCreateQuizFromBank: (bankId: string, count?: number, difficulty?: DifficultyLevel | 'mixed') => Promise<Quiz | null>;
  handleCreateQuizFromSelection: (questions: QuizQuestion[], title?: string) => Promise<Quiz | null>;
  handleRemoveQuestion: (bankId: string, questionId: string) => Promise<void>;
  handleExitQuiz: () => void;
}

export const useAppFeatureState = ({
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
}: UseAppFeatureStateOptions): UseAppFeatureStateResult => {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [graphType, setGraphType] = useState<'concept' | 'filelink'>('concept');
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [quizContext, setQuizContext] = useState<string>('');
  const [mindMapContent, setMindMapContent] = useState<string>('');
  const [mindMapDetailLevel, setMindMapDetailLevel] = useState<MindMapDetailLevel>('compact');
  const [diffOriginal, setDiffOriginal] = useState<string>('');
  const [diffModified, setDiffModified] = useState<string>('');
  const [examHistory, setExamHistory] = useState<ExamResult[]>(() => {
    try {
      const saved = localStorage.getItem('neon-exam-history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgePointStat[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>(() => {
    try {
      const saved = localStorage.getItem('neon-study-plans');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    try {
      const saved = localStorage.getItem('neon-snippets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const lastNonQuizViewModeRef = useRef<ViewMode>(ViewMode.Editor);

  useEffect(() => {
    localStorage.setItem('neon-exam-history', JSON.stringify(examHistory));
  }, [examHistory]);

  useEffect(() => {
    localStorage.setItem('neon-study-plans', JSON.stringify(studyPlans));
  }, [studyPlans]);

  useEffect(() => {
    localStorage.setItem('neon-snippets', JSON.stringify(snippets));
  }, [snippets]);

  useEffect(() => {
    if (viewMode !== ViewMode.Quiz) {
      lastNonQuizViewModeRef.current = viewMode;
    }
  }, [viewMode]);

  const performPolish = useCallback(async () => {
    const currentContent = getActivePaneContent();
    if (!currentContent.trim()) {
      showToast(t.polishEmptyError || 'Please add content before polishing', true);
      return;
    }

    try {
      saveSnapshot();
      setAiState({ isThinking: true, message: 'Polishing...', error: null });
      const res = await polishContent(currentContent, aiConfig);
      setDiffOriginal(currentContent);
      setDiffModified(res);
      setViewMode(ViewMode.Diff);
      showToast('Polish complete - review changes');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Polish failed';
      showToast(message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [aiConfig, getActivePaneContent, saveSnapshot, setAiState, setViewMode, showToast, t.polishEmptyError]);

  const performGraph = useCallback(async (useActiveFileOnly: boolean = false, graphTypeOverride?: 'concept' | 'filelink') => {
    const selectedGraphType = graphTypeOverride || graphType;

    try {
      setAiState({ isThinking: true, message: selectedGraphType === 'filelink' ? 'Building File Links...' : 'Analyzing Graph...', error: null });

      const currentContent = getActivePaneContent();

      let filesToAnalyze: MarkdownFile[];
      if (useActiveFileOnly && activeFile) {
        filesToAnalyze = [{ ...activeFile, content: currentContent }];
      } else {
        if (currentContent && activeFile) {
          filesToAnalyze = files.map(f =>
            f.id === activeFile.id ? { ...f, content: currentContent } : f
          );
        } else {
          filesToAnalyze = files;
        }
      }

      let data: GraphData;

      if (selectedGraphType === 'filelink') {
        const index = buildKnowledgeIndexFromFiles(filesToAnalyze);
        data = generateFileLinkGraph(filesToAnalyze, index);
      } else {
        data = await generateKnowledgeGraph(filesToAnalyze, aiConfig);
      }

      setGraphData(data);
      setGraphType(selectedGraphType);
      setViewMode(ViewMode.Graph);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Graph generation failed';
      showToast(message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [activeFile, aiConfig, files, getActivePaneContent, graphType, setAiState, setViewMode, showToast]);

  const performSynthesize = useCallback(async () => {
    try {
      setAiState({ isThinking: true, message: 'Synthesizing Knowledge Base...', error: null });

      const currentContent = getActivePaneContent();
      let filesToSynthesize = files;
      if (currentContent && activeFile) {
        filesToSynthesize = files.map(f =>
          f.id === activeFile.id ? { ...f, content: currentContent } : f
        );
      }

      const summary = await synthesizeKnowledgeBase(filesToSynthesize, aiConfig);
      const newFile: MarkdownFile = {
        id: crypto.randomUUID(),
        name: 'Master-Summary',
        content: summary,
        lastModified: Date.now(),
        path: 'Master-Summary.md'
      };
      setFiles([...files, newFile]);
      setActiveFileId(newFile.id);
      setViewMode(ViewMode.Preview);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Synthesis failed';
      showToast(message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [activeFile, aiConfig, files, getActivePaneContent, setActiveFileId, setAiState, setFiles, setViewMode, showToast]);

  const handleAIExpand = useCallback(async () => {
    const currentContent = getActivePaneContent();
    if (!currentContent.trim()) {
      showToast(t.polishEmptyError || 'Please add content before expanding', true);
      return;
    }

    try {
      saveSnapshot();
      setAiState({ isThinking: true, message: 'Expanding...', error: null });
      const res = await expandContent(currentContent, aiConfig);
      updateActiveFile(res);
      showToast('Expanded!');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to expand content';
      showToast(message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [aiConfig, getActivePaneContent, saveSnapshot, setAiState, showToast, t.polishEmptyError, updateActiveFile]);

  const handleGenerateMindMap = useCallback(async () => {
    const currentContent = getActivePaneContent();
    if (!currentContent.trim()) {
      showToast(t.polishEmptyError || 'Please add content before generating mind map', true);
      return;
    }

    setAiState({ isThinking: true, message: 'Dreaming up Mind Map...', error: null });
    try {
      const mermaidCode = await generateMindMap(currentContent, aiConfig, mindMapDetailLevel);
      setMindMapContent(mermaidCode);
      setViewMode(ViewMode.MindMap);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Mind map generation failed';
      showToast(message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [aiConfig, getActivePaneContent, mindMapDetailLevel, setAiState, setViewMode, showToast, t.polishEmptyError]);

  const handleGenerateQuiz = useCallback(async () => {
    const currentContent = getActivePaneContent();
    const sourceFileId = getActivePaneFileId();

    if (!currentContent.trim()) {
      showToast(t.polishEmptyError || 'Please add content before generating quiz', true);
      return;
    }

    setAiState({ isThinking: true, message: 'Creating Quiz...', error: null });
    try {
      lastNonQuizViewModeRef.current = viewMode;
      setQuizContext(currentContent);
      setCurrentQuiz({
        id: `quiz-loading-${Date.now()}`,
        title: t.quiz || 'Quiz',
        description: '',
        questions: [],
        isGraded: false,
        status: 'in_progress',
        sourceFileId
      });
      setViewMode(ViewMode.Quiz);

      const quiz = await generateQuiz(currentContent, aiConfig);
      if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        throw new Error('Failed to generate quiz questions. The AI response was empty or invalid.');
      }

      const quizWithSource = sourceFileId ? { ...quiz, sourceFileId } : quiz;
      setCurrentQuiz(quizWithSource);
      showToast(`Quiz generated with ${quiz.questions.length} questions!`, false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Quiz generation failed';
      setCurrentQuiz(null);
      setViewMode(lastNonQuizViewModeRef.current || ViewMode.Editor);
      showToast(`Quiz generation failed: ${message}`, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [aiConfig, getActivePaneContent, getActivePaneFileId, setAiState, setViewMode, showToast, t.polishEmptyError, t.quiz, viewMode]);

  const handleImportQuiz = useCallback(async (file: File) => {
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const csvQuiz = await parseCsvToQuiz(file);
        if (csvQuiz) {
          const textContent = await extractTextFromFile(file, aiConfig.apiKey);
          lastNonQuizViewModeRef.current = viewMode;
          setQuizContext(textContent);
          setCurrentQuiz(csvQuiz);
          setViewMode(ViewMode.Quiz);
          showToast(t.importSuccess);
          setAiState(prev => ({ ...prev, isThinking: false, message: null }));
          return;
        }
      }

      const textContent = await extractTextFromFile(file, aiConfig.apiKey);
      lastNonQuizViewModeRef.current = viewMode;
      setQuizContext(textContent);

      setAiState({ isThinking: true, message: t.analyzingQuiz, error: null });
      const quiz = await extractQuizFromRawContent(textContent, aiConfig);

      setCurrentQuiz(quiz);
      setViewMode(ViewMode.Quiz);
      showToast(t.importSuccess);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Quiz import failed';
      showToast(`${t.importFail}: ${message}`, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  }, [aiConfig, setAiState, setViewMode, showToast, t.analyzingQuiz, t.importFail, t.importSuccess, t.processingFile, viewMode]);

  const handleApplyTags = useCallback((tags: string[]) => {
    const currentContent = getActivePaneContent();
    const existingTags = extractTags(currentContent);
    const newTags = tags.filter(tag => !existingTags.includes(tag));

    if (newTags.length === 0) {
      showToast('No new tags to add', false);
      return;
    }

    const tagString = newTags.map(tag => `#[${tag}]`).join(' ');
    const newContent = currentContent + '\n' + tagString;
    updateActiveFile(newContent);
    showToast(`Added ${newTags.length} tag(s)`, false);
  }, [getActivePaneContent, showToast, updateActiveFile]);

  const handleApplyDiff = useCallback((text: string) => {
    updateActiveFile(text);
    setViewMode(ViewMode.Editor);
    showToast('Changes applied');
  }, [setViewMode, showToast, updateActiveFile]);

  const handleCancelDiff = useCallback(() => {
    setViewMode(ViewMode.Editor);
  }, [setViewMode]);

  const handleCompleteTask = useCallback((planId: string, taskId: string) => {
    setStudyPlans(prev => prev.map(plan => {
      if (plan.id !== planId) return plan;
      const updatedTasks = plan.tasks.map(task => {
        if (task.id !== taskId) return task;
        return { ...task, status: 'completed' as const, completedDate: Date.now() };
      });
      const completedCount = updatedTasks.filter(t => t.status === 'completed').length;
      const progress = Math.round((completedCount / updatedTasks.length) * 100);
      return { ...plan, tasks: updatedTasks, progress };
    }));
  }, []);

  const handleCreatePlan = useCallback((sourceType: 'file' | 'mistake', sourceId: string, title: string) => {
    const intervals = ['5 mins', '30 mins', '12 hours', '1 day', '2 days', '4 days', '7 days'];
    const now = Date.now();
    const tasks = intervals.map((label, i) => ({
      id: crypto.randomUUID(),
      scheduledDate: now + getIntervalMs(label),
      status: i === 0 ? ('pending' as const) : ('future' as const),
      intervalLabel: label
    }));

    const newPlan: StudyPlan = {
      id: crypto.randomUUID(),
      title,
      sourceType,
      sourceId,
      createdDate: now,
      tasks,
      progress: 0
    };
    setStudyPlans(prev => [...prev, newPlan]);
  }, []);

  const handleDeletePlan = useCallback((planId: string) => {
    setStudyPlans(prev => prev.filter(p => p.id !== planId));
  }, []);

  const handleCreateSnippet = useCallback((snippet: Omit<Snippet, 'id'>) => {
    const newSnippet: Snippet = { ...snippet, id: crypto.randomUUID() };
    setSnippets(prev => [...prev, newSnippet]);
    showToast('Snippet created');
  }, [showToast]);

  const handleDeleteSnippet = useCallback((id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
    showToast('Snippet deleted');
  }, [showToast]);

  const handleInsertSnippet = useCallback((content: string) => {
    if (!activeFile) return;

    const cursorPos = activeFile.cursorPosition || {
      start: activeFile.content.length,
      end: activeFile.content.length
    };

    const before = activeFile.content.substring(0, cursorPos.start);
    const after = activeFile.content.substring(cursorPos.end);

    const newContent = before + content + after;
    const newCursorPos = {
      start: cursorPos.start + content.length,
      end: cursorPos.start + content.length
    };

    updateActiveFile(newContent, newCursorPos);
    showToast('Snippet inserted');
  }, [activeFile, showToast, updateActiveFile]);

  const handleCreateQuestionBank = useCallback(async (name: string, description?: string): Promise<QuestionBank | null> => {
    try {
      const bank = await questionBankService.createBank(name, description);
      setQuestionBanks(prev => [...prev, bank]);
      showToast(`Created bank: ${name}`);
      return bank;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create bank';
      showToast(`Failed to create bank: ${message}`, true);
      return null;
    }
  }, [showToast]);

  const handleDeleteQuestionBank = useCallback(async (bankId: string) => {
    try {
      const success = await questionBankService.deleteBank(bankId);
      if (success) {
        setQuestionBanks(prev => prev.filter(b => b.id !== bankId));
        showToast('Bank deleted');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete bank';
      showToast(`Failed to delete bank: ${message}`, true);
    }
  }, [showToast]);

  const handleUpdateQuestionBank = useCallback(async (bankId: string, updates: Partial<QuestionBank>) => {
    try {
      const bank = await questionBankService.updateBank(bankId, updates);
      if (bank) {
        setQuestionBanks(prev => prev.map(b => b.id === bankId ? bank : b));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update bank';
      showToast(`Failed to update bank: ${message}`, true);
    }
  }, [showToast]);

  const handleAddQuestionsToBank = useCallback(async (bankId: string, questions: QuizQuestion[]): Promise<boolean> => {
    try {
      const success = await questionBankService.addQuestionsToBank(bankId, questions);
      if (!success) {
        showToast('Question bank not found', true);
        return false;
      }

      const banks = questionBankService.getAllBanks();
      setQuestionBanks(banks);

      const countLabel = t.questionCount.replace('{count}', String(questions.length));
      showToast(`${t.saveQuizQuestions || 'Saved quiz questions'} (${countLabel})`);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save questions';
      showToast(`Failed to save questions: ${message}`, true);
      return false;
    }
  }, [showToast, t.questionCount, t.saveQuizQuestions]);

  const handleGenerateQuestions = useCallback(async (bankId: string, sourceFileId: string, count?: number, difficulty?: string) => {
    const sourceFile = files.find(f => f.id === sourceFileId);
    if (!sourceFile || !sourceFile.content.trim()) {
      throw new Error('Please select a file with content');
    }

    setAiState({ isThinking: true, message: 'Generating questions...', error: null });

    try {
      const questions = await questionBankService.generateAndAddQuestions(
        bankId,
        sourceFile.content,
        aiConfig,
        { count: count || 5, difficulty }
      );

      const banks = questionBankService.getAllBanks();
      setQuestionBanks(banks);

      setAiState({ isThinking: false, message: null, error: null });
      showToast(`Generated ${questions.length} questions`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate questions';
      setAiState({ isThinking: false, message: null, error: message });
      throw error;
    }
  }, [aiConfig, files, setAiState, showToast]);

  const handleRemoveQuestion = useCallback(async (bankId: string, questionId: string) => {
    try {
      const success = await questionBankService.removeQuestion(bankId, questionId);
      if (success) {
        const banks = questionBankService.getAllBanks();
        setQuestionBanks(banks);
        showToast('Question removed');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to remove question';
      showToast(`Failed to remove question: ${message}`, true);
    }
  }, [showToast]);

  const handleCreateQuizFromBank = useCallback(async (
    bankId: string,
    count?: number,
    difficulty?: DifficultyLevel | 'mixed'
  ): Promise<Quiz | null> => {
    try {
      const quiz = await questionBankService.createQuizFromBank(bankId, { count, difficulty });
      lastNonQuizViewModeRef.current = viewMode;
      setQuizContext('');
      setCurrentQuiz(quiz);
      setViewMode(ViewMode.Quiz);
      const countLabel = t.questionCount.replace('{count}', String(quiz.questions.length));
      showToast(`${t.startQuiz}: ${countLabel}`);
      return quiz;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create quiz';
      showToast(`Failed to create quiz: ${message}`, true);
      return null;
    }
  }, [setViewMode, showToast, t.questionCount, t.startQuiz, viewMode]);

  const handleCreateQuizFromSelection = useCallback(async (
    questions: QuizQuestion[],
    title?: string
  ): Promise<Quiz | null> => {
    if (questions.length === 0) {
      showToast(t.noQuestionsSelected || 'No questions selected', true);
      return null;
    }

    try {
      const quiz = questionBankService.createQuizFromQuestions(questions, { title });
      lastNonQuizViewModeRef.current = viewMode;
      setQuizContext('');
      setCurrentQuiz(quiz);
      setViewMode(ViewMode.Quiz);
      const countLabel = t.questionCount.replace('{count}', String(quiz.questions.length));
      showToast(`${t.startQuiz}: ${countLabel}`);
      return quiz;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create quiz';
      showToast(`Failed to create quiz: ${message}`, true);
      return null;
    }
  }, [setViewMode, showToast, t.noQuestionsSelected, t.questionCount, t.startQuiz, viewMode]);

  const handleExitQuiz = useCallback(() => {
    setViewMode(lastNonQuizViewModeRef.current || ViewMode.Editor);
  }, [setViewMode]);

  return {
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
  };
};

const getIntervalMs = (label: string): number => {
  const map: Record<string, number> = {
    '5 mins': 5 * 60 * 1000,
    '30 mins': 30 * 60 * 1000,
    '12 hours': 12 * 60 * 60 * 1000,
    '1 day': 24 * 60 * 60 * 1000,
    '2 days': 2 * 24 * 60 * 60 * 1000,
    '4 days': 4 * 24 * 60 * 60 * 1000,
    '7 days': 7 * 24 * 60 * 60 * 1000,
  };
  return map[label] || 0;
};
