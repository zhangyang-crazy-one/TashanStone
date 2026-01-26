export interface MemoryChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: unknown;
}

export interface PromotionCriteria {
  hasCodeFix: boolean;
  hasLearning: boolean;
  hasTechStack: boolean;
  userMarkedImportant: boolean;
  mentionCount: number;
  sessionLength: number;
}

const HIGH_IMPORTANCE_KEYWORDS = ['bug', 'fix', '修复', '问题', 'error', '优化', '性能', '安全'];
const TOPIC_KEYWORDS = [
  'React', 'TypeScript', 'Electron', 'Node.js', 'API', 'Database',
  'AI', 'Claude', 'MCP', 'RAG', '向量数据库', 'Context',
  'Bug', 'Fix', 'Error', '性能', '优化', '架构', '设计',
  '组件', '状态管理', '内存', '存储', '文件', '搜索',
];
const DECISION_PATTERNS = [
  /(?:we decided|decided to|decision was|chose to|will use|using)\s+([^.]+)/gi,
  /(?:解决方案|solution|方法|approach)[:\s]+([^.]+)/gi,
];
const FINDING_PATTERNS = [
  /(?:found|discovered|learned|noticed|realized|important|critical|key)[s]?[:\s]+([^.]+)/gi,
  /(?:发现|重要|关键|注意)[:\s]+([^.]+)/gi,
];

export const calculateMemoryImportance = (
  topics: string[],
  decisions: string[],
  keyFindings: string[]
): 'low' | 'medium' | 'high' => {
  let score = 0;
  score += decisions.length * 2;
  score += keyFindings.length * 1.5;
  score += topics.length * 0.5;

  if (topics.some(t => HIGH_IMPORTANCE_KEYWORDS.some(k => t.toLowerCase().includes(k)))) {
    score += 3;
  }

  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
};

export const shouldPromoteToPermanentMemory = (
  decisions: string[],
  keyFindings: string[],
  topics: string[],
  sessionLength: number,
  criteria?: Partial<PromotionCriteria>
): boolean => {
  const {
    hasCodeFix = decisions.some(d =>
      /\b(fix|bug|error|issue|repair|solve|resolve)\b/i.test(d)
    ),
    hasLearning = keyFindings.some(f =>
      /\b(learn|discover|understand|realize|notice)\b/i.test(f)
    ),
    hasTechStack = topics.some(t =>
      /\b(react|typescript|electron|node|python|api|database|server|client)\b/i.test(t)
    ),
    userMarkedImportant = false,
    mentionCount = 0,
    sessionLength: minSessionLength = 10,
  } = criteria || {};

  const score = (hasCodeFix ? 3 : 0) +
                (hasLearning ? 2 : 0) +
                (hasTechStack ? 1 : 0) +
                (userMarkedImportant ? 5 : 0) +
                Math.min(mentionCount, 3);

  return score >= 3 || sessionLength >= minSessionLength;
};

export const generateSessionSummary = (messages: MemoryChatMessage[]): string => {
  const userMsgs = messages.filter(m => m.role === 'user').slice(-5);
  const assistantMsgs = messages.filter(m => m.role === 'assistant').slice(-5);

  const recentConversation = userMsgs.map((u, i) => {
    const a = assistantMsgs[i];
    const userContent = typeof u.content === 'string' ? u.content : '';
    const assistantContent = typeof a?.content === 'string' ? a.content : 'N/A';
    return `User: ${userContent.substring(0, 200)}...\nAssistant: ${assistantContent.substring(0, 200)}...`;
  }).join('\n\n---\n\n');

  return `会话包含 ${messages.length} 条消息。\n\n最近对话：\n${recentConversation}`;
};

export const extractTopics = (messages: MemoryChatMessage[]): string[] => {
  const topics: Set<string> = new Set();

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    for (const keyword of TOPIC_KEYWORDS) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        topics.add(keyword);
      }
    }
  }

  return Array.from(topics).slice(0, 5);
};

export const extractDecisions = (messages: MemoryChatMessage[]): string[] => {
  const decisions: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      for (const pattern of DECISION_PATTERNS) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            decisions.push(match[1].trim().substring(0, 150));
          }
        }
      }
    }
  }

  return [...new Set(decisions)].slice(0, 5);
};

export const extractKeyFindings = (messages: MemoryChatMessage[]): string[] => {
  const findings: string[] = [];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    for (const pattern of FINDING_PATTERNS) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          findings.push(match[1].trim().substring(0, 200));
        }
      }
    }
  }

  return [...new Set(findings)].slice(0, 5);
};
