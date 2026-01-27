// ========================
// Core Document Types
// ========================

export interface MarkdownFile {
  id: string;
  name: string;
  content: string;
  lastModified: number;
  handle?: FileSystemFileHandle; // For local file persistence
  isLocal?: boolean;
  path?: string; // Relative path for folder imports (e.g. "docs/v1/intro.md")
  // AI-Enhanced Metadata
  summary?: string; // AI Generated Summary for search previews
  importance?: number; // 0-10 Score automatically assessed by AI
  keyConcepts?: string[]; // Auto-extracted key concepts
  // Cursor & Scroll Position Memory
  cursorPosition?: { start: number; end: number };
  scrollTop?: number;
}

// ========================
// View & Layout Types
// ========================

export enum ViewMode {
  Split = 'SPLIT',
  Editor = 'EDITOR',
  Preview = 'PREVIEW',
  Graph = 'GRAPH',
  Quiz = 'QUIZ',
  MindMap = 'MINDMAP',
  NoteSpace = 'NOTE_SPACE',
  Library = 'LIBRARY',
  Analytics = 'ANALYTICS',
  Diff = 'DIFF',
  Roadmap = 'ROADMAP'
}

export interface EditorPane {
  id: string;
  fileId: string;
  mode: 'editor' | 'preview';
}

export type MindMapDetailLevel = 'compact' | 'detailed';

// 3D Note Space Layout
export interface NoteLayoutItem {
  id: string; // matches file.id
  x: number;
  y: number;
  z: number;
  rotation: number; // Y-axis rotation in degrees
  width: number;
  height: number;
  scale: number;
  color?: string; // Optional background override
  isPinned?: boolean;
}

// ========================
// Theme System
// ========================

export type ThemeType = 'dark' | 'light';

// Helper type for compatibility with old code
export type Theme = ThemeType; 

export interface ThemeColors {
  '--bg-main': string;
  '--bg-panel': string;
  '--bg-element': string;
  '--border-main': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--primary-500': string; // Main Brand Color
  '--primary-600': string; // Hover state / Deeper
  '--secondary-500': string; // Accent (Violet usually)

  // Neutral palette mappings for Tailwind Slate
  '--neutral-50': string;
  '--neutral-100': string;
  '--neutral-200': string;
  '--neutral-300': string; // Used for text in dark mode
  '--neutral-400': string;
  '--neutral-500': string;
  '--neutral-600': string;
  '--neutral-700': string;
  '--neutral-800': string; // Used for text in light mode
  '--neutral-900': string;

  // Font Configuration (Optional)
  '--font-primary'?: string;
  '--font-header'?: string;
  '--font-mono'?: string;

  // Font Size Configuration (Optional) - rem values
  '--font-size-base'?: string;      // Base font size (default: 1rem)
  '--font-size-sm'?: string;        // Small text
  '--font-size-lg'?: string;        // Large text
  '--font-size-h1'?: string;        // H1 heading
  '--font-size-h2'?: string;        // H2 heading
  '--font-size-h3'?: string;        // H3 heading
  '--line-height-base'?: string;    // Base line height

  // Index signature for additional custom properties
  [key: string]: string | undefined;
}

export interface AppTheme {
  id: string;
  name: string;
  type: ThemeType;
  colors: ThemeColors;
  isCustom?: boolean;
}

// ========================
// AI Configuration
// ========================

export interface AIState {
  isThinking: boolean;
  error: string | null;
  message: string | null;
}

export type AIProvider = 'gemini' | 'ollama' | 'openai' | 'anthropic';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type BackupFrequency = 'never' | 'daily' | 'weekly' | 'monthly';

