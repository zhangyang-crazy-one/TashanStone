import { ApiMessage } from './types';
import { TokenBudget } from './token-budget';

export const PROJECT_MEMORY_DIR = '.tasha/memory';
export const MEMORY_INDEX_FILE = 'memory-index.md';

export interface ProjectMemory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  importance: 'low' | 'medium' | 'high';
  sourceSession?: string;
  createdAt: number;
  updatedAt: number;
  relatedFiles: string[];
}

export interface MemoryIndex {
  version: string;
  lastUpdated: number;
  memories: ProjectMemory[];
  tags: Record<string, string[]>;
}

export interface ProjectContext {
  projectInfo: string;
  techStack: string[];
  keyConcepts: string[];
  recentProgress: string[];
  activeTasks: string[];
  decisions: string[];
}

export const DEFAULT_MEMORY_INDEX: MemoryIndex = {
  version: '1.0.0',
  lastUpdated: Date.now(),
  memories: [],
  tags: {},
};

export function createMemoryTemplate(title: string, content: string, tags: string[]): string {
  return `---
title: ${title}
tags: ${tags.join(', ')}
created: ${new Date().toISOString()}
---

# ${title}

${content}
`;
}

export function parseMemoryFile(content: string): Partial<ProjectMemory> {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled Memory';

  const tagsMatch = content.match(/tags:\s*(.+)$/m);
  const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()) : [];

  const createdMatch = content.match(/created:\s*(.+)$/m);
  const createdAt = createdMatch ? new Date(createdMatch[1]).getTime() : Date.now();

  const bodyStart = content.indexOf('\n# ');
  const bodyContent = bodyStart > -1 ? content.slice(bodyStart + 1) : content;

  return {
    title,
    tags,
    createdAt,
    content: bodyContent.trim(),
  };
}

export function generateProjectContext(index: MemoryIndex): ProjectContext {
  const importantMemories = index.memories.filter(m => m.importance === 'high');
  const techStack = extractTechStack(index);
  const keyConcepts = extractKeyConcepts(index);
  const recentProgress = index.memories
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map(m => `- ${m.title} (${new Date(m.updatedAt).toLocaleDateString()})`);
  const activeTasks = index.memories
    .filter(m => m.tags.includes('task') || m.tags.includes('todo'))
    .map(m => `- ${m.title}`);
  const decisions = index.memories
    .filter(m => m.tags.includes('decision'))
    .map(m => `- ${m.title}: ${m.content.slice(0, 100)}...`);

  return {
    projectInfo: `TashaStone - AI驱动的Markdown编辑器，项目包含 ${index.memories.length} 条记忆记录`,
    techStack,
    keyConcepts,
    recentProgress,
    activeTasks,
    decisions,
  };
}

function extractTechStack(index: MemoryIndex): string[] {
  const techTags = ['react', 'electron', 'typescript', 'vite', 'sqlite', 'lancedb', 'gemini', 'tailwind'];
  const found = new Set<string>();
  for (const memory of index.memories) {
    for (const tag of memory.tags) {
      if (techTags.includes(tag.toLowerCase())) {
        found.add(tag);
      }
    }
  }
  return Array.from(found);
}

function extractKeyConcepts(index: MemoryIndex): string[] {
  const conceptTags = ['context-engineering', 'rag', 'mcp', 'memory', 'compression'];
  const found = new Set<string>();
  for (const memory of index.memories) {
    for (const tag of memory.tags) {
      if (conceptTags.includes(tag.toLowerCase())) {
        found.add(tag);
      }
    }
  }
  return Array.from(found);
}

export function formatProjectContextForInjection(context: ProjectContext): string {
  const lines = [
    '## 项目上下文',
    '',
    `**项目信息**: ${context.projectInfo}`,
    '',
    '**技术栈**:',
    ...context.techStack.map(t => `- ${t}`),
    '',
    '**核心概念**:',
    ...context.keyConcepts.map(c => `- ${c}`),
    '',
    '**最近进展**:',
    ...context.recentProgress,
    '',
    '**进行中任务**:',
    ...context.activeTasks,
    '',
    '**重要决策**:',
    ...context.decisions,
    '',
  ];

  return lines.join('\n');
}

