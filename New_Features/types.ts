

export interface MarkdownFile {
  id: string;
  name: string;
  content: string;
  lastModified: number;
  handle?: FileSystemFileHandle; // For local file persistence
  isLocal?: boolean;
  path?: string; // Relative path for folder imports (e.g. "docs/v1/intro.md")
  summary?: string; // AI Generated Summary for search previews
  importance?: number; // 0-10 Score automatically assessed by AI
  keyConcepts?: string[]; // Auto-extracted key concepts
}

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

export type ThemeType = 'dark' | 'light';

export interface EditorPane {
  id: string;
  fileId: string;
  mode: 'editor' | 'preview';
}

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
}

export interface AppTheme {
  id: string;
  name: string;
  type: ThemeType;
  colors: ThemeColors;
  isCustom?: boolean;
}

export interface AIState {
  isThinking: boolean;
  error: string | null;
  message: string | null;
}

export type AIProvider = 'gemini' | 'ollama' | 'openai';

export type BackupFrequency = 'never' | 'daily' | 'weekly' | 'monthly';

export interface AIConfig {
  provider: AIProvider;
  model: string;
  embeddingModel?: string; // Added embedding model selection
  compactModel?: string; // Model used for compacting context
  baseUrl?: string; 
  apiKey?: string; 
  temperature: number;
  language: 'en' | 'zh'; // Added language support
  enableWebSearch?: boolean; // Added Web Search support for Gemini
  mcpTools?: string; // JSON string of custom tool definitions
  customPrompts?: {
    polish?: string;
    expand?: string;
    enhance?: string; // New: Enhance User Prompt
  };
  backup?: {
    frequency: BackupFrequency;
    lastBackup: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  tool_call_id?: string;
}

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

// 3D Note Space Types
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

// Quiz System Types
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
  correctAnswer?: string | string[]; // For auto-grading if applicable
  userAnswer?: string | string[];
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

export interface MistakeRecord {
  id: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  explanation?: string;
  timestamp: number;
  quizTitle?: string;
}

// Analytics Types
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

export interface RAGStats {
  totalFiles: number;
  indexedFiles: number;
  totalChunks: number;
  isIndexing: boolean;
}

export interface AppShortcut {
  id: string;
  label: string;
  keys: string; // e.g. "Ctrl+S", "Alt+Shift+P"
  actionId: string;
}

export interface Snippet {
  id: string;
  name: string;
  content: string;
  category: 'code' | 'text' | 'template';
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

// --- Spaced Repetition Types ---

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

// --- Web Speech API Types ---
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

// Window augmentation
declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
    jspdf: any;
  }
}