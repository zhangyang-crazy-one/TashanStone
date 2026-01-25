import type { AIConfig, AppShortcut, MarkdownFile } from '../../types';

export const generateId = () => Math.random().toString(36).substring(2, 11);

export const DEFAULT_CONTENT = "# Welcome to ZhangNote 📝\n\nTry opening a local folder or importing a PDF!";

export const DEFAULT_FILE: MarkdownFile = {
  id: 'default-1',
  name: 'Welcome',
  content: DEFAULT_CONTENT,
  lastModified: Date.now(),
  path: 'Welcome.md'
};

export const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  embeddingModel: 'text-embedding-004',
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,
  language: 'en',
  enableWebSearch: false,
  mcpTools: '[]',
  customPrompts: {
    polish: "You are an expert technical editor. Improve the provided Markdown content for clarity, grammar, and flow. Return only the polished Markdown.",
    expand: "You are a creative technical writer. Expand on the provided Markdown content, adding relevant details, examples, or explanations. Return only the expanded Markdown."
  },
  // 🔧 修复: 添加 contextEngine 默认值
  contextEngine: {
    enabled: true,
    maxTokens: 1000000,
    modelContextLimit: 200000,
    modelOutputLimit: 16000,
    compactThreshold: 0.85,
    pruneThreshold: 0.70,
    truncateThreshold: 0.90,
    messagesToKeep: 3,
    checkpointInterval: 20
  }
};

export const DEFAULT_SHORTCUTS: AppShortcut[] = [
  { id: 'save', label: 'Save File', keys: 'Ctrl+S', actionId: 'save' },
  { id: 'sidebar', label: 'Toggle Sidebar', keys: 'Ctrl+B', actionId: 'toggle_sidebar' },
  { id: 'settings', label: 'Open Settings', keys: 'Alt+S', actionId: 'open_settings' },
  { id: 'chat', label: 'Toggle Chat', keys: 'Alt+C', actionId: 'toggle_chat' },
  { id: 'new_file', label: 'New File', keys: 'Alt+N', actionId: 'new_file' },
  { id: 'polish', label: 'AI Polish', keys: 'Alt+P', actionId: 'ai_polish' },
  { id: 'graph', label: 'Build Graph', keys: 'Alt+G', actionId: 'build_graph' },
  { id: 'smart_organize', label: 'Smart Organize', keys: 'Alt+O', actionId: 'smart_organize' },
  { id: 'search', label: 'Search Files', keys: 'Ctrl+F', actionId: 'search' },
  // Link Insert shortcuts
  { id: 'insert_wikilink', label: 'Insert WikiLink', keys: 'Ctrl+Alt+K', actionId: 'insert_wikilink' },
  { id: 'insert_blockref', label: 'Insert Block Reference', keys: 'Ctrl+Alt+Shift+K', actionId: 'insert_blockref' },
  { id: 'quick_link', label: 'Quick Link', keys: 'Ctrl+Alt+L', actionId: 'quick_link' }
];

export const STREAM_UPDATE_INTERVAL_MS = 40;
