
import React, { useState, useEffect, useMemo } from 'react';
import { QuizQuestion, QuestionType, DifficultyLevel, MarkdownFile, AIConfig, Quiz, ExamConfig } from '../types';
import { Search, Filter, Plus, Trash2, Edit2, Play, Save, X, Sparkles, BrainCircuit, Check, LayoutGrid, List as ListIcon, Tag } from 'lucide-react';
import { generateQuiz } from '../services/aiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ExamConfigModal } from './ExamConfigModal';
import { translations, Language } from '../utils/translations';

interface QuestionBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeFile: MarkdownFile;
  aiConfig: AIConfig;
  onStartQuiz: (questions: QuizQuestion[], config?: ExamConfig) => void;
}

// --- Helper Components ---

const Badge = ({ children, color = 'slate' }: { children: React.ReactNode, color?: string }) => {
    const colorClasses: Record<string, string> = {
        slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
        green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        purple: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    };
    return (
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${colorClasses[color] || colorClasses.slate}`}>
            {children}
        </span>
    );
};

export const QuestionBankModal: React.FC<QuestionBankModalProps> = ({ 
    isOpen, onClose, activeFile, aiConfig, onStartQuiz 
}) => {
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
    const [editingQuestion, setEditingQuestion] = useState<Partial<QuizQuestion>>({});
    
    // Filtering
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState<DifficultyLevel | 'all'>('all');
    const [filterType, setFilterType] = useState<QuestionType | 'all'>('all');
    const [filterTags, setFilterTags] = useState<string[]>([]);

    const [isGenerating, setIsGenerating] = useState(false);
    const [isExamConfigOpen, setIsExamConfigOpen] = useState(false);
    const [examConfigType, setExamConfigType] = useState<'auto' | 'manual'>('auto');

    const t = translations[aiConfig.language as Language || 'en'];

    // Load from LocalStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('neon-question-bank');
            if (saved) setQuestions(JSON.parse(saved));
        } catch (e) { console.error("Failed to load question bank", e); }
    }, []);

    // Save to LocalStorage on change
    useEffect(() => {
        if (questions.length > 0) {
            localStorage.setItem('neon-question-bank', JSON.stringify(questions));
        }
    }, [questions]);

    // --- Actions ---

    const handleGenerate = async () => {
        if (!activeFile.content) return;
        setIsGenerating(true);
        try {
            const quiz = await generateQuiz(activeFile.content, aiConfig);
            if (quiz.questions) {
                // De-duplicate based on question text
                const newQuestions = quiz.questions.filter(nq => !questions.some(eq => eq.question === nq.question));
                setQuestions(prev => [...newQuestions, ...prev]);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to generate questions.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDelete = (id: string) => {
        if(confirm("Delete this question?")) {
            setQuestions(prev => prev.filter(q => q.id !== id));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleSaveEditor = () => {
        if (!editingQuestion.question) return;

        const newQ: QuizQuestion = {
            id: editingQuestion.id || `manual-${Date.now()}`,
            type: editingQuestion.type || 'single',
            question: editingQuestion.question,
            options: editingQuestion.options || [],
            correctAnswer: editingQuestion.correctAnswer || '',
            explanation: editingQuestion.explanation || '',
            difficulty: editingQuestion.difficulty || 'medium',
            tags: editingQuestion.tags || [],
            knowledgePoints: editingQuestion.knowledgePoints || [],
            created: editingQuestion.created || Date.now()
        };

        if (editorMode === 'create') {
            setQuestions(prev => [newQ, ...prev]);
        } else {
            setQuestions(prev => prev.map(q => q.id === newQ.id ? newQ : q));
        }
        setEditorMode(null);
        setEditingQuestion({});
    };

    const handleStartExam = (quiz: Quiz, config: ExamConfig) => {
        onStartQuiz(quiz.questions, config);
        onClose();
        setIsExamConfigOpen(false);
    };

    const openExamConfig = (type: 'auto' | 'manual') => {
        setExamConfigType(type);
        setIsExamConfigOpen(true);
    };

    // --- Filtering Logic ---
    const filteredQuestions = useMemo(() => {
        return questions.filter(q => {
            if (searchQuery && !q.question.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            if (filterDifficulty !== 'all' && q.difficulty !== filterDifficulty) return false;
            if (filterType !== 'all' && q.type !== filterType) return false;
            if (filterTags.length > 0 && !filterTags.every(t => q.tags?.includes(t))) return false;
            return true;
        });
    }, [questions, searchQuery, filterDifficulty, filterType, filterTags]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        questions.forEach(q => q.tags?.forEach(t => tags.add(t)));
        return Array.from(tags);
    }, [questions]);

    const selectedQuestionsList = useMemo(() => {
        return questions.filter(q => selectedIds.has(q.id));
    }, [questions, selectedIds]);

    // --- Render ---

    if (!isOpen) return null;

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-6xl h-[90vh] bg-white dark:bg-cyber-900 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 overflow-hidden flex flex-col animate-scaleIn">
                
                {/* Header */}
                <div className="h-16 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
                            <BrainCircuit size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t.questionBank}</h2>
                            <p className="text-xs text-slate-500">{questions.length} {t.questionsAvailable}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => openExamConfig('auto')}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-lg text-sm font-bold transition-transform hover:scale-105 shadow-md"
                        >
                            <Sparkles size={16} /> {t.intelligentExam}
                        </button>
                        <div className="h-6 w-px bg-paper-300 dark:bg-cyber-600 mx-2" />
                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="flex items-center gap-2 px-3 py-2 bg-paper-100 dark:bg-cyber-800 hover:bg-paper-200 dark:hover:bg-cyber-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors border border-paper-200 dark:border-cyber-600"
                        >
                            {isGenerating ? <Sparkles className="animate-spin" size={14} /> : <Plus size={14} />}
                            {isGenerating ? t.grading : t.generateFromNote}
                        </button>
                        <button 
                            onClick={() => { setEditingQuestion({}); setEditorMode('create'); }}
                            className="flex items-center gap-2 px-3 py-2 bg-paper-100 dark:bg-cyber-800 hover:bg-paper-200 dark:hover:bg-cyber-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors border border-paper-200 dark:border-cyber-600"
                        >
                            <Plus size={14} /> {t.manualAdd}
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Layout */}
                <div className="flex flex-1 overflow-hidden">
                    
                    {/* Sidebar Filters */}
                    <div className="w-64 border-r border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/30 p-4 flex flex-col gap-6 overflow-y-auto">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input 
                                type="text" 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={t.searchPlaceholder}
                                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                            />
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Filter size={12}/> {t.difficulty}</h3>
                            <div className="space-y-1">
                                {['all', 'easy', 'medium', 'hard'].map(lvl => (
                                    <button
                                        key={lvl}
                                        onClick={() => setFilterDifficulty(lvl as DifficultyLevel | 'all')}
                                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${filterDifficulty === lvl ? 'bg-cyan-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-paper-200 dark:hover:bg-cyber-700'}`}
                                    >
                                        {lvl === 'all' ? 'All' : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2"><LayoutGrid size={12}/> {t.type}</h3>
                            <div className="space-y-1">
                                {['all', 'single', 'multiple', 'text', 'fill_blank'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setFilterType(type as QuestionType | 'all')}
                                        className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${filterType === type ? 'bg-cyan-500 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-paper-200 dark:hover:bg-cyber-700'}`}
                                    >
                                        {type === 'all' ? 'All' : type === 'fill_blank' ? t.fillBlank : type.charAt(0).toUpperCase() + type.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Tag size={12}/> {t.tags}</h3>
                            <div className="flex flex-wrap gap-2">
                                {allTags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                        className={`px-2 py-1 rounded text-xs border transition-colors ${filterTags.includes(tag) ? 'bg-violet-500 border-violet-500 text-white' : 'bg-white dark:bg-cyber-900 border-paper-200 dark:border-cyber-600 text-slate-600 dark:text-slate-400'}`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Question List */}
                    <div className="flex-1 overflow-y-auto bg-white dark:bg-cyber-900 p-6">
                        {editorMode ? (
                            <div className="max-w-2xl mx-auto space-y-4 animate-fadeIn">
                                {/* ... (Editor Form) ... */}
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                                        {editorMode === 'create' ? t.create : t.edit} {t.question}
                                    </h3>
                                    <div className="flex gap-2">
                                        <button onClick={() => setEditorMode(null)} className="px-3 py-1.5 rounded bg-paper-100 dark:bg-cyber-800 text-slate-600 dark:text-slate-400 text-sm">{t.cancel}</button>
                                        <button onClick={handleSaveEditor} className="px-4 py-1.5 rounded bg-cyan-500 text-white font-bold text-sm flex items-center gap-2"><Save size={14}/> {t.save}</button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <label className="block space-y-1">
                                        <span className="text-xs font-bold text-slate-500">{t.type}</span>
                                        <select 
                                            className="w-full p-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                                            value={editingQuestion.type || 'single'}
                                            onChange={e => setEditingQuestion({...editingQuestion, type: e.target.value as QuestionType})}
                                        >
                                            <option value="single">{t.singleChoice}</option>
                                            <option value="multiple">{t.multipleChoice}</option>
                                            <option value="text">{t.shortEssay}</option>
                                            <option value="fill_blank">{t.fillBlank}</option>
                                        </select>
                                    </label>
                                    <label className="block space-y-1">
                                        <span className="text-xs font-bold text-slate-500">{t.difficulty}</span>
                                        <select 
                                            className="w-full p-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                                            value={editingQuestion.difficulty || 'medium'}
                                            onChange={e => setEditingQuestion({...editingQuestion, difficulty: e.target.value as DifficultyLevel})}
                                        >
                                            <option value="easy">{t.easy}</option>
                                            <option value="medium">{t.medium}</option>
                                            <option value="hard">{t.hard}</option>
                                        </select>
                                    </label>
                                </div>

                                <label className="block space-y-1">
                                    <span className="text-xs font-bold text-slate-500">{t.question}</span>
                                    <textarea 
                                        className="w-full h-32 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                                        value={editingQuestion.question || ''}
                                        onChange={e => setEditingQuestion({...editingQuestion, question: e.target.value})}
                                        placeholder="Enter the question text..."
                                    />
                                </label>

                                {(editingQuestion.type === 'single' || editingQuestion.type === 'multiple') && (
                                    <div className="space-y-2">
                                        <span className="text-xs font-bold text-slate-500">Options (One per line)</span>
                                        <textarea 
                                            className="w-full h-24 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                                            value={editingQuestion.options?.join('\n') || ''}
                                            onChange={e => setEditingQuestion({...editingQuestion, options: e.target.value.split('\n')})}
                                            placeholder="Option A&#10;Option B&#10;Option C"
                                        />
                                    </div>
                                )}

                                <label className="block space-y-1">
                                    <span className="text-xs font-bold text-slate-500">{t.correct}</span>
                                    <input 
                                        type="text"
                                        className="w-full p-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                                        value={editingQuestion.correctAnswer as string || ''}
                                        onChange={e => setEditingQuestion({...editingQuestion, correctAnswer: e.target.value})}
                                        placeholder={editingQuestion.type === 'single' ? 'Option text or index' : 'Answer key'}
                                    />
                                </label>

                                <label className="block space-y-1">
                                    <span className="text-xs font-bold text-slate-500">{t.explanation}</span>
                                    <textarea 
                                        className="w-full h-20 p-3 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                                        value={editingQuestion.explanation || ''}
                                        onChange={e => setEditingQuestion({...editingQuestion, explanation: e.target.value})}
                                    />
                                </label>
                                
                                <label className="block space-y-1">
                                    <span className="text-xs font-bold text-slate-500">{t.tags}</span>
                                    <input 
                                        type="text"
                                        className="w-full p-2 bg-paper-50 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-600 rounded text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                                        value={editingQuestion.tags?.join(', ') || ''}
                                        onChange={e => setEditingQuestion({...editingQuestion, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)})}
                                        placeholder="math, algebra, hard"
                                    />
                                </label>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredQuestions.length === 0 ? (
                                    <div className="text-center py-20 text-slate-400">
                                        <ListIcon size={48} className="mx-auto mb-4 opacity-20" />
                                        <p>{t.noResults}</p>
                                    </div>
                                ) : (
                                    filteredQuestions.map(q => (
                                        <div 
                                            key={q.id} 
                                            className={`
                                                relative border rounded-xl p-4 transition-all bg-white dark:bg-cyber-800
                                                ${selectedIds.has(q.id) ? 'border-cyan-500 ring-1 ring-cyan-500 bg-cyan-50 dark:bg-cyan-900/10' : 'border-paper-200 dark:border-cyber-700 hover:border-cyan-300 dark:hover:border-cyan-700'}
                                            `}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.has(q.id)}
                                                        onChange={() => setSelectedIds(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(q.id)) next.delete(q.id);
                                                            else next.add(q.id);
                                                            return next;
                                                        })}
                                                        className="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                                    />
                                                    <div className="flex gap-2">
                                                        <Badge color={q.difficulty === 'easy' ? 'green' : q.difficulty === 'medium' ? 'yellow' : 'red'}>{q.difficulty}</Badge>
                                                        <Badge color="blue">{q.type.replace('_', ' ')}</Badge>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingQuestion(q); setEditorMode('edit'); }} className="p-1.5 text-slate-400 hover:text-cyan-600 rounded hover:bg-cyan-50 dark:hover:bg-cyan-900/30">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleDelete(q.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="pl-6 prose dark:prose-invert prose-sm max-w-none text-slate-700 dark:text-slate-300">
                                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question}</ReactMarkdown>
                                            </div>

                                            <div className="mt-3 pl-6 flex flex-wrap gap-2">
                                                {q.tags?.map(tag => (
                                                    <span key={tag} className="text-xs text-slate-500 bg-paper-100 dark:bg-cyber-700 px-1.5 py-0.5 rounded">#{tag}</span>
                                                ))}
                                                {q.knowledgePoints?.map(kp => (
                                                    <span key={kp} className="text-xs text-violet-500 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded">@{kp}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="h-16 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800 flex items-center justify-between px-6 shrink-0">
                    <div className="text-sm text-slate-500">
                        {selectedIds.size} {t.question} selected
                    </div>
                    <button 
                        onClick={() => openExamConfig('manual')}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-600 hover:to-violet-600 text-white rounded-lg font-bold shadow-lg shadow-violet-500/30 transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                        <Play size={18} fill="currentColor" /> {t.startQuiz}
                    </button>
                </div>
            </div>
        </div>
        
        {/* Exam Configuration Modal Overlay */}
        <ExamConfigModal 
            isOpen={isExamConfigOpen}
            onClose={() => setIsExamConfigOpen(false)}
            onStartExam={handleStartExam}
            selectedFile={activeFile}
            aiConfig={aiConfig}
            preSelectedQuestions={examConfigType === 'manual' ? selectedQuestionsList : undefined}
        />
        </>
    );
};
