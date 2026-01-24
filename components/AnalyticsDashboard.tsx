import { useMemo, useState } from 'react';
import { BarChart2, TrendingUp, TrendingDown, Target, Clock, Award, BookOpen, AlertTriangle, Calendar, Filter } from 'lucide-react';
import { ExamResult, KnowledgePointStat } from '../types';
import Tooltip from './Tooltip';

interface AnalyticsDashboardProps {
  examResults: ExamResult[];
  knowledgeStats: KnowledgePointStat[];
  totalStudyTime?: number; // minutes
  language?: 'en' | 'zh';
}

export const AnalyticsDashboard = ({
  examResults,
  knowledgeStats,
  totalStudyTime = 0,
  language = 'en'
}: AnalyticsDashboardProps) => {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('month');
  const [sortBy, setSortBy] = useState<'accuracy' | 'count'>('accuracy');

  const t = language === 'zh' ? {
    title: '学习分析仪表板',
    overview: '概览',
    avgScore: '平均分',
    totalExams: '总测验数',
    studyTime: '学习时间',
    weakPoints: '薄弱项',
    hours: '小时',
    minutes: '分钟',
    trend: '趋势',
    up: '上升',
    down: '下降',
    stable: '稳定',
    scoreHistory: '成绩历史',
    knowledgeMastery: '知识点掌握度',
    recentExams: '最近测验',
    accuracy: '准确率',
    questions: '题',
    date: '日期',
    score: '分数',
    duration: '用时',
    tags: '标签',
    filterBy: '筛选',
    week: '本周',
    month: '本月',
    all: '全部',
    sortBy: '排序',
    byAccuracy: '按准确率',
    byCount: '按题数',
    noData: '暂无数据',
    excellent: '优秀',
    good: '良好',
    needImprovement: '需改进'
  } : {
    title: 'Learning Analytics Dashboard',
    overview: 'Overview',
    avgScore: 'Avg Score',
    totalExams: 'Total Exams',
    studyTime: 'Study Time',
    weakPoints: 'Weak Points',
    hours: 'hrs',
    minutes: 'mins',
    trend: 'Trend',
    up: 'Up',
    down: 'Down',
    stable: 'Stable',
    scoreHistory: 'Score History',
    knowledgeMastery: 'Knowledge Mastery',
    recentExams: 'Recent Exams',
    accuracy: 'Accuracy',
    questions: 'Q',
    date: 'Date',
    score: 'Score',
    duration: 'Duration',
    tags: 'Tags',
    filterBy: 'Filter',
    week: 'This Week',
    month: 'This Month',
    all: 'All Time',
    sortBy: 'Sort',
    byAccuracy: 'By Accuracy',
    byCount: 'By Count',
    noData: 'No data available',
    excellent: 'Excellent',
    good: 'Good',
    needImprovement: 'Need Improvement'
  };

  const filteredResults = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    return examResults.filter(r => {
      if (timeRange === 'week') return now - r.date < weekMs;
      if (timeRange === 'month') return now - r.date < monthMs;
      return true;
    });
  }, [examResults, timeRange]);

  const stats = useMemo(() => {
    if (filteredResults.length === 0) {
      return { avgScore: 0, totalExams: 0, recentTrend: 'stable', weakPoints: [] };
    }

    const avgScore = filteredResults.reduce((sum, r) => sum + r.score, 0) / filteredResults.length;
    const totalExams = filteredResults.length;

    // Calculate trend from last 5 exams
    const recentExams = filteredResults.slice(-5);
    let recentTrend: 'up' | 'down' | 'stable' = 'stable';

    if (recentExams.length >= 3) {
      const firstHalf = recentExams.slice(0, Math.floor(recentExams.length / 2));
      const secondHalf = recentExams.slice(Math.floor(recentExams.length / 2));
      const firstAvg = firstHalf.reduce((s, r) => s + r.score, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, r) => s + r.score, 0) / secondHalf.length;

      if (secondAvg > firstAvg + 5) recentTrend = 'up';
      else if (secondAvg < firstAvg - 5) recentTrend = 'down';
    }

    const weakPoints = knowledgeStats
      .filter(k => k.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy);

    return { avgScore, totalExams, recentTrend, weakPoints };
  }, [filteredResults, knowledgeStats]);

  const sortedKnowledgeStats = useMemo(() => {
    const sorted = [...knowledgeStats];
    if (sortBy === 'accuracy') {
      return sorted.sort((a, b) => a.accuracy - b.accuracy);
    }
    return sorted.sort((a, b) => b.totalQuestions - a.totalQuestions);
  }, [knowledgeStats, sortBy]);

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)} ${t.minutes}`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}${t.hours} ${mins}${t.minutes}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 80) return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (accuracy >= 60) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getAccuracyLabel = (accuracy: number) => {
    if (accuracy >= 80) return t.excellent;
    if (accuracy >= 60) return t.good;
    return t.needImprovement;
  };

  if (examResults.length === 0 && knowledgeStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))]">
        <BarChart2 size={64} className="text-[rgb(var(--text-secondary))] mb-4" />
        <p className="text-xl text-[rgb(var(--text-secondary))]">{t.noData}</p>
        <p className="text-sm text-[rgb(var(--text-secondary))] mt-2">
          {language === 'zh' ? '完成一些测验后即可查看分析数据' : 'Complete some quizzes to see analytics'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))] custom-scrollbar">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart2 size={32} className="text-[rgb(var(--primary-500))]" />
            <h1 className="text-3xl font-bold text-[rgb(var(--primary-500))]">{t.title}</h1>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-2 bg-[rgb(var(--bg-panel))] rounded p-1">
            {(['week', 'month', 'all'] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  timeRange === range
                    ? 'bg-[rgb(var(--primary-500))] text-white'
                    : 'text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
                }`}
              >
                {t[range]}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Average Score */}
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))] hover:border-[rgb(var(--primary-500))] transition-colors">
            <div className="flex items-center justify-between mb-2">
              <Award className="text-[rgb(var(--primary-500))]" size={24} />
              <span className="text-3xl font-bold text-[rgb(var(--primary-500))]">
                {Math.round(stats.avgScore)}%
              </span>
            </div>
            <p className="text-sm text-[rgb(var(--text-secondary))]">{t.avgScore}</p>
          </div>

          {/* Total Exams */}
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))] hover:border-[rgb(var(--secondary-500))] transition-colors">
            <div className="flex items-center justify-between mb-2">
              <BookOpen className="text-[rgb(var(--secondary-500))]" size={24} />
              <span className="text-3xl font-bold text-[rgb(var(--secondary-500))]">
                {stats.totalExams}
              </span>
            </div>
            <p className="text-sm text-[rgb(var(--text-secondary))]">{t.totalExams}</p>
          </div>

          {/* Study Time */}
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))] hover:border-cyan-500 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <Clock className="text-cyan-400" size={24} />
              <span className="text-2xl font-bold text-cyan-400">
                {formatTime(totalStudyTime)}
              </span>
            </div>
            <p className="text-sm text-[rgb(var(--text-secondary))]">{t.studyTime}</p>
          </div>

          {/* Trend */}
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))] hover:border-emerald-500 transition-colors">
            <div className="flex items-center justify-between mb-2">
              {stats.recentTrend === 'up' && <TrendingUp className="text-emerald-400" size={24} />}
              {stats.recentTrend === 'down' && <TrendingDown className="text-red-400" size={24} />}
              {stats.recentTrend === 'stable' && <Target className="text-yellow-400" size={24} />}
              <span className={`text-lg font-semibold ${
                stats.recentTrend === 'up' ? 'text-emerald-400' :
                stats.recentTrend === 'down' ? 'text-red-400' : 'text-yellow-400'
              }`}>
                {t[stats.recentTrend]}
              </span>
            </div>
            <p className="text-sm text-[rgb(var(--text-secondary))]">{t.trend}</p>
          </div>
        </div>

        {/* Score History Chart */}
        {filteredResults.length > 0 && (
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))]">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <BarChart2 size={20} className="text-[rgb(var(--primary-500))]" />
              {t.scoreHistory}
            </h2>
            <div className="flex items-end justify-between gap-2 h-48">
              {filteredResults.slice(-10).map((result, idx) => {
                const height = Math.max(result.score, 5); // Minimum 5% height for visibility
                return (
                  <div key={result.id} className="flex-1 flex flex-col items-center gap-2">
                    <Tooltip content={`${result.quizTitle}: ${result.score}%`} className="w-full">
                      <div
                        className="w-full bg-gradient-to-t from-[rgb(var(--primary-500))] to-[rgb(var(--secondary-500))] rounded-t relative group cursor-pointer transition-all hover:opacity-80"
                        style={{ height: `${height}%` }}
                        aria-label={`${result.quizTitle}: ${result.score}%`}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[rgb(var(--bg-element))] px-2 py-1 rounded text-xs whitespace-nowrap">
                          {result.score}%
                        </div>
                      </div>
                    </Tooltip>
                    <span className="text-xs text-[rgb(var(--text-secondary))] rotate-45 origin-left mt-2">
                      {formatDate(result.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Knowledge Mastery */}
        {knowledgeStats.length > 0 && (
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Target size={20} className="text-[rgb(var(--primary-500))]" />
                {t.knowledgeMastery}
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[rgb(var(--text-secondary))]">{t.sortBy}:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'accuracy' | 'count')}
                  className="bg-[rgb(var(--bg-element))] text-[rgb(var(--text-primary))] px-3 py-1 rounded border border-[rgb(var(--border-main))] focus:outline-none focus:border-[rgb(var(--primary-500))]"
                >
                  <option value="accuracy">{t.byAccuracy}</option>
                  <option value="count">{t.byCount}</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {sortedKnowledgeStats.slice(0, 15).map(stat => (
                <div key={stat.tag} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[rgb(var(--text-primary))]">{stat.tag}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getAccuracyColor(stat.accuracy)}`}>
                        {getAccuracyLabel(stat.accuracy)}
                      </span>
                      <span className="text-[rgb(var(--text-secondary))]">
                        {stat.correctQuestions}/{stat.totalQuestions} {t.questions}
                      </span>
                      <span className="font-semibold text-[rgb(var(--text-primary))]">
                        {Math.round(stat.accuracy)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-[rgb(var(--bg-element))] rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stat.accuracy >= 80 ? 'bg-green-500' :
                        stat.accuracy >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${stat.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Exams List */}
        {filteredResults.length > 0 && (
          <div className="bg-[rgb(var(--bg-panel))] rounded-lg p-6 border border-[rgb(var(--border-main))]">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar size={20} className="text-[rgb(var(--primary-500))]" />
              {t.recentExams}
            </h2>
            <div className="space-y-2">
              {filteredResults.slice(-10).reverse().map(result => (
                <div
                  key={result.id}
                  className="flex items-center justify-between p-4 bg-[rgb(var(--bg-element))] rounded hover:bg-[rgb(var(--bg-element))]/80 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-[rgb(var(--text-primary))]">{result.quizTitle}</p>
                    <div className="flex items-center gap-4 mt-1 text-sm text-[rgb(var(--text-secondary))]">
                      <span className="flex items-center gap-1">
                        <Calendar size={14} />
                        {new Date(result.date).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {Math.floor(result.duration / 60)}m {result.duration % 60}s
                      </span>
                      {result.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {result.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-[rgb(var(--primary-500))]/20 text-[rgb(var(--primary-500))] rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${
                        result.score >= 80 ? 'text-green-400' :
                        result.score >= 60 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {Math.round(result.score)}%
                      </p>
                      <p className="text-xs text-[rgb(var(--text-secondary))]">
                        {result.correctCount}/{result.totalQuestions}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weak Points Alert */}
        {stats.weakPoints.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-400 flex-shrink-0 mt-1" size={24} />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-400 mb-2">{t.weakPoints}</h3>
                <div className="flex flex-wrap gap-2">
                  {stats.weakPoints.slice(0, 10).map(point => (
                    <span
                      key={point.tag}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded border border-red-500/30 text-sm"
                    >
                      {point.tag} ({Math.round(point.accuracy)}%)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