export interface AIConfig {
  provider: AIProvider;
  model: string;
  embeddingProvider?: AIProvider;
  embeddingModel?: string;
  embeddingBaseUrl?: string;
  embeddingApiKey?: string;
  compactModel?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature: number;
  language: 'en' | 'zh';
  enableWebSearch?: boolean;
  enableStreaming?: boolean;
  mcpTools?: string;
  customPrompts?: {
    polish?: string;
    expand?: string;
    enhance?: string;
  };
  backup?: {
    frequency: BackupFrequency;
    lastBackup: number;
  };
  security?: {
    enableLoginProtection?: boolean;
  };
  contextEngine?: {
    enabled: boolean;
    maxTokens: number;
    modelContextLimit?: number;
    modelOutputLimit?: number;
    compactThreshold: number;
    pruneThreshold: number;
    truncateThreshold: number;
    messagesToKeep: number;
    checkpointInterval: number;
  };
  tagSuggestion?: {
    enabled: boolean;
    autoSuggest: boolean;
  };
}

// ========================
// RAG & Chat System
// ========================

export interface RAGResultData {
  fileName: string;
  count: number;
  maxScore: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, JsonValue>;
  partialArgs?: Record<string, JsonValue>;
  rawArgs?: string;
  result?: JsonValue;
  status: 'pending' | 'running' | 'success' | 'error';
  provider?: AIProvider;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export type ToolEventCallback = (toolCall: ToolCall) => void;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  tool_call_id?: string;
  toolCalls?: ToolCall[]; // Display tool call process in UI
  ragResults?: {
    totalChunks: number;
    queryTime: number;
    results: RAGResultData[];
  };
}

// Vector Store Types (for RAG system)
export interface VectorChunk {
  id: string;
  fileId: string;
  text: string;
  embedding?: number[];
  metadata: {
    start: number;
    end: number;
    fileName: string;
  };
}

export interface IndexMeta {
  fileId: string;
  lastModified: number;
  chunkCount: number;
  indexedAt: number;
  embeddingModel?: string;
  embeddingProvider?: string;
}

// ========================
// Knowledge Graph
// ========================

export interface GraphNode {
  id: string;
  label: string;
  group?: number;
  val?: number;
  type?: 'file' | 'exam' | 'question'; // Added type for node distinction
  score?: number; // 0-100 for exam mastery coloring
}

export interface GraphLink {
  source: string;
  target: string;
  relationship?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ========================
// Quiz & Exam System
// ========================

export type QuestionType = 'single' | 'multiple' | 'text' | 'fill_blank';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type ExamMode = 'practice' | 'exam';

export interface ExamConfig {
  mode: ExamMode;
  duration: number; // minutes, 0 for unlimited
  passingScore: number; // percentage
  showAnswers: 'immediate' | 'after_submit';
}

export interface GradingResult {
  score: number; // 0-100
  feedback: string;
  keyPointsMatched: string[];
  keyPointsMissed: string[];
  suggestion?: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[];
  // Support both numeric index (new) and string (legacy) formats
  // single: number (0-3) or string ('A', 'Option A')
  // multiple: number[] ([0, 2]) or string[] (['A', 'C'])
  // fill_blank/text: string
  correctAnswer?: number | number[] | string | string[];
  userAnswer?: number | number[] | string | string[];
  explanation?: string;
  isCorrect?: boolean;

  // Intelligent Grading Result
  gradingResult?: GradingResult;

  // New Metadata fields
  difficulty?: DifficultyLevel;
  tags?: string[];
  knowledgePoints?: string[];
  sourceFileId?: string;
  created?: number;

  // Question Bank fields
  questionBankId?: string;
  timesUsed: number;
  lastUsed?: number;
  successRate: number;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  isGraded: boolean;
  score?: number; // Percentage

