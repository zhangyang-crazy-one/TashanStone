import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import type { AIConfig, QuestionBank, Quiz, QuizQuestion, Theme, MistakeRecord } from '../types';
import { gradeQuizQuestion, generateQuizExplanation } from '../services/aiService';
import { translations, Language } from '../utils/translations';
import { QuizBankLink } from './QuizPanel/QuizBankLink';
import { QuizFooter } from './QuizPanel/QuizFooter';
import { QuizHeader } from './QuizPanel/QuizHeader';
import { QuizMistakeCollection } from './QuizPanel/QuizMistakeCollection';
import { QuizQuestionCard } from './QuizPanel/QuizQuestionCard';
import { formatAnswer, getQuestionType, isAnswerCorrect, isAnswerEmpty, isOptionCorrect, isOptionSelected, normalizeSelection } from './QuizPanel/quizAnswerUtils';
import { useQuizMistakes } from './QuizPanel/useQuizMistakes';

interface QuizPanelProps {
  quiz: Quiz;
  aiConfig: AIConfig;
  theme: Theme;
  onClose: () => void;
  contextContent: string;
  language?: Language;
  questionBanks: QuestionBank[];
  onAddQuestionsToBank: (bankId: string, questions: QuizQuestion[]) => Promise<boolean>;
  onCreateQuestionBank: (name: string, description?: string) => Promise<QuestionBank | null>;
  sourceFileId?: string;
}

const isGeneratedQuiz = (quizId: string) => quizId.startsWith('quiz-gen-') || quizId.startsWith('quiz-extracted-');

