import React, { useState, useEffect } from 'react';
import { Check, Clock, AlertCircle, ChevronDown, ChevronRight, Trash2, BookOpen, RefreshCw, X } from 'lucide-react';
import { StudyPlan, ReviewTask } from '../types';
import { SRS_INTERVALS, srsService } from '../src/services/srs/srsService';
import { translations } from '../utils/translations';
import { Language } from '../utils/translations';

interface StudyPlanPanelProps {
  studyPlans: StudyPlan[];
  onCompleteTask: (planId: string, taskId: string) => void;
  onCreatePlan: (sourceType: 'file' | 'mistake', sourceId: string, title: string) => void;
  onDeletePlan: (planId: string) => void;
  language?: Language;
  showConfirmDialog?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info', confirmText?: string, cancelText?: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const StudyPlanPanel: React.FC<StudyPlanPanelProps> = ({
  studyPlans,
  onCompleteTask,
  onCreatePlan,
  onDeletePlan,
  language = 'en',
  showConfirmDialog,
  isOpen = true,
  onClose
}) => {
  const t = translations[language];
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'pending' | 'overdue' | 'completed'>('pending');
  const [stats, setStats] = useState({ totalPlans: 0, completedPlans: 0, overdueTasks: 0, todaysTasks: 0 });

  useEffect(() => {
    const updateStats = async () => {
      await srsService.initialize();
      setStats(srsService.getStats());
    };
    updateStats();
  }, [studyPlans]);

  const togglePlan = (planId: string) => {
    setExpandedPlans(prev => {
      const next = new Set(prev);
      if (next.has(planId)) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  };

  const getTaskStatus = (task: ReviewTask): 'pending' | 'completed' | 'overdue' | 'future' => {
    if (task.status === 'completed') return 'completed';
    if (task.status === 'future') return 'future';
    if (task.scheduledDate < Date.now()) return 'overdue';
    return 'pending';
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return date.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getTimeUntil = (scheduledDate: number): string => {
    const diff = scheduledDate - Date.now();
    if (diff < 0) return 'Overdue';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''}`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getFilteredPlans = () => {
    switch (activeTab) {
      case 'overdue':
        return studyPlans.filter(plan => 
          plan.progress < 100 && 
          plan.tasks.some(t => getTaskStatus(t) === 'overdue')
        );
      case 'completed':
        return studyPlans.filter(plan => plan.progress === 100);
      default:
        return studyPlans.filter(plan => plan.progress < 100);
    }
  };

  const handleDeletePlan = (planId: string, planTitle: string) => {
    if (showConfirmDialog) {
      showConfirmDialog(
        t.deleteStudyPlan,
        `${t.confirmDelete || 'Are you sure you want to delete'} "${planTitle}"?`,
        () => onDeletePlan(planId),
        'danger',
        t.delete,
        t.cancel
      );
    } else {
      onDeletePlan(planId);
    }
  };

  const filteredPlans = getFilteredPlans();

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-paper-50 dark:bg-cyber-900">
      <div className="px-4 py-3 border-b border-paper-200 dark:border-cyber-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <RefreshCw size={16} className="text-emerald-500" />
            {t.studyPlans || 'Study Plans'}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-paper-200 dark:hover:bg-cyber-700 rounded transition-colors"
            >
              <X size={16} className="text-slate-400" />
            </button>
          )}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {stats.todaysTasks} {t.taskStatus?.pending || 'tasks today'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 px-4 pt-2">
        <div className="bg-amber-100 dark:bg-amber-900/30 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats.overdueTasks}</div>
          <div className="text-[10px] text-amber-600/70 dark:text-amber-400/70">{t.taskStatus?.overdue || 'Overdue'}</div>
        </div>
        <div className="bg-cyan-100 dark:bg-cyan-900/30 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{stats.todaysTasks}</div>
          <div className="text-[10px] text-cyan-600/70 dark:text-cyan-400/70">{t.todayTasks || 'Today'}</div>
        </div>
        <div className="bg-green-100 dark:bg-green-900/30 rounded-lg p-2 text-center">
          <div className="text-lg font-bold text-green-600 dark:text-green-400">{stats.completedPlans}</div>
          <div className="text-[10px] text-green-600/70 dark:text-green-400/70">Done</div>
        </div>
      </div>

      <div className="flex gap-1 bg-paper-100 dark:bg-cyber-800 p-1 rounded-lg mx-4">
        {(['pending', 'overdue', 'completed'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-cyber-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filteredPlans.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <BookOpen size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No {activeTab} plans</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPlans.map(plan => {
              const isExpanded = expandedPlans.has(plan.id);
              const hasOverdue = plan.tasks.some(t => getTaskStatus(t) === 'overdue');

              return (
                <div
                  key={plan.id}
                  className={`border rounded-lg overflow-hidden transition-colors ${
                    hasOverdue
                      ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                      : 'border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800'
                  }`}
                >
                  <div
                    className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-paper-50 dark:hover:bg-cyber-700/50 transition-colors"
                    onClick={() => togglePlan(plan.id)}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {hasOverdue && (
                        <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {plan.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <div className="w-16 h-1.5 bg-paper-200 dark:bg-cyber-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              plan.progress === 100 
                                ? 'bg-green-500' 
                                : hasOverdue 
                                ? 'bg-amber-500' 
                                : 'bg-cyan-500'
                            }`}
                            style={{ width: `${plan.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{plan.progress}%</span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-slate-400" />
                      ) : (
                        <ChevronRight size={16} className="text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-paper-100 dark:border-cyber-700 px-3 py-2 bg-paper-50/50 dark:bg-cyber-900/50">
                      <div className="space-y-1">
                        {plan.tasks.map((task) => {
                          const status = getTaskStatus(task);
                          const isClickable = status === 'pending' || status === 'overdue';
                          
                          return (
                            <div
                              key={task.id}
                              className={`flex items-center gap-3 px-2 py-1.5 rounded transition-colors ${
                                isClickable 
                                  ? 'hover:bg-paper-100 dark:hover:bg-cyber-700 cursor-pointer' 
                                  : ''
                              }`}
                              onClick={() => {
                                if (isClickable) {
                                  onCompleteTask(plan.id, task.id);
                                }
                              }}
                            >
                              <button
                                disabled={status === 'completed' || status === 'future'}
                                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                  status === 'completed'
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : status === 'overdue'
                                    ? 'border-amber-500 text-amber-500'
                                    : status === 'pending'
                                    ? 'border-slate-300 dark:border-slate-500 hover:border-cyan-500'
                                    : 'border-slate-200 dark:border-slate-600 text-slate-300'
                                }`}
                              >
                                {status === 'completed' && <Check size={12} />}
                                {status === 'overdue' && <Clock size={10} />}
                              </button>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs ${
                                    status === 'completed'
                                      ? 'text-slate-400 line-through'
                                      : status === 'overdue'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-slate-600 dark:text-slate-300'
                                  }`}>
                                    {task.intervalLabel}
                                  </span>
                                  {status === 'future' && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-paper-100 dark:bg-cyber-700 text-slate-400 rounded">
                                      Future
                                    </span>
                                  )}
                                </div>
                                <div className={`text-[10px] ${
                                  status === 'overdue' 
                                    ? 'text-amber-500' 
                                    : 'text-slate-400'
                                }`}>
                                  {status === 'completed'
                                    ? task.completedDate 
                                      ? `Done ${formatDate(task.completedDate)}`
                                      : 'Completed'
                                    : status === 'future'
                                    ? `Starts ${formatDate(task.scheduledDate)}`
                                    : getTimeUntil(task.scheduledDate)
                                  }
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePlan(plan.id, plan.title);
                        }}
                        className="w-full mt-2 py-1.5 flex items-center justify-center gap-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        <Trash2 size={12} />
                        Delete Plan
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudyPlanPanel;
