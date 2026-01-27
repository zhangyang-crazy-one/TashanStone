import React from 'react';
import { BookOpen, CheckCircle2, CheckSquare, Loader2, Sparkles, XCircle } from 'lucide-react';

import type { QuizQuestion } from '../../types';
import { translations, Language } from '../../utils/translations';
import { Button } from '../ui/Button';

interface QuizQuestionCardProps {
  question: QuizQuestion;
  isAnswered: boolean;
  isExplaining: boolean;
  isOptionSelected: (idx: number) => boolean;
  isOptionCorrect: (idx: number) => boolean;
  onOptionSelect: (idx: number) => void;
  onTextAnswer: (value: string) => void;
  onExplain: () => void;
  language?: Language;
}

export const QuizQuestionCard: React.FC<QuizQuestionCardProps> = ({
  question,
  isAnswered,
  isExplaining,
  isOptionSelected,
  isOptionCorrect,
  onOptionSelect,
  onTextAnswer,
  onExplain,
  language = 'en'
}) => {
  const t = translations[language];
  const questionType = question.type || (question.options && question.options.length > 0 ? 'single' : 'text');
  const isMultiple = questionType === 'multiple';

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          questionType === 'single' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
          questionType === 'multiple' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
          questionType === 'fill_blank' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
          'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
        }`}>
          {questionType === 'single' ? (language === 'zh' ? '单选题' : 'Single Choice') :
           questionType === 'multiple' ? (language === 'zh' ? '多选题' : 'Multiple Choice') :
           questionType === 'fill_blank' ? (language === 'zh' ? '填空题' : 'Fill-in-blank') :
           (language === 'zh' ? '问答题' : 'Essay')}
        </span>
      </div>

      <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
        {question.question}
      </h3>

      <div className="space-y-3 pt-4">
        {questionType === 'multiple' && (
          <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 mb-2">
            <CheckSquare size={16} />
            <span>{language === 'zh' ? '本题为多选题，请选择所有正确答案' : 'Select all correct answers'}</span>
          </div>
        )}

        {question.options && question.options.length > 0 && question.options.map((opt, idx) => {
          const selected = isOptionSelected(idx);
          const correct = isOptionCorrect(idx);

          let optionClass = 'border-paper-200 dark:border-cyber-700 hover:border-cyan-400 dark:hover:border-cyan-500 bg-white dark:bg-cyber-800';
          if (selected) {
            optionClass = 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-200 ring-1 ring-cyan-500';
          }
          if (isAnswered) {
            if (correct) optionClass = 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 ring-1 ring-green-500';
            else if (selected && !question.isCorrect) optionClass = 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200';
            else optionClass += ' opacity-60';
          }

          return (
            <button
              key={idx}
              onClick={() => onOptionSelect(idx)}
              disabled={isAnswered}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 group ${optionClass}`}
            >
              <div className={`flex-shrink-0 w-6 h-6 ${isMultiple ? 'rounded-md' : 'rounded-full'} border-2 flex items-center justify-center transition-colors ${
                selected
                  ? 'border-cyan-500 bg-cyan-500 text-white'
                  : 'border-slate-300 dark:border-slate-600'
              }`}>
                {isMultiple ? (
                  selected && <CheckCircle2 size={14} />
                ) : (
                  selected && <div className="w-2.5 h-2.5 rounded-full bg-white" />
                )}
              </div>
              <span className="font-medium text-lg flex-1">{opt}</span>
              {isAnswered && correct && <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />}
            </button>
          );
        })}

        {questionType === 'fill_blank' && (!question.options || question.options.length === 0) && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="font-medium">{language === 'zh' ? '请填写简短答案（1-5个词）' : 'Enter a short answer (1-5 words)'}</span>
              </div>
            </div>
            <input
              type="text"
              value={typeof question.userAnswer === 'string' ? question.userAnswer : ''}
              onChange={(e) => onTextAnswer(e.target.value)}
              disabled={isAnswered}
              placeholder={language === 'zh' ? '输入答案...' : 'Type answer...'}
              className="w-full p-4 rounded-xl bg-white dark:bg-cyber-800 border-2 border-paper-200 dark:border-cyber-700 focus:border-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-lg"
            />
            {isAnswered && question.correctAnswer && (
              <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                  {language === 'zh' ? '正确答案' : 'Correct Answer'}
                </div>
                <p className="text-slate-700 dark:text-slate-300 font-medium">
                  {String(question.correctAnswer)}
                </p>
              </div>
            )}
          </div>
        )}

        {questionType === 'text' && (!question.options || question.options.length === 0) && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
                <BookOpen size={16} />
                <span className="font-medium">{language === 'zh' ? '请详细回答以下问题（AI评分）' : 'Please answer in detail (AI graded)'}</span>
              </div>
            </div>
            <textarea
              value={typeof question.userAnswer === 'string' ? question.userAnswer : ''}
              onChange={(e) => onTextAnswer(e.target.value)}
              disabled={isAnswered}
              placeholder={language === 'zh' ? '在此输入你的答案...' : 'Type your answer here...'}
              className="w-full h-40 p-4 rounded-xl bg-white dark:bg-cyber-800 border-2 border-paper-200 dark:border-cyber-700 focus:border-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-lg resize-none"
            />
            {isAnswered && question.correctAnswer && (
              <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                  {language === 'zh' ? '参考要点' : 'Reference Points'}
                </div>
                <p className="text-slate-700 dark:text-slate-300">
                  {String(question.correctAnswer)}
                </p>
              </div>
            )}
          </div>
        )}

        {!question.type && (!question.options || question.options.length === 0) && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="font-medium">{language === 'zh' ? '请在下方输入你的答案' : 'Enter your answer below'}</span>
              </div>
            </div>
            <textarea
              value={typeof question.userAnswer === 'string' ? question.userAnswer : ''}
              onChange={(e) => onTextAnswer(e.target.value)}
              disabled={isAnswered}
              placeholder={language === 'zh' ? '在此输入你的答案...' : 'Type your answer here...'}
              className="w-full h-32 p-4 rounded-xl bg-white dark:bg-cyber-800 border-2 border-paper-200 dark:border-cyber-700 focus:border-cyan-500 focus:outline-none text-slate-800 dark:text-slate-200 text-lg resize-none"
            />
            {isAnswered && question.correctAnswer && (
              <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                  {language === 'zh' ? '参考答案' : 'Reference Answer'}
                </div>
                <p className="text-slate-700 dark:text-slate-300">
                  {Array.isArray(question.correctAnswer)
                    ? question.correctAnswer.join(', ')
                    : String(question.correctAnswer)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {isAnswered && (
        <div className={`p-4 rounded-xl border ${question.isCorrect ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900'} animate-fadeIn`}>
          <div className="flex items-start gap-3">
            {question.isCorrect ? <CheckCircle2 className="text-green-500 mt-1" /> : <XCircle className="text-red-500 mt-1" />}
            <div className="flex-1">
              <h4 className={`font-bold ${question.isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                {question.isCorrect ? t.correct : t.incorrect}
              </h4>

              {question.explanation ? (
                <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm leading-relaxed">
                  <span className="font-bold opacity-70">Explanation: </span>
                  {question.explanation}
                </p>
              ) : (
                <div className="mt-3">
                  <Button
                    onClick={onExplain}
                    disabled={isExplaining}
                    isLoading={isExplaining}
                    size="sm"
                    leftIcon={!isExplaining ? <Sparkles size={14} /> : undefined}
                    variant="secondary"
                    className="bg-white dark:bg-cyber-800 border-slate-200 dark:border-slate-700 text-violet-600 dark:text-violet-400 hover:border-violet-400 hover:shadow-sm"
                  >
                    {isExplaining ? 'AI is thinking...' : 'Ask AI for Explanation'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
