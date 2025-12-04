
import React, { useMemo, useState, useEffect } from 'react';
import { MarkdownFile, KnowledgePointStat, ExamResult } from '../types';
import { getAnalyticsData, extractTags } from '../services/knowledgeService';
import { getExamHistory, getMasteryData, identifyWeakAreas } from '../services/analyticsService';
import { Activity, Hash, Network, Calendar, TrendingUp, BookOpen, Target, AlertTriangle, ChevronRight, BarChart2, Award } from 'lucide-react';
import { translations, Language } from '../utils/translations';

interface AnalyticsDashboardProps {
    files: MarkdownFile[];
    onNavigate?: (id: string) => void;
    language?: Language;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ files, onNavigate, language = 'en' }) => {
    const [activeTab, setActiveTab] = useState<'knowledge' | 'learning'>('knowledge');
    const [examHistory, setExamHistory] = useState<ExamResult[]>([]);
    const [masteryData, setMasteryData] = useState<KnowledgePointStat[]>([]);
    const [weakAreas, setWeakAreas] = useState<KnowledgePointStat[]>([]);
    
    const t = translations[language];

    useEffect(() => {
        setExamHistory(getExamHistory());
        setMasteryData(getMasteryData());
        setWeakAreas(identifyWeakAreas());
    }, []);

    // --- Knowledge Graph Stats ---
    const stats = useMemo(() => getAnalyticsData(files), [files]);
    const maxDaily = Math.max(...stats.notesPerDay.map(d => d.count), 1);
    const maxTag = Math.max(...stats.tagStats.map(t => t.count), 1);
    const maxGrowth = Math.max(...stats.cumulativeGrowth.map(d => d.count), 1);

    // --- Learning Stats ---
    const totalExams = examHistory.length;
    const avgScore = totalExams > 0 
        ? Math.round(examHistory.reduce((acc, curr) => acc + curr.score, 0) / totalExams) 
        : 0;
    
    // Sort history by date for charts
    const sortedHistory = [...examHistory].sort((a, b) => a.date - b.date);

    // Generate Points for Knowledge Growth Line Chart
    const polylinePoints = useMemo(() => {
        if (stats.cumulativeGrowth.length < 2) return "";
        const width = 100; 
        const height = 50;
        const stepX = width / (stats.cumulativeGrowth.length - 1);
        return stats.cumulativeGrowth.map((d, i) => {
            const x = i * stepX;
            const y = height - (d.count / maxGrowth) * height; 
            return `${x},${y}`;
        }).join(" ");
    }, [stats.cumulativeGrowth, maxGrowth]);

    // Generate Points for Exam Score Line Chart
    const examScorePoints = useMemo(() => {
        if (sortedHistory.length < 2) return "";
        const width = 100;
        const height = 50;
        const stepX = width / (sortedHistory.length - 1);
        return sortedHistory.map((d, i) => {
            const x = i * stepX;
            const y = height - (d.score / 100) * height; // normalized to 100
            return `${x},${y}`;
        }).join(" ");
    }, [sortedHistory]);

    // Radar Chart Logic
    const renderRadar = (data: KnowledgePointStat[]) => {
        if (data.length < 3) return null;
        
        // Take top 6 metrics
        const metrics = data.slice(0, 6);
        const count = metrics.length;
        const radius = 40;
        const centerX = 50;
        const centerY = 50;
        const angleStep = (Math.PI * 2) / count;

        const points = metrics.map((m, i) => {
            const value = m.accuracy / 100;
            const angle = i * angleStep - Math.PI / 2; // Start from top
            const x = centerX + radius * value * Math.cos(angle);
            const y = centerY + radius * value * Math.sin(angle);
            return `${x},${y}`;
        }).join(" ");

        const axisLines = metrics.map((_, i) => {
            const angle = i * angleStep - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            return <line key={i} x1={centerX} y1={centerY} x2={x} y2={y} stroke="rgba(150,150,150,0.2)" strokeWidth="0.5" />;
        });

        // Grid levels (20%, 40%... 100%)
        const levels = [0.2, 0.4, 0.6, 0.8, 1];
        const gridPolygons = levels.map((lvl, idx) => {
             const pts = metrics.map((_, i) => {
                const angle = i * angleStep - Math.PI / 2;
                const x = centerX + radius * lvl * Math.cos(angle);
                const y = centerY + radius * lvl * Math.sin(angle);
                return `${x},${y}`;
             }).join(" ");
             return <polygon key={idx} points={pts} fill="none" stroke="rgba(150,150,150,0.1)" strokeWidth="0.5" />;
        });

        const labels = metrics.map((m, i) => {
            const angle = i * angleStep - Math.PI / 2;
            // Push label out slightly further than radius
            const labelRadius = radius + 12; 
            const x = centerX + labelRadius * Math.cos(angle);
            const y = centerY + labelRadius * Math.sin(angle);
            return (
                <text 
                    key={i} 
                    x={x} 
                    y={y} 
                    fontSize="3" 
                    fill="currentColor" 
                    textAnchor="middle" 
                    alignmentBaseline="middle"
                    className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest"
                >
                    {m.tag.length > 8 ? m.tag.substring(0,8)+'..' : m.tag}
                </text>
            );
        });

        return (
            <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
                {gridPolygons}
                {axisLines}
                <polygon points={points} fill="rgba(139, 92, 246, 0.2)" stroke="#8b5cf6" strokeWidth="1.5" />
                {labels}
            </svg>
        );
    };

    const handleReviewTag = (tag: string) => {
        // Find a file with this tag and navigate
        if (!onNavigate) return;
        const target = files.find(f => extractTags(f.content).includes(tag));
        if (target) {
            onNavigate(target.id);
        } else {
            alert(`No notes found for tag: ${tag}`);
        }
    };

    return (
        <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
                
                {/* Header & Tabs */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-paper-200 dark:border-cyber-700 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-cyan-500 rounded-xl shadow-lg shadow-cyan-500/20 text-white">
                            {activeTab === 'knowledge' ? <Activity size={24} /> : <Award size={24} />}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                                {activeTab === 'knowledge' ? t.knowledgeAnalytics : t.learningReports}
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm">
                                {activeTab === 'knowledge' ? t.insightsNetwork : t.trackMastery}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex bg-paper-100 dark:bg-cyber-800 p-1 rounded-lg">
                        <button 
                            onClick={() => setActiveTab('knowledge')}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'knowledge' ? 'bg-white dark:bg-cyber-700 shadow text-cyan-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {t.knowledgeAnalytics}
                        </button>
                        <button 
                            onClick={() => setActiveTab('learning')}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'learning' ? 'bg-white dark:bg-cyber-700 shadow text-violet-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            {t.learningReports}
                        </button>
                    </div>
                </div>

                {/* --- KNOWLEDGE GRAPH TAB --- */}
                {activeTab === 'knowledge' && (
                    <div className="space-y-8 animate-fadeIn">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                                <div className="text-4xl font-black text-cyan-600 dark:text-cyan-400 mb-2">{stats.totalNotes}</div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.totalNotes}</div>
                            </div>
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                                <div className="text-4xl font-black text-violet-600 dark:text-violet-400 mb-2">{stats.totalLinks}</div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.connections}</div>
                            </div>
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                                <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mb-2">{(stats.density * 100).toFixed(1)}%</div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.networkDensity}</div>
                            </div>
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                                <div className="text-4xl font-black text-amber-500 dark:text-amber-400 mb-2">{stats.tagStats.length}</div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.uniqueTags}</div>
                            </div>
                        </div>

                        {/* Growth Chart & Timeline */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                                <div className="flex items-center gap-2 mb-6">
                                    <Calendar size={18} className="text-cyan-500" />
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200">{t.activityTimeline}</h3>
                                </div>
                                <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2 custom-scrollbar">
                                    {stats.notesPerDay.length === 0 ? (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm italic">
                                            No activity recorded yet.
                                        </div>
                                    ) : (
                                        stats.notesPerDay.map((d, i) => (
                                            <div key={d.date} className="flex flex-col items-center gap-1 group min-w-[20px]">
                                                <div 
                                                    className="w-4 bg-cyan-200 dark:bg-cyan-900/50 rounded-t-sm hover:bg-cyan-500 transition-colors relative"
                                                    style={{ height: `${Math.max(10, (d.count / maxDaily) * 100)}%` }}
                                                >
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-black text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 shadow-xl">
                                                        {d.date}: {d.count}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm overflow-hidden relative">
                                <div className="flex items-center gap-2 mb-4 relative z-10">
                                    <TrendingUp size={18} className="text-violet-500" />
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200">{t.knowledgeGrowth}</h3>
                                </div>
                                
                                <div className="h-48 relative flex items-end">
                                     {stats.cumulativeGrowth.length > 1 ? (
                                         <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                             <defs>
                                                 <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                                                     <stop offset="0%" stopColor="rgb(var(--primary-500))" stopOpacity="0.3" />
                                                     <stop offset="100%" stopColor="rgb(var(--primary-500))" stopOpacity="0" />
                                                 </linearGradient>
                                             </defs>
                                             <polygon points={`0,50 ${polylinePoints} 100,50`} fill="url(#growthGradient)" />
                                             <polyline points={polylinePoints} fill="none" stroke="rgb(var(--primary-500))" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                         </svg>
                                     ) : (
                                         <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm italic">
                                             Not enough data.
                                         </div>
                                     )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                                 <div className="flex items-center gap-2 mb-6">
                                    <Hash size={18} className="text-emerald-500" />
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200">{t.tagDistribution}</h3>
                                </div>
                                {stats.tagStats.length === 0 ? (
                                    <p className="text-slate-400 italic text-sm">No tags found.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-4">
                                        {stats.tagStats.map(tag => (
                                            <div key={tag.name} className="flex flex-col gap-1 items-start">
                                                <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{tag.name}</div>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded px-2 flex items-center justify-center text-xs font-mono transition-all hover:bg-emerald-200 dark:hover:bg-emerald-900/50" style={{ minWidth: `${Math.max(40, (tag.count / maxTag) * 200)}px` }}>
                                                        {tag.count}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <Network size={18} className="text-violet-500" />
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200">{t.topInfluencers}</h3>
                                </div>
                                <div className="space-y-3">
                                    {stats.topConnected.slice(0, 5).map((node, i) => (
                                        <div key={i} className="flex items-center justify-between p-2 hover:bg-paper-100 dark:hover:bg-cyber-700 rounded-lg transition-colors">
                                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate w-2/3">{node.name}</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 h-1.5 bg-paper-100 dark:bg-cyber-900 rounded-full overflow-hidden">
                                                    <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, (node.connections / (stats.topConnected[0]?.connections || 1)) * 100)}%` }}></div>
                                                </div>
                                                <span className="text-xs font-mono text-slate-400">{node.connections}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- LEARNING REPORTS TAB --- */}
                {activeTab === 'learning' && (
                    <div className="space-y-8 animate-fadeIn">
                        {/* Learning KPIs */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex items-center justify-between">
                                <div>
                                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100">{totalExams}</div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.examsCompleted}</div>
                                </div>
                                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full">
                                    <BookOpen size={24} />
                                </div>
                            </div>
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex items-center justify-between">
                                <div>
                                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100">{avgScore}%</div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.averageScore}</div>
                                </div>
                                <div className={`p-3 rounded-full ${avgScore >= 80 ? 'bg-green-100 text-green-600' : avgScore >= 60 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                                    <BarChart2 size={24} />
                                </div>
                            </div>
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex items-center justify-between">
                                <div>
                                    <div className="text-3xl font-black text-slate-800 dark:text-slate-100">{masteryData.length}</div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.skillsTracked}</div>
                                </div>
                                <div className="p-3 bg-violet-100 dark:bg-violet-900/30 text-violet-600 rounded-full">
                                    <Target size={24} />
                                </div>
                            </div>
                        </div>

                        {/* Radar Chart & Growth Curve */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
                                <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 w-full text-left flex items-center gap-2">
                                    <Target size={14}/> {t.masteryRadar}
                                </h3>
                                {masteryData.length >= 3 ? (
                                    <div className="w-full max-w-xs aspect-square">
                                        {renderRadar(masteryData)}
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-sm italic">Complete more quizzes with diverse tags to unlock mastery radar.</div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col">
                                <h3 className="text-sm font-bold text-slate-500 uppercase mb-6 w-full text-left flex items-center gap-2">
                                    <TrendingUp size={14}/> {t.scoreHistory}
                                </h3>
                                <div className="flex-1 relative flex items-end min-h-[200px] border-l border-b border-slate-200 dark:border-slate-700 ml-4 mb-4">
                                    {sortedHistory.length > 1 ? (
                                        <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                            <defs>
                                                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="rgb(var(--secondary-500))" stopOpacity="0.3" />
                                                    <stop offset="100%" stopColor="rgb(var(--secondary-500))" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                            <polygon points={`0,50 ${examScorePoints} 100,50`} fill="url(#scoreGradient)" />
                                            <polyline points={examScorePoints} fill="none" stroke="rgb(var(--secondary-500))" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                            
                                            {/* Data Points */}
                                            {sortedHistory.map((_, i) => {
                                                const pt = examScorePoints.split(' ')[i].split(',');
                                                return <circle key={i} cx={pt[0]} cy={pt[1]} r="1" fill="#fff" stroke="rgb(var(--secondary-500))" strokeWidth="0.5" />
                                            })}
                                        </svg>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm italic absolute inset-0">
                                            Not enough history data.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Weak Areas */}
                        <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm border-l-4 border-l-red-500">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                                <AlertTriangle className="text-red-500" size={20} /> {t.areasImprovement}
                            </h3>
                            {weakAreas.length === 0 ? (
                                <p className="text-slate-500 dark:text-slate-400 text-sm">Great job! No specific weak areas detected yet (Acc &lt; 60%).</p>
                            ) : (
                                <div className="space-y-3">
                                    {weakAreas.map((area, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                                            <div>
                                                <div className="font-bold text-red-700 dark:text-red-400 text-sm">#{area.tag}</div>
                                                <div className="text-xs text-red-600/70 dark:text-red-400/70">{t.accuracy}: {area.accuracy}% ({area.correctQuestions}/{area.totalQuestions})</div>
                                            </div>
                                            <button 
                                                onClick={() => handleReviewTag(area.tag)}
                                                className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 px-3 py-1.5 bg-white dark:bg-cyber-800 rounded shadow-sm hover:shadow transition-all"
                                            >
                                                {t.reviewNotes} <ChevronRight size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Recent Activity Log */}
                        <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                            <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">{t.recentExams}</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-paper-200 dark:border-cyber-600 text-slate-400">
                                            <th className="pb-2 font-medium">Date</th>
                                            <th className="pb-2 font-medium">Title</th>
                                            <th className="pb-2 font-medium">Score</th>
                                            <th className="pb-2 font-medium">Duration</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-paper-100 dark:divide-cyber-700">
                                        {[...examHistory].reverse().slice(0, 5).map((exam) => (
                                            <tr key={exam.id} className="text-slate-600 dark:text-slate-300">
                                                <td className="py-3">{new Date(exam.date).toLocaleDateString()}</td>
                                                <td className="py-3 font-medium">{exam.quizTitle}</td>
                                                <td className={`py-3 font-bold ${exam.score >= 60 ? 'text-green-500' : 'text-red-500'}`}>{exam.score}%</td>
                                                <td className="py-3 text-xs font-mono">{Math.floor(exam.duration / 60)}m {exam.duration % 60}s</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {examHistory.length === 0 && (
                                    <div className="py-8 text-center text-slate-400 italic">{t.noExams}</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
