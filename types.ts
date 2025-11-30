

export interface MarkdownFile {
  id: string;
  name: string;
  content: string;
  lastModified: number;
  handle?: FileSystemFileHandle; // For local file persistence
  isLocal?: boolean;
  path?: string; // Relative path for folder imports (e.g. "docs/v1/intro.md")
}

export enum ViewMode {
  Split = 'SPLIT',
  Editor = 'EDITOR',
  Preview = 'PREVIEW',
  Graph = 'GRAPH',
  Quiz = 'QUIZ',
  MindMap = 'MINDMAP'
}

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

export interface AIConfig {
  provider: AIProvider;
  model: string;
  baseUrl?: string; 
  apiKey?: string; 
  temperature: number;
  language: 'en' | 'zh'; // Added language support
  mcpTools?: string; // JSON string of custom tool definitions
  customPrompts?: {
    polish?: string;
    expand?: string;
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

// Quiz System Types
export interface QuizQuestion {
  id: string;
  type: 'single' | 'multiple' | 'text';
  question: string;
  options?: string[];
  correctAnswer?: string | string[]; // For auto-grading if applicable
  userAnswer?: string | string[];
  explanation?: string;
  isCorrect?: boolean;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
  isGraded: boolean;
  score?: number;
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