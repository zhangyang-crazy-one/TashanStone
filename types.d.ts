export interface MarkdownFile {
    id: string;
    name: string;
    content: string;
    lastModified: number;
    handle?: FileSystemFileHandle;
    isLocal?: boolean;
    path?: string;
    summary?: string;
    importance?: number;
    keyConcepts?: string[];
    cursorPosition?: {
        start: number;
        end: number;
    };
    scrollTop?: number;
}
export declare enum ViewMode {
    Split = "SPLIT",
    Editor = "EDITOR",
    Preview = "PREVIEW",
    Graph = "GRAPH",
    Quiz = "QUIZ",
    MindMap = "MINDMAP",
    NoteSpace = "NOTE_SPACE",
    Library = "LIBRARY",
    Analytics = "ANALYTICS",
    Diff = "DIFF",
    Roadmap = "ROADMAP"
}
export interface EditorPane {
    id: string;
    fileId: string;
    mode: 'editor' | 'preview';
}
export interface NoteLayoutItem {
    id: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    width: number;
    height: number;
    scale: number;
    color?: string;
    isPinned?: boolean;
}
export type ThemeType = 'dark' | 'light';
export type Theme = ThemeType;
export interface ThemeColors {
    '--bg-main': string;
    '--bg-panel': string;
    '--bg-element': string;
    '--border-main': string;
    '--text-primary': string;
    '--text-secondary': string;
    '--primary-500': string;
    '--primary-600': string;
    '--secondary-500': string;
    '--neutral-50': string;
    '--neutral-100': string;
    '--neutral-200': string;
    '--neutral-300': string;
    '--neutral-400': string;
    '--neutral-500': string;
    '--neutral-600': string;
    '--neutral-700': string;
    '--neutral-800': string;
    '--neutral-900': string;
    '--font-primary'?: string;
    '--font-header'?: string;
    '--font-mono'?: string;
    '--font-size-base'?: string;
    '--font-size-sm'?: string;
    '--font-size-lg'?: string;
    '--font-size-h1'?: string;
    '--font-size-h2'?: string;
    '--font-size-h3'?: string;
    '--line-height-base'?: string;
    [key: string]: string | undefined;
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
export type AIProvider = 'gemini' | 'ollama' | 'openai' | 'anthropic';
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
        compactThreshold: number;
        pruneThreshold: number;
        truncateThreshold: number;
        messagesToKeep: number;
        checkpointInterval: number;
    };
}
export interface RAGResultData {
    fileName: string;
    count: number;
    maxScore: number;
}
export interface ToolCall {
    id: string;
    name: string;
    args: Record<string, any>;
    result?: any;
    status: 'pending' | 'running' | 'success' | 'error';
    error?: string;
    startTime?: number;
    endTime?: number;
}
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: number;
    tool_call_id?: string;
    toolCalls?: ToolCall[];
    ragResults?: {
        totalChunks: number;
        queryTime: number;
        results: RAGResultData[];
    };
}
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
export interface GraphNode {
    id: string;
    label: string;
    group?: number;
    val?: number;
    type?: 'file' | 'exam' | 'question';
    score?: number;
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
export type QuestionType = 'single' | 'multiple' | 'text' | 'fill_blank';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type ExamMode = 'practice' | 'exam';
export interface ExamConfig {
    mode: ExamMode;
    duration: number;
    passingScore: number;
    showAnswers: 'immediate' | 'after_submit';
}
export interface GradingResult {
    score: number;
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
    correctAnswer?: number | number[] | string | string[];
    userAnswer?: number | number[] | string | string[];
    explanation?: string;
    isCorrect?: boolean;
    gradingResult?: GradingResult;
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
    score?: number;
    config?: ExamConfig;
    startTime?: number;
    endTime?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
    sourceFileId?: string;
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
export interface ExamResult {
    id: string;
    quizTitle: string;
    date: number;
    score: number;
    totalQuestions: number;
    correctCount: number;
    duration: number;
    tags: string[];
    sourceFileId?: string;
}
export interface KnowledgePointStat {
    tag: string;
    totalQuestions: number;
    correctQuestions: number;
    accuracy: number;
}
export interface ReviewTask {
    id: string;
    scheduledDate: number;
    completedDate?: number;
    status: 'pending' | 'completed' | 'overdue' | 'future';
    intervalLabel: string;
}
export interface StudyPlan {
    id: string;
    title: string;
    sourceType: 'file' | 'mistake';
    sourceId: string;
    createdDate: number;
    tasks: ReviewTask[];
    progress: number;
    tags?: string[];
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
        indices?: [number, number];
    }[];
    lastModified: number;
    tags: string[];
}
export interface RAGStats {
    totalFiles: number;
    indexedFiles: number;
    totalChunks: number;
    isIndexing: boolean;
}
export interface OCRStats {
    isProcessing: boolean;
    totalPages: number;
    processedPages: number;
    currentFile?: string;
}
export interface ImportProgress {
    totalFiles: number;
    processedFiles: number;
    currentFile: string;
}
export interface AppShortcut {
    id: string;
    label: string;
    keys: string;
    actionId: string;
}
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
//# sourceMappingURL=types.d.ts.map