import React from 'react';
import { BookOpen, BookmarkX, Trash2 } from 'lucide-react';

import type { MistakeRecord } from '../../types';
import { translations, Language } from '../../utils/translations';
import Tooltip from '../Tooltip';

interface QuizMistakeCollectionProps {
  mistakes: MistakeRecord[];
  onDelete: (id: string) => void;
  onClose: () => void;
  language?: Language;
}

export const QuizMistakeCollection: React.FC<QuizMistakeCollectionProps> = ({
  mistakes,
  onDelete,
  onClose,
  language = 'en'
}) => {
  const t = translations[language];

  return (
    <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col overflow-hidden">
      <div className="h-16 flex items-center justify-between px-6 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
            <BookmarkX size={20} />
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Mistake Collection (错题本)</h2>
        </div>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-md bg-paper-200 dark:bg-cyber-700 text-slate-600 dark:text-slate-300 hover:bg-paper-300 dark:hover:bg-cyber-600 transition-colors text-sm font-medium"
        >
          Back to Quiz
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-12">
        <div className="max-w-4xl mx-auto space-y-6">
          {mistakes.length === 0 ? (
            <div className="text-center text-slate-400 py-20">
              <BookOpen size={48} className="mx-auto mb-4 opacity-50" />
              <p>No mistakes recorded yet. Keep practicing!</p>
            </div>
          ) : (
            mistakes.map(mistake => (
              <div key={mistake.id} className="bg-white dark:bg-cyber-800 rounded-xl border border-red-200 dark:border-red-900/50 shadow-sm p-6 relative group">
                <Tooltip content={t.tooltips?.removeFromCollection || 'Remove from collection'}>
                  <button
                    onClick={() => onDelete(mistake.id)}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label={t.tooltips?.removeFromCollection || 'Remove from collection'}
                  >
                    <Trash2 size={18} />
                  </button>
                </Tooltip>

                <div className="text-xs text-slate-500 mb-2 flex items-center gap-2">
                  <span className="bg-paper-100 dark:bg-cyber-700 px-2 py-0.5 rounded text-[10px]">
                    {new Date(mistake.timestamp).toLocaleDateString()}
                  </span>
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
};
