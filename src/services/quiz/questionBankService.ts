import { QuestionBank, QuizQuestion, QuestionBankStats, AIConfig } from '../../../types';
import { generateQuiz, extractQuizFromRawContent } from '../../../services/aiService';

const STORAGE_KEY = 'neon-question-banks';

export class QuestionBankService {
  private banks: QuestionBank[] = [];
  private initialized: boolean = false;

  private statsCache: Map<string, {
    stats: QuestionBankStats;
    timestamp: number
  }> = new Map();
  private readonly CACHE_TTL = 5000;

  // 批量计算缓存：避免重复计算
  private allStatsCache: {
    stats: { totalBanks: number; totalQuestions: number; byDifficulty: Record<string, number> };
    timestamp: number;
  } | null = null;
  private readonly ALL_STATS_TTL = 10000; // 10秒

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.banks = JSON.parse(saved);
      }
      this.initialized = true;
    } catch (error) {
      console.error('[QuestionBankService] Failed to initialize:', error);
      this.banks = [];
      this.initialized = true;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.banks));
    } catch (error) {
      console.error('[QuestionBankService] Failed to save:', error);
    }
  }

  getAllBanks(): QuestionBank[] {
    return [...this.banks];
  }

  getBankById(id: string): QuestionBank | undefined {
    return this.banks.find(b => b.id === id);
  }

  async createBank(name: string, description?: string): Promise<QuestionBank> {
    await this.initialize();
    
    const bank: QuestionBank = {
      id: `bank_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      description,
      tags: [],
      questions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sourceFileIds: []
    };

    this.banks.push(bank);
    this.save();
    return bank;
  }

  async updateBank(id: string, updates: Partial<QuestionBank>): Promise<QuestionBank | null> {
    await this.initialize();
    
    const index = this.banks.findIndex(b => b.id === id);
    if (index === -1) return null;

    this.banks[index] = {
      ...this.banks[index],
      ...updates,
      updatedAt: Date.now()
    };
    
    this.invalidateCache(id);
    this.save();
    return this.banks[index];
  }

  async deleteBank(id: string): Promise<boolean> {
    await this.initialize();
    
    const index = this.banks.findIndex(b => b.id === id);
    if (index === -1) return false;

    this.banks.splice(index, 1);
    this.invalidateCache(id);
    this.save();
    return true;
  }

  async addQuestionsToBank(bankId: string, questions: QuizQuestion[]): Promise<boolean> {
    await this.initialize();
    
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return false;

    const timestamp = Date.now();
    const newQuestions = questions.map(q => ({
      ...q,
      questionBankId: bankId,
      lastUsed: timestamp,
      id: q.id || `q_${timestamp}_${Math.random().toString(36).substring(2, 9)}`
    }));

    bank.questions.push(...newQuestions);
    bank.updatedAt = Date.now();
    
    // Update source file IDs
    const sourceFileIds = new Set([...bank.sourceFileIds]);
    newQuestions.forEach(q => {
      if (q.sourceFileId) {
        sourceFileIds.add(q.sourceFileId);
      }
    });
    bank.sourceFileIds = Array.from(sourceFileIds);

    this.invalidateCache(bankId);
    this.save();
    return true;
  }

  async removeQuestion(bankId: string, questionId: string): Promise<boolean> {
    await this.initialize();
    
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return false;

    const index = bank.questions.findIndex(q => q.id === questionId);
    if (index === -1) return false;

    bank.questions.splice(index, 1);
    bank.updatedAt = Date.now();
    this.invalidateCache(bankId);
    this.save();
    return true;
  }

  async generateAndAddQuestions(
    bankId: string,
    sourceContent: string,
    aiConfig: AIConfig,
    options?: { count?: number; difficulty?: string }
  ): Promise<QuizQuestion[]> {
    await this.initialize();
    
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) throw new Error('Bank not found');

    const count = options?.count || 5;
    
    try {
      const quiz = await generateQuiz(sourceContent, aiConfig);
      
      if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        throw new Error('Failed to generate questions');
      }

      const newQuestions: QuizQuestion[] = quiz.questions.slice(0, count).map(q => ({
        ...q,
        questionBankId: bankId,
        sourceFileId: bank.sourceFileIds[0],
        created: Date.now(),
        timesUsed: 0,
        successRate: 0
      }));

      await this.addQuestionsToBank(bankId, newQuestions);
      return newQuestions;
    } catch (error) {
      console.error('[QuestionBankService] Failed to generate questions:', error);
      throw error;
    }
  }

  getBankStats(bankId: string): QuestionBankStats | null {
    const cached = this.statsCache.get(bankId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.stats;
    }

    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return null;

    const stats = this.calculateStats(bank);

    this.statsCache.set(bankId, {
      stats,
      timestamp: Date.now()
    });

    // 批量缓存也失效
    this.allStatsCache = null;

    return stats;
  }

  // 批量获取所有题库的统计信息
  getAllBanksStats(): { totalBanks: number; totalQuestions: number; byDifficulty: Record<string, number> } {
    const now = Date.now();

    if (this.allStatsCache && now - this.allStatsCache.timestamp < this.ALL_STATS_TTL) {
      return this.allStatsCache.stats;
    }

    const result = {
      totalBanks: this.banks.length,
      totalQuestions: 0,
      byDifficulty: {} as Record<string, number>
    };

    for (const bank of this.banks) {
      result.totalQuestions += bank.questions.length;

      for (const q of bank.questions) {
        if (q.difficulty) {
          result.byDifficulty[q.difficulty] = (result.byDifficulty[q.difficulty] || 0) + 1;
        }
      }
    }

    this.allStatsCache = {
      stats: result,
      timestamp: now
    };

    return result;
  }

  private calculateStats(bank: QuestionBank): QuestionBankStats {
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
      averageSuccessRate: questionsWithStats > 0
        ? Math.round(totalSuccessRate / questionsWithStats)
        : 0
    };
  }

  private invalidateCache(bankId: string): void {
    this.statsCache.delete(bankId);
  }

  recordQuestionUsage(bankId: string, questionId: string, isCorrect: boolean): void {
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return;

    const question = bank.questions.find(q => q.id === questionId);
    if (!question) return;

    question.timesUsed = (question.timesUsed || 0) + 1;
    
    if (question.successRate === undefined) {
      question.successRate = isCorrect ? 100 : 0;
    } else {
      const total = question.timesUsed;
      const correct = Math.round((question.successRate / 100) * (total - 1)) + (isCorrect ? 1 : 0);
      question.successRate = Math.round((correct / total) * 100);
    }
    
    question.lastUsed = Date.now();
    this.invalidateCache(bankId);
    this.save();
  }

  searchQuestions(bankId: string, query: string): QuizQuestion[] {
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return [];

    const lowerQuery = query.toLowerCase();
    return bank.questions.filter(q =>
      q.question.toLowerCase().includes(lowerQuery) ||
      q.explanation?.toLowerCase().includes(lowerQuery) ||
      q.tags?.some(t => t.toLowerCase().includes(lowerQuery))
    );
  }

  getQuestionsByTag(bankId: string, tag: string): QuizQuestion[] {
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return [];

    return bank.questions.filter(q => q.tags?.includes(tag));
  }

  getQuestionsByDifficulty(bankId: string, difficulty: string): QuizQuestion[] {
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return [];

    return bank.questions.filter(q => q.difficulty === difficulty);
  }

  importQuestions(bankId: string, questions: QuizQuestion[]): number {
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return 0;

    const existingIds = new Set(bank.questions.map(q => q.id));
    const newQuestions: QuizQuestion[] = [];
    const timestamp = Date.now();

    questions.forEach(q => {
      if (!existingIds.has(q.id)) {
        newQuestions.push({
          ...q,
          questionBankId: bankId,
          created: q.created || timestamp,
          timesUsed: q.timesUsed || 0,
          successRate: q.successRate || 0
        });
      }
    });

    bank.questions.push(...newQuestions);
    bank.updatedAt = Date.now();
    this.invalidateCache(bankId);
    this.save();
    return newQuestions.length;
  }

  exportBank(bankId: string): string | null {
    const bank = this.banks.find(b => b.id === bankId);
    if (!bank) return null;

    return JSON.stringify(bank, null, 2);
  }

  async importFromJson(bankId: string, jsonContent: string): Promise<number> {
    try {
      const data = JSON.parse(jsonContent);
      if (!data.questions || !Array.isArray(data.questions)) {
        throw new Error('Invalid format');
      }

      const questions: QuizQuestion[] = data.questions.map((q: any) => ({
        id: q.id || `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        type: q.type || 'single',
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        tags: q.tags || [],
        knowledgePoints: q.knowledgePoints,
        sourceFileId: q.sourceFileId,
        questionBankId: bankId,
        created: q.created || Date.now(),
        timesUsed: q.timesUsed || 0,
        successRate: q.successRate || 0
      }));

      return this.importQuestions(bankId, questions);
    } catch (error) {
      console.error('[QuestionBankService] Failed to import:', error);
      throw new Error('Invalid JSON format');
    }
  }
}

export const questionBankService = new QuestionBankService();
