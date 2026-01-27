import React, { useEffect, useState } from 'react';
import { Bookmark, Plus, X } from 'lucide-react';

import type { QuestionBank, Quiz } from '../../types';
import { translations, Language } from '../../utils/translations';
import { Button } from '../ui/Button';
import Tooltip from '../Tooltip';
import { prepareQuizQuestionsForBank } from './quizBankUtils';

interface QuizBankLinkProps {
  quiz: Quiz;
  banks: QuestionBank[];
  onCreateBank: (name: string, description?: string) => Promise<QuestionBank | null>;
  onAddQuestionsToBank: (bankId: string, questions: Quiz['questions']) => Promise<boolean>;
  language?: Language;
  autoOpen?: boolean;
  sourceFileId?: string;
}

const LAST_BANK_KEY = 'neon-last-question-bank-id';

const getStoredBankId = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(LAST_BANK_KEY) || '';
};

export const QuizBankLink: React.FC<QuizBankLinkProps> = ({
  quiz,
  banks,
  onCreateBank,
  onAddQuestionsToBank,
  language = 'en',
  autoOpen = false,
  sourceFileId
}) => {
  const t = translations[language];
  const [isOpen, setIsOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<string>(() => getStoredBankId());
  const [newBankName, setNewBankName] = useState<string>(() => quiz.title || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (autoOpen && !hasAutoOpened) {
      setIsOpen(true);
      setHasAutoOpened(true);
    }
  }, [autoOpen, hasAutoOpened]);

  useEffect(() => {
    if (!selectedBankId && banks.length > 0) {
      setSelectedBankId(banks[0].id);
      return;
    }
    if (selectedBankId && !banks.some(bank => bank.id === selectedBankId)) {
      setSelectedBankId(banks[0]?.id || '');
    }
  }, [banks, selectedBankId]);

  useEffect(() => {
    if (!newBankName.trim()) {
      setNewBankName(quiz.title || '');
    }
  }, [quiz.title, newBankName]);

  const handleClose = () => {
    setIsOpen(false);
    setError(null);
  };

  const handleSaveExisting = async () => {
    if (!selectedBankId) {
      setError(t.selectQuestionBank || 'Select a question bank');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const questions = prepareQuizQuestionsForBank(quiz, sourceFileId);
      const success = await onAddQuestionsToBank(selectedBankId, questions);
      if (!success) {
        setError(t.selectQuestionBank || 'Select a question bank');
        return;
      }
      localStorage.setItem(LAST_BANK_KEY, selectedBankId);
      setIsOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save questions';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateAndSave = async () => {
    if (!newBankName.trim()) {
      setError(t.bankName || 'Bank name is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const bank = await onCreateBank(newBankName.trim());
      if (!bank) {
        setError('Failed to create bank');
        return;
      }
      const questions = prepareQuizQuestionsForBank(quiz, sourceFileId);
      const success = await onAddQuestionsToBank(bank.id, questions);
      if (!success) {
        setError('Failed to save questions');
        return;
      }
      localStorage.setItem(LAST_BANK_KEY, bank.id);
      setSelectedBankId(bank.id);
      setIsOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save questions';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Tooltip content={t.saveToQuestionBank || 'Save to Question Bank'}>
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:text-violet-500 dark:hover:text-violet-400 transition-colors border border-paper-300 dark:border-cyber-600 rounded-md bg-white dark:bg-cyber-800"
          aria-label={t.saveToQuestionBank || 'Save to Question Bank'}
        >
          <Bookmark size={18} />
          <span className="hidden sm:inline text-sm">{t.saveToQuestionBank || 'Save to Bank'}</span>
        </button>
      </Tooltip>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-cyber-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-paper-200 dark:border-cyber-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                {t.saveToQuestionBank || 'Save to Question Bank'}
              </h3>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-paper-100 dark:hover:bg-cyber-700 rounded-lg transition-colors"
                aria-label={t.cancel || 'Close'}
              >
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {banks.length > 0 ? (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t.questionBankList || 'Question Banks'}
                  </label>
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="w-full px-3 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg focus:outline-none focus:border-violet-500 transition-colors"
                  >
                    {banks.map(bank => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={handleSaveExisting}
                    disabled={isSaving}
                    fullWidth
                    isLoading={isSaving}
                    className="bg-violet-500 hover:bg-violet-600"
                  >
                    {t.saveQuizQuestions || 'Save Quiz Questions'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t.createFirstBank || 'Create your first question bank to start generating quizzes'}</p>
              )}

              <div className="border-t border-paper-200 dark:border-cyber-700 pt-4 space-y-3">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t.createQuestionBank || 'Create Question Bank'}
                </label>
                <input
                  type="text"
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  placeholder={t.bankName || 'Bank Name'}
                  className="w-full px-3 py-2 bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg focus:outline-none focus:border-violet-500 transition-colors"
                />
                <Button
                  onClick={handleCreateAndSave}
                  disabled={isSaving}
                  fullWidth
                  isLoading={isSaving}
                  leftIcon={<Plus size={16} />}
                  className="bg-cyan-500 hover:bg-cyan-600"
                >
                  {t.createAndSave || 'Create & Save'}
                </Button>
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
