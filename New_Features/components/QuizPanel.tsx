








import React, { useState, useEffect, useRef } from 'react';
import { Quiz, AIConfig, Theme, MistakeRecord } from '../types';
import { CheckCircle2, XCircle, HelpCircle, Download, BookOpen, AlertTriangle, ArrowRight, ArrowLeft, RotateCcw, BookmarkX, Trash2, Sparkles, Loader2, Clock, Check, Award, BarChart2, Star, ThumbsUp, Lightbulb, Timer, Save, Database } from 'lucide-react';
import { gradeQuizQuestion, generateQuizExplanation, gradeSubjectiveAnswer } from '../services/aiService';
import { saveExamResult } from '../services/analyticsService';
import { createStudyPlanForMistake } from '../services/srsService';
import { translations, Language } from '../utils/translations';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface QuizPanelProps {
  quiz: Quiz;
  aiConfig: AIConfig;
  theme: Theme;
  onClose: () => void;
  contextContent: string;
  language?: Language;
  onSave?: () => void;
  onAddToBank?: () => void;
}

export const QuizPanel: React.FC<QuizPanelProps> = ({ quiz, aiConfig, theme, onClose, contextContent, language = 'en', onSave, onAddToBank }) => {
  const [currentQuiz, setCurrentQuiz] = useState<Quiz>(quiz);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [gradingIds, setGradingIds] = useState<string[]>([]);
  const [explainingIds, setExplainingIds] = useState<string[]>([]);
  
  // Exam Mode State
  const [timeLeft, setTimeLeft] = useState(quiz.config?.duration ? quiz.config.duration * 60 : 0);
  const [startTime] = useState(Date.now());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Mistake Collection State
  const [showMistakes, setShowMistakes] = useState(false);
  const [savedMistakes, setSavedMistakes] = useState<MistakeRecord[]>([]);

  const t = translations[language];
  const mode = currentQuiz.config?.mode || 'practice';

  // Load mistakes on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('neon-quiz-mistakes');
      if (stored) setSavedMistakes(JSON.parse(stored));
    } catch (e) { console.error("Failed to load mistakes", e); }
  }, []);

  // Timer Logic
  useEffect(() => {
      if (mode === 'exam' && !isSubmitted && timeLeft > 0) {
          timerRef.current = setInterval(() => {
              setTimeLeft(prev => {
                  if (prev <= 1) {
                      clearInterval(timerRef.current!);
                      handleSubmitExam();
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      }
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [mode, isSubmitted]);

  const saveMistake = (record: MistakeRecord) => {
    const updated = [record, ...savedMistakes];
    setSavedMistakes(updated);
    localStorage.setItem('neon-quiz-mistakes', JSON.stringify(updated));
    
    // Automatically schedule SRS review for this mistake
    createStudyPlanForMistake(record);
  };

  const deleteMistake = (id: string) => {
    const updated = savedMistakes.filter(m => m.id !== id);
    setSavedMistakes(updated);
    localStorage.setItem('neon-quiz-mistakes', JSON.stringify(updated));
  };

  // Safe access to active question
  const activeQuestion = currentQuiz.questions?.[activeQuestionIdx];

  const handleOptionSelect = (option: string) => {
    if (activeQuestion.isCorrect !== undefined && mode === 'practice') return; 
    if (isSubmitted) return;

    const updatedQuestions = [...currentQuiz.questions];
    updatedQuestions[activeQuestionIdx] = {
      ...activeQuestion,
      userAnswer: option
    };
    setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
  };

  const handleTextAnswer = (text: string) => {
    if (activeQuestion.isCorrect !== undefined && mode === 'practice') return;
    if (isSubmitted) return;

    const updatedQuestions = [...currentQuiz.questions];
    updatedQuestions[activeQuestionIdx] = {
      ...activeQuestion,
      userAnswer: text
    };
    setCurrentQuiz({ ...currentQuiz, questions: updatedQuestions });
  };

  // Helper: Smart comparison for multiple choice & fill-in-the-blank
  const isAnswerCorrect = (userAns: string | string[], correctAns: string | string[], options?: string[]): boolean => {
      // 1. Array comparison (Select All)
      if (Array.isArray(correctAns)) {
          if (!Array.isArray(userAns)) return false;
          const correctSet = new Set(correctAns.map(s => s.trim().toLowerCase()));
          const userSet = new Set(userAns.map(s => s.trim().toLowerCase()));
          return correctSet.size === userSet.size && [...correctSet].every(x => userSet.has(x));
      }

      // 2. Single value comparison (Case Insensitive normalization)
      const uStr = (Array.isArray(userAns) ? userAns[0] : userAns || '').trim().toLowerCase();
      const cStr = (correctAns || '').trim().toLowerCase();
      
      if (uStr === cStr) return true;

      // 3. Letter Matching (e.g. Correct="B", User selected "4" which is the 2nd option)
      if (options && options.length > 0) {
          const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
          
          // Case A: Correct is Letter (B), User is Value (4)
          // Find index of user selection in options
          const userIdx = options.findIndex(opt => opt.trim().toLowerCase() === uStr);
          if (userIdx !== -1) {
              if (letters[userIdx] === cStr.toUpperCase()) return true;
              
              const optWithLetter = options[userIdx];
              if (optWithLetter.startsWith(cStr + ".") || optWithLetter.startsWith(cStr + " ")) return true;
          }

          // Case B: Correct is Value (4), User is Letter (B)
          const correctIdx = options.findIndex(opt => opt.trim().toLowerCase() === cStr);
          if (correctIdx !== -1 && letters[correctIdx] === uStr.toUpperCase()) return true;
      }

      // 4. Loose Substring Match (for Fill-in-the-blank tolerance)
      if (uStr && cStr && (uStr.includes(cStr) || cStr.includes(uStr)) && uStr.length > 3) return true;

      return false;
  };

  const checkAnswer = async () => {
    // Only in Practice Mode
    const q = activeQuestion;
    if (!q.userAnswer) return;

    // --- Objective Grading (Instant) ---
    // Includes: Single Choice, Multiple Choice, and Fill-in-the-Blank
    if (['single', 'multiple', 'fill_blank'].includes(q.type)) {
      const isCorrect = isAnswerCorrect(q.userAnswer, q.correctAnswer || '', q.options);
      
      const updatedQuestions = [...currentQuiz.questions];
      updatedQuestions[activeQuestionIdx] = { ...q, isCorrect };
      setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));
      
      if (!isCorrect) {
          saveMistake({
              id: `${currentQuiz.id}-${q.id}-${Date.now()}`,
              question: q.question,
              userAnswer: Array.isArray(q.userAnswer) ? q.userAnswer.join(', ') : q.userAnswer as string,
              correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || "Unknown"),
              explanation: q.explanation,
              timestamp: Date.now(),
              quizTitle: currentQuiz.title
          });
      }
    } 
    // --- Subjective Grading (AI-Assisted) ---
    // Includes: Text/Essay
    else {
      setGradingIds(prev => [...prev, q.id]);
      try {
        const result = await gradeSubjectiveAnswer(
            q.question, 
            q.userAnswer as string, 
            Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || ''),
            contextContent, 
            aiConfig
        );
        
        const isPass = result.score >= 60; // 60% Passing threshold for subjective
        
        const updatedQuestions = [...currentQuiz.questions];
        updatedQuestions[activeQuestionIdx] = { 
          ...q, 
          isCorrect: isPass, 
          explanation: result.feedback, // Fallback explanation
          gradingResult: result // Detailed Result
        };
        setCurrentQuiz(prev => ({ ...prev, questions: updatedQuestions }));
        
        if (!isPass) {
           saveMistake({
              id: `${currentQuiz.id}-${q.id}-${Date.now()}`,
              question: q.question,
              userAnswer: q.userAnswer as string,
              correctAnswer: "(See AI Feedback)",
              explanation: result.feedback,
              timestamp: Date.now(),
              quizTitle: currentQuiz.title
          });
        }
      } catch (err) {
        console.error("Grading failed", err);
      } finally {
        setGradingIds(prev => prev.filter(id => id !== q.id));
      }
    }
  };

  const handleSubmitExam = async () => {
      setIsSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);
      
      const duration = Math.round((Date.now() - startTime) / 1000);

      // Grade all questions
      const updatedQuestions = await Promise.all(currentQuiz.questions.map(async (q) => {
          // Objective
          if (['single', 'multiple', 'fill_blank'].includes(q.type)) {
              const isCorrect = q.userAnswer ? isAnswerCorrect(q.userAnswer, q.correctAnswer || '', q.options) : false;
              if (!isCorrect && q.userAnswer) {
                  saveMistake({
                      id: `${currentQuiz.id}-${q.id}-${Date.now()}`,
                      question: q.question,
                      userAnswer: Array.isArray(q.userAnswer) ? q.userAnswer.join(', ') : (q.userAnswer as string),
                      correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || "Unknown"),
                      explanation: q.explanation,
                      timestamp: Date.now(),
                      quizTitle: currentQuiz.title
                  });
              }
              return { ...q, isCorrect };
          } 
          // Subjective
          else {
              if (q.userAnswer) {
                  try {
                      const res = await gradeSubjectiveAnswer(
                          q.question, 
                          q.userAnswer as string, 
                          Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.correctAnswer || ''),
                          contextContent, 
                          aiConfig
                      );
                      const isPass = res.score >= 60;
                      if (!isPass) {
                          saveMistake({
                              id: `${currentQuiz.id}-${q.id}-${Date.now()}`,
                              question: q.question,
                              userAnswer: q.userAnswer as string,
                              correctAnswer: "(AI Graded)",
                              explanation: res.feedback,
                              timestamp: Date.now(),
                              quizTitle: currentQuiz.title
                          });
                      }
                      return { ...q, isCorrect: isPass, gradingResult: res, explanation: res.feedback };
                  } catch {
                      return { ...q, isCorrect: false };
                  }
              }
              return { ...q, isCorrect: false };
          }
      }));

      // Calculate Score
      const correctCount = updatedQuestions.filter(q => q.isCorrect).length;
      const score = Math.round((correctCount / updatedQuestions.length) * 100);

      const completedQuiz = {
          ...currentQuiz,
          questions: updatedQuestions,
          score,
          status: 'completed' as const
      };

      setCurrentQuiz(completedQuiz);
      
      // Save Result to History
      saveExamResult(completedQuiz, duration);
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
             setSavedMistakes(prev => prev.map(m => m.id === existingMistake.id ? updatedMistake : m));
             localStorage.setItem('neon-quiz-mistakes', JSON.stringify(savedMistakes.map(m => m.id === existingMistake.id ? updatedMistake : m)));
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

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
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
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t.mistakeCollection}</h2>
                </div>
                <button onClick={() => setShowMistakes(false)} className="px-3 py-1.5 rounded-md bg-paper-200 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-paper-300 dark:hover:bg-cyber-600 transition-colors text-sm font-medium">
                    {t.backToQuiz || "Back to Quiz"}
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-12">
                 <div className="max-w-4xl mx-auto space-y-6">
                    {savedMistakes.length === 0 ? (
                        <div className="text-center text-slate-400 py-20">
                            <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
                            <p>{t.noMistakes}</p>
                        </div>
                    ) : (
                        savedMistakes.map(mistake => (
                            <div key={mistake.id} className="bg-white dark:bg-cyber-800 rounded-xl border border-red-200 dark:border-red-900/50 shadow-sm p-6 relative group">
                                <button 
                                    onClick={() => deleteMistake(mistake.id)} 
                                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    title={t.removeMistake || "Remove from collection"}
                                >
                                    <Trash2 size={18} />
                                </button>
                                
                                <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                                    <span className="bg-paper-100 dark:bg-cyber-700 px-2 py-0.5 rounded text-[10px]">{new Date(mistake.timestamp).toLocaleDateString()}</span>
                                    {mistake.quizTitle && <span>{mistake.quizTitle}</span>}
                                </div>
                                
                                <div className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 prose dark:prose-invert">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{mistake.question}</ReactMarkdown>
                                </div>
                                
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                                        <span className="text-xs font-bold text-red-500 uppercase tracking-wide block mb-1">{t.yourAnswer || "Your Answer"}</span>
                                        <div className="text-slate-700 dark:text-slate-300 prose dark:prose-invert">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{mistake.userAnswer}</ReactMarkdown>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/30">
                                        <span className="text-xs font-bold text-green-500 uppercase tracking-wide block mb-1">{t.correctAnswer || "Correct Answer"}</span>
                                        <div className="text-slate-700 dark:text-slate-300 prose dark:prose-invert">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{mistake.correctAnswer}</ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                                
                                {mistake.explanation && (
                                    <div className="mt-4 pt-4 border-t border-paper-100 dark:border-cyber-700">
                                        <div className="text-sm text-slate-600 dark:text-slate-400 italic prose dark:prose-invert">
                                            <span className="font-semibold not-italic mr-1">{t.explanation}:</span>
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{mistake.explanation}</ReactMarkdown>
                                        </div>
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

  // --- Exam Report Card ---
  if (mode === 'exam' && isSubmitted) {
      const score = currentQuiz.score || 0;
      const passing = currentQuiz.config?.passingScore || 60;
      const passed = score >= passing;
      const timeSpent = Math.round((Date.now() - startTime) / 1000);

      // Aggregate correct/incorrect for display
      const correctQuestions = currentQuiz.questions.filter(q => q.isCorrect).length;
      const totalQuestions = currentQuiz.questions.length;

      return (
          <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col items-center justify-center p-6 animate-fadeIn overflow-y-auto">
              <div className="max-w-3xl w-full bg-white dark:bg-cyber-800 rounded-2xl shadow-2xl border border-paper-200 dark:border-cyber-700 p-8 text-center relative overflow-hidden">
                  {/* Background Accents */}
                  <div className={`absolute top-0 left-0 w-full h-2 ${passed ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  
                  <div className="mb-6 flex justify-center">
                      <div className={`p-4 rounded-full ${passed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                          {passed ? <Award size={48} /> : <BarChart2 size={48} />}
                      </div>
                  </div>

                  <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-2">
                      {passed ? t.congrats : t.keepPracticing}
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-8">
                      {passed ? t.passedMsg : t.failedMsg}
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      <div className="p-4 bg-paper-50 dark:bg-cyber-900/50 rounded-xl border border-paper-200 dark:border-cyber-700">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t.score}</div>
                          <div className={`text-3xl font-black ${passed ? 'text-green-500' : 'text-red-500'}`}>{score}%</div>
                      </div>
                      <div className="p-4 bg-paper-50 dark:bg-cyber-900/50 rounded-xl border border-paper-200 dark:border-cyber-700">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t.timeSpent}</div>
                          <div className="text-2xl font-black text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1">
                              <Timer size={18} className="text-slate-400" />
                              {formatTime(timeSpent)}
                          </div>
                      </div>
                      <div className="p-4 bg-paper-50 dark:bg-cyber-900/50 rounded-xl border border-paper-200 dark:border-cyber-700">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t.accuracy}</div>
                          <div className="text-2xl font-black text-slate-700 dark:text-slate-300">
                              {correctQuestions}/{totalQuestions}
                          </div>
                      </div>
                      <div className="p-4 bg-paper-50 dark:bg-cyber-900/50 rounded-xl border border-paper-200 dark:border-cyber-700">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t.passing}</div>
                          <div className="text-2xl font-black text-slate-700 dark:text-slate-300">{passing}%</div>
                      </div>
                  </div>

                  {/* Topic Breakdown Preview */}
                  <div className="text-left mb-8">
                      <h4 className="text-sm font-bold text-slate-500 mb-3 uppercase tracking-wide">{t.knowledgeBreakdown}</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                          {Array.from(new Set(currentQuiz.questions.flatMap(q => q.tags || []))).map(tag => {
                              const qs = currentQuiz.questions.filter(q => q.tags?.includes(tag));
                              const correct = qs.filter(q => q.isCorrect).length;
                              const pct = Math.round((correct / qs.length) * 100);
                              return (
                                  <div key={tag} className="flex items-center gap-3 text-sm">
                                      <span className="w-24 truncate font-medium text-slate-600 dark:text-slate-300">#{tag}</span>
                                      <div className="flex-1 h-2 bg-paper-200 dark:bg-cyber-700 rounded-full overflow-hidden">
                                          <div className={`h-full ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }}></div>
                                      </div>
                                      <span className="w-10 text-right text-slate-500">{pct}%</span>
                                  </div>
                              )
                          })}
                      </div>
                  </div>

                  <div className="flex gap-4 justify-center">
                      <button onClick={onClose} className="px-6 py-3 bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-lg hover:transform hover:scale-105 transition-all">
                          {t.returnEditor}
                      </button>
                      <button onClick={() => setShowMistakes(true)} className="px-6 py-3 bg-paper-100 dark:bg-cyber-700 text-slate-600 dark:text-slate-200 font-bold rounded-xl hover:bg-paper-200 transition-colors flex items-center gap-2">
                          <BookmarkX size={18} /> {t.reviewMistakes}
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // --- Standard Quiz/Practice View ---
  return (
    <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col overflow-hidden">
      
      {/* Quiz Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 shrink-0">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate max-w-xs" title={currentQuiz.title}>{currentQuiz.title}</h2>
            {mode === 'exam' && (
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full font-mono text-sm font-bold ${timeLeft < 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-paper-100 dark:bg-cyber-700 text-slate-600 dark:text-slate-300'}`}>
                    <Clock size={14} />
                    {formatTime(timeLeft)}
                </div>
            )}
            {mode === 'practice' && (
                <div className="hidden sm:block text-xs font-mono text-slate-400 bg-paper-100 dark:bg-cyber-700 px-2 py-1 rounded">
                    {t.practiceMode}
                </div>
            )}
        </div>
        <div className="flex items-center gap-2">
            {onAddToBank && (
                <button 
                    onClick={onAddToBank} 
                    className="p-2 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors relative group"
                    title={t.addToBank || "Add to Question Bank"}
                >
                    <Database size={20} />
                </button>
            )}
            <button 
                onClick={() => setShowMistakes(true)} 
                className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors relative"
                title={t.mistakeCollection}
            >
                <BookmarkX size={20} />
                {savedMistakes.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
            </button>
            <button onClick={handleDownload} className="p-2 text-slate-400 hover:text-cyan-500 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors" title={t.download}>
                <Download size={20} />
            </button>
            {onSave && (
                <button 
                    onClick={onSave} 
                    className="p-2 text-cyan-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors relative group"
                    title={t.saveQuiz || "Save Quiz"}
                >
                    <div className="absolute top-1 right-1"><Sparkles size={8} fill="currentColor" /></div>
                    <Save size={20} />
                </button>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-paper-100 dark:hover:bg-cyber-700 transition-colors" title={t.exitQuiz}>
                <XCircle size={20} />
            </button>
        </div>
      </div>

      {/* Main Question Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center">
        {activeQuestion && (
            <div className="max-w-3xl w-full space-y-6 animate-slideUp">
                
                {/* Progress Bar */}
                <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 font-medium mb-2">
                    <span>{t.question} {activeQuestionIdx + 1} / {currentQuiz.questions.length}</span>
                    <div className="flex-1 h-2 bg-paper-200 dark:bg-cyber-700 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${((activeQuestionIdx + 1) / currentQuiz.questions.length) * 100}%` }}></div>
                    </div>
                </div>

                {/* Question Card */}
                <div className="bg-white dark:bg-cyber-800 rounded-2xl shadow-xl border border-paper-200 dark:border-cyber-700 p-6 md:p-8 relative">
                    
                    {/* Tags & Difficulty Badges */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {activeQuestion.difficulty && (
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${activeQuestion.difficulty === 'hard' ? 'bg-red-100 text-red-600' : activeQuestion.difficulty === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                                {activeQuestion.difficulty}
                            </span>
                        )}
                        {activeQuestion.tags?.map(tag => (
                            <span key={tag} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-paper-100 dark:bg-cyber-700 text-slate-500">
                                {tag}
                            </span>
                        ))}
                    </div>

                    <div className="prose dark:prose-invert prose-lg max-w-none mb-8 text-slate-800 dark:text-slate-100">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {activeQuestion.question}
                        </ReactMarkdown>
                    </div>

                    {/* Options / Input */}
                    <div className="space-y-3">
                        {/* Single/Multiple Choice */}
                        {(activeQuestion.type === 'single' || activeQuestion.type === 'multiple') && activeQuestion.options?.map((option, idx) => {
                            const isSelected = activeQuestion.userAnswer === option || (Array.isArray(activeQuestion.userAnswer) && activeQuestion.userAnswer.includes(option));
                            // In Exam Mode, show selection only. In Practice, show correctness if graded.
                            const showResult = mode === 'practice' && activeQuestion.isCorrect !== undefined;
                            
                            // Determine style based on state
                            let optionClass = "border-paper-200 dark:border-cyber-600 hover:border-cyan-400 hover:bg-paper-50 dark:hover:bg-cyber-700";
                            if (isSelected) optionClass = "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 ring-1 ring-cyan-500";
                            
                            if (showResult) {
                                if (option === activeQuestion.correctAnswer) optionClass = "border-green-500 bg-green-50 dark:bg-green-900/20 ring-1 ring-green-500";
                                else if (isSelected && !activeQuestion.isCorrect) optionClass = "border-red-500 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-500";
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleOptionSelect(option)}
                                    className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3 group ${optionClass}`}
                                >
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-slate-300 dark:border-slate-600 group-hover:border-cyan-400'}`}>
                                        {isSelected && <Check size={14} strokeWidth={3} />}
                                    </div>
                                    <span className="flex-1 text-slate-700 dark:text-slate-300 font-medium">
                                        <ReactMarkdown components={{ p: ({children}) => <span className="m-0 p-0">{children}</span> }} remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{option}</ReactMarkdown>
                                    </span>
                                </button>
                            );
                        })}

                        {/* Fill Blank / Short Text */}
                        {['text', 'fill_blank'].includes(activeQuestion.type) && (
                            <div>
                                <textarea 
                                    className="w-full h-32 p-4 bg-paper-50 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 resize-none"
                                    placeholder="Type your answer here..."
                                    value={activeQuestion.userAnswer as string || ''}
                                    onChange={(e) => handleTextAnswer(e.target.value)}
                                    disabled={mode === 'practice' && activeQuestion.isCorrect !== undefined}
                                />
                            </div>
                        )}
                    </div>

                    {/* Explanation / Grading Feedback (Practice Mode Only) */}
                    {mode === 'practice' && activeQuestion.isCorrect !== undefined && (
                        <div className={`mt-6 p-4 rounded-xl border ${activeQuestion.isCorrect ? 'bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-900/30' : 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30'} animate-fadeIn`}>
                            <div className="flex items-center gap-2 mb-2 font-bold">
                                {activeQuestion.isCorrect ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}
                                <span className={activeQuestion.isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                                    {activeQuestion.isCorrect ? t.correct : t.incorrect}
                                </span>
                            </div>
                            
                            {/* Subjective Feedback Report */}
                            {activeQuestion.gradingResult ? (
                                <div className="space-y-3 mt-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-bold text-slate-600 dark:text-slate-400">{t.score}: {activeQuestion.gradingResult.score}/100</span>
                                        <div className="w-32 h-2 bg-paper-200 dark:bg-cyber-900 rounded-full overflow-hidden">
                                            <div className="h-full bg-cyan-500" style={{ width: `${activeQuestion.gradingResult.score}%` }}></div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300">{activeQuestion.gradingResult.feedback}</p>
                                    
                                    {activeQuestion.gradingResult.keyPointsMatched.length > 0 && (
                                        <div className="text-xs">
                                            <span className="font-bold text-green-600 block mb-1">Key Points Covered:</span>
                                            <ul className="list-disc pl-4 text-slate-600 dark:text-slate-400 space-y-0.5">
                                                {activeQuestion.gradingResult.keyPointsMatched.map((pt, i) => <li key={i}>{pt}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {activeQuestion.gradingResult.keyPointsMissed.length > 0 && (
                                        <div className="text-xs">
                                            <span className="font-bold text-red-500 block mb-1">Missed Concepts:</span>
                                            <ul className="list-disc pl-4 text-slate-600 dark:text-slate-400 space-y-0.5">
                                                {activeQuestion.gradingResult.keyPointsMissed.map((pt, i) => <li key={i}>{pt}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-700 dark:text-slate-300">
                                    {activeQuestion.explanation || "No explanation provided."}
                                </p>
                            )}

                            {/* AI Explain Button */}
                            {!activeQuestion.gradingResult && (
                                <button 
                                    onClick={handleExplain} 
                                    disabled={explainingIds.includes(activeQuestion.id)}
                                    className="mt-3 text-xs font-bold text-violet-600 hover:text-violet-700 flex items-center gap-1"
                                >
                                    {explainingIds.includes(activeQuestion.id) ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                                    {activeQuestion.explanation ? t.regenerateExplanation : t.askAIExplain}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Navigation Footer */}
                <div className="flex justify-between items-center pt-4 pb-8">
                    <button 
                        onClick={() => setActiveQuestionIdx(Math.max(0, activeQuestionIdx - 1))}
                        disabled={activeQuestionIdx === 0}
                        className="px-4 py-2 rounded-lg bg-white dark:bg-cyber-800 text-slate-600 dark:text-slate-300 border border-paper-200 dark:border-cyber-700 hover:bg-paper-50 dark:hover:bg-cyber-700 disabled:opacity-50 flex items-center gap-2 font-medium shadow-sm transition-all"
                    >
                        <ArrowLeft size={16} /> {t.previous}
                    </button>

                    <div className="flex gap-3">
                        {mode === 'practice' && !activeQuestion.isCorrect && activeQuestion.isCorrect !== false && (
                            <button
                                onClick={checkAnswer}
                                disabled={!activeQuestion.userAnswer || gradingIds.includes(activeQuestion.id)}
                                className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {gradingIds.includes(activeQuestion.id) ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                {gradingIds.includes(activeQuestion.id) ? t.grading : t.checkAnswer}
                            </button>
                        )}
                        
                        {activeQuestionIdx < currentQuiz.questions.length - 1 ? (
                            <button 
                                onClick={() => setActiveQuestionIdx(activeQuestionIdx + 1)}
                                className="px-4 py-2 rounded-lg bg-slate-800 dark:bg-white text-white dark:text-slate-900 font-bold hover:opacity-90 shadow-lg transition-all flex items-center gap-2"
                            >
                                {t.next} <ArrowRight size={16} />
                            </button>
                        ) : (
                            <button 
                                onClick={handleSubmitExam}
                                className="px-6 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold hover:scale-105 shadow-xl shadow-green-500/30 transition-all flex items-center gap-2"
                            >
                                {t.finish} <Award size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};