import { StudyPlan, ReviewTask, MistakeRecord, MarkdownFile } from '../../../types';

// 艾宾浩斯遗忘曲线间隔 (毫秒)
export const SRS_INTERVALS = [
  { label: '5 mins', ms: 5 * 60 * 1000, multiplier: 0 },
  { label: '30 mins', ms: 30 * 60 * 1000, multiplier: 1 },
  { label: '12 hours', ms: 12 * 60 * 60 * 1000, multiplier: 2 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000, multiplier: 3 },
  { label: '2 days', ms: 2 * 24 * 60 * 60 * 1000, multiplier: 4 },
  { label: '4 days', ms: 4 * 24 * 60 * 60 * 1000, multiplier: 5 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000, multiplier: 6 },
  { label: '15 days', ms: 15 * 24 * 60 * 60 * 1000, multiplier: 7 },
];

const STORAGE_KEY = 'neon-study-plans';

export class SRSService {
  private plans: StudyPlan[] = [];

  async initialize(): Promise<void> {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.plans = JSON.parse(saved);
      }
    } catch (error) {
      console.error('[SRSService] Failed to initialize:', error);
      this.plans = [];
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.plans));
    } catch (error) {
      console.error('[SRSService] Failed to save:', error);
    }
  }

  getAllPlans(): StudyPlan[] {
    return [...this.plans];
  }

  getPlanById(id: string): StudyPlan | undefined {
    return this.plans.find(p => p.id === id);
  }

  createStudyPlanForFile(file: MarkdownFile, title?: string): StudyPlan {
    const now = Date.now();
    const tasks: ReviewTask[] = SRS_INTERVALS.map((interval, index) => ({
      id: `task_${now}_${index}`,
      scheduledDate: now + interval.ms,
      status: index === 0 ? 'pending' : 'future',
      intervalLabel: interval.label
    }));

    const plan: StudyPlan = {
      id: `plan_${now}_${Math.random().toString(36).substring(2, 9)}`,
      title: title || `Review: ${file.name}`,
      sourceType: 'file',
      sourceId: file.id,
      createdDate: now,
      tasks,
      progress: 0
    };

    this.plans.push(plan);
    this.save();
    return plan;
  }

  createStudyPlanForMistake(mistake: MistakeRecord, quizTitle?: string): StudyPlan {
    const now = Date.now();
    const tasks: ReviewTask[] = SRS_INTERVALS.map((interval, index) => ({
      id: `task_${now}_${index}`,
      scheduledDate: now + interval.ms,
      status: index === 0 ? 'pending' : 'future',
      intervalLabel: interval.label
    }));

    const plan: StudyPlan = {
      id: `plan_${now}_${Math.random().toString(36).substring(2, 9)}`,
      title: quizTitle 
        ? `Mistake Review: ${quizTitle}`
        : `Mistake Review: ${mistake.question.substring(0, 30)}...`,
      sourceType: 'mistake',
      sourceId: mistake.id,
      createdDate: now,
      tasks,
      progress: 0
    };

    this.plans.push(plan);
    this.save();
    return plan;
  }

  markTaskComplete(planId: string, taskId: string): StudyPlan | null {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return null;

    const taskIndex = plan.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return null;

    // Mark current task as completed
    plan.tasks[taskIndex] = {
      ...plan.tasks[taskIndex],
      status: 'completed',
      completedDate: Date.now()
    };

    // Calculate progress
    const completedCount = plan.tasks.filter(t => t.status === 'completed').length;
    plan.progress = Math.round((completedCount / plan.tasks.length) * 100);

    // Advance future tasks if this was the first pending task
    if (taskIndex === 0) {
      for (let i = 1; i < plan.tasks.length; i++) {
        if (plan.tasks[i].status === 'future') {
          plan.tasks[i] = {
            ...plan.tasks[i],
            status: 'pending',
            scheduledDate: Date.now() + SRS_INTERVALS[i].ms
          };
          break;
        }
      }
    }

    this.save();
    return plan;
  }

  getTaskStatus(task: ReviewTask): 'pending' | 'completed' | 'overdue' | 'future' {
    if (task.status === 'completed') return 'completed';
    if (task.status === 'future') return 'future';
    
    // Check if overdue
    if (task.scheduledDate < Date.now()) {
      return 'overdue';
    }
    
    return 'pending';
  }

  getOverdueTasks(): Array<{ plan: StudyPlan; task: ReviewTask }> {
    const overdue: Array<{ plan: StudyPlan; task: ReviewTask }> = [];
    
    this.plans.forEach(plan => {
      plan.tasks.forEach(task => {
        const status = this.getTaskStatus(task);
        if (status === 'overdue') {
          overdue.push({ plan, task });
        }
      });
    });
    
    return overdue;
  }

  getTodaysTasks(): Array<{ plan: StudyPlan; task: ReviewTask }> {
    const today: Array<{ plan: StudyPlan; task: ReviewTask }> = [];
    const now = Date.now();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    this.plans.forEach(plan => {
      plan.tasks.forEach(task => {
        if (task.status === 'pending' && task.scheduledDate <= endOfDay.getTime()) {
          today.push({ plan, task });
        }
      });
    });
    
    return today;
  }

  deletePlan(planId: string): boolean {
    const index = this.plans.findIndex(p => p.id === planId);
    if (index === -1) return false;
    
    this.plans.splice(index, 1);
    this.save();
    return true;
  }

  updatePlan(planId: string, updates: Partial<StudyPlan>): StudyPlan | null {
    const index = this.plans.findIndex(p => p.id === planId);
    if (index === -1) return null;
    
    this.plans[index] = {
      ...this.plans[index],
      ...updates
    };
    this.save();
    return this.plans[index];
  }

  // Get statistics
  getStats(): {
    totalPlans: number;
    completedPlans: number;
    overdueTasks: number;
    todaysTasks: number;
  } {
    const completedPlans = this.plans.filter(p => p.progress === 100).length;
    const overdueTasks = this.getOverdueTasks().length;
    const todaysTasks = this.getTodaysTasks().length;
    
    return {
      totalPlans: this.plans.length,
      completedPlans,
      overdueTasks,
      todaysTasks
    };
  }
}

export const srsService = new SRSService();
