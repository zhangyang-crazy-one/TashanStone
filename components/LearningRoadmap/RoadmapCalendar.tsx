import React from 'react';
import {
  Calendar,
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

import Tooltip from '../Tooltip';
import type { RoadmapTask } from './useLearningRoadmap';

interface DateTaskCounts {
  pending: number;
  completed: number;
  overdue: number;
  future: number;
}

interface RoadmapCalendarProps {
  selectedDate: Date;
  selectedDateTasks: RoadmapTask[];
  language: 'en' | 'zh';
  t: {
    months: string[];
    weekdays: string[];
    intervalLabels: Record<string, string>;
    prevMonth: string;
    nextMonth: string;
    goToday: string;
    selectedDateTasks: string;
    noTasksToday: string;
    completeTask: string;
    overdue: string;
    pending: string;
    completed: string;
    future: string;
  };
  getDaysInMonth: (date: Date) => number;
  getFirstDayOfMonth: (date: Date) => number;
  dateHasTasks: (date: Date) => DateTaskCounts;
  isToday: (date: Date) => boolean;
  isSelected: (date: Date) => boolean;
  getTaskStatusIcon: (status: RoadmapTask['status']) => React.ReactNode;
  getTaskStatusColor: (status: RoadmapTask['status']) => string;
  onSelectDate: (date: Date) => void;
  onNavigateMonth: (direction: 'prev' | 'next') => void;
  onGoToday: () => void;
  onCompleteTask: (planId: string, taskId: string) => void;
}

export function RoadmapCalendar({
  selectedDate,
  selectedDateTasks,
  language,
  t,
  getDaysInMonth,
  getFirstDayOfMonth,
  dateHasTasks,
  isToday,
  isSelected,
  getTaskStatusIcon,
  getTaskStatusColor,
  onSelectDate,
  onNavigateMonth,
  onGoToday,
  onCompleteTask
}: RoadmapCalendarProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-[rgb(var(--bg-panel))] rounded-lg border border-[rgb(var(--border-main))] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border-main))] bg-[rgb(var(--bg-element))]/50">
          <Tooltip content={t.prevMonth}>
            <button
              onClick={() => onNavigateMonth('prev')}
              className="p-2 rounded-lg hover:bg-[rgb(var(--bg-element))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
              aria-label={t.prevMonth}
            >
              <ChevronLeft size={20} />
            </button>
          </Tooltip>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-[rgb(var(--text-primary))]">
              {t.months[selectedDate.getMonth()]} {selectedDate.getFullYear()}
            </h3>
            <button
              onClick={onGoToday}
              className="px-2 py-1 text-xs bg-[rgb(var(--primary-500))]/20 text-[rgb(var(--primary-500))] rounded hover:bg-[rgb(var(--primary-500))]/30 transition-colors"
            >
              {t.goToday}
            </button>
          </div>
          <Tooltip content={t.nextMonth}>
            <button
              onClick={() => onNavigateMonth('next')}
              className="p-2 rounded-lg hover:bg-[rgb(var(--bg-element))] text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))] transition-colors"
              aria-label={t.nextMonth}
            >
              <ChevronRight size={20} />
            </button>
          </Tooltip>
        </div>

        <div className="grid grid-cols-7 border-b border-[rgb(var(--border-main))]">
          {t.weekdays.map((day, index) => (
            <div
              key={day}
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

        <div className="grid grid-cols-7">
          {(() => {
            const daysInMonth = getDaysInMonth(selectedDate);
            const firstDay = getFirstDayOfMonth(selectedDate);
            const cells: React.ReactElement[] = [];

            for (let i = 0; i < firstDay; i += 1) {
              cells.push(
                <div
                  key={`empty-${i}`}
                  className="p-2 min-h-[80px] border-r border-b border-[rgb(var(--border-main))]/30 bg-[rgb(var(--bg-element))]/20"
                />
              );
            }

            for (let day = 1; day <= daysInMonth; day += 1) {
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
                  onClick={() => onSelectDate(date)}
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

            const totalCells = cells.length;
            const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
            for (let i = 0; i < remainingCells; i += 1) {
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
              {selectedDateTasks.map(task => (
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
                          {t.intervalLabels[task.intervalLabel] || task.intervalLabel}
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
  );
}
