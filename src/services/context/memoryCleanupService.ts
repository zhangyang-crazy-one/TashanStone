/**
 * MemoryCleanupService - 清理陈旧和孤立的记忆条目
 * 
 * 功能:
 * 1. 清理过期中期记忆（30天未访问）
 * 2. 清理孤立的 LanceDB 向量条目
 * 3. 修复悬挂的升级（promoted 但没有对应的 long-term 条目）
 * 4. 统计清理信息
 * 
 * 注意：此服务通过 IPC 与主进程通信
 */

export interface CleanupReport {
    expiredMidTerm: number;
    orphanedVectors: number;
    danglingPromotions: number;
    errors: string[];
    freedSpace: number;
}

export interface CleanupStats {
    expiredCount: number;
    orphanedCount: number;
    danglingCount: number;
    totalMidTerm: number;      // 会话摘要 (SQLite compacted_sessions)
    totalLongTerm: number;     // 已升级会话 (SQLite compacted_sessions)
    persistentFiles: number;   // 持久记忆文件 (.memories/*.md)
}

export class MemoryCleanupService {
    private readonly EXPIRY_DAYS = 30;
    private readonly EXPIRY_MS = this.EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    /**
     * 运行完整的清理流程（通过 IPC）
     */
    async runCleanup(): Promise<CleanupReport> {
        try {
            if ((window as any).electronAPI?.memory?.runCleanup) {
                const result = await (window as any).electronAPI.memory.runCleanup();
                console.log('[MemoryCleanupService] Cleanup completed:', result);
                return result;
            } else {
                console.warn('[MemoryCleanupService] IPC handler not available');
                return {
                    expiredMidTerm: 0,
                    orphanedVectors: 0,
                    danglingPromotions: 0,
                    errors: ['IPC handler not available'],
                    freedSpace: 0,
                };
            }
        } catch (error) {
            console.error('[MemoryCleanupService] Cleanup failed:', error);
            return {
                expiredMidTerm: 0,
                orphanedVectors: 0,
                danglingPromotions: 0,
                errors: [error instanceof Error ? error.message : String(error)],
                freedSpace: 0,
            };
        }
    }

    /**
     * 获取清理统计信息（通过 IPC）
     */
    async getCleanupStats(): Promise<CleanupStats> {
        try {
            if ((window as any).electronAPI?.memory?.getCleanupStats) {
                const stats = await (window as any).electronAPI.memory.getCleanupStats();
                console.log('[MemoryCleanupService] Stats:', stats);
                return stats;
            } else {
                console.warn('[MemoryCleanupService] IPC handler not available');
                return {
                    expiredCount: 0,
                    orphanedCount: 0,
                    danglingCount: 0,
                    totalMidTerm: 0,
                    totalLongTerm: 0,
                    persistentFiles: 0,
                };
            }
        } catch (error) {
            console.error('[MemoryCleanupService] Failed to get stats:', error);
            return {
                expiredCount: 0,
                orphanedCount: 0,
                danglingCount: 0,
                totalMidTerm: 0,
                totalLongTerm: 0,
                persistentFiles: 0,
            };
        }
    }

    /**
     * 清理孤立向量条目（通过 IPC）
     */
    async cleanupOrphanedVectors(): Promise<{ deleted: number; errors: string[] }> {
        try {
            if ((window as any).electronAPI?.memory?.cleanupOrphanedVectors) {
                const result = await (window as any).electronAPI.memory.cleanupOrphanedVectors();
                console.log('[MemoryCleanupService] Cleaned orphaned vectors:', result);
                return result;
            } else {
                console.warn('[MemoryCleanupService] IPC handler not available');
                return { deleted: 0, errors: ['IPC handler not available'] };
            }
        } catch (error) {
            console.error('[MemoryCleanupService] Cleanup orphaned vectors failed:', error);
            return { 
                deleted: 0, 
                errors: [error instanceof Error ? error.message : String(error)] 
            };
        }
    }

    /**
     * 清理过期记忆（便捷方法）
     */
    async cleanupExpiredMemories(): Promise<number> {
        const report = await this.runCleanup();
        return report.expiredMidTerm;
    }

    /**
     * 获取内存统计概览
     */
    async getOverview(): Promise<{
        totalMemories: number;
        midTermCount: number;
        longTermCount: number;
        lastCleanup: string | null;
    }> {
        const stats = await this.getCleanupStats();
        return {
            totalMemories: stats.totalMidTerm + stats.totalLongTerm,
            midTermCount: stats.totalMidTerm,
            longTermCount: stats.totalLongTerm,
            lastCleanup: null, // 可以从设置中读取
        };
    }
}

export const memoryCleanupService = new MemoryCleanupService();
