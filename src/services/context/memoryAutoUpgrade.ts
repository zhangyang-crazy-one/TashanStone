import { CompactedSession } from './types';

export interface PermanentMemoryTemplate {
  id: string;
  title: string;
  content: string;
  summary?: string;
  sourcePath: string;
  sourceType: 'file' | 'conversation' | 'manual';
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  topics: string[];
  category?: string;
  importance: 'low' | 'medium' | 'high';
  isStarred: boolean;
  accessCount: number;
  promotedFrom?: string;
  promotedAt?: number;
}

export interface MidTermMemoryRecord {
  id: string;
  sessionId: string;
  summary: string;
  content: string;
  topics: string[];
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  isStarred: boolean;
}

interface MemoryAutoUpgradeConfig {
  midTermMaxAge: number;
  permanentThreshold: number;
  autoUpgradeEnabled: boolean;
  aiSummaryEnabled: boolean;
  checkIntervalMs: number;
}

const DEFAULT_CONFIG: MemoryAutoUpgradeConfig = {
  midTermMaxAge: 7 * 24 * 60 * 60 * 1000,
  permanentThreshold: 30 * 24 * 60 * 60 * 1000,
  autoUpgradeEnabled: true,
  aiSummaryEnabled: true,
  checkIntervalMs: 60 * 60 * 1000,
};

