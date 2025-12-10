import { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  BookOpen,
  Plus,
  Trash2,
  List,
  CalendarDays,
  Target,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  ChevronLeft
} from 'lucide-react';
import { StudyPlan, ReviewTask } from '../types';

interface LearningRoadmapProps {
  studyPlans: StudyPlan[];
  onCompleteTask: (planId: string, taskId: string) => void;
  onCreatePlan: (sourceType: 'file' | 'mistake', sourceId: string, title: string) => void;
  onDeletePlan: (planId: string) => void;
  language?: 'en' | 'zh';
  showConfirmDialog?: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string,
    cancelText?: string
  ) => void;
}

export const LearningRoadmap = ({
  studyPlans,
  onCompleteTask,
  onCreatePlan,
  onDeletePlan,
  language = 'en',
  showConfirmDialog
}: LearningRoadmapProps) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [newPlanSource, setNewPlanSource] = useState<'file' | 'mistake'>('file');
  const [newPlanSourceId, setNewPlanSourceId] = useState('');

  const t = language === 'zh' ? {
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
  };

  const togglePlanExpanded = (planId: string) => {
    const newExpanded = new Set(expandedPlans);
    if (newExpanded.has(planId)) {
      newExpanded.delete(planId);
    } else {
      newExpanded.add(planId);
    }
    setExpandedPlans(newExpanded);
  };

  // Calculate today's tasks
  const todayTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();
    const tomorrowTs = todayTs + 86400000;

    return studyPlans.flatMap(plan =>
      plan.tasks
        .filter(t => t.status === 'pending' && t.scheduledDate >= todayTs && t.scheduledDate < tomorrowTs)
        .map(t => ({ ...t, planTitle: plan.title, planId: plan.id }))
    );
  }, [studyPlans]);

  // Calculate overdue tasks
  const overdueTasks = useMemo(() => {
    const now = Date.now();
    return studyPlans.flatMap(plan =>
      plan.tasks
        .filter(t => t.status === 'pending' && t.scheduledDate < now)
        .map(t => ({ ...t, planTitle: plan.title, planId: plan.id }))
    );
  }, [studyPlans]);

  // Calculate completed tasks today
  const completedToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = today.getTime();

    return studyPlans.flatMap(plan =>
      plan.tasks.filter(t => t.completedDate && t.completedDate >= todayTs)
    ).length;
  }, [studyPlans]);

  // Calendar helper functions
  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // Get tasks for a specific date
  const getTasksForDate = (date: Date) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const startTs = startOfDay.getTime();
    const endTs = endOfDay.getTime();

    return studyPlans.flatMap(plan =>
      plan.tasks
        .filter(t => t.scheduledDate >= startTs && t.scheduledDate <= endTs)
        .map(t => ({ ...t, planTitle: plan.title, planId: plan.id }))
    );
  };

  // Get tasks for selected date
  const selectedDateTasks = useMemo(() => {
    return getTasksForDate(selectedDate);
  }, [studyPlans, selectedDate]);

  // Check if a date has tasks
  const dateHasTasks = (date: Date): { pending: number; completed: number; overdue: number; future: number } => {
    const tasks = getTasksForDate(date);
    return {
      pending: tasks.filter(t => t.status === 'pending').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      overdue: tasks.filter(t => t.status === 'overdue').length,
      future: tasks.filter(t => t.status === 'future').length
    };
  };

  // Check if date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  // Check if date is selected
  const isSelected = (date: Date): boolean => {
    return date.getDate() === selectedDate.getDate() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getFullYear() === selectedDate.getFullYear();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTaskStatusIcon = (status: ReviewTask['status']) => {
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
  };

  const getTaskStatusColor = (status: ReviewTask['status']) => {
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
  };

  const handleCreatePlan = () => {
    if (!newPlanTitle.trim() || !newPlanSourceId.trim()) return;
    onCreatePlan(newPlanSource, newPlanSourceId, newPlanTitle);
    setNewPlanTitle('');
    setNewPlanSourceId('');
    setShowCreateModal(false);
  };

  const handleDeletePlan = (planId: string) => {
    if (showConfirmDialog) {
      showConfirmDialog(
        t.confirmDelete || 'Confirm Delete',
        'Are you sure you want to delete this study plan?',
        () => onDeletePlan(planId),
        'danger',
        'Delete',
        'Cancel'
      );
    } else {
      // Fallback to native confirm
      if (window.confirm(t.confirmDelete)) {
        onDeletePlan(planId);
      }
    }
  };

  if (studyPlans.length === 0 && !showCreateModal) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))]">
        <BookOpen size={64} className="text-[rgb(var(--text-secondary))] mb-4" />
        <p className="text-xl text-[rgb(var(--text-secondary))] mb-2">{t.noPlanYet}</p>
        <p className="text-sm text-[rgb(var(--text-secondary))] mb-6">{t.createFirst}</p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-[rgb(var(--primary-500))] hover:bg-[rgb(var(--primary-600))] text-white rounded flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          {t.createPlan}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))] custom-scrollbar">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Target size={32} className="text-[rgb(var(--primary-500))]" />
              <div>
                <h1 className="text-3xl font-bold text-[rgb(var(--primary-500))]">{t.title}</h1>
                <p className="text-sm text-[rgb(var(--text-secondary))]">{t.subtitle}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-[rgb(var(--bg-panel))] rounded p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors ${
                  viewMode === 'list'
                    ? 'bg-[rgb(var(--primary-500))] text-white'
                    : 'text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
                }`}
              >
                <List size={16} />
                {t.list}
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-[rgb(var(--primary-500))] text-white'
                    : 'text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
                }`}
              >
                <CalendarDays size={16} />
                {t.calendar}
              </button>
            </div>

            {/* Create Plan Button */}
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[rgb(var(--primary-500))] hover:bg-[rgb(var(--primary-600))] text-white rounded flex items-center gap-2 transition-colors"
            >
              <Plus size={18} />
              {t.createPlan}
            </button>
          </div>
        </div>

        {/* Today's Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))] hover:border-yellow-500 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <Clock className="text-yellow-400" size={24} />
              <span className="text-3xl font-bold text-yellow-400">{todayTasks.length}</span>
            </div>
            <p className="text-sm text-[rgb(var(--text-secondary))]">{t.todayTasks}</p>
          </div>

          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))] hover:border-red-500 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="text-red-400" size={24} />
              <span className="text-3xl font-bold text-red-400">{overdueTasks.length}</span>
            </div>
            <p className="text-sm text-[rgb(var(--text-secondary))]">{t.overdueTasks}</p>
          </div>

          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))] hover:border-green-500 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="text-green-400" size={24} />
              <span className="text-3xl font-bold text-green-400">{completedToday}</span>
            </div>
            <p className="text-sm text-[rgb(var(--text-secondary))]">{t.completedTasks}</p>
          </div>
        </div>

        {/* Calendar View */}
        {viewMode === 'calendar' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar Grid */}
            <div className="lg:col-span-2 bg-[rgb(var(--bg-panel))] rounded-lg border border-[rgb(var(--border-main))] overflow-hidden">
              {/* Calendar Header */}
              <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border-main))] bg-[rgb(var(--bg-element))]/50">
                <button
                  onClick={() => navigateMonth('prev')}
                  className="p-2 rounded-lg hover:bg-[rgb(var(--bg-element))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
                  title={t.prevMonth}
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-[rgb(var(--text-primary))]">
                    {t.months[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                  </h3>
                  <button
                    onClick={goToToday}
                    className="px-2 py-1 text-xs bg-[rgb(var(--primary-500))]/20 text-[rgb(var(--primary-500))] rounded hover:bg-[rgb(var(--primary-500))]/30 transition-colors"
                  >
                    {t.goToday}
                  </button>
                </div>
                <button
                  onClick={() => navigateMonth('next')}
                  className="p-2 rounded-lg hover:bg-[rgb(var(--bg-element))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
                  title={t.nextMonth}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Weekday Headers */}
              <div className="grid grid-cols-7 border-b border-[rgb(var(--border-main))]">
                {t.weekdays.map((day: string, index: number) => (
                  <div
                    key={index}
                    className={`p-3 text-center text-sm font-medium ${
                      index === 0 || index === 6
                        ? 'text-red-400'
                        : 'text-[rgb(var(--text-secondary))]'
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days Grid */}
              <div className="grid grid-cols-7">
                {(() => {
                  const daysInMonth = getDaysInMonth(selectedDate);
                  const firstDay = getFirstDayOfMonth(selectedDate);
                  const cells: React.ReactElement[] = [];

                  // Previous month empty cells
                  for (let i = 0; i < firstDay; i++) {
                    cells.push(
                      <div
                        key={`empty-${i}`}
                        className="p-2 min-h-[80px] border-r border-b border-[rgb(var(--border-main))]/30 bg-[rgb(var(--bg-element))]/20"
                      />
                    );
                  }

                  // Current month days
                  for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                    const taskCounts = dateHasTasks(date);
                    const hasAnyTask = taskCounts.pending + taskCounts.completed + taskCounts.overdue + taskCounts.future > 0;
                    const dayIsToday = isToday(date);
                    const dayIsSelected = isSelected(date);
                    const dayOfWeek = (firstDay + day - 1) % 7;
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                    cells.push(
                      <div
                        key={day}
                        onClick={() => setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day))}
                        className={`
                          p-2 min-h-[80px] border-r border-b border-[rgb(var(--border-main))]/30 cursor-pointer
                          transition-colors relative group
                          ${dayIsSelected ? 'bg-[rgb(var(--primary-500))]/10 ring-2 ring-[rgb(var(--primary-500))] ring-inset' : ''}
                          ${dayIsToday && !dayIsSelected ? 'bg-yellow-500/10' : ''}
                          ${!dayIsSelected && !dayIsToday ? 'hover:bg-[rgb(var(--bg-element))]/50' : ''}
                        `}
                      >
                        <div className={`
                          text-sm font-medium mb-1 flex items-center justify-center w-7 h-7 rounded-full
                          ${dayIsToday ? 'bg-[rgb(var(--primary-500))] text-white' : ''}
                          ${isWeekend && !dayIsToday ? 'text-red-400' : ''}
                          ${!isWeekend && !dayIsToday ? 'text-[rgb(var(--text-primary))]' : ''}
                        `}>
                          {day}
                        </div>

                        {/* Task Indicators */}
                        {hasAnyTask && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {taskCounts.overdue > 0 && (
                              <div className="flex items-center gap-0.5">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span className="text-[10px] text-red-400">{taskCounts.overdue}</span>
                              </div>
                            )}
                            {taskCounts.pending > 0 && (
                              <div className="flex items-center gap-0.5">
                                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                                <span className="text-[10px] text-yellow-400">{taskCounts.pending}</span>
                              </div>
                            )}
                            {taskCounts.completed > 0 && (
                              <div className="flex items-center gap-0.5">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span className="text-[10px] text-green-400">{taskCounts.completed}</span>
                              </div>
                            )}
                            {taskCounts.future > 0 && (
                              <div className="flex items-center gap-0.5">
                                <span className="w-2 h-2 rounded-full bg-[rgb(var(--text-secondary))]"></span>
                                <span className="text-[10px] text-[rgb(var(--text-secondary))]">{taskCounts.future}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Fill remaining cells to complete the grid
                  const totalCells = cells.length;
                  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
                  for (let i = 0; i < remainingCells; i++) {
                    cells.push(
                      <div
                        key={`next-${i}`}
                        className="p-2 min-h-[80px] border-r border-b border-[rgb(var(--border-main))]/30 bg-[rgb(var(--bg-element))]/20"
                      />
                    );
                  }

                  return cells;
                })()}
              </div>

              {/* Legend */}
              <div className="p-3 border-t border-[rgb(var(--border-main))] bg-[rgb(var(--bg-element))]/30 flex items-center justify-center gap-6 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500"></span>
                  <span className="text-[rgb(var(--text-secondary))]">{t.overdue}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                  <span className="text-[rgb(var(--text-secondary))]">{t.pending}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  <span className="text-[rgb(var(--text-secondary))]">{t.completed}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[rgb(var(--text-secondary))]"></span>
                  <span className="text-[rgb(var(--text-secondary))]">{t.future}</span>
                </div>
              </div>
            </div>

            {/* Selected Date Tasks Panel */}
            <div className="bg-[rgb(var(--bg-panel))] rounded-lg border border-[rgb(var(--border-main))] overflow-hidden">
              <div className="p-4 border-b border-[rgb(var(--border-main))] bg-[rgb(var(--bg-element))]/50">
                <h3 className="text-lg font-semibold text-[rgb(var(--text-primary))] flex items-center gap-2">
                  <CalendarDays size={20} className="text-[rgb(var(--primary-500))]" />
                  {t.selectedDateTasks}
                </h3>
                <p className="text-sm text-[rgb(var(--text-secondary))] mt-1">
                  {selectedDate.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                  })}
                </p>
              </div>

              <div className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                {selectedDateTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <Calendar size={32} className="mx-auto mb-2 text-[rgb(var(--text-secondary))] opacity-50" />
                    <p className="text-sm text-[rgb(var(--text-secondary))]">{t.noTasksToday}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDateTasks.map((task: any) => (
                      <div
                        key={task.id}
                        className={`p-3 rounded-lg border ${getTaskStatusColor(task.status)} transition-colors`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            {getTaskStatusIcon(task.status)}
                            <div>
                              <p className="text-sm font-medium text-[rgb(var(--text-primary))]">
                                {task.planTitle}
                              </p>
                              <p className="text-xs mt-1 opacity-75">
                                {t.intervalLabels[task.intervalLabel as keyof typeof t.intervalLabels] || task.intervalLabel}
                              </p>
                              <p className="text-xs mt-0.5 opacity-60">
                                {new Date(task.scheduledDate).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                          {(task.status === 'pending' || task.status === 'overdue') && (
                            <button
                              onClick={() => onCompleteTask(task.planId, task.id)}
                              className="px-2 py-1 bg-[rgb(var(--primary-500))] hover:bg-[rgb(var(--primary-600))] text-white rounded text-xs flex items-center gap-1 transition-colors"
                            >
                              <CheckCircle size={12} />
                              {t.completeTask}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-4">
            {studyPlans.map(plan => {
              const isExpanded = expandedPlans.has(plan.id);
              const tasksByStatus = {
                pending: plan.tasks.filter(t => t.status === 'pending').length,
                completed: plan.tasks.filter(t => t.status === 'completed').length,
                overdue: plan.tasks.filter(t => t.status === 'overdue').length,
                future: plan.tasks.filter(t => t.status === 'future').length
              };

              return (
                <div
                  key={plan.id}
                  className="bg-[rgb(var(--bg-panel))] rounded-lg border border-[rgb(var(--border-main))] overflow-hidden"
                >
                  {/* Plan Header */}
                  <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-[rgb(var(--bg-element))]/50 transition-colors"
                       onClick={() => togglePlanExpanded(plan.id)}>
                    <div className="flex items-center gap-3 flex-1">
                      <button className="text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]">
                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </button>
                      <BookOpen className="text-[rgb(var(--primary-500))]" size={24} />
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-[rgb(var(--text-primary))]">{plan.title}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-[rgb(var(--text-secondary))]">
                          <span>
                            {t.progress}: {Math.round(plan.progress)}%
                          </span>
                          <span>
                            {plan.tasks.length} {t.tasks}
                          </span>
                          <span className="text-green-400">{tasksByStatus.completed} {t.completed}</span>
                          {tasksByStatus.overdue > 0 && (
                            <span className="text-red-400">{tasksByStatus.overdue} {t.overdue}</span>
                          )}
                        </div>
                        {plan.tags && plan.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {plan.tags.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-[rgb(var(--primary-500))]/20 text-[rgb(var(--primary-500))] rounded text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-4">
                      <div className="w-32 bg-[rgb(var(--bg-element))] rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[rgb(var(--primary-500))] to-[rgb(var(--secondary-500))] transition-all"
                          style={{ width: `${plan.progress}%` }}
                        />
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlan(plan.id);
                        }}
                        className="p-2 text-[rgb(var(--text-secondary))] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title={t.deletePlan}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Tasks List (Expandable) */}
                  {isExpanded && (
                    <div className="border-t border-[rgb(var(--border-main))] p-4 space-y-2 bg-[rgb(var(--bg-element))]/30">
                      <h4 className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-3">{t.schedule}</h4>
                      {plan.tasks.map(task => (
                        <div
                          key={task.id}
                          className={`flex items-center justify-between p-3 rounded border ${getTaskStatusColor(task.status)} transition-colors`}
                        >
                          <div className="flex items-center gap-3">
                            {getTaskStatusIcon(task.status)}
                            <div>
                              <p className="text-sm font-medium">
                                {t.intervalLabels[task.intervalLabel as keyof typeof t.intervalLabels] || task.intervalLabel}
                              </p>
                              <p className="text-xs opacity-75">
                                {task.completedDate
                                  ? `${t.completed}: ${formatDate(task.completedDate)}`
                                  : `${t.schedule}: ${formatDate(task.scheduledDate)}`
                                }
                              </p>
                            </div>
                          </div>

                          {task.status === 'pending' || task.status === 'overdue' ? (
                            <button
                              onClick={() => onCompleteTask(plan.id, task.id)}
                              className="px-3 py-1.5 bg-[rgb(var(--primary-500))] hover:bg-[rgb(var(--primary-600))] text-white rounded text-sm flex items-center gap-2 transition-colors"
                            >
                              <CheckCircle size={16} />
                              {t.completeTask}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Motivation Message */}
        {todayTasks.length === 0 && overdueTasks.length === 0 && completedToday > 0 && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
            <TrendingUp className="text-green-400 mx-auto mb-3" size={48} />
            <h3 className="text-xl font-semibold text-green-400 mb-2">{t.wellDone}</h3>
            <p className="text-[rgb(var(--text-secondary))]">{t.keepGoing}</p>
          </div>
        )}

        {todayTasks.length === 0 && overdueTasks.length === 0 && completedToday === 0 && (
          <div className="bg-[rgb(var(--bg-panel))] border border-[rgb(var(--border-main))] rounded-lg p-6 text-center">
            <Calendar className="text-[rgb(var(--text-secondary))] mx-auto mb-3" size={48} />
            <h3 className="text-xl font-semibold text-[rgb(var(--text-primary))] mb-2">{t.noTasksToday}</h3>
            <p className="text-[rgb(var(--text-secondary))]">{t.reviewReminder}</p>
          </div>
        )}
      </div>

      {/* Create Plan Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg border border-[rgb(var(--border-main))] max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-[rgb(var(--primary-500))] mb-4">{t.createPlan}</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
                  {t.planTitle}
                </label>
                <input
                  type="text"
                  value={newPlanTitle}
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  className="w-full bg-[rgb(var(--bg-element))] text-[rgb(var(--text-primary))] px-3 py-2 rounded border border-[rgb(var(--border-main))] focus:outline-none focus:border-[rgb(var(--primary-500))]"
                  placeholder={language === 'zh' ? '输入计划标题' : 'Enter plan title'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
                  {t.sourceType}
                </label>
                <select
                  value={newPlanSource}
                  onChange={(e) => setNewPlanSource(e.target.value as 'file' | 'mistake')}
                  className="w-full bg-[rgb(var(--bg-element))] text-[rgb(var(--text-primary))] px-3 py-2 rounded border border-[rgb(var(--border-main))] focus:outline-none focus:border-[rgb(var(--primary-500))]"
                >
                  <option value="file">{t.sourceFile}</option>
                  <option value="mistake">{t.sourceMistake}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[rgb(var(--text-primary))] mb-2">
                  {t.sourceId}
                </label>
                <input
                  type="text"
                  value={newPlanSourceId}
                  onChange={(e) => setNewPlanSourceId(e.target.value)}
                  className="w-full bg-[rgb(var(--bg-element))] text-[rgb(var(--text-primary))] px-3 py-2 rounded border border-[rgb(var(--border-main))] focus:outline-none focus:border-[rgb(var(--primary-500))]"
                  placeholder={language === 'zh' ? '输入文件或错题 ID' : 'Enter file or mistake ID'}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-[rgb(var(--bg-element))] hover:bg-[rgb(var(--bg-element))]/80 text-[rgb(var(--text-primary))] rounded transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleCreatePlan}
                disabled={!newPlanTitle.trim() || !newPlanSourceId.trim()}
                className="px-4 py-2 bg-[rgb(var(--primary-500))] hover:bg-[rgb(var(--primary-600))] text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.create}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
