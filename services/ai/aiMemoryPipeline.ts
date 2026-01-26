import type { ChatMessage, MemoryCandidate } from "../../types";
import {
  ApiMessage,
  Checkpoint,
  CompactedSession,
  ContextConfig,
  ContextManager,
  ContextMemoryService,
  IndexedConversation,
  InMemoryStorage,
  TokenBudget,
  TokenUsage,
  createContextManager,
  createPersistentMemoryService,
  type LongTermMemoryStorage,
  MemoryDocument,
  PersistentMemoryService,
} from "../../src/services/context";

// ========================
// Context Engineering Integration
// ========================

// P0 Performance Optimization: LRU Cache for Context Managers
// Prevent sessionContextManagers from growing indefinitely

interface ContextManagerEntry {
  manager: ContextManager;
  lastAccessed: number;
}

class LRUSessionCache {
  private cache: Map<string, ContextManagerEntry>;
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(maxSize: number = 50, maxAgeMinutes: number = 30) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.maxAge = maxAgeMinutes * 60 * 1000;
  }

  get(sessionId: string): ContextManager | undefined {
    const entry = this.cache.get(sessionId);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.lastAccessed > this.maxAge) {
      this.cache.delete(sessionId);
      return undefined;
    }

    // Update access time (move to end)
    entry.lastAccessed = Date.now();
    this.cache.delete(sessionId);
    this.cache.set(sessionId, entry);

    return entry.manager;
  }

  set(sessionId: string, manager: ContextManager): void {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      const oldest = this.cache.get(oldestKey);
      if (oldest && Date.now() - oldest.lastAccessed > this.maxAge) {
        // Only remove if expired, otherwise keep it
        this.cache.delete(oldestKey);
      } else {
        // Force remove oldest even if not expired
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(sessionId, {
      manager,
      lastAccessed: Date.now()
    });
  }

  delete(sessionId: string): boolean {
    return this.cache.delete(sessionId);
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): { size: number; maxSize: number; oldestAge: number | null } {
    let oldestAge: number | null = null;
    if (this.cache.size > 0) {
      const oldest = Array.from(this.cache.values())
        .reduce((min, entry) => Math.min(min, Date.now() - entry.lastAccessed), Infinity);
      oldestAge = oldest;
    }
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      oldestAge
    };
  }
}

// Global session cache with 50 sessions, 30 minutes expiry
const sessionContextCache = new LRUSessionCache(50, 30);

// Legacy map for backward compatibility during migration
const sessionContextManagers: Map<string, ContextManager> = new Map();

export function getContextManager(sessionId: string): ContextManager {
  // Try new cache first
  let manager = sessionContextCache.get(sessionId);
  
  // Fallback to legacy map during migration
  if (!manager) {
    manager = sessionContextManagers.get(sessionId);
    if (!manager) {
      manager = createContextManager(sessionId);
    }
  }
  
  // Update both caches
  sessionContextCache.set(sessionId, manager);
  sessionContextManagers.set(sessionId, manager);
  
  return manager;
}

export function createContextManagerForSession(
  sessionId: string,
  config?: Partial<ContextConfig>
): ContextManager {
  const manager = createContextManager(sessionId, config);
  
  // Update both caches
  sessionContextCache.set(sessionId, manager);
  sessionContextManagers.set(sessionId, manager);
  
  return manager;
}

export function removeContextManager(sessionId: string): void {
  sessionContextCache.delete(sessionId);
  sessionContextManagers.delete(sessionId);
}

export function clearAllContextManagers(): void {
  sessionContextCache.clear();
  sessionContextManagers.clear();
}

export function getContextCacheStats(): { cache: { size: number; maxSize: number; oldestAge: number | null } } {
  return {
    cache: sessionContextCache.stats()
  };
}

export async function manageContextForSession(
  sessionId: string,
  systemPrompt: string,
  aiCompactFn?: (content: string) => Promise<string>
): Promise<{ messages: ApiMessage[]; usage: TokenUsage; action: string; savedTokens?: number }> {
  const manager = getContextManager(sessionId);
  const result = await manager.manageContext(systemPrompt, aiCompactFn);
  return {
    messages: result.messages,
    usage: result.usage,
    action: result.action,
    savedTokens: result.saved_tokens,
  };
}

