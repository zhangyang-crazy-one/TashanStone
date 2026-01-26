import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle, Clock } from 'lucide-react';

import type { ReviewTask, StudyPlan } from '../../types';

export interface RoadmapTask extends ReviewTask {
  planTitle: string;
  planId: string;
}

interface DateTaskCounts {
  pending: number;
  completed: number;
  overdue: number;
  future: number;
}

interface UseLearningRoadmapParams {
  studyPlans: StudyPlan[];
  onCreatePlan: (sourceType: 'file' | 'mistake', sourceId: string, title: string) => void;
  onDeletePlan: (planId: string) => void;
  language: 'en' | 'zh';
  showConfirmDialog?: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string,
    cancelText?: string
  ) => void;
}

export const useLearningRoadmap = ({
  studyPlans,
  onCreatePlan,
  onDeletePlan,
  language,
  showConfirmDialog
}: UseLearningRoadmapParams) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [newPlanSource, setNewPlanSource] = useState<'file' | 'mistake'>('file');
  const [newPlanSourceId, setNewPlanSourceId] = useState('');

  const t = useMemo(() => (language === 'zh' ? {
    title: '学习路线图',
    subtitle: '间隔重复学习 (SRS)',
    today: '今日概览',
    todayTasks: '待复习',
    overdueTasks: '已逾期',
    completedTasks: '已完成',
    viewMode: '视图模式',
    list: '列表',
    calendar: '日历',
    createPlan: '创建计划',
    deletePlan: '删除计划',
    noPlanYet: '暂无学习计划',
    createFirst: '创建第一个计划开始学习',
    planTitle: '计划标题',
    sourceType: '来源类型',
    sourceFile: '笔记文件',
    sourceMistake: '错题本',
    sourceId: '来源 ID',
    create: '创建',
    cancel: '取消',
    progress: '进度',
    tasks: '个任务',
    completed: '已完成',
    pending: '待完成',
    overdue: '已逾期',
    future: '未来',
    schedule: '复习计划',
    completeTask: '完成复习',
    confirmDelete: '确认删除此计划?',
    intervalLabels: {
      '5min': '5 分钟',
      '30min': '30 分钟',
      '12h': '12 小时',
      '1d': '1 天',
      '2d': '2 天',
      '4d': '4 天',
      '7d': '7 天',
      '15d': '15 天',
      '30d': '30 天',
      '60d': '60 天'
    },
    noTasksToday: '今日无复习任务',
    wellDone: '做得很好!',
    keepGoing: '继续保持!',
    reviewReminder: '记得定时复习',
    tags: '标签',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    months: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    prevMonth: '上个月',
    nextMonth: '下个月',
    goToday: '回到今天',
    selectedDateTasks: '当日任务'
  } : {
    title: 'Learning Roadmap',
    subtitle: 'Spaced Repetition System (SRS)',
    today: "Today's Overview",
    todayTasks: 'To Review',
    overdueTasks: 'Overdue',
    completedTasks: 'Completed',
    viewMode: 'View Mode',
    list: 'List',
    calendar: 'Calendar',
    createPlan: 'Create Plan',
    deletePlan: 'Delete Plan',
    noPlanYet: 'No study plans yet',
    createFirst: 'Create your first plan to get started',
    planTitle: 'Plan Title',
    sourceType: 'Source Type',
    sourceFile: 'Note File',
    sourceMistake: 'Mistake Record',
    sourceId: 'Source ID',
    create: 'Create',
    cancel: 'Cancel',
    progress: 'Progress',
    tasks: 'tasks',
    completed: 'Completed',
    pending: 'Pending',
    overdue: 'Overdue',
    future: 'Future',
    schedule: 'Review Schedule',
    completeTask: 'Complete Review',
    confirmDelete: 'Delete this plan?',
    intervalLabels: {
      '5min': '5 mins',
      '30min': '30 mins',
      '12h': '12 hours',
      '1d': '1 day',
      '2d': '2 days',
      '4d': '4 days',
      '7d': '7 days',
      '15d': '15 days',
      '30d': '30 days',
      '60d': '60 days'
    },
    noTasksToday: 'No tasks to review today',
    wellDone: 'Well done!',
    keepGoing: 'Keep going!',
    reviewReminder: 'Remember to review regularly',
    tags: 'Tags',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    prevMonth: 'Previous Month',
    nextMonth: 'Next Month',
    goToday: 'Go to Today',
    selectedDateTasks: 'Tasks on Selected Date'
  }), [language]);

  const togglePlanExpanded = useCallback((planId: string) => {
    setExpandedPlans(prev => {
      const next = new Set(prev);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  }, []);

  const todayTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();
    const tomorrowTs = todayTs + 86400000;

    return studyPlans.flatMap(plan =>
      plan.tasks
        .filter(task => task.status === 'pending' && task.scheduledDate >= todayTs && task.scheduledDate < tomorrowTs)
        .map(task => ({ ...task, planTitle: plan.title, planId: plan.id }))
    );
  }, [studyPlans]);

  const overdueTasks = useMemo(() => {
    const now = Date.now();
    return studyPlans.flatMap(plan =>
      plan.tasks
        .filter(task => task.status === 'pending' && task.scheduledDate < now)
        .map(task => ({ ...task, planTitle: plan.title, planId: plan.id }))
    );
  }, [studyPlans]);

  const completedToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    return studyPlans.flatMap(plan =>
      plan.tasks.filter(task => task.completedDate && task.completedDate >= todayTs)
    ).length;
  }, [studyPlans]);

  const getDaysInMonth = useCallback((date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }, []);

  const getFirstDayOfMonth = useCallback((date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }, []);

  const navigateMonth = useCallback((direction: 'prev' | 'next') => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  const getTasksForDate = useCallback((date: Date): RoadmapTask[] => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const startTs = startOfDay.getTime();
    const endTs = endOfDay.getTime();

    return studyPlans.flatMap(plan =>
      plan.tasks
        .filter(task => task.scheduledDate >= startTs && task.scheduledDate <= endTs)
        .map(task => ({ ...task, planTitle: plan.title, planId: plan.id }))
    );
  }, [studyPlans]);

  const selectedDateTasks = useMemo(() => getTasksForDate(selectedDate), [getTasksForDate, selectedDate]);

  const dateHasTasks = useCallback((date: Date): DateTaskCounts => {
    const tasks = getTasksForDate(date);
    return {
      pending: tasks.filter(task => task.status === 'pending').length,
      completed: tasks.filter(task => task.status === 'completed').length,
      overdue: tasks.filter(task => task.status === 'overdue').length,
      future: tasks.filter(task => task.status === 'future').length
    };
  }, [getTasksForDate]);

  const isToday = useCallback((date: Date): boolean => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  }, []);

  const isSelected = useCallback((date: Date): boolean => {
    return date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear();
  }, [selectedDate]);

  const formatDate = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [language]);

  const getTaskStatusIcon = useCallback((status: ReviewTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="text-green-400" size={20} />;
      case 'overdue':
        return <AlertTriangle className="text-red-400" size={20} />;
      case 'pending':
        return <Clock className="text-yellow-400" size={20} />;
      case 'future':
        return <Calendar className="text-[rgb(var(--text-secondary))]" size={20} />;
    }
  }, []);

  const getTaskStatusColor = useCallback((status: ReviewTask['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 border-green-500/30 text-green-400';
      case 'overdue':
        return 'bg-red-500/20 border-red-500/30 text-red-400';
      case 'pending':
        return 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400';
      case 'future':
        return 'bg-[rgb(var(--bg-element))] border-[rgb(var(--border-main))] text-[rgb(var(--text-secondary))]';
    }
  }, []);

  const handleCreatePlan = useCallback(() => {
    if (!newPlanTitle.trim() || !newPlanSourceId.trim()) return;
    onCreatePlan(newPlanSource, newPlanSourceId, newPlanTitle);
    setNewPlanTitle('');
    setNewPlanSourceId('');
    setShowCreateModal(false);
  }, [newPlanTitle, newPlanSource, newPlanSourceId, onCreatePlan]);

  const handleDeletePlan = useCallback((planId: string) => {
    if (showConfirmDialog) {
      showConfirmDialog(
        t.confirmDelete || 'Confirm Delete',
        'Are you sure you want to delete this study plan?',
        () => onDeletePlan(planId),
        'danger',
        'Delete',
        'Cancel'
      );
    } else if (window.confirm(t.confirmDelete)) {
      onDeletePlan(planId);
    }
  }, [onDeletePlan, showConfirmDialog, t.confirmDelete]);

  return {
    t,
    selectedDate,
    setSelectedDate,
    viewMode,
    setViewMode,
    expandedPlans,
    showCreateModal,
    setShowCreateModal,
    newPlanTitle,
    setNewPlanTitle,
    newPlanSource,
    setNewPlanSource,
    newPlanSourceId,
    setNewPlanSourceId,
    todayTasks,
    overdueTasks,
    completedToday,
    selectedDateTasks,
    dateHasTasks,
    isToday,
    isSelected,
    getDaysInMonth,
    getFirstDayOfMonth,
    navigateMonth,
    goToToday,
    formatDate,
    getTaskStatusIcon,
    getTaskStatusColor,
    handleCreatePlan,
    handleDeletePlan,
    togglePlanExpanded
  };
};
