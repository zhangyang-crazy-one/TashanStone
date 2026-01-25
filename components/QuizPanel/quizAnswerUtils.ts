import type { QuizQuestion } from '../../types';

type QuizAnswerValue = number | number[] | string | string[] | null | undefined;

const toIndex = (value: QuizAnswerValue, options?: string[]): number => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return -1;

  const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  const normalized = value.trim().toUpperCase();

  if (letterToIndex[normalized] !== undefined) return letterToIndex[normalized];

  const numeric = parseInt(normalized, 10);
  if (!Number.isNaN(numeric) && numeric >= 0) return numeric;

  if (options) {
    const idx = options.findIndex(opt => opt.trim().toLowerCase() === value.trim().toLowerCase());
    if (idx !== -1) return idx;
  }

  return -1;
};

export const normalizeSelection = (answer: QuizAnswerValue, options?: string[]): number[] => {
  if (!Array.isArray(answer)) return [];
  return answer
    .map(value => toIndex(value, options))
    .filter((value): value is number => value >= 0);
};

export const getQuestionType = (question: QuizQuestion): QuizQuestion['type'] => {
  if (question.type) return question.type;
  if (question.options && question.options.length > 0) {
    return Array.isArray(question.correctAnswer) ? 'multiple' : 'single';
  }
  return 'text';
};

export const parseSingleAnswer = (
  userAns: QuizAnswerValue,
  correctAns: QuizAnswerValue,
  options?: string[]
): boolean => {
  if (userAns === undefined || userAns === null || correctAns === undefined || correctAns === null) {
    return false;
  }

  const userIdx = toIndex(userAns, options);
  const correctIdx = toIndex(correctAns, options);

  if (userIdx !== -1 && correctIdx !== -1) {
    return userIdx === correctIdx;
  }
  return false;
};

export const isAnswerCorrect = (
  userAns: QuizAnswerValue,
  correctAns: QuizAnswerValue,
  type: QuizQuestion['type'],
  options?: string[]
): boolean | null => {
  const normalize = (value: string) => value.trim().toLowerCase();

  switch (type) {
    case 'single':
      if (userAns === undefined || userAns === null || correctAns === undefined || correctAns === null) {
        return false;
      }
      if (typeof userAns === 'number' && typeof correctAns === 'number') {
        return userAns === correctAns;
      }
      return parseSingleAnswer(userAns, correctAns, options);

    case 'multiple': {
      const userArr = Array.isArray(userAns) ? userAns : [];
      const correctArr = Array.isArray(correctAns) ? correctAns : [];
      if (correctArr.length === 0 || userArr.length === 0) return false;
      if (userArr.length !== correctArr.length) return false;

      const userSet = new Set(userArr.map(value => String(value)));
      const correctSet = new Set(correctArr.map(value => String(value)));
      return [...correctSet].every(value => userSet.has(value));
    }

    case 'fill_blank': {
      const userStr = typeof userAns === 'string' ? normalize(userAns) : '';
      const correctStr = typeof correctAns === 'string' ? normalize(correctAns) : '';
      if (userStr === '' || correctStr === '') return false;
      if (userStr === correctStr) return true;

      const userNum = parseFloat(userStr);
      const correctNum = parseFloat(correctStr);
      if (!Number.isNaN(userNum) && !Number.isNaN(correctNum)) {
        return Math.abs(userNum - correctNum) <= Math.abs(correctNum) * 0.01;
      }
      return false;
    }

    case 'text':
      return null;

    default:
      if (options && options.length > 0) {
        return parseSingleAnswer(userAns, correctAns, options);
      }
      return null;
  }
};

export const isOptionSelected = (question: QuizQuestion, idx: number): boolean => {
  const ans = question.userAnswer;
  if (question.type === 'multiple') {
    if (Array.isArray(ans)) {
      return ans.some(value => value === idx || (typeof value === 'string' && parseInt(value, 10) === idx));
    }
    return false;
  }
  if (typeof ans === 'number') return ans === idx;
  if (typeof ans === 'string') return ans === question.options?.[idx] || parseInt(ans, 10) === idx;
  return false;
};

export const isOptionCorrect = (question: QuizQuestion, idx: number): boolean => {
  const correct = question.correctAnswer;
  if (question.type === 'multiple') {
    if (Array.isArray(correct)) {
      return correct.some(value => value === idx || (typeof value === 'string' && parseInt(value, 10) === idx));
    }
    return false;
  }
  if (typeof correct === 'number') return correct === idx;
  if (typeof correct === 'string') return parseInt(correct, 10) === idx;
  return false;
};

export const isAnswerEmpty = (answer: QuizAnswerValue): boolean => {
  if (answer === undefined || answer === null) return true;
  if (typeof answer === 'string') return answer.trim() === '';
  if (Array.isArray(answer)) return answer.length === 0;
  return false;
};

export const formatAnswer = (answer: QuizAnswerValue, options?: string[]): string => {
  if (Array.isArray(answer)) {
    return answer
      .map(value => (typeof value === 'number' && options ? options[value] : value))
      .join(', ');
  }
  if (typeof answer === 'number' && options) return options[answer] || String(answer);
  return String(answer ?? '');
};