export function addMessageToContext(
  sessionId: string,
  message: ApiMessage
): void {
  const manager = getContextManager(sessionId);
  manager.addMessage(message);
}

export function addMessagesToContext(
  sessionId: string,
  messages: ApiMessage[]
): void {
  const manager = getContextManager(sessionId);
  manager.addMessages(messages);
}

export async function getContextMessages(
  sessionId: string
): Promise<ApiMessage[]> {
  const manager = getContextManager(sessionId);
  return manager.getMessages();
}

export async function getEffectiveContextHistory(
  sessionId: string
): Promise<ApiMessage[]> {
  const manager = getContextManager(sessionId);
  return manager.getEffectiveHistory();
}

export async function analyzeContextUsage(
  sessionId: string,
  systemPrompt: string
): Promise<{ usage: TokenUsage; status: ReturnType<TokenBudget['checkThresholds']> }> {
  const manager = getContextManager(sessionId);
  return manager.analyzeUsage(systemPrompt);
}

export async function createContextCheckpoint(
  sessionId: string,
  name?: string
): Promise<Checkpoint> {
  const manager = getContextManager(sessionId);
  return manager.createCheckpoint(name);
}

export function clearContext(sessionId: string): void {
  const manager = sessionContextManagers.get(sessionId);
  if (manager) {
    manager.clear();
  }
}

export function convertChatMessageToApiMessage(msg: ChatMessage): ApiMessage {
  return {
    id: msg.id,
    role: msg.role as ApiMessage['role'],
    content: msg.content,
    timestamp: msg.timestamp,
    tool_call_id: msg.tool_call_id,
  };
}

export function convertApiMessageToChatMessage(msg: ApiMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role === 'system' ? 'assistant' : msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  };
}

// ========================
// Context Persistence (Phase 2)
// ========================

export interface CheckpointStorage {
  saveCheckpoint(checkpoint: Checkpoint, messages: ApiMessage[]): Promise<void>;
  getCheckpoint(checkpointId: string): Promise<{ checkpoint: Checkpoint; messages: ApiMessage[] } | null>;
  listCheckpoints(sessionId: string): Promise<Checkpoint[]>;
  deleteCheckpoint(checkpointId: string): Promise<boolean>;
  saveCompactedSession(session: CompactedSession): Promise<void>;
  getCompactedSessions(sessionId: string): Promise<CompactedSession[]>;
}

let globalCheckpointStorage: CheckpointStorage | null = null;

export function setGlobalCheckpointStorage(storage: CheckpointStorage): void {
  globalCheckpointStorage = storage;
}

export function getGlobalCheckpointStorage(): CheckpointStorage | null {
  return globalCheckpointStorage;
}

export function enableContextPersistence(
  sessionId: string,
  autoSave: boolean = true
): void {
  const manager = getContextManager(sessionId);
  if (globalCheckpointStorage) {
    manager.enablePersistence(globalCheckpointStorage, autoSave);
  }
}

export function disableContextPersistence(sessionId: string): void {
  const manager = sessionContextManagers.get(sessionId);
  if (manager) {
    manager.disablePersistence();
  }
}

export async function restoreContextFromCheckpoint(
  sessionId: string,
  checkpointId: string
): Promise<boolean> {
  const manager = getContextManager(sessionId);
  return manager.restoreFromCheckpoint(checkpointId);
}

export async function getContextCheckpoints(
  sessionId: string
): Promise<Checkpoint[]> {
  const manager = getContextManager(sessionId);
  return manager.listCheckpoints();
}

export async function deleteContextCheckpoint(
  checkpointId: string
): Promise<boolean> {
  const storage = globalCheckpointStorage;
  if (!storage) return false;
  return storage.deleteCheckpoint(checkpointId);
}