export const QuizPanel: React.FC<QuizPanelProps> = ({
  quiz,
  aiConfig,
  onClose,
  contextContent,
  language = 'en',
  questionBanks,
  onAddQuestionsToBank,
  onCreateQuestionBank,
  sourceFileId
}) => {
  const [currentQuiz, setCurrentQuiz] = useState<Quiz>(quiz);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [gradingIds, setGradingIds] = useState<string[]>([]);
  const [explainingIds, setExplainingIds] = useState<string[]>([]);

  const t = translations[language];

  useEffect(() => {
    setCurrentQuiz(quiz);
    setActiveQuestionIdx(0);
  }, [quiz]);

  const {
    showMistakes,
    setShowMistakes,
    savedMistakes,
    saveMistake,
    deleteMistake
  } = useQuizMistakes(currentQuiz.title);

  const activeQuestion = currentQuiz.questions?.[activeQuestionIdx];

  const checkAnswer = async () => {
    if (!activeQuestion || isAnswerEmpty(activeQuestion.userAnswer)) return;

    const questionType = getQuestionType(activeQuestion);
    const validationResult = isAnswerCorrect(
      activeQuestion.userAnswer,
      activeQuestion.correctAnswer,
      questionType,
      activeQuestion.options
    );

    if (validationResult !== null) {
      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = { ...activeQuestion, isCorrect: validationResult };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));

      if (!validationResult) {
        const mistake: MistakeRecord = {
          id: `${currentQuiz.id}-${activeQuestion.id}-${Date.now()}`,
          question: activeQuestion.question,
          userAnswer: formatAnswer(activeQuestion.userAnswer, activeQuestion.options),
          correctAnswer: formatAnswer(activeQuestion.correctAnswer, activeQuestion.options),
          explanation: activeQuestion.explanation,
          timestamp: Date.now(),
          quizTitle: currentQuiz.title
        };
        saveMistake(mistake);
      }
      return;
    }

    setGradingIds(prev => [...prev, activeQuestion.id]);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI grading timeout (60s)')), 60000);
    });

    try {
      const userAnswer = formatAnswer(activeQuestion.userAnswer, activeQuestion.options);
      const result = await Promise.race([
        gradeQuizQuestion(activeQuestion.question, userAnswer, contextContent, aiConfig),
        timeoutPromise
      ]);

      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = {
        ...activeQuestion,
        isCorrect: result.isCorrect,
        explanation: result.explanation
      };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));

      if (!result.isCorrect) {
        const mistake: MistakeRecord = {
          id: `${currentQuiz.id}-${activeQuestion.id}-${Date.now()}`,
          question: activeQuestion.question,
          userAnswer,
          correctAnswer: '(AI Graded)',
          explanation: result.explanation,
          timestamp: Date.now(),
          quizTitle: currentQuiz.title
        };
        saveMistake(mistake);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI grading failed.';
      const updatedQuestions = [...currentQuiz.questions];
      const errorMsg = message.includes('timeout')
        ? 'AI grading timed out. Please try again or check your answer manually.'
        : 'AI grading failed. Please try again.';
      updatedQuestions[activeQuestionIdx] = {
        ...activeQuestion,
        isCorrect: false,
        explanation: errorMsg
      };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));
    } finally {
      setGradingIds(prev => prev.filter(id => id !== activeQuestion.id));
    }
  };

  const handleExplain = async () => {
    if (!activeQuestion || explainingIds.includes(activeQuestion.id)) return;

    setExplainingIds(prev => [...prev, activeQuestion.id]);
    try {
      const correctAnswer = formatAnswer(activeQuestion.correctAnswer, activeQuestion.options) || 'the correct option';
      const userAnswer = formatAnswer(activeQuestion.userAnswer, activeQuestion.options);
      const explanation = await generateQuizExplanation(
        activeQuestion.question,
        correctAnswer,
        userAnswer,
        contextContent,
        aiConfig
      );

      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = { ...activeQuestion, explanation };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));

      const existingMistake = savedMistakes.find(m => m.question === activeQuestion.question);
      if (existingMistake) {
        const updatedMistake = { ...existingMistake, explanation };
        saveMistake(updatedMistake);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExplainingIds(prev => prev.filter(id => id !== activeQuestion.id));
    }
  };

  const handleDownload = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentQuiz, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `quiz_${currentQuiz.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  if (showMistakes) {
    return (
      <QuizMistakeCollection
        mistakes={savedMistakes}
        onDelete={deleteMistake}
        onClose={() => setShowMistakes(false)}
        language={language}
      />
    );
  }

  if (!currentQuiz || !currentQuiz.questions || currentQuiz.questions.length === 0) {
    return (
      <div className="w-full h-full p-6 flex items-center justify-center text-slate-500">
        <div className="text-center">
          <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500" />
          <p>No questions generated for this quiz.</p>
          <button onClick={onClose} className="mt-4 text-cyan-500 underline">{t.close}</button>
        </div>
      </div>
    );
  }

  if (!activeQuestion) {
    return (
      <div className="w-full h-full p-6 flex items-center justify-center text-slate-500">
        <p>Error: Question not found at index {activeQuestionIdx}</p>
      </div>
    );
  }

  const isGrading = gradingIds.includes(activeQuestion.id);
  const isExplaining = explainingIds.includes(activeQuestion.id);
  const isAnswered = activeQuestion.isCorrect !== undefined;
  const canCheckAnswer = !isAnswerEmpty(activeQuestion.userAnswer);

  const autoOpenSave = useMemo(() => isGeneratedQuiz(currentQuiz.id), [currentQuiz.id]);

  return (
    <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col overflow-hidden">
      <QuizHeader
        title={currentQuiz.title}
        questionIndex={activeQuestionIdx}
        totalQuestions={currentQuiz.questions.length}
        onShowMistakes={() => setShowMistakes(true)}
        onDownload={handleDownload}
        onExit={onClose}
        language={language}
        bankAction={(
          <QuizBankLink
            quiz={currentQuiz}
            banks={questionBanks}
            onAddQuestionsToBank={onAddQuestionsToBank}
            onCreateBank={onCreateQuestionBank}
            language={language}
            autoOpen={autoOpenSave}
            sourceFileId={sourceFileId}
          />
        )}
      />

      <div className="w-full h-1 bg-paper-200 dark:bg-cyber-800">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-300"
          style={{ width: `${((activeQuestionIdx + 1) / currentQuiz.questions.length) * 100}%` }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-12 flex justify-center">
        <div className="w-full max-w-3xl space-y-8">
          <QuizQuestionCard
            question={activeQuestion}
            isAnswered={isAnswered}
            isExplaining={isExplaining}
            isOptionSelected={(idx) => isOptionSelected(activeQuestion, idx)}
            isOptionCorrect={(idx) => isOptionCorrect(activeQuestion, idx)}
            onOptionSelect={(idx) => {
              if (activeQuestion.isCorrect !== undefined) return;
              const updatedQuestions = [...currentQuiz.questions];
              if (getQuestionType(activeQuestion) === 'multiple') {
                const currentSelection = normalizeSelection(activeQuestion.userAnswer, activeQuestion.options);
                const newSelection = currentSelection.includes(idx)
                  ? currentSelection.filter(value => value !== idx)
                  : [...currentSelection, idx].sort((a, b) => a - b);
                updatedQuestions[activeQuestionIdx] = { ...activeQuestion, userAnswer: newSelection };
              } else {
                updatedQuestions[activeQuestionIdx] = { ...activeQuestion, userAnswer: idx };
              }
              setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
            }}
            onTextAnswer={(value) => {
              if (activeQuestion.isCorrect !== undefined) return;
              const updatedQuestions = [...currentQuiz.questions];
              updatedQuestions[activeQuestionIdx] = { ...activeQuestion, userAnswer: value };
              setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
            }}
            onExplain={handleExplain}
            language={language}
          />
        </div>
      </div>

      <QuizFooter
        activeIndex={activeQuestionIdx}
        totalQuestions={currentQuiz.questions.length}
        isAnswered={isAnswered}
        isGrading={isGrading}
        canCheckAnswer={canCheckAnswer}
        onPrev={() => setActiveQuestionIdx(Math.max(0, activeQuestionIdx - 1))}
        onCheckAnswer={checkAnswer}
        onNext={() => setActiveQuestionIdx(activeQuestionIdx + 1)}
        onFinish={onClose}
        language={language}
      />
    </div>
  );
};
