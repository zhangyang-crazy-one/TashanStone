
import React, { useState, useEffect, useMemo } from 'react';
import { StudyPlan, ReviewTask } from '../types';
import { getStudyPlans, markTaskComplete, getTaskStatus, deleteStudyPlan } from '../services/srsService';
import { CheckCircle2, Circle, Clock, AlertTriangle, Trash2, BookOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { translations, Language } from '../utils/translations';

interface LearningRoadmapProps {
    language?: Language;
    onNavigateToFile?: (id: string) => void;
}

export const LearningRoadmap: React.FC<LearningRoadmapProps> = ({ language = 'en', onNavigateToFile }) => {
    const [plans, setPlans] = useState<StudyPlan[]>([]);
    const [filter, setFilter] = useState<'all' | 'due' | 'mistake' | 'note'>('all');
    const t = translations[language];

    const loadPlans = () => {
        setPlans(getStudyPlans());
    };

    useEffect(() => {
        loadPlans();
        // Auto-refresh periodically to update time-based statuses
        const interval = setInterval(loadPlans, 60000); 
        return () => clearInterval(interval);
    }, []);

    const handleCompleteTask = (planId: string, taskId: string) => {
        markTaskComplete(planId, taskId);
        loadPlans();
    };

    const handleDeletePlan = (planId: string) => {
        if (confirm("Delete this study plan?")) {
            deleteStudyPlan(planId);
            loadPlans();
        }
    };

    const filteredPlans = useMemo(() => {
        return plans.filter(p => {
            if (filter === 'all') return true;
            if (filter === 'mistake') return p.sourceType === 'mistake';
            if (filter === 'note') return p.sourceType === 'file';
            if (filter === 'due') {
                return p.tasks.some(t => {
                    const s = getTaskStatus(t);
                    return s === 'pending' || s === 'overdue';
                });
            }
            return true;
        }).sort((a, b) => b.createdDate - a.createdDate);
    }, [plans, filter]);

    return (
        <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="h-16 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-800 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                        <Clock size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Ebbinghaus Roadmap</h2>
                        <p className="text-xs text-slate-500">{plans.length} Active Learning Journeys</p>
                    </div>
                </div>
                <div className="flex bg-paper-100 dark:bg-cyber-900 rounded-lg p-1">
                    {['all', 'due', 'note', 'mistake'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f as any)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md capitalize transition-all ${filter === f ? 'bg-white dark:bg-cyber-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                {filteredPlans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                        <BookOpen size={48} className="opacity-20" />
                        <p>No study plans found for this filter.</p>
                        <button onClick={loadPlans} className="flex items-center gap-2 text-sm text-indigo-500 hover:underline">
                            <RefreshCw size={14} /> Refresh
                        </button>
                    </div>
                ) : (
                    <div className="space-y-8 max-w-5xl mx-auto">
                        {filteredPlans.map(plan => (
                            <PlanCard 
                                key={plan.id} 
                                plan={plan} 
                                onCompleteTask={handleCompleteTask} 
                                onDelete={handleDeletePlan}
                                onNavigate={onNavigateToFile}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const PlanCard: React.FC<{ 
    plan: StudyPlan; 
    onCompleteTask: (pid: string, tid: string) => void;
    onDelete: (pid: string) => void;
    onNavigate?: (id: string) => void;
}> = ({ plan, onCompleteTask, onDelete, onNavigate }) => {
    
    // Calculate stats
    const total = plan.tasks.length;
    const completed = plan.tasks.filter(t => t.status === 'completed').length;
    
    const isMistake = plan.sourceType === 'mistake';

    return (
        <div className="bg-white dark:bg-cyber-800 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm overflow-hidden animate-fadeIn">
            {/* Card Header */}
            <div className={`px-6 py-4 flex justify-between items-start border-b border-paper-100 dark:border-cyber-700/50 ${isMistake ? 'bg-red-50/50 dark:bg-red-900/10' : 'bg-indigo-50/50 dark:bg-indigo-900/10'}`}>
                <div className="flex gap-4">
                    <div className={`mt-1 p-2 rounded-lg shrink-0 ${isMistake ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600'}`}>
                        {isMistake ? <AlertCircle size={20} /> : <BookOpen size={20} />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{plan.title}</h3>
                            {isMistake && <span className="text-[10px] bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 px-2 py-0.5 rounded font-bold uppercase">Fix Mistake</span>}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                            <span>Started: {new Date(plan.createdDate).toLocaleDateString()}</span>
                            <span>•</span>
                            <span className={completed === total ? 'text-green-500 font-bold' : ''}>{Math.round(plan.progress)}% Complete</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    {plan.sourceType === 'file' && onNavigate && (
                        <button 
                            onClick={() => onNavigate(plan.sourceId)}
                            className="p-2 text-slate-400 hover:text-indigo-500 transition-colors"
                            title="Go to Note"
                        >
                            <BookOpen size={18} />
                        </button>
                    )}
                    <button 
                        onClick={() => onDelete(plan.id)}
                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete Plan"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Timeline Visualization */}
            <div className="p-6 overflow-x-auto custom-scrollbar">
                <div className="flex items-center min-w-max relative pt-4 pb-2 px-2">
                    {/* Connecting Line */}
                    <div className="absolute top-1/2 left-0 right-0 h-1 bg-paper-200 dark:bg-cyber-700 -z-10 transform -translate-y-1"></div>
                    
                    {/* Start Node */}
                    <div className="flex flex-col items-center gap-2 mr-8 opacity-50 relative group">
                        <div className="w-4 h-4 rounded-full bg-slate-400 ring-4 ring-white dark:ring-cyber-800"></div>
                        <span className="text-[10px] font-mono text-slate-400 uppercase">Start</span>
                    </div>

                    {/* Task Nodes */}
                    {plan.tasks.map((task, idx) => {
                        const status = getTaskStatus(task);
                        let nodeClass = "";
                        let icon = null;
                        let labelClass = "text-slate-500";

                        switch (status) {
                            case 'completed':
                                nodeClass = "bg-green-500 ring-green-200 dark:ring-green-900/50";
                                icon = <CheckCircle2 size={14} className="text-white" />;
                                labelClass = "text-green-600 dark:text-green-400 font-bold";
                                break;
                            case 'pending':
                                nodeClass = "bg-amber-500 ring-amber-200 dark:ring-amber-900/50 animate-pulse";
                                icon = <Clock size={14} className="text-white" />;
                                labelClass = "text-amber-600 dark:text-amber-400 font-bold";
                                break;
                            case 'overdue':
                                nodeClass = "bg-red-500 ring-red-200 dark:ring-red-900/50";
                                icon = <AlertTriangle size={14} className="text-white" />;
                                labelClass = "text-red-600 dark:text-red-400 font-bold";
                                break;
                            case 'future':
                            default:
                                nodeClass = "bg-slate-300 dark:bg-slate-600 ring-slate-100 dark:ring-slate-800";
                                icon = <Circle size={8} className="text-white" />;
                                break;
                        }

                        // Check if clickable (only pending/overdue)
                        const isActionable = status === 'pending' || status === 'overdue';

                        return (
                            <div key={task.id} className="flex flex-col items-center gap-3 mr-8 relative group">
                                <button 
                                    disabled={!isActionable}
                                    onClick={() => onCompleteTask(plan.id, task.id)}
                                    className={`
                                        w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-cyber-800 transition-all z-10
                                        ${nodeClass}
                                        ${isActionable ? 'hover:scale-110 cursor-pointer shadow-lg' : 'cursor-default'}
                                    `}
                                    title={isActionable ? "Mark Reviewed" : (status === 'completed' ? `Completed: ${new Date(task.completedDate!).toLocaleDateString()}` : `Due: ${new Date(task.scheduledDate).toLocaleDateString()}`)}
                                >
                                    {icon}
                                </button>
                                
                                <div className="flex flex-col items-center text-center w-20">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${labelClass}`}>
                                        {task.intervalLabel}
                                    </span>
                                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                        {new Date(task.scheduledDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                    </span>
                                </div>

                                {/* Tooltip for future dates */}
                                {status === 'future' && (
                                    <div className="absolute bottom-full mb-2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        Unlocks: {new Date(task.scheduledDate).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
