
import React, { useState, useEffect, useMemo } from 'react';
import { QuizQuestion, QuestionType, DifficultyLevel, MarkdownFile, AIConfig, Quiz, ExamConfig } from '../types';
import { Search, Filter, Plus, Trash2, Edit2, Play, Save, X, Sparkles, BrainCircuit, Check, LayoutGrid, List as ListIcon, Tag, ArrowLeft, Loader2, AlertCircle, ChevronDown, CheckSquare, Square } from 'lucide-react';
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
    
    // View Modes: 'list' (default), 'create' (manual), 'edit' (manual), 'review' (AI result)
    const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit' | 'review'>('list');
    const [editingQuestion, setEditingQuestion] = useState<Partial<QuizQuestion>>({});
    
    // Pending State for AI Generation / Review
    const [pendingQuestions, setPendingQuestions] = useState<QuizQuestion[]>([]);
    const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
    const [pendingExamConfig, setPendingExamConfig] = useState<ExamConfig | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
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
        if (questions) { 
            localStorage.setItem('neon-question-bank', JSON.stringify(questions));
        }
    }, [questions]);

    // --- Actions ---

    const handleGenerate = async () => {
        if (!activeFile.content) return;
        setIsGenerating(true);
        try {
            const quiz = await generateQuiz(activeFile.content, aiConfig);
            if (quiz.questions && quiz.questions.length > 0) {
                // Determine new unique questions
                const newQuestions = quiz.questions.filter(nq => !questions.some(eq => eq.question === nq.question));
                
                if (newQuestions.length === 0) {
                    alert("No new unique questions were generated.");
                } else {
                    setPendingQuestions(newQuestions);
                    setSelectedPendingIds(new Set(newQuestions.map(q => q.id)));
                    setPendingExamConfig(null); // Simple generate implies manual review/save first
                    setViewMode('review');
                }
            } else {
                alert("AI returned no valid questions.");
            }
        } catch (e) {
            console.error(e);
            alert("Failed to generate questions. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleExamGenResult = (quiz: Quiz, config: ExamConfig) => {
        // If coming from "Manual" selection, we just start immediately because user already selected from existing bank
        if (examConfigType === 'manual') {
            onStartQuiz(quiz.questions, config);
            onClose();
            setIsExamConfigOpen(false);
            return;
        }

        // If "Intelligent Exam" (AI Gen), we go to Review Mode first
        setPendingQuestions(quiz.questions);
        setSelectedPendingIds(new Set(quiz.questions.map(q => q.id))); // Select all by default
        setPendingExamConfig(config);
        setViewMode('review');
        setIsExamConfigOpen(false);
    };

    const handleSavePending = async () => {
        const toSave = pendingQuestions.filter(q => selectedPendingIds.has(q.id));
        if (toSave.length === 0) return;

        setIsSaving(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            setQuestions(prev => [...toSave, ...prev]);
            setPendingQuestions([]);
            setPendingExamConfig(null);
            setViewMode('list');
        } catch (e) {
            alert("Failed to save questions.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAndStart = async () => {
        const toSave = pendingQuestions.filter(q => selectedPendingIds.has(q.id));
        if (toSave.length === 0) return;

        setIsSaving(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            // 1. Save to Bank
            setQuestions(prev => [...toSave, ...prev]);
            
            // 2. Start Exam
            if (pendingExamConfig) {
                onStartQuiz(toSave, pendingExamConfig);
                onClose();
            } else {
                // Fallback config if none provided
                onStartQuiz(toSave, { mode: 'practice', duration: 0, passingScore: 60, showAnswers: 'immediate' });
                onClose();
            }
        } catch (e) {
            alert("Error saving/starting exam.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDiscard = () => {
        if (confirm("Discard these generated questions?")) {
            setPendingQuestions([]);
            setPendingExamConfig(null);
            setViewMode('list');
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

        if (viewMode === 'create') {
            setQuestions(prev => [newQ, ...prev]);
        } else {
            setQuestions(prev => prev.map(q => q.id === newQ.id ? newQ : q));
        }
        setViewMode('list');
        setEditingQuestion({});
    };

    const openExamConfig = (type: 'auto' | 'manual') => {
        setExamConfigType(type);
        setIsExamConfigOpen(true);
    };

    // --- Review Grouping ---
    const groupedPending = useMemo(() => {
        const groups: Record<string, QuizQuestion[]> = {
            'Multiple Choice': [],
            'Essay / Fill Blank': []
        };
        pendingQuestions.forEach(q => {
            if (q.type === 'single' || q.type === 'multiple') groups['Multiple Choice'].push(q);
            else groups['Essay / Fill Blank'].push(q);
        });
        return groups;
    }, [pendingQuestions]);

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
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                {viewMode === 'review' ? 'Review Generated Questions' : t.questionBank}
                            </h2>
                            <p className="text-xs text-slate-500">
                                {viewMode === 'review' 
                                    ? `${selectedPendingIds.size} / ${pendingQuestions.length} selected` 
                                    : `${questions.length} ${t.questionsAvailable}`}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {viewMode === 'list' && (
                            <>
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
                                    onClick={() => { setEditingQuestion({}); setViewMode('create'); }}
                                    className="flex items-center gap-2 px-3 py-2 bg-paper-100 dark:bg-cyber-800 hover:bg-paper-200 dark:hover:bg-cyber-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors border border-paper-200 dark:border-cyber-600"
                                >
                                    <Plus size={14} /> {t.manualAdd}
                                </button>
                            </>
                        )}
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Layout */}
                <div className="flex flex-1 overflow-hidden">
                    
                    {/* Sidebar Filters - Only visible in list mode */}
                    {viewMode === 'list' && (
                        <div className="w-64 border-r border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/30 p-4 flex flex-col gap-6 overflow-y-auto hidden md:flex">
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
                    )}

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto bg-white dark:bg-cyber-900 p-6">
                        
                        {/* REVIEW MODE */}
                        {viewMode === 'review' && (
                            <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn pb-20">
                                {Object.entries(groupedPending).map(([group, qs]) => {
                                    if (qs.length === 0) return null;
                                    return (
                                        <div key={group}>
                                            <div className="flex items-center gap-2 mb-3 text-slate-500 dark:text-slate-400 border-b border-paper-200 dark:border-cyber-700 pb-1">
                                                <h3 className="font-bold uppercase tracking-wider text-sm">{group}</h3>
                                                <span className="bg-paper-200 dark:bg-cyber-700 px-2 py-0.5 rounded text-xs">{qs.length}</span>
                                            </div>
                                            <div className="space-y-4">
                                                {qs.map((q) => (
                                                    <div 
                                                        key={q.id} 
                                                        onClick={() => setSelectedPendingIds(prev => {
                                                            const next = new Set(prev);
                                                            if(next.has(q.id)) next.delete(q.id);
                                                            else next.add(q.id);
                                                            return next;
                                                        })}
                                                        className={`
                                                            border rounded-xl p-4 transition-all cursor-pointer group
                                                            ${selectedPendingIds.has(q.id) 
                                                                ? 'border-green-500 bg-green-50/50 dark:bg-green-900/10' 
                                                                : 'border-paper-200 dark:border-cyber-700 opacity-60 hover:opacity-100'}
                                                        `}
                                                    >
                                                        <div className="flex items-start justify-between mb-2">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`
                                                                    w-5 h-5 rounded border flex items-center justify-center transition-colors
                                                                    ${selectedPendingIds.has(q.id) ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600'}
                                                                `}>
                                                                    {selectedPendingIds.has(q.id) && <Check size={14} strokeWidth={3} />}
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <Badge color={q.difficulty === 'easy' ? 'green' : q.difficulty === 'medium' ? 'yellow' : 'red'}>{q.difficulty}</Badge>
                                                                    <Badge color="blue">{q.type}</Badge>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="pl-8 prose dark:prose-invert prose-sm max-w-none mb-3">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question}</ReactMarkdown>
                                                        </div>
                                                        {q.options && (
                                                            <ul className="list-disc pl-12 text-sm text-slate-600 dark:text-slate-400 space-y-1 mb-2">
                                                                {q.options.map((opt, i) => <li key={i}>{opt}</li>)}
                                                            </ul>
                                                        )}
                                                        <div className="ml-8 text-xs text-slate-500 font-mono bg-white dark:bg-cyber-800 p-2 rounded border border-paper-200 dark:border-cyber-700">
                                                            <span className="font-bold text-green-600 mr-2">Answer:</span> 
                                                            {Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : q.correctAnswer}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* EDITOR MODE (Create/Edit) */}
                        {(viewMode === 'create' || viewMode === 'edit') && (
                            <div className="max-w-2xl mx-auto space-y-4 animate-fadeIn">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                        <button onClick={() => setViewMode('list')} className="hover:bg-paper-100 dark:hover:bg-cyber-800 p-1 rounded-full"><ArrowLeft size={20}/></button>
                                        {viewMode === 'create' ? t.create : t.edit} {t.question}
                                    </h3>
                                    <div className="flex gap-2">
                                        <button onClick={() => setViewMode('list')} className="px-3 py-1.5 rounded bg-paper-100 dark:bg-cyber-800 text-slate-600 dark:text-slate-400 text-sm">{t.cancel}</button>
                                        <button onClick={handleSaveEditor} className="px-4 py-1.5 rounded bg-cyan-500 text-white font-bold text-sm flex items-center gap-2"><Save size={14}/> {t.save}</button>
                                    </div>
                                </div>
                                {/* Form omitted for brevity - same as before */}
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
                            </div>
                        )}

                        {/* LIST MODE */}
                        {viewMode === 'list' && (
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
                                                    <button onClick={() => { setEditingQuestion(q); setViewMode('edit'); }} className="p-1.5 text-slate-400 hover:text-cyan-600 rounded hover:bg-cyan-50 dark:hover:bg-cyan-900/30">
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
                    {viewMode === 'review' ? (
                        <>
                            <div className="text-sm text-slate-500">
                                Selected: {selectedPendingIds.size} questions
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={handleDiscard}
                                    className="px-4 py-2 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-bold transition-colors"
                                >
                                    Discard All
                                </button>
                                <button 
                                    onClick={handleSavePending}
                                    disabled={selectedPendingIds.size === 0 || isSaving}
                                    className="px-4 py-2 border border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                                >
                                    {isSaving ? "Saving..." : "Save to Bank"}
                                </button>
                                <button 
                                    onClick={handleSaveAndStart}
                                    disabled={selectedPendingIds.size === 0 || isSaving}
                                    className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-green-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                                    {pendingExamConfig ? "Save & Start Exam" : "Save & Finish"}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            </div>
        </div>
        
        {/* Exam Configuration Modal Overlay */}
        <ExamConfigModal 
            isOpen={isExamConfigOpen}
            onClose={() => setIsExamConfigOpen(false)}
            onComplete={handleExamGenResult}
            selectedFile={activeFile}
            aiConfig={aiConfig}
            preSelectedQuestions={examConfigType === 'manual' ? selectedQuestionsList : undefined}
        />
        </>
    );
};
