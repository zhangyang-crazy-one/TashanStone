
import React, { useState } from 'react';
import { Quiz, AIConfig, Theme } from '../types';
import { CheckCircle2, XCircle, HelpCircle, Download, BookOpen, AlertTriangle, ArrowRight, ArrowLeft, RotateCcw } from 'lucide-react';
import { gradeQuizQuestion } from '../services/aiService';
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
  const t = translations[language];

  // Safe access to active question
  const activeQuestion = currentQuiz.questions?.[activeQuestionIdx];

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

  const checkAnswer = async () => {
    const q = activeQuestion;
    if (!q.userAnswer) return;

    if (q.type !== 'text') {
      let isCorrect = false;
      if (Array.isArray(q.correctAnswer)) {
          const correctSet = new Set(q.correctAnswer);
          const userVal = Array.isArray(q.userAnswer) ? q.userAnswer : [q.userAnswer];
          const userSet = new Set(userVal);
          isCorrect = correctSet.size === userSet.size && [...correctSet].every(x => userSet.has(x));
      } else {
          isCorrect = q.correctAnswer === q.userAnswer;
      }
      
      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = { ...q, isCorrect };
      setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
    } else {
      setGradingIds(prev => [...prev, q.id]);
      try {
        const grading = await gradeQuizQuestion(q.question, q.userAnswer as string, contextContent, aiConfig);
        const updatedQuestions = [...currentQuiz.questions];
        const isCorrect = grading.toLowerCase().includes("correct") && !grading.toLowerCase().includes("incorrect");
        updatedQuestions[activeQuestionIdx] = { 
          ...q, 
          isCorrect, 
          explanation: grading 
        };
        setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
      } finally {
        setGradingIds(prev => prev.filter(id => id !== q.id));
      }
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

  const isGrading = gradingIds.includes(activeQuestion.id);
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
                             const isCorrectAnswer = activeQuestion.correctAnswer === opt;
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
                            <div>
                                <h4 className={`font-bold ${activeQuestion.isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                    {activeQuestion.isCorrect ? t.correct : t.incorrect}
                                </h4>
                                <p className="text-slate-600 dark:text-slate-300 mt-1">
                                    {activeQuestion.explanation || "No explanation provided."}
                                </p>
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
