
import React, { useState, useEffect } from 'react';
import { Quiz, AIConfig, Theme, MistakeRecord } from '../types';
import { CheckCircle2, XCircle, HelpCircle, Download, BookOpen, AlertTriangle, ArrowRight, ArrowLeft, RotateCcw, BookmarkX, Trash2, Sparkles, Loader2 } from 'lucide-react';
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
      if (stored) setSavedMistakes(JSON.parse(stored));
    } catch (e) { console.error("Failed to load mistakes", e); }
  }, []);

  const saveMistake = (record: MistakeRecord) => {
    const updated = [record, ...savedMistakes];
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

  const handleOptionSelect = (option: string) => {
    if (activeQuestion.isCorrect !== undefined) return; 
    const updatedQuestions = [...currentQuiz.questions];
    updatedQuestions[activeQuestionIdx] = {
      ...activeQuestion,
      userAnswer: option
    };
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

  // Helper: Smart comparison for multiple choice
  const isAnswerCorrect = (userAns: string | string[], correctAns: string | string[], options?: string[]): boolean => {
      // 1. Array comparison (Select All)
      if (Array.isArray(correctAns)) {
          if (!Array.isArray(userAns)) return false;
          const correctSet = new Set(correctAns.map(s => s.trim()));
          const userSet = new Set(userAns.map(s => s.trim()));
          return correctSet.size === userSet.size && [...correctSet].every(x => userSet.has(x));
      }

      // 2. Single value comparison
      const uStr = (Array.isArray(userAns) ? userAns[0] : userAns || '').trim();
      const cStr = (correctAns || '').trim();
      
      if (uStr === cStr) return true;

      // 3. Letter Matching (e.g. Correct="B", User selected "4" which is the 2nd option)
      if (options && options.length > 0) {
          const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
          
          // Case A: Correct is Letter (B), User is Value (4)
          // Find index of user selection in options
          const userIdx = options.indexOf(uStr); // e.g. "4" is at index 1
          if (userIdx !== -1) {
              // Check if the letter for this index matches the correct answer
              if (letters[userIdx] === cStr.toUpperCase()) return true;
              
              // Also check if option starts with Letter (e.g. "B. 4")
              const optWithLetter = options[userIdx];
              if (optWithLetter.startsWith(cStr + ".") || optWithLetter.startsWith(cStr + " ")) return true;
          }

          // Case B: Correct is Value (4), User is Letter (B) - unlikely in this UI but safe to add
          const correctIdx = options.indexOf(cStr);
          if (correctIdx !== -1 && letters[correctIdx] === uStr.toUpperCase()) return true;
      }

      // 4. Loose Substring Match (e.g. "A. Paris" vs "Paris")
      if (uStr && cStr && (uStr.includes(cStr) || cStr.includes(uStr)) && uStr.length > 2) return true;

      return false;
  };

  const checkAnswer = async () => {
    const q = activeQuestion;
    if (!q.userAnswer) return;

    // Logic for Multiple Choice (Deterministic)
    if (q.type !== 'text') {
      const isCorrect = isAnswerCorrect(q.userAnswer, q.correctAnswer || '', q.options);
      
      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = { ...q, isCorrect };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));
      
      // Auto-save mistake if incorrect (without explanation initially)
      if (!isCorrect) {
          const mistake: MistakeRecord = {
              id: `${currentQuiz.id}-${q.id}-${Date.now()}`,
              question: q.question,
              userAnswer: Array.isArray(q.userAnswer) ? q.userAnswer.join(', ') : q.userAnswer as string,
              correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || "Unknown"),
              explanation: q.explanation, // might be undefined
              timestamp: Date.now(),
              quizTitle: currentQuiz.title
          };
          saveMistake(mistake);
      }
    } 
    // Logic for Text Answers (AI Grading required immediately to determine correctness)
    else {
      setGradingIds(prev => [...prev, q.id]);
      try {
        const result = await gradeQuizQuestion(q.question, q.userAnswer as string, contextContent, aiConfig);
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
      } catch (err) {
        console.error("Grading failed", err);
      } finally {
        setGradingIds(prev => prev.filter(id => id !== q.id));
      }
    }
  };

  const handleExplain = async () => {
      const q = activeQuestion;
      if (!q || explainingIds.includes(q.id)) return;

      setExplainingIds(prev => [...prev, q.id]);
      try {
         const explanation = await generateQuizExplanation(
             q.question, 
             Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || "the correct option"), 
             Array.isArray(q.userAnswer) ? q.userAnswer.join(', ') : (q.userAnswer as string),
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
                    <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
                        {activeQuestion.question}
                    </h3>
                    
                    {/* Options / Input */}
                    <div className="space-y-3 pt-4">
                        {(activeQuestion.type === 'single' || activeQuestion.type === 'multiple') && activeQuestion.options?.map((opt, idx) => {
                             const isSelected = activeQuestion.userAnswer === opt;
                             const isCorrectAnswer = isAnswerCorrect(opt, activeQuestion.correctAnswer || '', activeQuestion.options);
                             
                             let optionClass = "border-paper-200 dark:border-cyber-700 hover:border-cyan-400 dark:hover:border-cyan-500 bg-white dark:bg-cyber-800";
                             
                             if (isSelected) {
                                 optionClass = "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-200 ring-1 ring-cyan-500";
                             }
                             if (isAnswered) {
                                 if (isCorrectAnswer) optionClass = "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 ring-1 ring-green-500";
                                 else if (isSelected && !activeQuestion.isCorrect) optionClass = "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200";
                                 else optionClass += " opacity-60";
                             }

                             return (
                                <button
                                    key={idx}
                                    onClick={() => handleOptionSelect(opt)}
                                    disabled={isAnswered}
                                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between group ${optionClass}`}
                                >
                                    <span className="font-medium text-lg">{opt}</span>
                                    {isSelected && <CheckCircle2 size={20} className="text-cyan-500" />}
                                </button>
                             );
                        })}

                        {activeQuestion.type === 'text' && (
                            <textarea
                                value={activeQuestion.userAnswer as string || ''}
                                onChange={(e) => handleTextAnswer(e.target.value)}
                                disabled={isAnswered}
                                placeholder="Type your answer here..."
                                className="w-full h-40 p-4 rounded-xl bg-white dark:bg-cyber-800 border-2 border-paper-200 dark:border-cyber-700 focus:border-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-lg resize-none"
                            />
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
                        disabled={!activeQuestion.userAnswer || isGrading}
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
