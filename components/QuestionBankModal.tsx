import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, GraduationCap, BookOpen, Sparkles, Search, ChevronDown } from 'lucide-react';
import { DifficultyLevel, MarkdownFile, QuestionBank, QuestionBankStats, Quiz, QuizQuestion } from '../types';
import { translations } from '../utils/translations';
import { Language } from '../utils/translations';

interface QuestionBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  banks: QuestionBank[];
  onCreateBank: (name: string, description?: string) => Promise<QuestionBank | null>;
  onDeleteBank: (bankId: string) => void;
  onUpdateBank: (bankId: string, updates: Partial<QuestionBank>) => void;
  onAddQuestionsToBank: (bankId: string, questions: QuizQuestion[]) => Promise<boolean>;
  onGenerateQuestions: (bankId: string, sourceFileId: string, count?: number, difficulty?: string) => Promise<void>;
  onCreateQuizFromBank: (bankId: string, count?: number, difficulty?: DifficultyLevel | 'mixed') => Promise<Quiz | null>;
  onCreateQuizFromSelection: (questions: QuizQuestion[], title?: string) => Promise<Quiz | null>;
  onRemoveQuestion: (bankId: string, questionId: string) => void;
  files: MarkdownFile[];
  onShowToast: (message: string, isError?: boolean) => void;
  language?: Language;
}

