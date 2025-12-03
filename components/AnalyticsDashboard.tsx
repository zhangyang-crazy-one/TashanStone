

import React, { useMemo } from 'react';
import { MarkdownFile } from '../types';
import { getAnalyticsData } from '../services/knowledgeService';
import { Activity, Hash, Network, Calendar, TrendingUp } from 'lucide-react';

interface AnalyticsDashboardProps {
    files: MarkdownFile[];
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ files }) => {
    const stats = useMemo(() => getAnalyticsData(files), [files]);

    const maxDaily = Math.max(...stats.notesPerDay.map(d => d.count), 1);
    const maxTag = Math.max(...stats.tagStats.map(t => t.count), 1);
    const maxGrowth = Math.max(...stats.cumulativeGrowth.map(d => d.count), 1);

    // Generate Points for SVG Line Chart (Knowledge Growth)
    const polylinePoints = useMemo(() => {
        if (stats.cumulativeGrowth.length < 2) return "";
        
        const width = 100; // normalized width
        const height = 50; // normalized height
        const stepX = width / (stats.cumulativeGrowth.length - 1);
        
        return stats.cumulativeGrowth.map((d, i) => {
            const x = i * stepX;
            const y = height - (d.count / maxGrowth) * height; // Invert Y
            return `${x},${y}`;
        }).join(" ");
    }, [stats.cumulativeGrowth, maxGrowth]);

    return (
        <div className="w-full h-full bg-paper-50 dark:bg-cyber-900 overflow-y-auto custom-scrollbar p-6">
            <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
                
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-cyan-500 rounded-xl shadow-lg shadow-cyan-500/20 text-white">
                        <Activity size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Knowledge Analytics</h1>
                        <p className="text-slate-500 dark:text-slate-400">Insights into your learning journey and note-taking habits.</p>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                        <div className="text-4xl font-black text-cyan-600 dark:text-cyan-400 mb-2">{stats.totalNotes}</div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Notes</div>
                    </div>
                    <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                        <div className="text-4xl font-black text-violet-600 dark:text-violet-400 mb-2">{stats.totalLinks}</div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Connections</div>
                    </div>
                    <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                        <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mb-2">{(stats.density * 100).toFixed(1)}%</div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Network Density</div>
                    </div>
                    <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm flex flex-col items-center text-center transform hover:scale-[1.02] transition-transform">
                        <div className="text-4xl font-black text-amber-500 dark:text-amber-400 mb-2">{stats.tagStats.length}</div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unique Tags</div>
                    </div>
                </div>

                {/* Growth Chart & Timeline */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Activity Heatmap */}
                    <div className="lg:col-span-2 bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <Calendar size={18} className="text-cyan-500" />
                            <h3 className="font-bold text-slate-700 dark:text-slate-200">Activity Timeline (Daily Notes)</h3>
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

                    {/* Learning Journey (Line Chart) */}
                    <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm overflow-hidden relative">
                        <div className="flex items-center gap-2 mb-4 relative z-10">
                            <TrendingUp size={18} className="text-violet-500" />
                            <h3 className="font-bold text-slate-700 dark:text-slate-200">Knowledge Growth</h3>
                        </div>
                        
                        <div className="h-48 relative flex items-end">
                             {stats.cumulativeGrowth.length > 1 ? (
                                 <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                                     {/* Fill Area */}
                                     <defs>
                                         <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                                             <stop offset="0%" stopColor="rgb(var(--primary-500))" stopOpacity="0.3" />
                                             <stop offset="100%" stopColor="rgb(var(--primary-500))" stopOpacity="0" />
                                         </linearGradient>
                                     </defs>
                                     <polygon 
                                        points={`0,50 ${polylinePoints} 100,50`} 
                                        fill="url(#growthGradient)" 
                                     />
                                     {/* Line */}
                                     <polyline 
                                        points={polylinePoints} 
                                        fill="none" 
                                        stroke="rgb(var(--primary-500))" 
                                        strokeWidth="2" 
                                        strokeLinecap="round" 
                                        vectorEffect="non-scaling-stroke"
                                     />
                                 </svg>
                             ) : (
                                 <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm italic">
                                     Not enough data for trend.
                                 </div>
                             )}
                             <div className="absolute top-0 right-0 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                                 {maxGrowth} Notes
                             </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Tag Distribution */}
                    <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                         <div className="flex items-center gap-2 mb-6">
                            <Hash size={18} className="text-emerald-500" />
                            <h3 className="font-bold text-slate-700 dark:text-slate-200">Tag Distribution</h3>
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

                    {/* Most Connected Nodes */}
                    <div className="bg-white dark:bg-cyber-800 p-6 rounded-xl border border-paper-200 dark:border-cyber-700 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <Network size={18} className="text-violet-500" />
                            <h3 className="font-bold text-slate-700 dark:text-slate-200">Top Influencers</h3>
                        </div>
                        <div className="space-y-3">
                            {stats.topConnected.length === 0 ? (
                                <p className="text-slate-400 italic text-sm">No connections found.</p>
                            ) : (
                                stats.topConnected.slice(0, 5).map((node, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 hover:bg-paper-100 dark:hover:bg-cyber-700 rounded-lg transition-colors">
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate w-2/3">{node.name}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-paper-100 dark:bg-cyber-900 rounded-full overflow-hidden">
                                                <div className="h-full bg-violet-500" style={{ width: `${Math.min(100, (node.connections / (stats.topConnected[0]?.connections || 1)) * 100)}%` }}></div>
                                            </div>
                                            <span className="text-xs font-mono text-slate-400">{node.connections}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Quote */}
                <div className="p-6 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 rounded-xl border border-cyan-500/20 text-center">
                    <p className="text-slate-600 dark:text-slate-300 text-sm italic font-medium">
                        "Your knowledge graph is growing stronger every day. Keep connecting the dots."
                    </p>
                </div>

            </div>
        </div>
    );
};