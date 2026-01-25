import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Trash } from 'lucide-react';
import { memoryCleanupService, type CleanupStats } from '../../src/services/context/memoryCleanupService';

interface MemoryStatsSectionProps {
  currentUiLang: 'zh' | 'en';
  showToast?: (message: string, isError?: boolean) => void;
}

export const MemoryStatsSection: React.FC<MemoryStatsSectionProps> = ({ currentUiLang, showToast }) => {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const t = currentUiLang === 'zh' ? {
    refresh: '刷新',
    runCleanup: '运行清理',
    cleaning: '清理中...',
    midTermSessions: '会话摘要',
    promotedSessions: '已升级会话',
    persistentFiles: '持久记忆文件',
    expiredCount: '过期数量',
    danglingCount: '悬挂升级',
    orphanedCount: '孤立向量',
    totalMemories: '总记忆数',
    cleanupSuccess: '清理完成：删除了 {count} 个过期记忆',
    cleanupError: '清理失败：{error}',
    noData: '暂无数据',
    sqliteLabel: 'SQLite',
    memoriesLabel: '.memories/',
  } : {
    refresh: 'Refresh',
    runCleanup: 'Run Cleanup',
    cleaning: 'Cleaning...',
    midTermSessions: 'Session Summaries',
    promotedSessions: 'Promoted Sessions',
    persistentFiles: 'Persistent Files',
    expiredCount: 'Expired',
    danglingCount: 'Dangling Upgrades',
    orphanedCount: 'Orphaned Vectors',
    totalMemories: 'Total Memories',
    cleanupSuccess: 'Cleanup completed: {count} expired memories removed',
    cleanupError: 'Cleanup failed: {error}',
    noData: 'No data',
    sqliteLabel: 'SQLite',
    memoriesLabel: '.memories/',
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await memoryCleanupService.getCleanupStats();
      setStats(result);
    } catch (error) {
      console.error('[MemoryStatsSection] Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCleanup = useCallback(async () => {
    setCleaning(true);
    try {
      const result = await memoryCleanupService.runCleanup();
      if (result.errors.length === 0) {
        showToast?.(t.cleanupSuccess.replace('{count}', String(result.expiredMidTerm)), false);
        await fetchStats();
      } else {
        showToast?.(t.cleanupError.replace('{error}', result.errors.join(', ')), true);
      }
    } catch (error) {
      showToast?.(t.cleanupError.replace('{error}', String(error)), true);
    } finally {
      setCleaning(false);
    }
  }, [fetchStats, showToast, t]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-4">
      {/* Stats Grid - 3+2 布局 */}
      <div className="space-y-3">
        {/* 第一行：主要统计 (3列) */}
        <div className="grid grid-cols-3 gap-3">
          {/* 会话摘要 (原中期记忆) */}
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.midTermSessions}</div>
            <div className="text-lg font-bold text-[rgb(var(--text-primary))]">
              {loading ? '...' : stats?.totalMidTerm || 0}
            </div>
            <div className="text-[10px] text-[rgb(var(--text-secondary))] opacity-60">
              {t.sqliteLabel}
            </div>
          </div>

          {/* 已升级会话 (原长期记忆) */}
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.promotedSessions}</div>
            <div className="text-lg font-bold text-[rgb(var(--text-primary))]">
              {loading ? '...' : stats?.totalLongTerm || 0}
            </div>
            <div className="text-[10px] text-[rgb(var(--text-secondary))] opacity-60">
              {t.sqliteLabel}
            </div>
          </div>

          {/* 🆕 持久记忆文件 */}
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg border-l-2 border-green-500">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.persistentFiles}</div>
            <div className="text-lg font-bold text-green-500">
              {loading ? '...' : stats?.persistentFiles || 0}
            </div>
            <div className="text-[10px] text-[rgb(var(--text-secondary))] opacity-60">
              {t.memoriesLabel}
            </div>
          </div>
        </div>

        {/* 第二行：清理相关 (2列) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.expiredCount}</div>
            <div className="text-lg font-bold text-orange-500">
              {loading ? '...' : stats?.expiredCount || 0}
            </div>
          </div>
          <div className="bg-[rgb(var(--bg-element))] p-3 rounded-lg">
            <div className="text-xs text-[rgb(var(--text-secondary))]">{t.danglingCount}</div>
            <div className="text-lg font-bold text-yellow-500">
              {loading ? '...' : stats?.danglingCount || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[rgb(var(--bg-element))] border border-[rgb(var(--border-main))] rounded-lg text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--border-main))] disabled:opacity-50 transition-colors text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {t.refresh}
        </button>
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 transition-colors text-sm"
        >
          {cleaning ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⏳</span>
              {t.cleaning}
            </span>
          ) : (
            <>
              <Trash size={14} />
              {t.runCleanup}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
