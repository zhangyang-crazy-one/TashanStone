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
  ChevronDown
} from 'lucide-react';
import { StudyPlan } from '../types';
import Tooltip from './Tooltip';
import { RoadmapCalendar } from './LearningRoadmap/RoadmapCalendar';
import { useLearningRoadmap } from './LearningRoadmap/useLearningRoadmap';

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
  const {
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
  } = useLearningRoadmap({
    studyPlans,
    onCreatePlan,
    onDeletePlan,
    language,
    showConfirmDialog
  });

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

        {viewMode === 'calendar' && (
          <RoadmapCalendar
            selectedDate={selectedDate}
            selectedDateTasks={selectedDateTasks}
            language={language}
            t={t}
            getDaysInMonth={getDaysInMonth}
            getFirstDayOfMonth={getFirstDayOfMonth}
            dateHasTasks={dateHasTasks}
            isToday={isToday}
            isSelected={isSelected}
            getTaskStatusIcon={getTaskStatusIcon}
            getTaskStatusColor={getTaskStatusColor}
            onSelectDate={setSelectedDate}
            onNavigateMonth={navigateMonth}
            onGoToday={goToToday}
            onCompleteTask={onCompleteTask}
          />
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
                      <Tooltip content={t.deletePlan}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePlan(plan.id);
                          }}
                          className="p-2 text-[rgb(var(--text-secondary))] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          aria-label={t.deletePlan}
                        >
                          <Trash2 size={18} />
                        </button>
                      </Tooltip>
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
