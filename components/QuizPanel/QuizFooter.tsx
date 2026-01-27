import React from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

import { translations, Language } from '../../utils/translations';
import { Button } from '../ui/Button';

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
      <Button
        variant="ghost"
        onClick={onPrev}
        disabled={activeIndex === 0}
        leftIcon={<ArrowLeft size={18} />}
        className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30"
      >
        {t.previous}
      </Button>

      <div className="flex gap-3">
        {!isAnswered ? (
          <Button
            onClick={onCheckAnswer}
            disabled={!canCheckAnswer || isGrading}
            isLoading={isGrading}
            className="px-6 shadow-lg shadow-cyan-500/25 disabled:shadow-none"
          >
            {isGrading ? t.grading : t.checkAnswer}
          </Button>
        ) : (
          activeIndex < totalQuestions - 1 ? (
            <Button
              onClick={onNext}
              className="px-6 bg-violet-500 hover:bg-violet-600 shadow-lg shadow-violet-500/25"
              rightIcon={<ArrowRight size={18} />}
            >
              {t.next}
            </Button>
          ) : (
            <Button
              onClick={onFinish}
              className="px-6 bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/25"
              rightIcon={<CheckCircle2 size={18} />}
            >
              {t.finish}
            </Button>
          )
        )}
      </div>
    </div>
  );
};
