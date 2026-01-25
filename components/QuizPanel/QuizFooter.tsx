import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

import { translations, Language } from '../../utils/translations';

interface QuizFooterProps {
  activeIndex: number;
  totalQuestions: number;
  isAnswered: boolean;
  isGrading: boolean;
  canCheckAnswer: boolean;
  onPrev: () => void;
  onCheckAnswer: () => void;
  onNext: () => void;
  onFinish: () => void;
  language?: Language;
}

export const QuizFooter: React.FC<QuizFooterProps> = ({
  activeIndex,
  totalQuestions,
  isAnswered,
  isGrading,
  canCheckAnswer,
  onPrev,
  onCheckAnswer,
  onNext,
  onFinish,
  language = 'en'
}) => {
  const t = translations[language];

  return (
    <div className="h-20 border-t border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 flex items-center justify-between px-6 md:px-12">
      <button
        onClick={onPrev}
        disabled={activeIndex === 0}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
      >
        <ArrowLeft size={18} /> {t.previous}
      </button>

      <div className="flex gap-3">
        {!isAnswered ? (
          <button
            onClick={onCheckAnswer}
            disabled={!canCheckAnswer || isGrading}
            className="flex items-center gap-2 px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-bold shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {isGrading ? t.grading : t.checkAnswer}
          </button>
        ) : (
          activeIndex < totalQuestions - 1 ? (
            <button
              onClick={onNext}
              className="flex items-center gap-2 px-6 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-bold shadow-lg shadow-violet-500/25 transition-all"
            >
              {t.next} <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={onFinish}
              className="flex items-center gap-2 px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold shadow-lg shadow-green-500/25 transition-all"
            >
              {t.finish} <CheckCircle2 size={18} />
            </button>
          )
        )}
      </div>
    </div>
  );
};
