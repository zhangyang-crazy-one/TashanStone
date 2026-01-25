import React from 'react';
import { BookmarkX, BookOpen, Download } from 'lucide-react';

import { translations, Language } from '../../utils/translations';
import Tooltip from '../Tooltip';

interface QuizHeaderProps {
  title: string;
  questionIndex: number;
  totalQuestions: number;
  onShowMistakes: () => void;
  onDownload: () => void;
  onExit: () => void;
  bankAction?: React.ReactNode;
  language?: Language;
}

export const QuizHeader: React.FC<QuizHeaderProps> = ({
  title,
  questionIndex,
  totalQuestions,
  onShowMistakes,
  onDownload,
  onExit,
  bankAction,
  language = 'en'
}) => {
  const t = translations[language];

  return (
    <div className="h-16 flex items-center justify-between px-6 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded-lg">
          <BookOpen size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title || 'Generated Quiz'}</h2>
          <div className="text-xs text-slate-500">{t.question} {questionIndex + 1} / {totalQuestions}</div>
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <Tooltip content={t.tooltips?.viewMistakes || 'View Mistake Collection'}>
          <button
            onClick={onShowMistakes}
            className="flex items-center gap-2 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 transition-colors border border-paper-300 dark:border-cyber-600 rounded-md bg-white dark:bg-cyber-800"
            aria-label={t.tooltips?.viewMistakes || 'View Mistake Collection'}
          >
            <BookmarkX size={18} />
            <span className="hidden sm:inline text-sm">Mistakes</span>
          </button>
        </Tooltip>
        {bankAction}
        <Tooltip content={t.tooltips?.downloadQuiz || 'Download Quiz JSON'}>
          <button onClick={onDownload} className="p-2 text-slate-400 hover:text-cyan-500 transition-colors" aria-label={t.tooltips?.downloadQuiz || 'Download Quiz JSON'}>
            <Download size={20} />
          </button>
        </Tooltip>
        <button
          onClick={onExit}
          className="px-3 py-1.5 rounded-md bg-paper-200 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-paper-300 dark:hover:bg-cyber-600 transition-colors text-sm font-medium"
        >
          {t.exitQuiz}
        </button>
      </div>
    </div>
  );
};
