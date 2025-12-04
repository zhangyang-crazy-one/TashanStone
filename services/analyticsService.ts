
import { ExamResult, Quiz, QuizQuestion, KnowledgePointStat } from '../types';

const HISTORY_KEY = 'neon-exam-history';

export const saveExamResult = (quiz: Quiz, duration: number) => {
    try {
        const history: ExamResult[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        
        // Collect tags from all questions for high-level indexing
        const allTags = new Set<string>();
        quiz.questions.forEach(q => {
            q.tags?.forEach(t => allTags.add(t));
            q.knowledgePoints?.forEach(kp => allTags.add(kp));
        });

        const correctCount = quiz.questions.filter(q => q.isCorrect).length;
        const total = quiz.questions.length;
        const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;

        const result: ExamResult = {
            id: `exam-res-${Date.now()}`,
            quizTitle: quiz.title,
            date: Date.now(),
            score: quiz.score || score, // Use pre-calculated score if available, or calc fresh
            totalQuestions: total,
            correctCount,
            duration, // in seconds
            tags: Array.from(allTags)
        };

        // Prepend new result
        const updatedHistory = [result, ...history];
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
        
        // Also update detailed question log for mastery calc? 
        // For simplicity, we'll re-calculate mastery from a separate "question log" if needed, 
        // but to keep it simple, we will store a separate "QuestionLog" or just allow the Analytics service to parse 
        // detailed results if we stored them. 
        // Let's store detailed breakdown in a separate key to avoid bloating the main history list if it gets large.
        // Actually, for this scale, let's just append detailed stats to a 'neon-mastery-log'
        saveMasteryLog(quiz);

    } catch (e) {
        console.error("Failed to save exam result", e);
    }
};

const saveMasteryLog = (quiz: Quiz) => {
    try {
        const logKey = 'neon-mastery-log';
        const log = JSON.parse(localStorage.getItem(logKey) || '[]');
        
        const newEntries = quiz.questions.map(q => ({
            questionId: q.id,
            tags: [...(q.tags || []), ...(q.knowledgePoints || [])],
            isCorrect: !!q.isCorrect,
            timestamp: Date.now()
        }));

        localStorage.setItem(logKey, JSON.stringify([...log, ...newEntries]));
    } catch (e) {
        console.error("Failed to save mastery log", e);
    }
};

export const getExamHistory = (): ExamResult[] => {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
        return [];
    }
};

export const getMasteryData = (): KnowledgePointStat[] => {
    try {
        const log = JSON.parse(localStorage.getItem('neon-mastery-log') || '[]');
        const statsMap = new Map<string, { total: number, correct: number }>();

        log.forEach((entry: any) => {
            entry.tags.forEach((tag: string) => {
                // Normalize tag
                const normTag = tag.trim(); 
                if (!statsMap.has(normTag)) {
                    statsMap.set(normTag, { total: 0, correct: 0 });
                }
                const stat = statsMap.get(normTag)!;
                stat.total += 1;
                if (entry.isCorrect) stat.correct += 1;
            });
        });

        return Array.from(statsMap.entries()).map(([tag, data]) => ({
            tag,
            totalQuestions: data.total,
            correctQuestions: data.correct,
            accuracy: Math.round((data.correct / data.total) * 100)
        })).sort((a, b) => b.totalQuestions - a.totalQuestions); // Sort by most practiced

    } catch {
        return [];
    }
};

export const identifyWeakAreas = (threshold = 60): KnowledgePointStat[] => {
    const data = getMasteryData();
    // Filter for weak areas with at least 3 attempts to be statistically somewhat relevant
    return data.filter(d => d.accuracy < threshold && d.totalQuestions >= 3);
};
