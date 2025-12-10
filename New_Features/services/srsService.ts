
import { StudyPlan, ReviewTask, MarkdownFile, MistakeRecord } from '../types';

const STORAGE_KEY = 'neon-srs-plans';

// Ebbinghaus Forgetting Curve Intervals (in ms)
// 5m, 30m, 12h, 1d, 2d, 4d, 7d, 15d
const INTERVALS = [
    { label: '5 mins', ms: 5 * 60 * 1000 },
    { label: '30 mins', ms: 30 * 60 * 1000 },
    { label: '12 hours', ms: 12 * 60 * 60 * 1000 },
    { label: '1 day', ms: 24 * 60 * 60 * 1000 },
    { label: '2 days', ms: 2 * 24 * 60 * 60 * 1000 },
    { label: '4 days', ms: 4 * 24 * 60 * 60 * 1000 },
    { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: '15 days', ms: 15 * 24 * 60 * 60 * 1000 },
];

export const getStudyPlans = (): StudyPlan[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error("Failed to load study plans", e);
        return [];
    }
};

const saveStudyPlans = (plans: StudyPlan[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
};

const generateTasks = (startTime: number): ReviewTask[] => {
    return INTERVALS.map((interval, index) => ({
        id: `task-${startTime}-${index}`,
        scheduledDate: startTime + interval.ms,
        status: 'future', // Initial state, will be calculated dynamically on render
        intervalLabel: interval.label
    }));
};

export const createStudyPlanForFile = (file: MarkdownFile): StudyPlan => {
    const plans = getStudyPlans();
    
    // Check if plan already exists for this file
    const existing = plans.find(p => p.sourceId === file.id && p.sourceType === 'file');
    if (existing) return existing;

    const newPlan: StudyPlan = {
        id: `plan-file-${file.id}-${Date.now()}`,
        title: `Study: ${file.name}`,
        sourceType: 'file',
        sourceId: file.id,
        createdDate: Date.now(),
        tasks: generateTasks(Date.now()),
        progress: 0,
        tags: [] // Could extract tags from file content
    };

    saveStudyPlans([newPlan, ...plans]);
    return newPlan;
};

export const createStudyPlanForMistake = (mistake: MistakeRecord): StudyPlan => {
    const plans = getStudyPlans();
    
    // Check uniqueness (don't duplicate if recently added)
    const existing = plans.find(p => p.sourceId === mistake.id);
    if (existing) return existing;

    const shortQ = mistake.question.length > 30 ? mistake.question.substring(0, 30) + '...' : mistake.question;

    const newPlan: StudyPlan = {
        id: `plan-mistake-${mistake.id}`,
        title: `Mistake: ${shortQ}`,
        sourceType: 'mistake',
        sourceId: mistake.id,
        createdDate: Date.now(),
        tasks: generateTasks(Date.now()),
        progress: 0,
        tags: ['mistake']
    };

    saveStudyPlans([newPlan, ...plans]);
    return newPlan;
};

export const markTaskComplete = (planId: string, taskId: string) => {
    const plans = getStudyPlans();
    const planIndex = plans.findIndex(p => p.id === planId);
    
    if (planIndex === -1) return;

    const plan = plans[planIndex];
    const taskIndex = plan.tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex !== -1) {
        plan.tasks[taskIndex].status = 'completed';
        plan.tasks[taskIndex].completedDate = Date.now();
        
        // Recalculate progress
        const completed = plan.tasks.filter(t => t.status === 'completed').length;
        plan.progress = Math.round((completed / plan.tasks.length) * 100);
        
        plans[planIndex] = plan;
        saveStudyPlans(plans);
    }
};

export const deleteStudyPlan = (planId: string) => {
    const plans = getStudyPlans().filter(p => p.id !== planId);
    saveStudyPlans(plans);
};

export const getTaskStatus = (task: ReviewTask): 'pending' | 'completed' | 'overdue' | 'future' => {
    if (task.status === 'completed') return 'completed';
    
    const now = Date.now();
    // Allow a small buffer? No, let's say if it's past time, it's pending or overdue
    if (now < task.scheduledDate) return 'future';
    
    // If more than 24 hours late (or relative to interval), mark overdue?
    // Simple logic: if > 1 day late, overdue.
    if (now > task.scheduledDate + 24 * 60 * 60 * 1000) return 'overdue';
    
    return 'pending';
};
