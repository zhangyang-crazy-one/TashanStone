import type { Quiz, QuizQuestion } from '../../types';

export const prepareQuizQuestionsForBank = (quiz: Quiz, sourceFileId?: string): QuizQuestion[] => {
  const now = Date.now();

  return quiz.questions.map((question, index) => {
    const { userAnswer, isCorrect, gradingResult, ...rest } = question;
    const created = question.created ?? now;
    const timesUsed = Number.isFinite(question.timesUsed) ? question.timesUsed : 0;
    const successRate = Number.isFinite(question.successRate) ? question.successRate : 0;
    const id = question.id || `${quiz.id}-${index}`;

    return {
      ...rest,
      id,
      created,
      timesUsed,
      successRate,
      sourceFileId: question.sourceFileId || quiz.sourceFileId || sourceFileId
    };
  });
};