export class MemoryAutoUpgradeService {
  private config: MemoryAutoUpgradeConfig;
  private isRunning: boolean = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<MemoryAutoUpgradeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.isRunning) {
      console.log('[MemoryAutoUpgrade] Service already running');
      return;
    }

    this.isRunning = true;
    console.log('[MemoryAutoUpgrade] Service started');

    this.checkAndUpgrade();

    this.checkInterval = setInterval(() => {
      this.checkAndUpgrade();
    }, this.config.checkIntervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[MemoryAutoUpgrade] Service stopped');
  }

  async checkAndUpgrade(): Promise<{
    upgraded: number;
    starred: number;
    errors: string[];
  }> {
    const result = {
      upgraded: 0,
      starred: 0,
      errors: [] as string[],
    };

    if (!this.config.autoUpgradeEnabled) {
      console.log('[MemoryAutoUpgrade] Auto-upgrade disabled');
      return result;
    }

    console.log('[MemoryAutoUpgrade] Checking for memories to upgrade...');

    try {
      const midTermMemories = await this.getMidTermMemories();
      const now = Date.now();

      for (const memory of midTermMemories) {
        try {
          const daysSinceAccess = (now - memory.lastAccessedAt) / (1000 * 60 * 60 * 24);
          const shouldUpgrade = 
            daysSinceAccess * 24 * 60 * 60 * 1000 > this.config.permanentThreshold ||
            memory.accessCount >= 3 ||
            memory.isStarred;

          if (shouldUpgrade) {
            await this.upgradeToPermanent(memory);
            
            if (memory.isStarred) {
              result.starred++;
            } else {
              result.upgraded++;
            }
            
            console.log('[MemoryAutoUpgrade] Upgraded memory:', memory.id);
          }
        } catch (error) {
          const errorMsg = `Failed to upgrade memory ${memory.id}: ${error}`;
          result.errors.push(errorMsg);
          console.error('[MemoryAutoUpgrade]', errorMsg);
        }
      }

      console.log('[MemoryAutoUpgrade] Check complete:', result);
    } catch (error) {
      console.error('[MemoryAutoUpgrade] Check failed:', error);
      result.errors.push(`Check failed: ${error}`);
    }

    return result;
  }

  async upgradeToPermanent(memory: MidTermMemoryRecord): Promise<PermanentMemoryTemplate> {
    const now = Date.now();

    let summary: string;
    if (this.config.aiSummaryEnabled) {
      summary = await this.generateAISummary(memory.content, memory.summary);
    } else {
      summary = this.generateHeuristicSummary(memory.content, memory.summary);
    }

    const permanentMemory: PermanentMemoryTemplate = {
      id: `perm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title: this.extractTitle(memory.content, memory.summary),
      content: memory.content,
      summary,
      sourcePath: `conversation://${memory.sessionId}`,
      sourceType: 'conversation',
      createdAt: memory.createdAt,
      updatedAt: now,
      lastAccessedAt: now,
      topics: memory.topics || [],
      category: this.categorizeContent(memory.content),
      importance: this.determineImportance(memory),
      isStarred: false,
      accessCount: memory.accessCount,
      promotedFrom: memory.id,
      promotedAt: now,
    };

    await this.saveToPermanent(permanentMemory);
    await this.markAsPromoted(memory.id);

    return permanentMemory;
  }

  async generateAISummary(content: string, existingSummary?: string): Promise<string> {
    if (existingSummary && existingSummary.length > 50) {
      return existingSummary;
    }

    try {
      if ((window as any).electronAPI?.ai?.generateSummary) {
        const result = await (window as any).electronAPI.ai.generateSummary({
          content,
          maxLength: 200,
          language: this.detectLanguage(content),
        });
        
        if (result?.summary) {
          console.log('[MemoryAutoUpgrade] AI summary generated');
          return result.summary;
        }
      }
    } catch (error) {
      console.warn('[MemoryAutoUpgrade] AI summary failed, using heuristic:', error);
    }

    return this.generateHeuristicSummary(content, existingSummary);
  }

  generateHeuristicSummary(content: string, existingSummary?: string): string {
    if (existingSummary && existingSummary.length > 20) {
      return existingSummary;
    }

    const maxLength = 200;
    let summary = content
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*|__/g, '')
      .replace(/\*|_/g, '')
      .replace(/\[|\]/g, '')
      .replace(/\(|\)/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (summary.length > maxLength) {
      summary = summary.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
    }

    return summary || 'No summary available';
  }

  async processStarredMemories(): Promise<{ processed: number; errors: string[] }> {
    const result = { processed: 0, errors: [] as string[] };

    try {
      const starredMemories = await this.getStarredMemories();

      for (const memory of starredMemories) {
        try {
          await this.upgradeToPermanent(memory);
          await this.unstarMemory(memory.id);
          result.processed++;
          console.log('[MemoryAutoUpgrade] Processed starred memory:', memory.id);
        } catch (error) {
          const errorMsg = `Failed to process starred memory ${memory.id}: ${error}`;
          result.errors.push(errorMsg);
          console.error('[MemoryAutoUpgrade]', errorMsg);
        }
      }
    } catch (error) {
      console.error('[MemoryAutoUpgrade] Failed to get starred memories:', error);
      result.errors.push(`Failed to get starred memories: ${error}`);
    }

    return result;
  }

  private async getMidTermMemories(): Promise<MidTermMemoryRecord[]> {
    try {
      if ((window as any).electronAPI?.memory?.getMidTermMemories) {
        return await (window as any).electronAPI.memory.getMidTermMemories();
      }
    } catch (error) {
      console.warn('[MemoryAutoUpgrade] Failed to get mid-term memories:', error);
    }
    return [];
  }

  private async getStarredMemories(): Promise<MidTermMemoryRecord[]> {
    try {
      if ((window as any).electronAPI?.memory?.getStarredMemories) {
        return await (window as any).electronAPI.memory.getStarredMemories();
      }
    } catch (error) {
      console.warn('[MemoryAutoUpgrade] Failed to get starred memories:', error);
    }
    return [];
  }

  private async saveToPermanent(memory: PermanentMemoryTemplate): Promise<void> {
    try {
      if ((window as any).electronAPI?.memory?.savePermanent) {
        await (window as any).electronAPI.memory.savePermanent(memory);
        console.log('[MemoryAutoUpgrade] Saved to permanent:', memory.id);
      } else {
        console.warn('[MemoryAutoUpgrade] savePermanent IPC not available');
      }
    } catch (error) {
      console.error('[MemoryAutoUpgrade] Failed to save permanent memory:', error);
      throw error;
    }
  }

  private async markAsPromoted(memoryId: string): Promise<void> {
    try {
      if ((window as any).electronAPI?.memory?.markAsPromoted) {
        await (window as any).electronAPI.memory.markAsPromoted(memoryId);
      }
    } catch (error) {
      console.warn('[MemoryAutoUpgrade] Failed to mark as promoted:', error);
    }
  }

  private async unstarMemory(memoryId: string): Promise<void> {
    try {
      if ((window as any).electronAPI?.memory?.star) {
        await (window as any).electronAPI.memory.star(memoryId, false);
      }
    } catch (error) {
      console.warn('[MemoryAutoUpgrade] Failed to unstar memory:', error);
    }
  }

  private extractTitle(content: string, summary?: string): string {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      return titleMatch[1].substring(0, 100);
    }

    if (summary) {
      const firstLine = summary.split('\n')[0];
      if (firstLine && firstLine.length > 5) {
        return firstLine.substring(0, 100);
      }
    }

    const words = content.split(/\s+/).filter(w => w.length > 3);
    return words.slice(0, 10).join(' ').substring(0, 100) || 'Untitled Memory';
  }

  private categorizeContent(content: string): string {
    const lowerContent = content.toLowerCase();
    
    const categories: [string, string[]][] = [
      ['Technical', ['function', 'class', 'import', 'export', 'api', 'interface', 'type', 'async', 'await', 'promise']],
      ['Project', ['todo', 'task', 'feature', 'bug', 'milestone', 'sprint', 'release', 'deploy']],
      ['Learning', ['learn', 'tutorial', 'guide', 'documentation', 'example', 'explain', 'concept']],
      ['Personal', ['note', 'idea', 'thought', 'remember', ' reminder', 'schedule']],
    ];

    for (const [category, keywords] of categories) {
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        return category;
      }
    }

    return 'General';
  }

  private determineImportance(memory: MidTermMemoryRecord): 'low' | 'medium' | 'high' {
    if (memory.isStarred) {
      return 'high';
    }

    if (memory.accessCount >= 5) {
      return 'high';
    }

    if (memory.accessCount >= 2) {
      return 'medium';
    }

    return 'low';
  }

  private detectLanguage(content: string): 'zh' | 'en' {
    const chineseChars = content.match(/[\u4e00-\u9fa5]/g);
    const englishWords = content.match(/\b[a-zA-Z]+\b/g);

    const chineseCount = chineseChars?.length || 0;
    const englishCount = englishWords?.length || 0;

    return chineseCount > englishCount ? 'zh' : 'en';
  }
}

export const memoryAutoUpgradeService = new MemoryAutoUpgradeService();