export class ProjectMemoryService {
  private tokenBudget: TokenBudget;

  constructor() {
    this.tokenBudget = new TokenBudget();
  }

  async createMemory(
    workspacePath: string,
    title: string,
    content: string,
    tags: string[],
    importance: ProjectMemory['importance'] = 'medium',
    relatedFiles: string[] = []
  ): Promise<ProjectMemory> {
    const memory: ProjectMemory = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title,
      content,
      tags,
      importance,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      relatedFiles,
    };

    const memoryContent = createMemoryTemplate(title, content, tags);
    const fileName = `${memory.id}.md`;
    const filePath = `${workspacePath}/${PROJECT_MEMORY_DIR}/${fileName}`;

    return memory;
  }

  async loadMemoryIndex(workspacePath: string): Promise<MemoryIndex> {
    const indexPath = `${workspacePath}/${PROJECT_MEMORY_DIR}/${MEMORY_INDEX_FILE}`;

    return DEFAULT_MEMORY_INDEX;
  }

  async saveMemoryIndex(workspacePath: string, index: MemoryIndex): Promise<void> {
    index.lastUpdated = Date.now();
  }

  async getMemoriesByTag(workspacePath: string, tag: string): Promise<ProjectMemory[]> {
    const index = await this.loadMemoryIndex(workspacePath);
    return index.memories.filter(m => m.tags.includes(tag));
  }

  async getRelevantMemories(
    workspacePath: string,
    query: string,
    limit: number = 5
  ): Promise<ProjectMemory[]> {
    const index = await this.loadMemoryIndex(workspacePath);
    const queryLower = query.toLowerCase();

    const scored = index.memories.map(m => {
      let score = 0;
      if (m.title.toLowerCase().includes(queryLower)) score += 10;
      if (m.content.toLowerCase().includes(queryLower)) score += 5;
      for (const tag of m.tags) {
        if (tag.toLowerCase().includes(queryLower)) score += 3;
      }
      return { memory: m, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
  }

  async formatContextForConversation(
    workspacePath: string,
    maxTokens: number = 5000
  ): Promise<string> {
    const index = await this.loadMemoryIndex(workspacePath);
    const context = generateProjectContext(index);
    const formatted = formatProjectContextForInjection(context);
    const tokens = await this.tokenBudget.estimateTokens(formatted);

    if (tokens > maxTokens) {
      return formatProjectContextForInjection({
        ...context,
        recentProgress: context.recentProgress.slice(0, 3),
        activeTasks: context.activeTasks.slice(0, 3),
        decisions: context.decisions.slice(0, 3),
      });
    }

    return formatted;
  }

  async addConversationMemory(
    workspacePath: string,
    sessionId: string,
    messages: ApiMessage[],
    summary: string
  ): Promise<ProjectMemory> {
    const memory = await this.createMemory(
      workspacePath,
      `对话 ${sessionId}`,
      summary,
      ['conversation', 'session', sessionId],
      'low',
      []
    );

    return memory;
  }

  async addDecisionMemory(
    workspacePath: string,
    decision: string,
    rationale: string,
    outcome?: string
  ): Promise<ProjectMemory> {
    const content = `## 决策\n\n${decision}\n\n## 理由\n\n${rationale}${outcome ? `\n\n## 结果\n\n${outcome}` : ''}`;
    
    return this.createMemory(
      workspacePath,
      `决策: ${decision.slice(0, 50)}...`,
      content,
      ['decision', 'architecture'],
      'high'
    );
  }

  async addArchitectureMemory(
    workspacePath: string,
    component: string,
    description: string,
    relationships: string[]
  ): Promise<ProjectMemory> {
    const content = `## 组件\n\n${component}\n\n## 描述\n\n${description}\n\n## 关联\n\n${relationships.map(r => `- ${r}`).join('\n')}`;
    
    return this.createMemory(
      workspacePath,
      `架构: ${component}`,
      content,
      ['architecture', 'component'],
      'high'
    );
  }

  listMemoryFiles(workspacePath: string): string[] {
    return [`${PROJECT_MEMORY_DIR}/`, `${PROJECT_MEMORY_DIR}/${MEMORY_INDEX_FILE}`];
  }
}

export const globalProjectMemoryService = new ProjectMemoryService();
