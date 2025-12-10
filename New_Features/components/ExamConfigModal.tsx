
import React, { useState } from 'react';
import { X, Sparkles, Clock, Target, Play, BrainCircuit, Settings } from 'lucide-react';
import { ExamConfig, ExamMode, MarkdownFile, AIConfig, Quiz } from '../types';
import { generateStructuredExam } from '../services/aiService';

interface ExamConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (quiz: Quiz, config: ExamConfig) => void;
  selectedFile: MarkdownFile;
  aiConfig: AIConfig;
  preSelectedQuestions?: any[]; // If coming from manual selection
}

export const ExamConfigModal: React.FC<ExamConfigModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  selectedFile,
  aiConfig,
  preSelectedQuestions
}) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'config'>(preSelectedQuestions ? 'config' : 'quick');
  
  // AI Gen State
  const [topics, setTopics] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [difficultyDist, setDifficultyDist] = useState('30% Easy, 50% Medium, 20% Hard');
  const [isGenerating, setIsGenerating] = useState(false);

  // Config State
  const [mode, setMode] = useState<ExamMode>('practice');
  const [duration, setDuration] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [showAnswers, setShowAnswers] = useState<'immediate' | 'after_submit'>('immediate');

  const handleGenerateAndStart = async () => {
      setIsGenerating(true);
      try {
          const quiz = await generateStructuredExam(topics, questionCount, difficultyDist, [selectedFile], aiConfig);
          onComplete(quiz, {
              mode,
              duration: mode === 'exam' ? duration : 0,
              passingScore,
              showAnswers: mode === 'exam' ? 'after_submit' : showAnswers
          });
          // Note: onClose is handled by parent after receiving data
      } catch (e) {
          console.error(e);
          alert("Failed to generate exam.");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleStartManual = () => {
      if (!preSelectedQuestions) return;
      const quiz: Quiz = {
          id: `manual-exam-${Date.now()}`,
          title: "Custom Exam",
          description: "Manually selected questions",
          questions: preSelectedQuestions,
          isGraded: false
      };
      onComplete(quiz, {
          mode,
          duration: mode === 'exam' ? duration : 0,
          passingScore,
          showAnswers: mode === 'exam' ? 'after_submit' : showAnswers
      });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden flex flex-col animate-scaleIn">
        
        <div className="p-4 border-b border-paper-200 dark:border-cyber-700 flex justify-between items-center bg-paper-50 dark:bg-cyber-800">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {preSelectedQuestions ? <Settings size={20}/> : <BrainCircuit size={20} />}
                {preSelectedQuestions ? "Configure Exam" : "Intelligent Test Generation"}
            </h3>
            <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
        </div>

        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
            {/* Tab Switcher if not manual */}
            {!preSelectedQuestions && (
                <div className="flex bg-paper-100 dark:bg-cyber-800 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('quick')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'quick' ? 'bg-white dark:bg-cyber-700 shadow-sm text-cyan-600' : 'text-slate-500'}`}
                    >
                        AI Generation
                    </button>
                    <button 
                        onClick={() => setActiveTab('config')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === 'config' ? 'bg-white dark:bg-cyber-700 shadow-sm text-cyan-600' : 'text-slate-500'}`}
                    >
                        Exam Settings
                    </button>
                </div>
            )}

            {activeTab === 'quick' && !preSelectedQuestions && (
                <div className="space-y-4 animate-fadeIn">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Knowledge Points / Topics</label>
                        <textarea 
                            value={topics}
                            onChange={e => setTopics(e.target.value)}
                            placeholder="e.g. React Hooks, State Management, Performance Optimization..."
                            className="w-full h-20 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Question Count</label>
                            <input 
                                type="number" 
                                value={questionCount}
                                onChange={e => setQuestionCount(parseInt(e.target.value))}
                                className="w-full p-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm"
                                min={1} max={50}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Difficulty Mix</label>
                            <select 
                                value={difficultyDist}
                                onChange={e => setDifficultyDist(e.target.value)}
                                className="w-full p-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm"
                            >
                                <option value="30% Easy, 50% Medium, 20% Hard">Balanced</option>
                                <option value="100% Easy">Beginner</option>
                                <option value="100% Hard">Expert Challenge</option>
                                <option value="50% Medium, 50% Hard">Advanced</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {(activeTab === 'config' || preSelectedQuestions) && (
                <div className="space-y-5 animate-fadeIn">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-500 uppercase">Exam Mode</label>
                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => { setMode('practice'); setShowAnswers('immediate'); }}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${mode === 'practice' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-paper-200 dark:border-cyber-700 opacity-60'}`}
                            >
                                <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">Practice Mode</div>
                                <div className="text-xs text-slate-500">Immediate feedback, no time limit. Self-paced learning.</div>
                            </button>
                            <button 
                                onClick={() => { setMode('exam'); setShowAnswers('after_submit'); }}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${mode === 'exam' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-paper-200 dark:border-cyber-700 opacity-60'}`}
                            >
                                <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">Exam Mode</div>
                                <div className="text-xs text-slate-500">Timed, hidden answers, final score report. Real simulation.</div>
                            </button>
                        </div>
                    </div>

                    {mode === 'exam' && (
                        <div className="space-y-4 pt-4 border-t border-paper-200 dark:border-cyber-700">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <Clock size={16} /> Duration (Minutes)
                                </label>
                                <input 
                                    type="number" 
                                    value={duration} 
                                    onChange={e => setDuration(parseInt(e.target.value))}
                                    className="w-20 p-1 text-center bg-paper-100 dark:bg-cyber-800 rounded border border-paper-200 dark:border-cyber-600"
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <Target size={16} /> Passing Score (%)
                                </label>
                                <input 
                                    type="number" 
                                    value={passingScore} 
                                    onChange={e => setPassingScore(parseInt(e.target.value))}
                                    className="w-20 p-1 text-center bg-paper-100 dark:bg-cyber-800 rounded border border-paper-200 dark:border-cyber-600"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        <div className="p-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800 flex justify-end gap-3">
            {activeTab === 'quick' && !preSelectedQuestions ? (
                <>
                    <button onClick={() => setActiveTab('config')} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800">
                        Next: Settings
                    </button>
                    <button 
                        onClick={handleGenerateAndStart} 
                        disabled={isGenerating}
                        className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-bold rounded-lg shadow-lg hover:opacity-90 flex items-center gap-2 disabled:opacity-50"
                    >
                        {isGenerating ? <Sparkles className="animate-spin" size={16} /> : <Play size={16} />}
                        {isGenerating ? "Generating..." : "Generate & Review"}
                    </button>
                </>
            ) : (
                <button 
                    onClick={preSelectedQuestions ? handleStartManual : handleGenerateAndStart} 
                    disabled={isGenerating}
                    className="w-full px-6 py-3 bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-bold rounded-lg shadow-lg hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {isGenerating ? "Generating..." : "Next: Review"}
                </button>
            )}
        </div>

      </div>
    </div>
  );
};