export const QuestionBankModal: React.FC<QuestionBankModalProps> = ({
  isOpen,
  onClose,
  banks,
  onCreateBank,
  onDeleteBank,
  onUpdateBank,
  onAddQuestionsToBank,
  onGenerateQuestions,
  onCreateQuizFromBank,
  onCreateQuizFromSelection,
  onRemoveQuestion,
  files,
  onShowToast,
  language = 'en'
}) => {
  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'banks' | 'create'>('banks');
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [newBankName, setNewBankName] = useState('');
  const [newBankDescription, setNewBankDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBanks, setExpandedBanks] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | 'mixed'>('medium');
  const [selectedQuestionKeys, setSelectedQuestionKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) {
      setSelectedQuestionKeys(new Set());
    }
  }, [isOpen]);

  // Get selected file content for question generation
  const selectedFile = useMemo(() => {
    return files.find(f => f.id === selectedFileId);
  }, [selectedFileId, files]);

  // Calculate stats for a bank
  const getBankStats = (bank: QuestionBank): QuestionBankStats => {
    const totalQuestions = bank.questions.length;
    const byDifficulty: Record<string, number> = {};
    const byTags: Record<string, number> = {};
    let totalSuccessRate = 0;
    let questionsWithStats = 0;

    bank.questions.forEach(q => {
      if (q.difficulty) {
        byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
      }
      if (q.tags) {
        q.tags.forEach(tag => {
          byTags[tag] = (byTags[tag] || 0) + 1;
        });
      }
      if (q.successRate !== undefined) {
        totalSuccessRate += q.successRate;
        questionsWithStats++;
      }
    });

    return {
      totalQuestions,
      byDifficulty,
      byTags,
      averageSuccessRate: questionsWithStats > 0 ? Math.round(totalSuccessRate / questionsWithStats) : 0
    };
  };

  // Filter banks by search query
  const filteredBanks = useMemo(() => {
    if (!searchQuery) return banks;
    const query = searchQuery.toLowerCase();
    return banks.filter(bank =>
      bank.name.toLowerCase().includes(query) ||
      bank.description?.toLowerCase().includes(query) ||
      bank.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }, [banks, searchQuery]);

  const selectionKey = (bankId: string, questionId: string) => `${bankId}:${questionId}`;

  const selectedEntries = useMemo(() => {
    const entries: Array<{ bank: QuestionBank; question: QuizQuestion }> = [];
    for (const bank of banks) {
      for (const question of bank.questions) {
        if (selectedQuestionKeys.has(selectionKey(bank.id, question.id))) {
          entries.push({ bank, question });
        }
      }
    }
    return entries;
  }, [banks, selectedQuestionKeys]);

  const selectedQuestions = useMemo(
    () => selectedEntries.map(entry => entry.question),
    [selectedEntries]
  );

  const selectedCount = selectedQuestions.length;
  const selectedBankNames = useMemo(() => {
    const names = new Set<string>();
    selectedEntries.forEach(entry => names.add(entry.bank.name));
    return Array.from(names);
  }, [selectedEntries]);

  const clearSelection = () => {
    setSelectedQuestionKeys(new Set());
  };

  const toggleQuestionSelection = (bankId: string, questionId: string) => {
    setSelectedQuestionKeys(prev => {
      const next = new Set(prev);
      const key = selectionKey(bankId, questionId);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleCreateBank = () => {
    if (!newBankName.trim()) {
      onShowToast(t.bankName + t.confirmDelete || 'Please enter a bank name', true);
      return;
    }
    onCreateBank(newBankName.trim(), newBankDescription.trim());
    setNewBankName('');
    setNewBankDescription('');
    setActiveTab('banks');
    onShowToast(`${t.questionBank}: ${newBankName}`);
  };

  const handleGenerateQuestions = async (bankId: string) => {
    if (!selectedFile || !selectedFile.content.trim()) {
      onShowToast(t.transcription?.selectFile || 'Please select a file with content', true);
      return;
    }

    setIsGenerating(true);
    try {
      await onGenerateQuestions(bankId, selectedFileId, questionCount, difficulty);
      onShowToast(`${t.questionCount.replace('{count}', String(questionCount))} generated successfully!`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onShowToast(`Failed to generate questions: ${message}`, true);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateQuiz = async (bankId: string) => {
    const bank = banks.find(b => b.id === bankId);
    if (!bank || bank.questions.length === 0) {
      onShowToast(t.noQuestionsInBank || 'No questions available in this bank', true);
      return;
    }

    try {
      const quiz = await onCreateQuizFromBank(bankId, questionCount, difficulty);
      if (quiz) {
        onClose();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create quiz';
      onShowToast(message, true);
    }
  };

  const handleCreateQuizFromSelection = async () => {
    if (selectedCount === 0) {
      onShowToast(t.noQuestionsSelected || 'No questions selected', true);
      return;
    }

    const title = selectedBankNames.length === 1
      ? `${selectedBankNames[0]} Quiz`
      : (t.customQuizTitle || 'Custom Quiz');

    const quiz = await onCreateQuizFromSelection(selectedQuestions, title);
    if (quiz) {
      clearSelection();
      onClose();
    }
  };

  const toggleExpanded = (bankId: string) => {
    setExpandedBanks(prev => {
      const next = new Set(prev);
      if (next.has(bankId)) {
        next.delete(bankId);
      } else {
        next.add(bankId);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white dark:bg-cyber-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-slideDown">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-paper-200 dark:border-cyber-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <GraduationCap size={20} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">{t.questionBank}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {banks.length} {t.createQuestionBank}, {banks.reduce((sum, b) => sum + b.questions.length, 0)} {t.questionCount.replace('{count}', String(banks.reduce((sum, b) => sum + b.questions.length, 0)))}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-paper-100 dark:hover:bg-cyber-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-paper-200 dark:border-cyber-700">
          <button
            onClick={() => setActiveTab('banks')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'banks'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <BookOpen size={16} className="inline mr-2" />
            My Banks
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'create'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Plus size={16} className="inline mr-2" />
            {t.createQuestionBank}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'create' && (
            <div className="max-w-md mx-auto">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t.bankName}
                  </label>
                  <input
                    type="text"
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    placeholder="e.g., Python Basics Quiz"
                    className="w-full px-4 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t.bankDescription} ({t.cancel.toLowerCase()})
                  </label>
                  <textarea
                    value={newBankDescription}
                    onChange={(e) => setNewBankDescription(e.target.value)}
                    placeholder="Brief description of this question bank..."
                    rows={3}
                    className="w-full px-4 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg focus:outline-none focus:border-violet-500 transition-colors resize-none"
                  />
                </div>
                <button
                  onClick={handleCreateBank}
                  className="w-full py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={18} />
                  {t.createQuestionBank}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'banks' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search banks..."
                  className="w-full pl-10 pr-4 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg focus:outline-none focus:border-violet-500 transition-colors"
                />
              </div>

              {/* Banks List */}
              {filteredBanks.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
                  <p>{t.noQuestionBanks}</p>
                  <p className="text-sm mt-1">{t.createFirstBank}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredBanks.map(bank => {
                    const stats = getBankStats(bank);
                    const isExpanded = expandedBanks.has(bank.id);
                    const isSelected = selectedBank?.id === bank.id;

                    return (
                      <div
                        key={bank.id}
                        className={`border rounded-lg transition-colors ${
                          isSelected
                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                            : 'border-paper-200 dark:border-cyber-700 hover:border-violet-300 dark:hover:border-violet-700'
                        }`}
                      >
                        {/* Bank Header */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer"
                          onClick={() => {
                            setSelectedBank(isSelected ? null : bank);
                            toggleExpanded(bank.id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                              <BookOpen size={18} className="text-violet-600 dark:text-violet-400" />
                            </div>
                            <div>
                              <h3 className="font-medium text-slate-800 dark:text-slate-200">{bank.name}</h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t.questionCount.replace('{count}', String(bank.questions.length))} • {t.close} {new Date(bank.updatedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {stats.averageSuccessRate > 0 && (
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                stats.averageSuccessRate >= 70
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                  : stats.averageSuccessRate >= 50
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              }`}>
                                {stats.averageSuccessRate}% avg
                              </span>
                            )}
                            <ChevronDown
                              size={16}
                              className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-paper-100 dark:border-cyber-700 pt-4">
                            {/* Quiz Assembly */}
                            <div className="mb-4 space-y-3">
                              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                                {t.createQuizFromBank || 'Create Quiz from Bank'}:
                              </label>

                              {/* Options Row */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                    {t.questionCount.replace('{count}', '')}
                                  </label>
                                  <select
                                    value={questionCount}
                                    onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
                                    className="w-full px-3 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-sm focus:outline-none focus:border-violet-500"
                                  >
                                    <option value={3}>3 {t.questionCount.replace('{count}', '')}</option>
                                    <option value={5}>5 {t.questionCount.replace('{count}', '')}</option>
                                    <option value={10}>10 {t.questionCount.replace('{count}', '')}</option>
                                    <option value={15}>15 {t.questionCount.replace('{count}', '')}</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                                    {t.difficulty}
                                  </label>
                                  <select
                                    value={difficulty}
                                    onChange={(e) => setDifficulty(e.target.value as DifficultyLevel | 'mixed')}
                                    className="w-full px-3 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-sm focus:outline-none focus:border-violet-500"
                                  >
                                    <option value="easy">{t.difficultyEasy}</option>
                                    <option value="medium">{t.difficultyMedium}</option>
                                    <option value="hard">{t.difficultyHard}</option>
                                    <option value="mixed">{t.difficultyMixed || 'Mixed'}</option>
                                  </select>
                                </div>
                              </div>

                              <button
                                onClick={() => handleCreateQuiz(bank.id)}
                                disabled={bank.questions.length === 0}
                                className="w-full py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                              >
                                <GraduationCap size={16} />
                                {t.startQuiz}
                              </button>
                            </div>

                            {/* AI Question Generation */}
                            <div className="mb-4 space-y-3">
                              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                                {t.generateQuestions || 'Generate Questions'}:
                              </label>
                              <select
                                value={selectedFileId}
                                onChange={(e) => setSelectedFileId(e.target.value)}
                                className="w-full px-3 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-sm focus:outline-none focus:border-violet-500"
                              >
                                <option value="">{t.transcription?.selectFile || 'Select a file...'}</option>
                                {files.filter(f => f.content.trim().length > 0).map(file => (
                                  <option key={file.id} value={file.id}>{file.name}</option>
                                ))}
                              </select>

                              <button
                                onClick={() => handleGenerateQuestions(bank.id)}
                                disabled={isGenerating || !selectedFileId}
                                className="w-full py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                              >
                                <Sparkles size={16} />
                                {isGenerating ? t.analyzingContent : `${t.generateQuestions || 'Generate Questions'} ${t.questionCount.replace('{count}', String(questionCount))}`}
                              </button>
                            </div>

                            {/* Questions List */}
                            {bank.questions.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                  {t.questionCount.replace('{count}', String(bank.questions.length))}
                                </h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                  {bank.questions.map((q, idx) => {
                                    const key = selectionKey(bank.id, q.id);
                                    const isSelected = selectedQuestionKeys.has(key);
                                    return (
                                      <div
                                        key={q.id}
                                        className={`flex items-start justify-between gap-2 p-3 rounded-lg border ${
                                          isSelected
                                            ? 'border-cyan-400/60 bg-cyan-50/40 dark:bg-cyan-900/20'
                                            : 'border-transparent bg-paper-50 dark:bg-cyber-900'
                                        }`}
                                      >
                                        <label className="flex items-start gap-3 flex-1 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleQuestionSelection(bank.id, q.id)}
                                            className="mt-1 h-4 w-4 rounded border-paper-300 text-cyan-500 focus:ring-cyan-400"
                                          />
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="text-xs font-mono text-slate-400">Q{idx + 1}</span>
                                              {q.difficulty && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                  q.difficulty === 'easy' ? 'bg-green-100 dark:bg-green-900/30 text-green-700' :
                                                  q.difficulty === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700' :
                                                  'bg-red-100 dark:bg-red-900/30 text-red-700'
                                                }`}>
                                                  {q.difficulty}
                                                </span>
                                              )}
                                              <span className="text-[10px] text-slate-400">
                                                Used {q.timesUsed} times
                                              </span>
                                            </div>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                                              {q.question}
                                            </p>
                                          </div>
                                        </label>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveQuestion(bank.id, q.id);
                                          }}
                                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-paper-100 dark:border-cyber-700">
                              <button
                                onClick={() => onDeleteBank(bank.id)}
                                className="flex-1 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                              >
                                <Trash2 size={14} />
                                {t.delete}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50 rounded-b-xl">
          {selectedCount > 0 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {t.selectedQuestions?.replace('{count}', String(selectedCount)) || `Selected ${selectedCount} questions`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-paper-200 dark:border-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-cyber-800 transition-colors"
                >
                  {t.clearSelection || 'Clear selection'}
                </button>
                <button
                  onClick={handleCreateQuizFromSelection}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white transition-colors"
                >
                  {t.startQuiz}
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{filteredBanks.length} of {banks.length} banks</span>
            <span>{t.questionBankManager}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuestionBankModal;