  // Exam Specifics
  config?: ExamConfig;
  startTime?: number;
  endTime?: number;
  status?: 'not_started' | 'in_progress' | 'completed';
  sourceFileId?: string; // Link back to note
}

export interface QuestionBank {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  questions: QuizQuestion[];
  createdAt: number;
  updatedAt: number;
  sourceFileIds: string[];
}

export interface QuestionBankStats {
  totalQuestions: number;
  byDifficulty: Record<DifficultyLevel, number>;
  byTags: Record<string, number>;
  averageSuccessRate: number;
}

export interface MistakeRecord {
  id: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation?: string;
  timestamp: number;
  quizTitle?: string;
}

// ========================
// Analytics & Study Tracking
// ========================

export interface ExamResult {
  id: string;
  quizTitle: string;
  date: number; // timestamp
  score: number; // percentage
  totalQuestions: number;
  correctCount: number;
  duration: number; // seconds
  tags: string[]; // Aggregated tags from questions
  sourceFileId?: string; // Added to link back for graph
}

export interface KnowledgePointStat {
  tag: string;
  totalQuestions: number;
  correctQuestions: number;
  accuracy: number; // 0-100
}

// Spaced Repetition Types
export interface ReviewTask {
  id: string;
  scheduledDate: number; // Timestamp
  completedDate?: number; // Timestamp or undefined
  status: 'pending' | 'completed' | 'overdue' | 'future';
  intervalLabel: string; // e.g., "5 mins", "1 day"
}

export interface StudyPlan {
  id: string;
  title: string;
  sourceType: 'file' | 'mistake';
  sourceId: string; // ID of the file or MistakeRecord
  createdDate: number;
  tasks: ReviewTask[];
  progress: number; // 0-100
  tags?: string[];
}

// ========================
// Search & Library
// ========================

export interface Snippet {
  id: string;
  name: string;
  content: string;
  category: 'code' | 'text' | 'template' | 'wikilink';
  description?: string;
}

export interface SearchResult {
  fileId: string;
  fileName: string;
  path: string;
  score: number;
  matches: {
    type: 'title' | 'content' | 'tag';
    text: string;
    indices?: [number, number]; // Start/End index of match
  }[];
  lastModified: number;
  tags: string[];
}

// ========================
// ========================
// Editor Types
// ========================

// CodeMirror Editor Ref Interface (view kept as unknown to avoid CodeMirror dependency)
export interface CodeMirrorEditorRef {
  view: unknown;
  insertText: (text: string) => void;
  getSelection: () => string;
}

// Action ID for editor actions
export type ActionId =
  | 'insert_wikilink'
  | 'insert_blockref'
  | 'quick_link'
  | 'toggleBold'
  | 'toggleItalic'
  | 'toggleCode'
  | 'toggleHeading'
  | 'toggleList'
  | 'toggleLink'
  | 'splitView'
  | 'aiChat'
  | 'settings'
  | 'undo'
  | 'redo';

// Link Insert Result
export interface LinkInsertResult {
  type: 'wikilink' | 'blockref' | 'quick_link';
  fileName: string;
  fileId?: string;
  alias?: string;
  startLine?: number;
  endLine?: number;
  selectedText?: string;
}

// ========================
// Utilities & System
// ========================

export interface RAGStats {
  totalFiles: number;
  indexedFiles: number;
  totalChunks: number;
  isIndexing: boolean;
}

export interface OCRStats {
  isProcessing: boolean;      // 是否正在处理 OCR
  totalPages: number;         // 总页数
  processedPages: number;     // 已处理页数
  currentFile?: string;       // 当前处理的文件名
}

export interface ImportProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
}

export interface AppShortcut {
  id: string;
  label: string;
  keys: string; // e.g. "Ctrl+S", "Alt+Shift+P"
  actionId: string;
}

// ========================
// Speech Recognition (Web Speech API)
// ========================

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

export interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

// ========================
// Memory Candidate (for Compact Memory Prompt)
// ========================

export interface MemoryCandidate {
  summary: string;
  topics: string[];
  decisions: string[];
  keyFindings: string[];
  score: number;
  shouldPromote: boolean;
  messageCount: number;
}

// ========================
// Global Window Extensions
// ========================

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
    jspdf: unknown;
  }
}
