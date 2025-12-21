
import React, { useState, useEffect } from 'react';
import { Quiz, AIConfig, Theme, MistakeRecord } from '../types';
import { CheckCircle2, XCircle, HelpCircle, Download, BookOpen, AlertTriangle, ArrowRight, ArrowLeft, RotateCcw, BookmarkX, Trash2, Sparkles, Loader2, CheckSquare, Circle } from 'lucide-react';
import { gradeQuizQuestion, generateQuizExplanation } from '../services/aiService';
import { translations, Language } from '../utils/translations';

interface QuizPanelProps {
  quiz: Quiz;
  aiConfig: AIConfig;
  theme: Theme;
  onClose: () => void;
  contextContent: string;
  language?: Language;
}

export const QuizPanel: React.FC<QuizPanelProps> = ({ quiz, aiConfig, theme, onClose, contextContent, language = 'en' }) => {
  const [currentQuiz, setCurrentQuiz] = useState<Quiz>(quiz);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [gradingIds, setGradingIds] = useState<string[]>([]);
  const [explainingIds, setExplainingIds] = useState<string[]>([]);
  
  // Mistake Collection State
  const [showMistakes, setShowMistakes] = useState(false);
  const [savedMistakes, setSavedMistakes] = useState<MistakeRecord[]>([]);

  const t = translations[language];

  // Load mistakes on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('neon-quiz-mistakes');
      if (stored) {
        const parsed = JSON.parse(stored) as MistakeRecord[];
        // Deduplicate by ID (keep first occurrence)
        const seen = new Set<string>();
        const deduped = parsed.filter(m => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        setSavedMistakes(deduped);
        // Save back deduplicated list if it changed
        if (deduped.length !== parsed.length) {
          localStorage.setItem('neon-quiz-mistakes', JSON.stringify(deduped));
        }
      }
    } catch (e) { console.error("Failed to load mistakes", e); }
  }, []);

  const saveMistake = (record: MistakeRecord) => {
    // Check if a record with the same ID already exists (for updates)
    const existingIndex = savedMistakes.findIndex(m => m.id === record.id);
    let updated: MistakeRecord[];

    if (existingIndex !== -1) {
      // Update existing record in place
      updated = [...savedMistakes];
      updated[existingIndex] = record;
    } else {
      // Add new record at the beginning
      updated = [record, ...savedMistakes];
    }

    setSavedMistakes(updated);
    localStorage.setItem('neon-quiz-mistakes', JSON.stringify(updated));
  };

  const deleteMistake = (id: string) => {
    const updated = savedMistakes.filter(m => m.id !== id);
    setSavedMistakes(updated);
    localStorage.setItem('neon-quiz-mistakes', JSON.stringify(updated));
  };

  // Safe access to active question
  const activeQuestion = currentQuiz.questions?.[activeQuestionIdx];

  // Handle option selection - supports both single and multiple choice using numeric index
  const handleOptionSelect = (optionIndex: number) => {
    if (activeQuestion.isCorrect !== undefined) return; // Already answered

    const updatedQuestions = [...currentQuiz.questions];

    if (activeQuestion.type === 'multiple') {
      // Multiple choice: toggle selection in array
      const currentSelection = (activeQuestion.userAnswer as number[]) || [];
      const newSelection = currentSelection.includes(optionIndex)
        ? currentSelection.filter(i => i !== optionIndex)
        : [...currentSelection, optionIndex].sort();

      updatedQuestions[activeQuestionIdx] = {
        ...activeQuestion,
        userAnswer: newSelection
      };
    } else {
      // Single choice: replace selection with index
      updatedQuestions[activeQuestionIdx] = {
        ...activeQuestion,
        userAnswer: optionIndex
      };
    }

    setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
  };

  const handleTextAnswer = (text: string) => {
    if (activeQuestion.isCorrect !== undefined) return;
    const updatedQuestions = [...currentQuiz.questions];
    updatedQuestions[activeQuestionIdx] = {
      ...activeQuestion,
      userAnswer: text
    };
    setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
  };

  // Simplified answer checking for numeric index format
  // Returns true/false for deterministic checking, null for AI grading needed
  const isAnswerCorrect = (
    userAns: number | number[] | string | string[] | undefined,
    correctAns: number | number[] | string | string[] | undefined,
    type: string,
    options?: string[]
  ): boolean | null => {
    // Normalize string for text comparison
    const normalize = (str: string) => str.trim().toLowerCase();

    switch (type) {
      case 'single':
        // Single choice: compare numeric indices
        // CRITICAL: Reject undefined/null values to prevent false positives
        if (userAns === undefined || userAns === null || correctAns === undefined || correctAns === null) {
          return false;
        }
        if (typeof userAns === 'number' && typeof correctAns === 'number') {
          return userAns === correctAns;
        }
        // Fallback: try to parse string to number or compare strings
        return parseSingleAnswer(userAns, correctAns, options);

      case 'multiple':
        // Multiple choice: compare index arrays
        const userArr = Array.isArray(userAns) ? userAns : [];
        const correctArr = Array.isArray(correctAns) ? correctAns : [];
        // CRITICAL: Empty correctArr means invalid question data - return false
        // (empty array's every() always returns true, which is a bug)
        if (correctArr.length === 0) return false;
        if (userArr.length === 0) return false; // User must select at least one
        if (userArr.length !== correctArr.length) return false;
        // Convert all values to strings for comparison (handles both number[] and string[])
        const userSetStr = new Set(userArr.map(v => String(v)));
        const correctSetStr = new Set(correctArr.map(v => String(v)));
        return [...correctSetStr].every(x => userSetStr.has(x));

      case 'fill_blank':
        // Fill-in-blank: exact string match after normalization
        const userStr = typeof userAns === 'string' ? normalize(userAns) : '';
        const correctStr = typeof correctAns === 'string' ? normalize(correctAns) : '';
        // CRITICAL: Empty strings should not match - prevent false positives
        if (userStr === '' || correctStr === '') return false;
        if (userStr === correctStr) return true;
        // Numeric tolerance for numbers
        const userNum = parseFloat(userStr);
        const correctNum = parseFloat(correctStr);
        if (!isNaN(userNum) && !isNaN(correctNum)) {
          return Math.abs(userNum - correctNum) <= Math.abs(correctNum) * 0.01;
        }
        return false;

      case 'text':
        // Essay/text: always requires AI grading
        return null;

      default:
        // Unknown type with options: try choice comparison
        if (options && options.length > 0) {
          return parseSingleAnswer(userAns, correctAns, options);
        }
        // Without options: try string comparison
        return null;
    }
  };

  // Helper to parse various answer formats for backward compatibility
  const parseSingleAnswer = (
    userAns: number | number[] | string | string[] | undefined,
    correctAns: number | number[] | string | string[] | undefined,
    options?: string[]
  ): boolean => {
    // Early exit for undefined/null values
    if (userAns === undefined || userAns === null || correctAns === undefined || correctAns === null) {
      return false;
    }

    const letterToIndex: { [key: string]: number } = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };

    const parseToIndex = (val: any): number => {
      if (typeof val === 'number') return val;
      if (typeof val !== 'string') return -1;

      const str = val.trim().toUpperCase();
      // Letter format
      if (letterToIndex[str] !== undefined) return letterToIndex[str];
      // Numeric string
      const num = parseInt(str, 10);
      if (!isNaN(num) && num >= 0) return num;
      // Match option text
      if (options) {
        const idx = options.findIndex(opt => opt.trim().toLowerCase() === val.trim().toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const userIdx = parseToIndex(userAns);
    const correctIdx = parseToIndex(correctAns);

    if (userIdx !== -1 && correctIdx !== -1) {
      return userIdx === correctIdx;
    }
    return false;
  };

  // Check if option at index is selected (handles both number and number[] userAnswer)
  const isOptionSelected = (idx: number): boolean => {
    const ans = activeQuestion?.userAnswer;
    if (activeQuestion?.type === 'multiple') {
      // For multiple choice, check if idx is in the array
      if (Array.isArray(ans)) {
        // Handle both number[] and string[] arrays
        return ans.some(a => a === idx || (typeof a === 'string' && parseInt(a, 10) === idx));
      }
      return false;
    }
    // For single choice, compare directly
    if (typeof ans === 'number') return ans === idx;
    if (typeof ans === 'string') return ans === activeQuestion?.options?.[idx] || parseInt(ans, 10) === idx;
    return false;
  };

  // Check if option at index is the correct answer
  const isOptionCorrect = (idx: number): boolean => {
    const correct = activeQuestion?.correctAnswer;
    if (activeQuestion?.type === 'multiple') {
      if (Array.isArray(correct)) {
        return correct.some(c => c === idx || (typeof c === 'string' && parseInt(c, 10) === idx));
      }
      return false;
    }
    if (typeof correct === 'number') return correct === idx;
    if (typeof correct === 'string') return parseInt(correct, 10) === idx;
    return false;
  };

  const checkAnswer = async () => {
    const q = activeQuestion;
    if (q.userAnswer === undefined || q.userAnswer === null ||
        (typeof q.userAnswer === 'string' && q.userAnswer.trim() === '') ||
        (Array.isArray(q.userAnswer) && q.userAnswer.length === 0)) return;

    const questionType = q.type || (q.options && q.options.length > 0 ? 'single' : 'text');

    // Determine validation method based on question type
    const validationResult = isAnswerCorrect(q.userAnswer, q.correctAnswer, questionType, q.options);

    // If validationResult is not null, we can determine correctness locally
    if (validationResult !== null) {
      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = { ...q, isCorrect: validationResult };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));

      // Auto-save mistake if incorrect
      if (!validationResult) {
        const formatAnswer = (ans: any, opts?: string[]): string => {
          if (Array.isArray(ans)) {
            return ans.map(i => typeof i === 'number' && opts ? opts[i] : i).join(', ');
          }
          if (typeof ans === 'number' && opts) return opts[ans] || String(ans);
          return String(ans || '');
        };

        const mistake: MistakeRecord = {
          id: `${currentQuiz.id}-${q.id}-${Date.now()}`,
          question: q.question,
          userAnswer: formatAnswer(q.userAnswer, q.options),
          correctAnswer: formatAnswer(q.correctAnswer, q.options),
          explanation: q.explanation,
          timestamp: Date.now(),
          quizTitle: currentQuiz.title
        };
        saveMistake(mistake);
      }
      return;
    }

    // AI Grading required for 'text' type questions
    setGradingIds(prev => [...prev, q.id]);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI grading timeout (60s)')), 60000);
    });

    try {
      const result = await Promise.race([
        gradeQuizQuestion(q.question, q.userAnswer as string, contextContent, aiConfig),
        timeoutPromise
      ]);

      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = {
        ...q,
        isCorrect: result.isCorrect,
        explanation: result.explanation
      };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));

      if (!result.isCorrect) {
        const mistake: MistakeRecord = {
          id: `${currentQuiz.id}-${q.id}-${Date.now()}`,
          question: q.question,
          userAnswer: q.userAnswer as string,
          correctAnswer: "(AI Graded)",
          explanation: result.explanation,
          timestamp: Date.now(),
          quizTitle: currentQuiz.title
        };
        saveMistake(mistake);
      }
    } catch (err: any) {
      console.error("Grading failed", err);

      const updatedQuestions = [...currentQuiz.questions];
      const errorMsg = err.message?.includes('timeout')
        ? 'AI grading timed out. Please try again or check your answer manually.'
        : 'AI grading failed. Please try again.';

      updatedQuestions[activeQuestionIdx] = {
        ...q,
        isCorrect: false,
        explanation: errorMsg
      };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));
    } finally {
      setGradingIds(prev => prev.filter(id => id !== q.id));
    }
  };

  const handleExplain = async () => {
      const q = activeQuestion;
      if (!q || explainingIds.includes(q.id)) return;

      setExplainingIds(prev => [...prev, q.id]);
      try {
         const explanation = await generateQuizExplanation(
             q.question,
             Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : String(q.correctAnswer || "the correct option"),
             Array.isArray(q.userAnswer) ? q.userAnswer.join(', ') : String(q.userAnswer || ""),
             contextContent,
             aiConfig
         );

         const updatedQuestions = [...currentQuiz.questions];
         updatedQuestions[activeQuestionIdx] = { ...q, explanation };
         setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));

         // Update mistake record if it exists
         const existingMistake = savedMistakes.find(m => m.question === q.question);
         if (existingMistake) {
             const updatedMistake = { ...existingMistake, explanation };
             saveMistake(updatedMistake); // overwrite
         }

      } catch (e) {
         console.error(e);
      } finally {
         setExplainingIds(prev => prev.filter(id => id !== q.id));
      }
  };

  const handleDownload = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentQuiz, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `quiz_${currentQuiz.id}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // --- Render Mistake View ---
  if (showMistakes) {
      return (
        <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col overflow-hidden">
            <div className="h-16 flex items-center justify-between px-6 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 shrink-0">
                <div className="flex items-center gap-3">
                     <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                        <BookmarkX size={20} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Mistake Collection (错题本)</h2>
                </div>
                <button onClick={() => setShowMistakes(false)} className="px-3 py-1.5 rounded-md bg-paper-200 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-paper-300 dark:hover:bg-cyber-600 transition-colors text-sm font-medium">
                    Back to Quiz
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-12">
                 <div className="max-w-4xl mx-auto space-y-6">
                    {savedMistakes.length === 0 ? (
                        <div className="text-center text-slate-400 py-20">
                            <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No mistakes recorded yet. Keep practicing!</p>
                        </div>
                    ) : (
                        savedMistakes.map(mistake => (
                            <div key={mistake.id} className="bg-white dark:bg-cyber-800 rounded-xl border border-red-200 dark:border-red-900/50 shadow-sm p-6 relative group">
                                <button 
                                    onClick={() => deleteMistake(mistake.id)} 
                                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Remove from collection"
                                >
                                    <Trash2 size={18} />
                                </button>
                                
                                <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                                    <span className="bg-paper-100 dark:bg-cyber-700 px-2 py-0.5 rounded text-[10px]">{new Date(mistake.timestamp).toLocaleDateString()}</span>
                                    {mistake.quizTitle && <span>{mistake.quizTitle}</span>}
                                </div>
                                
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4">{mistake.question}</h3>
                                
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                                        <span className="text-xs font-bold text-red-500 uppercase tracking-wide block mb-1">Your Answer</span>
                                        <p className="text-slate-700 dark:text-slate-300">{mistake.userAnswer}</p>
                                    </div>
                                    <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/30">
                                        <span className="text-xs font-bold text-green-500 uppercase tracking-wide block mb-1">Correct Answer</span>
                                        <p className="text-slate-700 dark:text-slate-300">{mistake.correctAnswer}</p>
                                    </div>
                                </div>
                                
                                {mistake.explanation && (
                                    <div className="mt-4 pt-4 border-t border-paper-100 dark:border-cyber-700">
                                        <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                                            <span className="font-semibold not-italic mr-1">Explanation:</span>
                                            {mistake.explanation}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                 </div>
            </div>
        </div>
      );
  }

  // --- Main Quiz Render ---
  
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

  return (
    <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded-lg">
                    <BookOpen size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{currentQuiz.title || 'Generated Quiz'}</h2>
                    <div className="text-xs text-slate-500">{t.question} {activeQuestionIdx + 1} / {currentQuiz.questions.length}</div>
                </div>
            </div>
            <div className="flex gap-2">
                 <button 
                    onClick={() => setShowMistakes(true)} 
                    className="flex items-center gap-2 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 transition-colors border border-paper-300 dark:border-cyber-600 rounded-md bg-white dark:bg-cyber-800" 
                    title="View Mistake Collection"
                >
                    <BookmarkX size={18} />
                    <span className="hidden sm:inline text-sm">Mistakes</span>
                </button>
                 <button onClick={handleDownload} className="p-2 text-slate-400 hover:text-cyan-500 transition-colors" title="Download Quiz JSON">
                    <Download size={20} />
                </button>
                <button onClick={onClose} className="px-3 py-1.5 rounded-md bg-paper-200 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-paper-300 dark:hover:bg-cyber-600 transition-colors text-sm font-medium">
                    {t.exitQuiz}
                </button>
            </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-paper-200 dark:bg-cyber-800">
            <div 
                className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-300"
                style={{ width: `${((activeQuestionIdx + 1) / currentQuiz.questions.length) * 100}%` }}
            ></div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-12 flex justify-center">
            <div className="w-full max-w-3xl space-y-8">
                {/* Question Card */}
                <div className="space-y-4 animate-fadeIn">
                    {/* Question Type Badge */}
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            activeQuestion.type === 'single' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                            activeQuestion.type === 'multiple' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                            activeQuestion.type === 'fill_blank' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                            'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        }`}>
                            {activeQuestion.type === 'single' ? (language === 'zh' ? '单选题' : 'Single Choice') :
                             activeQuestion.type === 'multiple' ? (language === 'zh' ? '多选题' : 'Multiple Choice') :
                             activeQuestion.type === 'fill_blank' ? (language === 'zh' ? '填空题' : 'Fill-in-blank') :
                             (language === 'zh' ? '问答题' : 'Essay')}
                        </span>
                    </div>

                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
                        {activeQuestion.question}
                    </h3>

                    {/* Options / Input */}
                    <div className="space-y-3 pt-4">
                        {/* Multiple choice hint */}
                        {activeQuestion.type === 'multiple' && (
                            <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 mb-2">
                                <CheckSquare size={16} />
                                <span>{language === 'zh' ? '本题为多选题，请选择所有正确答案' : 'Select all correct answers'}</span>
                            </div>
                        )}

                        {/* Choice questions: show option buttons */}
                        {activeQuestion.options && activeQuestion.options.length > 0 && activeQuestion.options.map((opt, idx) => {
                             const isSelected = isOptionSelected(idx);
                             const isCorrectOpt = isOptionCorrect(idx);
                             const isMultiple = activeQuestion.type === 'multiple';

                             let optionClass = "border-paper-200 dark:border-cyber-700 hover:border-cyan-400 dark:hover:border-cyan-500 bg-white dark:bg-cyber-800";

                             if (isSelected) {
                                 optionClass = "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-200 ring-1 ring-cyan-500";
                             }
                             if (isAnswered) {
                                 if (isCorrectOpt) optionClass = "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 ring-1 ring-green-500";
                                 else if (isSelected && !activeQuestion.isCorrect) optionClass = "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200";
                                 else optionClass += " opacity-60";
                             }

                             return (
                                <button
                                    key={idx}
                                    onClick={() => handleOptionSelect(idx)}
                                    disabled={isAnswered}
                                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 group ${optionClass}`}
                                >
                                    {/* Visual indicator: checkbox for multiple, circle for single */}
                                    <div className={`flex-shrink-0 w-6 h-6 rounded-${isMultiple ? 'md' : 'full'} border-2 flex items-center justify-center transition-colors ${
                                        isSelected
                                            ? 'border-cyan-500 bg-cyan-500 text-white'
                                            : 'border-slate-300 dark:border-slate-600'
                                    }`}>
                                        {isMultiple ? (
                                            isSelected && <CheckCircle2 size={14} />
                                        ) : (
                                            isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />
                                        )}
                                    </div>
                                    <span className="font-medium text-lg flex-1">{opt}</span>
                                    {isAnswered && isCorrectOpt && <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />}
                                </button>
                             );
                        })}

                        {/* Fill-in-blank questions: short text input */}
                        {activeQuestion.type === 'fill_blank' && (!activeQuestion.options || activeQuestion.options.length === 0) && (
                            <div className="space-y-4">
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        <span className="font-medium">{language === 'zh' ? '请填写简短答案（1-5个词）' : 'Enter a short answer (1-5 words)'}</span>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={activeQuestion.userAnswer as string || ''}
                                    onChange={(e) => handleTextAnswer(e.target.value)}
                                    disabled={isAnswered}
                                    placeholder={language === 'zh' ? '输入答案...' : 'Type answer...'}
                                    className="w-full p-4 rounded-xl bg-white dark:bg-cyber-800 border-2 border-paper-200 dark:border-cyber-700 focus:border-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-lg"
                                />
                                {isAnswered && activeQuestion.correctAnswer && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                                        <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                                            {language === 'zh' ? '正确答案' : 'Correct Answer'}
                                        </div>
                                        <p className="text-slate-700 dark:text-slate-300 font-medium">
                                            {String(activeQuestion.correctAnswer)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Text/Essay questions: textarea input */}
                        {activeQuestion.type === 'text' && (!activeQuestion.options || activeQuestion.options.length === 0) && (
                            <div className="space-y-4">
                                <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
                                        <BookOpen size={16} />
                                        <span className="font-medium">{language === 'zh' ? '请详细回答以下问题（AI评分）' : 'Please answer in detail (AI graded)'}</span>
                                    </div>
                                </div>
                                <textarea
                                    value={activeQuestion.userAnswer as string || ''}
                                    onChange={(e) => handleTextAnswer(e.target.value)}
                                    disabled={isAnswered}
                                    placeholder={language === 'zh' ? '在此输入你的答案...' : 'Type your answer here...'}
                                    className="w-full h-40 p-4 rounded-xl bg-white dark:bg-cyber-800 border-2 border-paper-200 dark:border-cyber-700 focus:border-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-lg resize-none"
                                />
                                {isAnswered && activeQuestion.correctAnswer && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                                        <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                                            {language === 'zh' ? '参考要点' : 'Reference Points'}
                                        </div>
                                        <p className="text-slate-700 dark:text-slate-300">
                                            {String(activeQuestion.correctAnswer)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Fallback: no type specified but no options - show text input */}
                        {!activeQuestion.type && (!activeQuestion.options || activeQuestion.options.length === 0) && (
                            <div className="space-y-4">
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        <span className="font-medium">{language === 'zh' ? '请在下方输入你的答案' : 'Enter your answer below'}</span>
                                    </div>
                                </div>
                                <textarea
                                    value={activeQuestion.userAnswer as string || ''}
                                    onChange={(e) => handleTextAnswer(e.target.value)}
                                    disabled={isAnswered}
                                    placeholder={language === 'zh' ? '在此输入你的答案...' : 'Type your answer here...'}
                                    className="w-full h-32 p-4 rounded-xl bg-white dark:bg-cyber-800 border-2 border-paper-200 dark:border-cyber-700 focus:border-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-lg resize-none"
                                />
                                {isAnswered && activeQuestion.correctAnswer && (
                                    <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                                        <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                                            {language === 'zh' ? '参考答案' : 'Reference Answer'}
                                        </div>
                                        <p className="text-slate-700 dark:text-slate-300">
                                            {Array.isArray(activeQuestion.correctAnswer)
                                                ? activeQuestion.correctAnswer.join(', ')
                                                : String(activeQuestion.correctAnswer)}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Feedback Area */}
                {isAnswered && (
                    <div className={`p-4 rounded-xl border ${activeQuestion.isCorrect ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900'} animate-fadeIn`}>
                        <div className="flex items-start gap-3">
                            {activeQuestion.isCorrect ? <CheckCircle2 className="text-green-500 mt-1" /> : <XCircle className="text-red-500 mt-1" />}
                            <div className="flex-1">
                                <h4 className={`font-bold ${activeQuestion.isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                    {activeQuestion.isCorrect ? t.correct : t.incorrect}
                                </h4>
                                
                                {activeQuestion.explanation ? (
                                    <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm leading-relaxed">
                                        <span className="font-bold opacity-70">Explanation: </span>
                                        {activeQuestion.explanation}
                                    </p>
                                ) : (
                                    <div className="mt-3">
                                        <button 
                                            onClick={handleExplain}
                                            disabled={isExplaining}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-cyber-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-violet-600 dark:text-violet-400 hover:border-violet-400 hover:shadow-sm transition-all"
                                        >
                                            {isExplaining ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                            {isExplaining ? "AI is thinking..." : "Ask AI for Explanation"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Footer / Controls */}
        <div className="h-20 border-t border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 flex items-center justify-between px-6 md:px-12">
             <button
                onClick={() => setActiveQuestionIdx(Math.max(0, activeQuestionIdx - 1))}
                disabled={activeQuestionIdx === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
             >
                <ArrowLeft size={18} /> {t.previous}
             </button>

             <div className="flex gap-3">
                {!isAnswered ? (
                    <button
                        onClick={checkAnswer}
                        disabled={
                          activeQuestion.userAnswer === undefined ||
                          activeQuestion.userAnswer === null ||
                          (typeof activeQuestion.userAnswer === 'string' && activeQuestion.userAnswer.trim() === '') ||
                          (Array.isArray(activeQuestion.userAnswer) && activeQuestion.userAnswer.length === 0) ||
                          isGrading
                        }
                        className="flex items-center gap-2 px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-bold shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        {isGrading ? t.grading : t.checkAnswer}
                    </button>
                ) : (
                   activeQuestionIdx < currentQuiz.questions.length - 1 ? (
                        <button
                            onClick={() => setActiveQuestionIdx(activeQuestionIdx + 1)}
                            className="flex items-center gap-2 px-6 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-bold shadow-lg shadow-violet-500/25 transition-all"
                        >
                            {t.next} <ArrowRight size={18} />
                        </button>
                   ) : (
                       <button
                           onClick={onClose}
                           className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold shadow-lg shadow-green-500/25 transition-all"
                       >
                           {t.finish} <CheckCircle2 size={18} />
                       </button>
                   )
                )}
             </div>
        </div>
    </div>
  );
};