export async function saveCompactedSession(
  sessionId: string,
  summary: string,
  keyTopics: string[],
  decisions: string[],
  messageStart: number,
  messageEnd: number
): Promise<void> {
  const storage = globalCheckpointStorage;
  if (!storage) return;

  const session: CompactedSession = {
    id: `mid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    session_id: sessionId,
    summary,
    key_topics: keyTopics,
    decisions: decisions,
    message_range: { start: messageStart, end: messageEnd },
    created_at: Date.now(),
  };

  await storage.saveCompactedSession(session);
}

export async function getCompactedSessions(
  sessionId: string
): Promise<CompactedSession[]> {
  const storage = globalCheckpointStorage;
  if (!storage) return [];
  return storage.getCompactedSessions(sessionId);
}

// ========================
// Phase 3: Three-Layer Memory Integration
// ========================

export interface MemoryStats {
  shortTermSessions: number;
  midTermSessions: number;
  longTermConversations: number;
}

let contextMemoryService: ContextMemoryService | null = null;

export function initializeContextMemory(
  options?: {
    maxTokens?: number;
    midTermMaxAge?: number;
    longTermStorage?: LongTermMemoryStorage;
  }
): ContextMemoryService {
  const midTermStorage = new InMemoryStorage();
  contextMemoryService = new ContextMemoryService(midTermStorage, options?.longTermStorage);
  return contextMemoryService;
}

export function setContextMemoryService(service: ContextMemoryService): void {
  contextMemoryService = service;
}

export function getContextMemoryService(): ContextMemoryService | null {
  return contextMemoryService;
}

export function addMessageToMemory(
  sessionId: string,
  message: ApiMessage
): void {
  contextMemoryService?.addMessage(sessionId, message);
}

export async function getMemoryContext(
  sessionId: string,
  maxTokens?: number
): Promise<ApiMessage[]> {
  if (!contextMemoryService) {
    return [];
  }
  return contextMemoryService.getContext(sessionId, maxTokens);
}

export async function promoteSessionToMidTerm(
  sessionId: string,
  summary: string,
  keyTopics: string[],
  decisions: string[]
): Promise<CompactedSession | null> {
  if (!contextMemoryService) return null;
  return contextMemoryService.promoteToMidTerm(sessionId, summary, keyTopics, decisions);
}

export async function promoteSessionToLongTerm(
  sessionId: string,
  summary: string,
  topics: string[]
): Promise<IndexedConversation | null> {
  if (!contextMemoryService) return null;
  return contextMemoryService.promoteToLongTerm(sessionId, summary, topics);
}

export async function searchRelevantHistory(
  query: string,
  limit: number = 5
): Promise<IndexedConversation[]> {
  if (!contextMemoryService) return [];
  return contextMemoryService.searchRelevantHistory(query, limit);
}

export function clearMemorySession(sessionId: string): void {
  contextMemoryService?.clearSession(sessionId);
}

export async function getMemoryStats(): Promise<MemoryStats> {
  if (!contextMemoryService) {
    return { shortTermSessions: 0, midTermSessions: 0, longTermConversations: 0 };
  }
  return contextMemoryService.getMemoryStats();
}

export async function createMemoryFromCheckpoint(
  checkpointId: string
): Promise<boolean> {
  const storage = globalCheckpointStorage;
  if (!storage) return false;

  const result = await storage.getCheckpoint(checkpointId);
  if (!result) return false;

  if (!contextMemoryService) {
    initializeContextMemory();
  }

  await contextMemoryService?.createMemoryFromCheckpoint(result.checkpoint, result.messages);
  return true;
}

export async function reconstructContextWithMemories(
  sessionId: string,
  systemPrompt: string
): Promise<ApiMessage[]> {
  const memoryContext = await getMemoryContext(sessionId);
  const currentContext = await getContextMessages(sessionId);

  const allMessages = [...memoryContext, ...currentContext];
  return allMessages;
}

// ========================
// Phase 3.5: Persistent Memory (Permanent Memory Documents)
// ========================

let persistentMemoryService: PersistentMemoryService | null = null;

export function initializePersistentMemory(
  options?: { memoriesFolder?: string }
): PersistentMemoryService {
  persistentMemoryService = createPersistentMemoryService({
    memoriesFolder: options?.memoriesFolder ?? '.memories',
  });
  return persistentMemoryService;
}

export function setPersistentMemoryService(service: PersistentMemoryService): void {
  persistentMemoryService = service;
}

export function getPersistentMemoryService(): PersistentMemoryService | null {
  return persistentMemoryService;
}

export async function initPersistentMemory(): Promise<void> {
  if (!persistentMemoryService) {
    initializePersistentMemory();
  }
  await persistentMemoryService?.initialize();
}

export function setMemoryEmbeddingService(
  service: (text: string) => Promise<number[]>
): void {
  persistentMemoryService?.setEmbeddingService(service);
}

export async function promoteToPermanentMemory(
  sessionId: string,
  summary: string,
  topics: string[],
  decisions: string[],
  keyFindings: string[]
): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) {
    console.warn('[PersistentMemory] Service not initialized');
    return null;
  }
  return persistentMemoryService.createMemoryFromSession(
    sessionId,
    summary,
    topics,
    decisions,
    keyFindings
  );
}

export async function getPermanentMemories(): Promise<MemoryDocument[]> {
  if (!persistentMemoryService) return [];
  return persistentMemoryService.getAllMemories();
}

export async function getPermanentMemory(id: string): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) return null;
  return persistentMemoryService.getMemory(id);
}

export async function searchPermanentMemories(
  query: string,
  limit: number = 5
): Promise<MemoryDocument[]> {
  if (!persistentMemoryService) return [];
  return persistentMemoryService.searchMemories(query, limit);
}

export async function updatePermanentMemory(
  id: string,
  content: string
): Promise<boolean> {
  if (!persistentMemoryService) return false;
  return persistentMemoryService.updateMemory(id, content);
}

export async function deletePermanentMemory(id: string): Promise<boolean> {
  if (!persistentMemoryService) return false;
  return persistentMemoryService.deleteMemory(id);
}

export async function getAllMemoryStats(): Promise<{
  shortTermSessions: number;
  midTermSessions: number;
  longTermConversations: number;
  permanentMemories: number;
}> {
  const memStats = await getMemoryStats();
  const permMemories = await getPermanentMemories();
  return {
    ...memStats,
    permanentMemories: permMemories.length,
  };
}

// ========================
// Memory Analysis for Compact Prompt
// ========================

/**
 * Analyze session for memory without saving - returns MemoryCandidate for user review
 */
export function analyzeSessionForMemory(
  messages: ChatMessageForMemory[]
): MemoryCandidate {
  const summary = generateSessionSummary(messages);
  const topics = extractTopics(messages);
  const decisions = extractDecisions(messages);
  const keyFindings = extractKeyFindings(messages);

  // Calculate score
  const hasCodeFix = decisions.some(d =>
    /\b(fix|bug|error|issue|repair|solve|resolve)\b/i.test(d)
  );
  const hasLearning = keyFindings.some(f =>
    /\b(learn|discover|understand|realize|notice)\b/i.test(f)
  );
  const hasTechStack = topics.some(t =>
    /\b(react|typescript|electron|node|python|api|database|server|client)\b/i.test(t)
  );

  const score = (hasCodeFix ? 3 : 0) +
                (hasLearning ? 2 : 0) +
                (hasTechStack ? 1 : 0);

  const shouldPromote = score >= 3 || messages.length >= 15;

  return {
    summary,
    topics,
    decisions,
    keyFindings,
    score,
    shouldPromote,
    messageCount: messages.length
  };
}

/**
 * Create memory from user-confirmed candidate
 */
export async function createMemoryFromCandidate(
  sessionId: string,
  candidate: MemoryCandidate,
  editedSummary: string,
  embeddingService: (text: string) => Promise<number[]>
): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) {
    console.warn('[CreateMemory] Service not initialized');
    return null;
  }

  persistentMemoryService.setEmbeddingService(embeddingService);

  return persistentMemoryService.createMemoryFromSession(
    sessionId,
    editedSummary || candidate.summary,
    candidate.topics,
    candidate.decisions,
    candidate.keyFindings
  );
}

// ========================
// Memory Auto-Creation Integration
// ========================

export interface ChatMessageForMemory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export async function autoCreateMemoryFromSession(
  sessionId: string,
  messages: ChatMessageForMemory[],
  embeddingService: (text: string) => Promise<number[]>
): Promise<MemoryDocument | null> {
  if (!persistentMemoryService) {
    console.warn('[AutoMemory] Service not initialized');
    return null;
  }

  if (messages.length < 5) {
    console.log('[AutoMemory] Session too short, skipping');
    return null;
  }

  const summary = generateSessionSummary(messages);
  const topics = extractTopics(messages);
  const decisions = extractDecisions(messages);
  const keyFindings = extractKeyFindings(messages);

  const shouldPromote = shouldPromoteToPermanentMemory(
    decisions,
    keyFindings,
    topics,
    messages.length
  );

  if (!shouldPromote) {
    console.log('[AutoMemory] Does not meet promotion criteria');
    return null;
  }

  persistentMemoryService.setEmbeddingService(embeddingService);

  return persistentMemoryService.createMemoryFromSession(
    sessionId,
    summary,
    topics,
    decisions,
    keyFindings
  );
}

function generateSessionSummary(messages: ChatMessageForMemory[]): string {
  const userMsgs = messages.filter(m => m.role === 'user').slice(-5);
  const assistantMsgs = messages.filter(m => m.role === 'assistant').slice(-5);

  const recentConversation = userMsgs.map((u, i) => {
    const a = assistantMsgs[i];
    const userContent = typeof u.content === 'string' ? u.content : JSON.stringify(u.content);
    const assistantContent = a ? (typeof a.content === 'string' ? a.content : JSON.stringify(a.content)) : 'N/A';
    return `User: ${userContent.substring(0, 200)}...\nAssistant: ${assistantContent.substring(0, 200)}...`;
  }).join('\n\n---\n\n');

  return `会话包含 ${messages.length} 条消息。\n\n最近对话：\n${recentConversation}`;
}

function extractTopics(messages: ChatMessageForMemory[]): string[] {
  const topics: Set<string> = new Set();
  const topicKeywords = [
    'React', 'TypeScript', 'Electron', 'Node.js', 'API', 'Database',
    'AI', 'Claude', 'MCP', 'RAG', '向量数据库', 'Context',
    'Bug', 'Fix', 'Error', '性能', '优化', '架构', '设计',
    '组件', '状态管理', '内存', '存储', '文件', '搜索',
  ];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    for (const keyword of topicKeywords) {
      if (content.toLowerCase().includes(keyword.toLowerCase())) {
        topics.add(keyword);
      }
    }
  }

  return Array.from(topics).slice(0, 5);
}

function extractDecisions(messages: ChatMessageForMemory[]): string[] {
  const decisions: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      const decisionPatterns = [
        /(?:we decided|decided to|decision was|chose to|will use|using)\s+([^.]+)/gi,
        /(?:解决方案|solution|方法|approach)[:\s]+([^.]+)/gi,
      ];

      for (const pattern of decisionPatterns) {
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
}

function extractKeyFindings(messages: ChatMessageForMemory[]): string[] {
  const findings: string[] = [];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    const findingPatterns = [
      /(?:found|discovered|learned|noticed|realized|important|critical|key)[s]?[:\s]+([^.]+)/gi,
      /(?:发现|重要|关键|注意)[:\s]+([^.]+)/gi,
    ];

    for (const pattern of findingPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          findings.push(match[1].trim().substring(0, 200));
        }
      }
    }
  }

  return [...new Set(findings)].slice(0, 5);
}

function shouldPromoteToPermanentMemory(
  decisions: string[],
  keyFindings: string[],
  topics: string[],
  sessionLength: number
): boolean {
  const hasCodeFix = decisions.some(d =>
    /\b(fix|bug|error|issue|repair|solve|resolve)\b/i.test(d)
  );
  const hasLearning = keyFindings.some(f =>
    /\b(learn|discover|understand|realize|notice)\b/i.test(f)
  );
  const hasTechStack = topics.some(t =>
    /\b(react|typescript|electron|node|python|api|database|server|client)\b/i.test(t)
  );

  const score = (hasCodeFix ? 3 : 0) +
                (hasLearning ? 2 : 0) +
                (hasTechStack ? 1 : 0);

  return score >= 3 || sessionLength >= 15;
}
