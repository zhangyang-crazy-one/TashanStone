

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Toolbar } from './components/Toolbar';
import { Preview } from './components/Preview';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { AISettingsModal } from './components/AISettingsModal';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { QuizPanel } from './components/QuizPanel';
import { MindMap } from './components/MindMap';
import { LoginScreen } from './components/LoginScreen';
import { EditorTabs } from './components/EditorTabs';
import { SplitEditor } from './components/SplitEditor';
import { DiffView } from './components/DiffView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { LearningRoadmap } from './components/LearningRoadmap';
import { ConfirmDialog } from './components/ConfirmDialog';
import { VoiceTranscriptionModal } from './components/VoiceTranscriptionModal';
import { BacklinkPanel } from './components/BacklinkPanel';
import { QuestionBankModal } from './components/QuestionBankModal';
import { TagSuggestionModal } from './components/TagSuggestionModal';
import { SmartOrganizeModal } from './components/SmartOrganizeModal';
import { SearchModal } from './components/SearchModal';
import { StudyPlanPanel } from './components/StudyPlanPanel';
import { LinkInsertModal } from './components/LinkInsertModal';
import { CompactMemoryPrompt } from './components/CompactMemoryPrompt';
import { ViewMode, AIState, MarkdownFile, AIConfig, ChatMessage, GraphData, AppTheme, Quiz, RAGStats, OCRStats, AppShortcut, RAGResultData, EditorPane, Snippet, StudyPlan, ExamResult, KnowledgePointStat, QuestionBank, QuizQuestion, LinkInsertResult, CodeMirrorEditorRef, MemoryCandidate, ToolCall, JsonValue } from './types';
import { polishContent, expandContent, generateAIResponse, generateAIResponseStream, generateKnowledgeGraph, synthesizeKnowledgeBase, generateQuiz, generateMindMap, extractQuizFromRawContent, compactConversation, searchPermanentMemories, autoCreateMemoryFromSession, initPersistentMemory, getEmbedding, analyzeSessionForMemory, createMemoryFromCandidate } from './services/aiService';
import { applyTheme, getAllThemes, getSavedThemeId, saveCustomTheme, deleteCustomTheme, DEFAULT_THEMES, getLastUsedThemeIdForMode } from './services/themeService';
import { readDirectory, readDirectoryEnhanced, saveFileToDisk, processPdfFile, extractTextFromFile, parseCsvToQuiz, isExtensionSupported } from './services/fileService';
import { VectorStore } from './services/ragService';
import { questionBankService } from './src/services/quiz/questionBankService';
import { mcpService } from './src/services/mcpService';
import { extractWikiLinks, extractTags } from './src/types/wiki';
import { Backlink } from './src/types/wiki';
import { buildKnowledgeIndexFromFiles, generateFileLinkGraph } from './src/services/wiki/wikiLinkService';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { undo as codeMirrorUndo, redo as codeMirrorRedo } from '@codemirror/commands';
import { translations, Language } from './utils/translations';
import { encodeBase64Utf8 } from './utils/base64';

const generateId = () => Math.random().toString(36).substring(2, 11);

const DEFAULT_CONTENT = "# Welcome to ZhangNote 📝\n\nTry opening a local folder or importing a PDF!";

const DEFAULT_FILE: MarkdownFile = {
  id: 'default-1',
  name: 'Welcome',
  content: DEFAULT_CONTENT,
  lastModified: Date.now(),
  path: 'Welcome.md'
};

const DEFAULT_AI_CONFIG: AIConfig = {
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

const DEFAULT_SHORTCUTS: AppShortcut[] = [
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

interface FileHistory {
  past: string[];
  future: string[];
}

const App: React.FC = () => {
  // --- Authentication State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentUsername, setCurrentUsername] = useState<string>('');

  // --- Theme State ---
  const [themes, setThemes] = useState<AppTheme[]>(() => {
    const t = getAllThemes();
    return t.length > 0 ? t : DEFAULT_THEMES;
  });
  const [activeThemeId, setActiveThemeId] = useState<string>(() => getSavedThemeId());

  const buildToolResultBlock = (toolName: string, toolResult: { success: boolean; formatted: string }) => {
    const encoded = encodeBase64Utf8(toolResult.formatted);
    if (encoded) {
      const status = toolResult.success ? 'success' : 'error';
      return `<tool_result name="${toolName}" status="${status}" encoding="base64">${encoded}</tool_result>`;
    }

    return `🔧 **Tool: ${toolName}**\n\`\`\`json\n${toolResult.formatted}\n\`\`\``;
  };

  useEffect(() => {
    // Apply theme on mount and when activeThemeId changes
    const currentTheme = themes.find(t => t.id === activeThemeId) || themes[0];
    if (currentTheme) {
      applyTheme(currentTheme);
    }
  }, [activeThemeId, themes]);

  // Expose searchPermanentMemories to window for ChatPanel memory search
  useEffect(() => {
    (window as any).searchPermanentMemories = searchPermanentMemories;
    return () => {
      delete (window as any).searchPermanentMemories;
    };
  }, []);

  // NOTE: Authentication check moved after aiConfig declaration (around line 200+)

  const handleThemeChange = (id: string) => {
    const theme = themes.find(t => t.id === id);
    if (theme) {
      applyTheme(theme);
      setActiveThemeId(id);
    }
  };

  const toggleTheme = () => {
    const currentTheme = themes.find(t => t.id === activeThemeId);
    if (!currentTheme) return;

    const targetType = currentTheme.type === 'dark' ? 'light' : 'dark';

    // Smart Toggle: Try to restore the user's last preferred theme for this mode
    const lastUsedId = getLastUsedThemeIdForMode(targetType);
    const lastUsedTheme = lastUsedId ? themes.find(t => t.id === lastUsedId) : undefined;

    if (lastUsedTheme) {
      handleThemeChange(lastUsedTheme.id);
    } else {
      // Fallback: Find first available theme of target type
      const targetTheme = themes.find(t => t.type === targetType);
      if (targetTheme) handleThemeChange(targetTheme.id);
    }
  };

  // --- File System State ---
  const [files, setFiles] = useState<MarkdownFile[]>(() => {
    try {
      const saved = localStorage.getItem('neon-files');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Robust sanitization to prevent crashes
        if (Array.isArray(parsed)) {
          const validFiles = parsed.filter(f => f && typeof f === 'object' && f.id && f.name);
          if (validFiles.length > 0) {
            // Deduplicate by name - keep only the latest version of each file
            const deduped = new Map<string, MarkdownFile>();
            for (const file of validFiles) {
              const key = file.path || file.name;
              const existing = deduped.get(key);
              // Keep the one with the latest lastModified, or the first one if timestamps match
              if (!existing || (file.lastModified > existing.lastModified)) {
                deduped.set(key, file);
              }
            }
            const dedupedFiles = Array.from(deduped.values());
            if (dedupedFiles.length !== validFiles.length) {
              console.log(`[App] Deduplicated files: ${validFiles.length} -> ${dedupedFiles.length}`);
            }
            return dedupedFiles;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load files from storage, using default", e);
    }
    return [DEFAULT_FILE];
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const saved = localStorage.getItem('neon-active-id');
    return saved || 'default-1';
  });

  const activeFile = files.find(f => f.id === activeFileId) || files[0] || DEFAULT_FILE;

  // --- Undo/Redo State ---
  const [history, setHistory] = useState<Record<string, FileHistory>>({});
  const lastEditTimeRef = useRef<number>(0);
  const HISTORY_DEBOUNCE = 1000; // ms
  const MAX_HISTORY = 50;

  // --- Feature State ---
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    try {
      const saved = localStorage.getItem('neon-ai-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_AI_CONFIG,
          ...parsed,
          // 🔧 修复: 深度合并 customPrompts
          customPrompts: { ...DEFAULT_AI_CONFIG.customPrompts, ...parsed.customPrompts },
          // 🔧 修复: 深度合并 contextEngine
          contextEngine: {
            ...(DEFAULT_AI_CONFIG.contextEngine || {}),
            ...(parsed.contextEngine || {})
          }
        };
      }
      return DEFAULT_AI_CONFIG;
    } catch (e) { return DEFAULT_AI_CONFIG; }
  });

  // --- Authentication Check (depends on aiConfig) ---
  useEffect(() => {
    const checkAuth = async () => {
      // Check if login protection is enabled
      const loginProtectionEnabled = aiConfig.security?.enableLoginProtection ?? false;

      // Only check auth in Electron mode AND if login protection is enabled
      if (window.electronAPI?.db?.auth && loginProtectionEnabled) {
        try {
          const registered = await window.electronAPI.db.auth.isRegistered();
          if (!registered) {
            // First-time use, needs registration
            setIsCheckingAuth(false);
            setIsAuthenticated(false);
          } else {
            // Already registered, needs login
            const username = await window.electronAPI.db.auth.getUsername();
            setCurrentUsername(username);
            setIsCheckingAuth(false);
            setIsAuthenticated(false); // User must enter password
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          setIsCheckingAuth(false);
          setIsAuthenticated(true); // Fail open for better UX
        }
      } else {
        // Web mode or login protection disabled, skip authentication
        setIsCheckingAuth(false);
        setIsAuthenticated(true);
      }
    };
    checkAuth();
  }, [aiConfig.security?.enableLoginProtection]); // Re-run when login protection setting changes

  const [shortcuts, setShortcuts] = useState<AppShortcut[]>(() => {
    try {
      const saved = localStorage.getItem('neon-shortcuts');
      return saved ? JSON.parse(saved) : DEFAULT_SHORTCUTS;
    } catch { return DEFAULT_SHORTCUTS; }
  });

  useEffect(() => {
    localStorage.setItem('neon-shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [graphType, setGraphType] = useState<'concept' | 'filelink'>('concept');
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [quizContext, setQuizContext] = useState<string>(''); // Stores raw text for quiz generation context
  const [mindMapContent, setMindMapContent] = useState<string>('');

  // Diff View State
  const [diffOriginal, setDiffOriginal] = useState<string>('');
  const [diffModified, setDiffModified] = useState<string>('');

  // Analytics State
  const [examHistory, setExamHistory] = useState<ExamResult[]>(() => {
    try {
      const saved = localStorage.getItem('neon-exam-history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgePointStat[]>([]);

  // Learning Roadmap State
  const [studyPlans, setStudyPlans] = useState<StudyPlan[]>(() => {
    try {
      const saved = localStorage.getItem('neon-study-plans');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Snippets State
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    try {
      const saved = localStorage.getItem('neon-snippets');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Backlinks State
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);

  // QuestionBank State
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);

  // TagSuggestion State
  const [isTagSuggestionOpen, setIsTagSuggestionOpen] = useState(false);

  // SmartOrganize State
  const [isSmartOrganizeOpen, setIsSmartOrganizeOpen] = useState(false);
  const [smartOrganizeFile, setSmartOrganizeFile] = useState<MarkdownFile | null>(null);

  // StudyPlan/Review State
  const [isStudyPlanOpen, setIsStudyPlanOpen] = useState(false);

  // Handle Smart Organize file updates
  const handleSmartOrganizeUpdate = (fileId: string, updates: Partial<MarkdownFile>) => {
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, ...updates } : f
    ));
  };

  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Chat History (Persistent)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('neon-chat-history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Split);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVoiceTranscriptionOpen, setIsVoiceTranscriptionOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [aiState, setAiState] = useState<AIState>({ isThinking: false, error: null, message: null });
  const [ragStats, setRagStats] = useState<RAGStats>({ totalFiles: 0, indexedFiles: 0, totalChunks: 0, isIndexing: false });
  const [ocrStats, setOcrStats] = useState<OCRStats>({ isProcessing: false, totalPages: 0, processedPages: 0 });

  // Multi-File Editor State
  const [openPanes, setOpenPanes] = useState<EditorPane[]>(() => {
    try {
      const saved = localStorage.getItem('neon-editor-panes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activePaneId, setActivePaneId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('neon-active-pane');
      return saved || null;
    } catch (e) {
      return null;
    }
  });
  const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>(() => {
    try {
      const saved = localStorage.getItem('neon-split-mode');
      return (saved as 'none' | 'horizontal' | 'vertical') || 'none';
    } catch (e) {
      return 'none';
    }
  });

  // Confirm Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  // Refs
  const filesRef = useRef(files);
  const activeFileIdRef = useRef(activeFileId);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const codeMirrorRef = useRef<CodeMirrorEditorRef>(null);

  // Link Insert Modal State
  const [isLinkInsertOpen, setIsLinkInsertOpen] = useState(false);
  const [linkInsertMode, setLinkInsertMode] = useState<'wikilink' | 'blockref' | 'quick_link'>('wikilink');

  // Compact Memory Prompt State
  const [showCompactMemoryPrompt, setShowCompactMemoryPrompt] = useState(false);
  const [compactMemoryCandidate, setCompactMemoryCandidate] = useState<MemoryCandidate | null>(null);
  const [isCompactSaving, setIsCompactSaving] = useState(false);

  // 同步存储光标位置的 ref（解决 React 18 异步状态批处理导致的竞态条件）
  const cursorPositionsRef = useRef<Map<string, { start: number; end: number }>>(new Map());

  // RAG Service
  const [vectorStore] = useState(() => new VectorStore());

  // Localization
  const lang: Language = aiConfig.language === 'zh' ? 'zh' : 'en';
  const t = translations[lang];

  useEffect(() => {
    filesRef.current = files;
    activeFileIdRef.current = activeFileId;
  }, [files, activeFileId]);

  // Event listener for editor action events (from CodeMirror shortcuts)
  useEffect(() => {
    const handleEditorAction = (e: Event) => {
      const event = e as CustomEvent;
      const action = event.detail;

      switch (action) {
        case 'insert_wikilink':
          setLinkInsertMode('wikilink');
          setIsLinkInsertOpen(true);
          break;
        case 'insert_blockref':
          setLinkInsertMode('blockref');
          setIsLinkInsertOpen(true);
          break;
        case 'quick_link':
          setLinkInsertMode('quick_link');
          setIsLinkInsertOpen(true);
          break;
      }
    };

    window.addEventListener('editor-action', handleEditorAction as EventListener);
    return () => window.removeEventListener('editor-action', handleEditorAction as EventListener);
  }, []);

  // Get selected text from active editor
  const getSelectedText = useCallback(() => {
    if (codeMirrorRef.current) {
      return codeMirrorRef.current.getSelection() || '';
    }
    return '';
  }, []);

  // Update RAG stats whenever files change (only total count)
  useEffect(() => {
    // Filter out .keep files and empty files from stats
    const validFiles = files.filter(f => !f.name.endsWith('.keep') && f.content.trim().length > 0);
    const indexedCount = vectorStore.getStats().indexedFiles;
    const totalChunks = vectorStore.getStats().totalChunks;

    setRagStats(prev => ({
      ...prev,
      totalFiles: validFiles.length,
      indexedFiles: indexedCount,
      totalChunks: totalChunks
    }));
  }, [files, vectorStore]);

  // Update backlinks when active file changes
  useEffect(() => {
    if (!activeFile) {
      setBacklinks([]);
      return;
    }

    const currentFileName = activeFile.name.toLowerCase();
    const currentFilePath = activeFile.path?.toLowerCase() || '';

    const newBacklinks: Backlink[] = [];

    files.forEach(file => {
      if (file.id === activeFileId) return;

      const links = extractWikiLinks(file.content);
      links.forEach(link => {
        const linkTarget = link.target.toLowerCase();
        if (linkTarget === currentFileName ||
          linkTarget === currentFilePath ||
          linkTarget.endsWith(`/${currentFileName}`) ||
          linkTarget === `${currentFileName}.md`) {
          newBacklinks.push({
            sourceFileId: file.id,
            sourceFileName: file.name,
            linkType: 'wikilink',
            context: link.alias || link.target
          });
        }
      });
    });

    setBacklinks(newBacklinks);
  }, [activeFileId, files]);

  // Persist Data
  useEffect(() => {
    localStorage.setItem('neon-chat-history', JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    localStorage.setItem('neon-ai-config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  // Persist new states
  useEffect(() => {
    localStorage.setItem('neon-exam-history', JSON.stringify(examHistory));
  }, [examHistory]);

  useEffect(() => {
    localStorage.setItem('neon-study-plans', JSON.stringify(studyPlans));
  }, [studyPlans]);

  useEffect(() => {
    localStorage.setItem('neon-snippets', JSON.stringify(snippets));
  }, [snippets]);

  // Persist Multi-File Editor State
  useEffect(() => {
    localStorage.setItem('neon-editor-panes', JSON.stringify(openPanes));
  }, [openPanes]);

  useEffect(() => {
    localStorage.setItem('neon-active-pane', activePaneId || '');
  }, [activePaneId]);

  useEffect(() => {
    localStorage.setItem('neon-split-mode', splitMode);
  }, [splitMode]);

  // Auto-create default pane when openPanes is empty but files exist
  // This ensures the editor always has something to display
  useEffect(() => {
    if (openPanes.length === 0 && files.length > 0) {
      const defaultFile = files.find(f => f.id === activeFileId) || files[0];
      if (defaultFile) {
        const newPaneId = generateId();
        const newPane: EditorPane = {
          id: newPaneId,
          fileId: defaultFile.id,
          mode: 'editor'
        };
        setOpenPanes([newPane]);
        setActivePaneId(newPaneId);
        console.log('[App] Created default editor pane for:', defaultFile.name);
      }
    }
  }, [openPanes.length, files.length, activeFileId]);

  // Initialize VectorStore, MCP and Persistent Memory on startup
  useEffect(() => {
    const initServices = async () => {
      // Initialize VectorStore
      try {
        await vectorStore.initialize();
        console.log('[VectorStore] Initialized');
      } catch (err) {
        console.error('[VectorStore] Init failed:', err);
      }

      // Initialize Persistent Memory Service
      try {
        await initPersistentMemory();
        console.log('[PersistentMemory] Initialized');
      } catch (err) {
        console.error('[PersistentMemory] Init failed:', err);
      }

      // Initialize MCP
      if (aiConfig.mcpTools && aiConfig.mcpTools.trim() !== '[]' && mcpService.isAvailable()) {
        try {
          console.log('[MCP] Loading saved configuration...');
          const result = await mcpService.loadConfig(aiConfig.mcpTools);
          if (result.success) {
            console.log('[MCP] Configuration loaded successfully on startup');
          } else {
            console.warn('[MCP] Failed to load configuration on startup:', result.error);
          }
        } catch (e) {
          console.error('[MCP] Error loading configuration on startup:', e);
        }
      }

      // Initialize Context Memory with Long-Term Storage
      try {
        const { initializeContextMemory } = await import('./services/aiService');
        const { LanceDBMemoryStorage } = await import('./src/services/context/long-term-memory');

        const longTermStorage = new LanceDBMemoryStorage();
        const initialized = await longTermStorage.initialize();

        if (initialized) {
          initializeContextMemory({ longTermStorage });
          console.log('[ContextMemory] Initialized with LanceDB long-term storage');
        } else {
          initializeContextMemory();
          console.warn('[ContextMemory] LanceDB not available, using in-memory only');
        }
      } catch (err) {
        console.error('[ContextMemory] Init failed:', err);
      }

      // Initialize Memory Auto Upgrade Service
      try {
        const { memoryAutoUpgradeService } = await import('./src/services/context/memoryAutoUpgrade');
        memoryAutoUpgradeService.start();
        console.log('[MemoryAutoUpgrade] Service started');
      } catch (err) {
        console.error('[MemoryAutoUpgrade] Start failed:', err);
      }

      // Initialize QuestionBank Service
      try {
        await questionBankService.initialize();
        const banks = questionBankService.getAllBanks();
        setQuestionBanks(banks);
        console.log('[QuestionBank] Initialized with', banks.length, 'banks');
      } catch (err) {
        console.error('[QuestionBank] Init failed:', err);
      }
    };
    initServices();
  }, []); // Only run once on mount

  // Auto-save logic: LocalStorage + Disk for Active File
  useEffect(() => {
    const autoSave = async () => {
      // 1. Save to LocalStorage (Backup)
      const filesToSave = filesRef.current.map(f => ({
        ...f,
        handle: undefined
      }));
      localStorage.setItem('neon-files', JSON.stringify(filesToSave));
      localStorage.setItem('neon-active-id', activeFileIdRef.current);

      // 2. Save Active File to Disk (if local and has handle)
      const activeId = activeFileIdRef.current;
      const currentActive = filesRef.current.find(f => f.id === activeId);

      if (currentActive && currentActive.isLocal && currentActive.handle) {
        try {
          await saveFileToDisk(currentActive);
          console.log(`[AutoSave] Saved ${currentActive.name} to disk.`);
        } catch (err) {
          console.warn(`[AutoSave] Failed to save ${currentActive.name} to disk`, err);
        }
      }
    };

    const intervalId = setInterval(autoSave, 30000);
    return () => clearInterval(intervalId);
  }, []);

  // --- Handlers ---

  const showToast = useCallback((message: string, isError: boolean = false) => {
    setAiState({ isThinking: false, error: isError ? message : null, message: isError ? null : message });
    setTimeout(() => setAiState(prev => ({ ...prev, message: null, error: null })), 4000);
  }, []);

  const showConfirmDialog = useCallback((
    title: string,
    message: string,
    onConfirm: () => void,
    type: 'danger' | 'warning' | 'info' = 'warning',
    confirmText?: string,
    cancelText?: string
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      type,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  }, []);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Memoized Node Click Handler to prevent Graph re-renders
  const handleNodeClick = useCallback((id: string) => {
    showToast(`Selected: ${id}`);
  }, [showToast]);

  const handleCreateItem = (type: 'file' | 'folder', name: string, parentPath: string = '') => {
    const sanitizedName = name.replace(/[\\/:*?"<>|]/g, '-');
    let finalPath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName;

    // Check for duplicates
    if (files.some(f => (f.path || f.name) === finalPath || (f.path || f.name) === `${finalPath}.md`)) {
      showToast("An item with this name already exists", true);
      return;
    }

    const newFileId = generateId();

    if (type === 'folder') {
      const folderKeeper: MarkdownFile = {
        id: newFileId,
        name: '.keep',
        content: '',
        lastModified: Date.now(),
        path: `${finalPath}/.keep`
      };
      setFiles(prev => [...prev, folderKeeper]);
      showToast(`Folder '${sanitizedName}' created`);
    } else {
      if (!finalPath.toLowerCase().endsWith('.md')) {
        finalPath += '.md';
      }

      const newFile: MarkdownFile = {
        id: newFileId,
        name: sanitizedName,
        content: '',
        lastModified: Date.now(),
        path: finalPath
      };
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);
      showToast(`File '${sanitizedName}' created`);
    }
  };

  const handleMoveItem = (sourceId: string, targetFolderPath: string | null) => {
    // 1. Find Source
    const sourceFile = files.find(f => f.id === sourceId);
    if (!sourceFile) return;

    const sourcePath = sourceFile.path || sourceFile.name;
    const isFolder = sourceFile.name === '.keep';

    // If it's a folder, the actual "path" of the folder is the parent directory of the .keep file
    const actualSourcePath = isFolder ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : sourcePath;
    const sourceName = isFolder ? actualSourcePath.split('/').pop() : sourceFile.name;

    // 2. Validate Target
    if (isFolder && targetFolderPath) {
      if (targetFolderPath === actualSourcePath || targetFolderPath.startsWith(actualSourcePath + '/')) {
        showToast("Cannot move folder into itself", true);
        return;
      }
    }

    // 3. Calculate New Paths
    const newFiles = files.map(f => {
      const currentPath = f.path || f.name;

      // Logic for moving a specific File
      if (!isFolder && f.id === sourceId) {
        const fileName = currentPath.split('/').pop();
        const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;
        // Check if file already exists at dest
        if (files.some(ex => (ex.path || ex.name) === newPath && ex.id !== sourceId)) {
          showToast("File with same name exists in destination", true);
          return f; // Cancel for this file
        }
        return { ...f, path: newPath! };
      }

      // Logic for moving a Folder (Recursive rename of all children)
      if (isFolder && currentPath.startsWith(actualSourcePath!)) {
        const relativePath = currentPath.substring(actualSourcePath!.length);
        const newRootPath = targetFolderPath ? `${targetFolderPath}/${sourceName}` : sourceName;
        return { ...f, path: newRootPath + relativePath };
      }

      return f;
    });

    setFiles(newFiles);
  };

  const handleDeleteFile = async (id: string) => {
    if (files.length <= 1) return;
    const fileToDelete = files.find(f => f.id === id);
    const fileName = fileToDelete?.name || 'this file';

    showConfirmDialog(
      t.deleteFileTitle,
      `${t.deleteFileMessage.replace('this file', fileName)}`,
      async () => {
        // 删除向量库中的数据
        await vectorStore.deleteByFile(id);

        const newFiles = files.filter(f => f.id !== id);
        setFiles(newFiles);
        if (activeFileId === id) setActiveFileId(newFiles[0].id);
      },
      'danger',
      t.delete,
      t.cancel
    );
  };

  const updateActiveFile = (content: string, cursorPosition?: { start: number; end: number }, skipHistory = false) => {
    if (!skipHistory) {
      const now = Date.now();
      if (now - lastEditTimeRef.current > HISTORY_DEBOUNCE) {
        setHistory(prev => {
          const fileHist = prev[activeFileId] || { past: [], future: [] };
          const newPast = [...fileHist.past, activeFile.content];
          if (newPast.length > MAX_HISTORY) newPast.shift();

          return {
            ...prev,
            [activeFileId]: {
              past: newPast,
              future: []
            }
          };
        });
      }
      lastEditTimeRef.current = now;
    }

    const updated = files.map(f =>
      f.id === activeFileId
        ? { ...f, content, lastModified: Date.now(), cursorPosition: cursorPosition || f.cursorPosition }
        : f
    );

    // 同步更新 ref
    if (cursorPosition && activeFileId) {
      cursorPositionsRef.current.set(activeFileId, cursorPosition);
    }

    setFiles(updated);
  };

  // Handle link insert result
  const handleLinkInsert = useCallback((result: LinkInsertResult) => {
    if (!activeFile) return;

    const { type, fileName, alias, startLine, endLine } = result;

    let linkText = '';
    switch (type) {
      case 'wikilink':
        linkText = alias ? `[[${fileName}|${alias}]]` : `[[${fileName}]]`;
        break;
      case 'blockref':
        if (endLine && endLine > startLine) {
          linkText = `(((${fileName}#${startLine}-${endLine})))`;
        } else {
          linkText = `(((${fileName}#${startLine})))`;
        }
        break;
      case 'quick_link':
        linkText = alias ? `[[${fileName}|${alias}]]` : `[[${fileName}]]`;
        break;
    }

    // 获取当前光标位置，默认为文件末尾
    const cursorPos = activeFile.cursorPosition || {
      start: activeFile.content.length,
      end: activeFile.content.length
    };

    // 在光标位置插入内容
    const before = activeFile.content.substring(0, cursorPos.start);
    const after = activeFile.content.substring(cursorPos.end);
    const newContent = before + linkText + after;

    // 计算新的光标位置（插入内容之后）
    const newCursorPos = {
      start: cursorPos.start + linkText.length,
      end: cursorPos.start + linkText.length
    };

    updateActiveFile(newContent, newCursorPos);
  }, [activeFile, updateActiveFile]);

  // 保存光标位置
  const handleCursorChange = (fileId: string, position: { start: number; end: number }) => {
    // 1. 同步更新 ref（立即生效，不受 React 批处理影响）
    cursorPositionsRef.current.set(fileId, position);
    // 2. 异步更新 state（用于持久化）
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, cursorPosition: position } : f
    ));
  };

  // 保存精确光标位置（包含 anchor 和 head，支持多选）
  // 这是更精确的光标保存，用于文件切换时的恢复
  const handleCursorSave = (fileId: string, position: { anchor: number; head: number }) => {
    // 转换为 start/end 格式保存
    const positionForState = { start: position.anchor, end: position.head };
    
    // 1. 同步更新 ref
    cursorPositionsRef.current.set(fileId, positionForState);
    
    // 2. 异步更新 state（用于持久化）
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, cursorPosition: positionForState } : f
    ));
  };

  // 获取光标位置（优先从同步 ref 读取）
  const getCursorPosition = (fileId: string): { start: number; end: number } | undefined => {
    // 优先从 ref 读取（同步，最新）
    const refPosition = cursorPositionsRef.current.get(fileId);
    if (refPosition) return refPosition;
    // 回退到 file state
    const file = filesRef.current.find(f => f.id === fileId);
    return file?.cursorPosition;
  };

  const handleUndo = () => {
    const view = codeMirrorRef.current?.view;
    if (view && codeMirrorUndo(view)) return;

    const fileHist = history[activeFileId];
    if (!fileHist || fileHist.past.length === 0) return;

    const previous = fileHist.past[fileHist.past.length - 1];
    const newPast = fileHist.past.slice(0, -1);
    const newFuture = [activeFile.content, ...fileHist.future];

    setHistory(prev => ({
      ...prev,
      [activeFileId]: {
        past: newPast,
        future: newFuture
      }
    }));

    updateActiveFile(previous, undefined, true);
  };

  const handleRedo = () => {
    const view = codeMirrorRef.current?.view;
    if (view && codeMirrorRedo(view)) return;

    const fileHist = history[activeFileId];
    if (!fileHist || fileHist.future.length === 0) return;

    const next = fileHist.future[0];
    const newFuture = fileHist.future.slice(1);
    const newPast = [...fileHist.past, activeFile.content];

    setHistory(prev => ({
      ...prev,
      [activeFileId]: {
        past: newPast,
        future: newFuture
      }
    }));

    updateActiveFile(next, undefined, true);
  };

  const saveSnapshot = () => {
    setHistory(prev => {
      const fileHist = prev[activeFileId] || { past: [], future: [] };
      return {
        ...prev,
        [activeFileId]: {
          past: [...fileHist.past, activeFile.content],
          future: []
        }
      };
    });
    lastEditTimeRef.current = Date.now();
  };

  const renameActiveFile = (newName: string) => {
    setFiles(prevFiles => prevFiles.map(f => {
      if (f.id === activeFileId) {
        const oldPath = f.path || f.name;
        const pathParts = oldPath.replace(/\\/g, '/').split('/');
        const oldNameWithExt = pathParts[pathParts.length - 1];

        const lastDotIndex = oldNameWithExt.lastIndexOf('.');
        const ext = lastDotIndex !== -1 ? oldNameWithExt.substring(lastDotIndex) : '';

        let finalName = newName;
        if (ext && !finalName.toLowerCase().endsWith(ext.toLowerCase())) {
          if (finalName.indexOf('.') === -1) {
            finalName += ext;
          }
        }

        pathParts[pathParts.length - 1] = finalName;
        const newPath = pathParts.join('/');

        const nameForDisplay = finalName.includes('.') ? finalName.substring(0, finalName.lastIndexOf('.')) : finalName;

        return { ...f, name: nameForDisplay, path: newPath };
      }
      return f;
    }));
  };

  // --- Multi-File Editor Handlers ---

  const openFileInPane = (fileId: string) => {
    // 检查是否已打开
    const existing = openPanes.find(p => p.fileId === fileId);
    if (existing) {
      setActivePaneId(existing.id);
      setActiveFileId(fileId); // 同步更新 activeFileId
      return;
    }

    const newPane: EditorPane = {
      id: crypto.randomUUID(),
      fileId,
      mode: 'editor'
    };
    setOpenPanes([...openPanes, newPane]);
    setActivePaneId(newPane.id);
    setActiveFileId(fileId); // 同步更新 activeFileId
  };

  const closePane = (paneId: string) => {
    const newPanes = openPanes.filter(p => p.id !== paneId);
    setOpenPanes(newPanes);

    if (activePaneId === paneId) {
      // 如果关闭的是活动面板，切换到下一个面板
      if (newPanes.length > 0) {
        const closedIndex = openPanes.findIndex(p => p.id === paneId);
        const nextIndex = Math.min(closedIndex, newPanes.length - 1);
        const nextPane = newPanes[nextIndex];
        setActivePaneId(nextPane.id);
        setActiveFileId(nextPane.fileId); // 同步更新 activeFileId
      } else {
        setActivePaneId(null);
      }
    }
  };

  const togglePaneMode = (paneId: string) => {
    setOpenPanes(openPanes.map(p =>
      p.id === paneId
        ? { ...p, mode: p.mode === 'editor' ? 'preview' : 'editor' }
        : p
    ));
  };

  // Sync viewMode with pane.mode - when user clicks Editor/Preview in toolbar
  // we need to update the active pane's mode accordingly
  useEffect(() => {
    if (viewMode === ViewMode.Editor || viewMode === ViewMode.Preview) {
      const targetMode = viewMode === ViewMode.Editor ? 'editor' : 'preview';
      const activePane = openPanes.find(p => p.id === activePaneId);

      // Only update if pane mode differs from viewMode
      if (activePane && activePane.mode !== targetMode) {
        setOpenPanes(prev => prev.map(p =>
          p.id === activePaneId
            ? { ...p, mode: targetMode }
            : p
        ));
      }
    }
  }, [viewMode]); // Only run when viewMode changes

  const selectPane = (paneId: string) => {
    setActivePaneId(paneId);
    // 同步更新 activeFileId
    const pane = openPanes.find(p => p.id === paneId);
    if (pane) {
      setActiveFileId(pane.fileId);
    }
  };

  const handlePaneContentChange = (fileId: string, content: string) => {
    const updated = files.map(f =>
      f.id === fileId ? { ...f, content, lastModified: Date.now() } : f
    );
    setFiles(updated);
  };

  // --- New Features ---

  const handleIndexKnowledgeBase = async (forceList?: MarkdownFile[]) => {
    if (ragStats.isIndexing) return;

    // Use provided list or fallback to current state ref (to avoid stale closures)
    const targetFiles = forceList || filesRef.current;

    // Deduplicate based on ID just in case
    const uniqueFilesMap = new Map();
    targetFiles.forEach(f => {
      if (!f.name.endsWith('.keep') && f.content.trim().length > 0) {
        uniqueFilesMap.set(f.id, f);
      }
    });
    const validFiles = Array.from(uniqueFilesMap.values());

    setRagStats(prev => ({ ...prev, isIndexing: true, totalFiles: validFiles.length }));

    // 先同步清理 LanceDB 中的陈旧数据（文件系统中已删除的文件以及重复文件名的旧版本）
    const currentFilesForSync = validFiles.map(f => ({ id: f.id, name: f.name }));
    try {
      const cleanedCount = await vectorStore.syncWithFileSystem(currentFilesForSync);
      if (cleanedCount > 0) {
        console.log(`[KnowledgeBase] Cleaned ${cleanedCount} stale files from vector store`);
      }
      // 同步后立即从 LanceDB 获取最新统计并更新 UI
      const dbStats = await vectorStore.getStatsFromDB();
      setRagStats(prev => ({
        ...prev,
        totalFiles: dbStats.totalFiles,
        indexedFiles: dbStats.indexedFiles,
        totalChunks: dbStats.totalChunks
      }));
    } catch (e) {
      console.error('[KnowledgeBase] Failed to sync vector store:', e);
    }

    const filesToIndex = validFiles; // Index all valid files

    try {
      for (const file of filesToIndex) {
        if (file.content && file.content.length > 0) {
          await vectorStore.indexFile(file, aiConfig);
          // 使用 LanceDB 实时统计
          const dbStats = await vectorStore.getStatsFromDB();
          setRagStats(prev => ({
            ...prev,
            totalFiles: dbStats.totalFiles,
            indexedFiles: dbStats.indexedFiles,
            totalChunks: dbStats.totalChunks
          }));
        }
      }
    } catch (e) {
      console.error("Indexing error", e);
    } finally {
      setRagStats(prev => ({ ...prev, isIndexing: false }));
    }
  };

  const handleOpenFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      throw new Error("Directory Picker not supported");
    }
    const dirHandle = await window.showDirectoryPicker();

    // 显示导入进度
    setAiState({ isThinking: true, message: t.processingFile, error: null });

    const loadedFiles = await readDirectoryEnhanced(
      dirHandle,
      aiConfig.apiKey,
      (progress) => {
        setAiState({
          isThinking: true,
          message: `${t.processingFile} (${progress.processedFiles + 1}/${progress.totalFiles}): ${progress.currentFile}`,
          error: null
        });
      }
    );

    setAiState({ isThinking: false, message: null, error: null });

    if (loadedFiles.length > 0) {
      setFiles(loadedFiles);
      setActiveFileId(loadedFiles[0].id);
      showToast(`${t.filesLoaded}: ${loadedFiles.length}`);
      // Auto-index after folder import
      handleIndexKnowledgeBase(loadedFiles);
    } else {
      showToast(t.noFilesFound);
    }
  };

  const handleImportFolderFiles = async (fileList: FileList) => {
    const newFiles: MarkdownFile[] = [];
    setAiState({ isThinking: true, message: t.processingFile, error: null });

    // Count total files and PDF files for progress tracking
    const supportedFiles: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      if (isExtensionSupported(fileList[i].name)) {
        supportedFiles.push(fileList[i]);
      }
    }

    // Set initial progress
    setOcrStats({
      isProcessing: true,
      totalPages: supportedFiles.length,
      processedPages: 0,
      currentFile: supportedFiles[0]?.name || ''
    });

    try {
      for (let i = 0; i < supportedFiles.length; i++) {
        const file = supportedFiles[i];
        const isPdf = file.name.toLowerCase().endsWith('.pdf');

        // Update progress
        setOcrStats(prev => ({
          ...prev,
          processedPages: i,
          currentFile: isPdf ? `${file.name} (OCR)` : file.name
        }));

        let content: string;
        if (isPdf) {
          // Use processPdfFile directly for PDF files to get progress
          content = await processPdfFile(file, aiConfig.apiKey, {
            onProgress: (current, total, isOcr) => {
              setOcrStats(prev => ({
                ...prev,
                currentFile: isOcr ? `${file.name} (OCR ${current}/${total})` : `${file.name} (${current}/${total})`
              }));
            }
          });
        } else {
          content = await extractTextFromFile(file, aiConfig.apiKey);
        }

        let path = file.webkitRelativePath || file.name;
        if (path.match(/\.(pdf|docx|doc)$/i)) {
          path = path.replace(/\.(pdf|docx|doc)$/i, '.md');
        }

        newFiles.push({
          id: generateId() + '-' + i,
          name: file.name.replace(/\.[^/.]+$/, ""),
          content: content,
          lastModified: file.lastModified,
          isLocal: false,
          path: path
        });

        // Update progress after file is processed
        setOcrStats(prev => ({
          ...prev,
          processedPages: i + 1
        }));
      }

      if (newFiles.length > 0) {
        // Safe Deduplication and Update
        let combinedFiles: MarkdownFile[] = [];

        setFiles(prev => {
          const existingPaths = new Set(prev.map(f => f.path || f.name));
          const uniqueNew = newFiles.filter(f => !existingPaths.has(f.path || f.name));
          combinedFiles = [...prev, ...uniqueNew];
          return combinedFiles;
        });

        setActiveFileId(newFiles[0].id);

        // Trigger indexing outside the state setter to avoid side-effects and double counting
        // We pass the new files specifically to be indexed
        if (combinedFiles.length > 0) {
          handleIndexKnowledgeBase(combinedFiles);
        }

        showToast(`${t.filesLoaded}: ${newFiles.length}`);
      } else {
        showToast(t.noFilesFound);
      }
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
      setOcrStats({ isProcessing: false, totalPages: 0, processedPages: 0 });
    }
  };

  const handleImportPdf = async (file: File) => {
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    setOcrStats({ isProcessing: true, totalPages: 0, processedPages: 0, currentFile: file.name });
    try {
      const mdContent = await processPdfFile(file, aiConfig.apiKey, {
        onProgress: (current, total, isOcr) => {
          // Update progress for all pages, with isOcr indicating OCR mode
          setOcrStats(prev => ({
            ...prev,
            processedPages: current,
            totalPages: total,
            currentFile: isOcr ? `${file.name} (OCR)` : file.name
          }));
        }
      });
      const newFile: MarkdownFile = {
        id: generateId(),
        name: file.name.replace('.pdf', ''),
        content: mdContent,
        lastModified: Date.now(),
        path: file.name.replace('.pdf', '.md')
      };

      let updatedList: MarkdownFile[] = [];
      setFiles(prev => {
        if (prev.some(f => (f.path || f.name) === newFile.path)) {
          updatedList = prev;
          return prev;
        }
        updatedList = [...prev, newFile];
        return updatedList;
      });

      // Index outside state setter
      if (updatedList.length > 0) {
        handleIndexKnowledgeBase(updatedList);
      }

      setActiveFileId(newFile.id);
      showToast(t.importSuccess);
    } catch (e: any) {
      showToast(`${t.importFail}: ${e.message}`, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
      setOcrStats({ isProcessing: false, totalPages: 0, processedPages: 0 });
    }
  };

  const handleImportQuiz = async (file: File) => {
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const csvQuiz = await parseCsvToQuiz(file);
        if (csvQuiz) {
          const textContent = await extractTextFromFile(file, aiConfig.apiKey);
          setQuizContext(textContent);
          setCurrentQuiz(csvQuiz);
          setViewMode(ViewMode.Quiz);
          showToast(t.importSuccess);
          setAiState(prev => ({ ...prev, isThinking: false, message: null }));
          return;
        }
      }

      const textContent = await extractTextFromFile(file, aiConfig.apiKey);
      setQuizContext(textContent);

      setAiState({ isThinking: true, message: t.analyzingQuiz, error: null });
      const quiz = await extractQuizFromRawContent(textContent, aiConfig);

      setCurrentQuiz(quiz);
      setViewMode(ViewMode.Quiz);
      showToast(t.importSuccess);
    } catch (e: any) {
      showToast(`${t.importFail}: ${e.message}`, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleExport = () => {
    if (!activeFile) return;
    try {
      const blob = new Blob([activeFile.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = activeFile.name.endsWith('.md') ? activeFile.name : `${activeFile.name}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`${t.download} Success`);
    } catch (e) {
      showToast("Export failed", true);
    }
  };

  // Helper: 获取当前活动面板的文件内容
  const getActivePaneContent = (): string => {
    // 1. 尝试使用 activePaneId 获取当前面板对应的文件
    if (activePaneId) {
      const activePane = openPanes.find(p => p.id === activePaneId);
      if (activePane) {
        const file = files.find(f => f.id === activePane.fileId);
        if (file) return file.content;
      }
    }
    // 2. 回退到 activeFile
    return activeFile?.content || '';
  };

  const handleGenerateMindMap = async () => {
    // 使用活动面板的文件内容
    const currentContent = getActivePaneContent();

    if (!currentContent.trim()) {
      showToast(t.polishEmptyError || "Please add content before generating mind map", true);
      return;
    }

    setAiState({ isThinking: true, message: "Dreaming up Mind Map...", error: null });
    try {
      const mermaidCode = await generateMindMap(currentContent, aiConfig);
      setMindMapContent(mermaidCode);
      setViewMode(ViewMode.MindMap);
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleGenerateQuiz = async () => {
    // 使用活动面板的文件内容
    const currentContent = getActivePaneContent();

    if (!currentContent.trim()) {
      showToast(t.polishEmptyError || "Please add content before generating quiz", true);
      return;
    }

    setAiState({ isThinking: true, message: "Creating Quiz...", error: null });
    try {
      const quiz = await generateQuiz(currentContent, aiConfig);

      // 验证生成的 quiz 是否有效
      if (!quiz || !quiz.questions || quiz.questions.length === 0) {
        throw new Error("Failed to generate quiz questions. The AI response was empty or invalid.");
      }

      setQuizContext(currentContent);
      setCurrentQuiz(quiz);
      setViewMode(ViewMode.Quiz);
      showToast(`Quiz generated with ${quiz.questions.length} questions!`, false);
    } catch (e: any) {
      console.error('[Quiz Generation Error]', e);
      showToast(`Quiz generation failed: ${e.message}`, true);
      // 不切换视图，保持在当前界面
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleApplyTags = (tags: string[]) => {
    const currentContent = getActivePaneContent();
    const existingTags = extractTags(currentContent);
    const newTags = tags.filter(tag => !existingTags.includes(tag));

    if (newTags.length === 0) {
      showToast('No new tags to add', false);
      return;
    }

    const tagString = newTags.map(t => `#${t}`).join(' ');
    const newContent = currentContent + '\n' + tagString;
    updateActiveFile(newContent);
    showToast(`Added ${newTags.length} tag(s)`, false);
  };

  const handleTextFormat = (startTag: string, endTag: string) => {
    const view = codeMirrorRef.current?.view;
    if (view) {
      const { from, to } = view.state.selection.main;
      const selectedText = view.state.sliceDoc(from, to);
      const insertText = `${startTag}${selectedText}${endTag}`;

      view.dispatch({
        changes: { from, to, insert: insertText },
        selection: {
          anchor: from + startTag.length,
          head: from + startTag.length + selectedText.length
        }
      });
      view.focus();
      return;
    }

    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const content = activeFile.content;

    const selectedText = content.substring(start, end);
    const newText = `${startTag}${selectedText}${endTag}`;

    const newContent = content.substring(0, start) + newText + content.substring(end);

    updateActiveFile(newContent);

    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(start + startTag.length, end + startTag.length);
      }
    }, 0);
  };

  // --- Phase 8 Handler Functions ---

  // DiffView handlers
  const handleApplyDiff = (text: string) => {
    updateActiveFile(text);
    setViewMode(ViewMode.Editor);
    showToast('Changes applied');
  };

  const handleCancelDiff = () => {
    setViewMode(ViewMode.Editor);
  };

  // StudyPlan handlers
  const handleCompleteTask = (planId: string, taskId: string) => {
    setStudyPlans(prev => prev.map(plan => {
      if (plan.id !== planId) return plan;
      const updatedTasks = plan.tasks.map(task => {
        if (task.id !== taskId) return task;
        return { ...task, status: 'completed' as const, completedDate: Date.now() };
      });
      const completedCount = updatedTasks.filter(t => t.status === 'completed').length;
      const progress = Math.round((completedCount / updatedTasks.length) * 100);
      return { ...plan, tasks: updatedTasks, progress };
    }));
  };

  const getIntervalMs = (label: string): number => {
    const map: Record<string, number> = {
      '5 mins': 5 * 60 * 1000,
      '30 mins': 30 * 60 * 1000,
      '12 hours': 12 * 60 * 60 * 1000,
      '1 day': 24 * 60 * 60 * 1000,
      '2 days': 2 * 24 * 60 * 60 * 1000,
      '4 days': 4 * 24 * 60 * 60 * 1000,
      '7 days': 7 * 24 * 60 * 60 * 1000,
    };
    return map[label] || 0;
  };

  const handleCreatePlan = (sourceType: 'file' | 'mistake', sourceId: string, title: string) => {
    const intervals = ['5 mins', '30 mins', '12 hours', '1 day', '2 days', '4 days', '7 days'];
    const now = Date.now();
    const tasks = intervals.map((label, i) => ({
      id: crypto.randomUUID(),
      scheduledDate: now + getIntervalMs(label),
      status: i === 0 ? ('pending' as const) : ('future' as const),
      intervalLabel: label
    }));

    const newPlan: StudyPlan = {
      id: crypto.randomUUID(),
      title,
      sourceType,
      sourceId,
      createdDate: now,
      tasks,
      progress: 0
    };
    setStudyPlans(prev => [...prev, newPlan]);
  };

  const handleDeletePlan = (planId: string) => {
    setStudyPlans(prev => prev.filter(p => p.id !== planId));
  };

  // Snippet handlers
  const handleCreateSnippet = (snippet: Omit<Snippet, 'id'>) => {
    const newSnippet: Snippet = { ...snippet, id: crypto.randomUUID() };
    setSnippets(prev => [...prev, newSnippet]);
    showToast('Snippet created');
  };

  const handleDeleteSnippet = (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
    showToast('Snippet deleted');
  };

  const handleInsertSnippet = (content: string) => {
    if (!activeFile) return;

    // 获取当前光标位置，默认为文件末尾
    const cursorPos = activeFile.cursorPosition || {
      start: activeFile.content.length,
      end: activeFile.content.length
    };

    // 在光标位置插入内容
    const before = activeFile.content.substring(0, cursorPos.start);
    const after = activeFile.content.substring(cursorPos.end);

    const newContent = before + content + after;

    // 计算新的光标位置（插入内容之后）
    const newCursorPos = {
      start: cursorPos.start + content.length,
      end: cursorPos.start + content.length
    };

    updateActiveFile(newContent, newCursorPos);
    showToast('Snippet inserted');
  };

  // QuestionBank handlers
  const handleCreateQuestionBank = async (name: string, description?: string) => {
    try {
      const bank = await questionBankService.createBank(name, description);
      setQuestionBanks(prev => [...prev, bank]);
      showToast(`Created bank: ${name}`);
    } catch (error: any) {
      showToast(`Failed to create bank: ${error.message}`, true);
    }
  };

  const handleDeleteQuestionBank = async (bankId: string) => {
    try {
      const success = await questionBankService.deleteBank(bankId);
      if (success) {
        setQuestionBanks(prev => prev.filter(b => b.id !== bankId));
        showToast('Bank deleted');
      }
    } catch (error: any) {
      showToast(`Failed to delete bank: ${error.message}`, true);
    }
  };

  const handleUpdateQuestionBank = async (bankId: string, updates: Partial<QuestionBank>) => {
    try {
      const bank = await questionBankService.updateBank(bankId, updates);
      if (bank) {
        setQuestionBanks(prev => prev.map(b => b.id === bankId ? bank : b));
      }
    } catch (error: any) {
      showToast(`Failed to update bank: ${error.message}`, true);
    }
  };

  const handleGenerateQuestions = async (bankId: string, sourceFileId: string, count?: number, difficulty?: string) => {
    const sourceFile = files.find(f => f.id === sourceFileId);
    if (!sourceFile || !sourceFile.content.trim()) {
      throw new Error('Please select a file with content');
    }

    setAiState({ isThinking: true, message: 'Generating questions...', error: null });

    try {
      const questions = await questionBankService.generateAndAddQuestions(
        bankId,
        sourceFile.content,
        aiConfig,
        { count: count || 5, difficulty }
      );

      const banks = questionBankService.getAllBanks();
      setQuestionBanks(banks);

      setAiState({ isThinking: false, message: null, error: null });
      showToast(`Generated ${questions.length} questions`);
    } catch (error: any) {
      setAiState({ isThinking: false, message: null, error: error.message });
      throw error;
    }
  };

  const handleRemoveQuestion = async (bankId: string, questionId: string) => {
    try {
      const success = await questionBankService.removeQuestion(bankId, questionId);
      if (success) {
        const banks = questionBankService.getAllBanks();
        setQuestionBanks(banks);
        showToast('Question removed');
      }
    } catch (error: any) {
      showToast(`Failed to remove question: ${error.message}`, true);
    }
  };

  // Streaming control handler
  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setAiState(prev => ({ ...prev, isThinking: false }));
  };

  // -- AI Actions Wrappers for Shortcuts --
  const performPolish = async () => {
    // 使用活动面板的文件内容
    const currentContent = getActivePaneContent();

    // 验证内容非空
    if (!currentContent.trim()) {
      showToast(t.polishEmptyError || "Please add content before polishing", true);
      return;
    }

    try {
      saveSnapshot();
      setAiState({ isThinking: true, message: "Polishing...", error: null });
      const res = await polishContent(currentContent, aiConfig);
      // Show DiffView instead of directly applying changes
      setDiffOriginal(currentContent);
      setDiffModified(res);
      setViewMode(ViewMode.Diff);
      showToast("Polish complete - review changes");
    } catch (e: any) { showToast(e.message, true); }
    finally { setAiState(p => ({ ...p, isThinking: false, message: null })); }
  };

  const performGraph = async (useActiveFileOnly: boolean = false, graphTypeOverride?: 'concept' | 'filelink') => {
    const selectedGraphType = graphTypeOverride || graphType;

    try {
      setAiState({ isThinking: true, message: selectedGraphType === 'filelink' ? "Building File Links..." : "Analyzing Graph...", error: null });

      // 使用活动面板的文件内容
      const currentContent = getActivePaneContent();

      let filesToAnalyze: MarkdownFile[];
      if (useActiveFileOnly && activeFile) {
        filesToAnalyze = [{ ...activeFile, content: currentContent }];
      } else {
        // 对于多文件分析，更新当前活动文件的内容
        if (currentContent && activeFile) {
          filesToAnalyze = files.map(f =>
            f.id === activeFile.id ? { ...f, content: currentContent } : f
          );
        } else {
          filesToAnalyze = files;
        }
      }

      let data: GraphData;

      if (selectedGraphType === 'filelink') {
        // 基于 WikiLink 生成文件级链接图谱
        const index = buildKnowledgeIndexFromFiles(filesToAnalyze);
        data = generateFileLinkGraph(filesToAnalyze, index);
      } else {
        // AI 生成概念级知识图谱
        data = await generateKnowledgeGraph(filesToAnalyze, aiConfig);
      }

      setGraphData(data);
      setGraphType(selectedGraphType);
      setViewMode(ViewMode.Graph);
    } catch (e: any) { showToast(e.message, true); }
    finally { setAiState(p => ({ ...p, isThinking: false, message: null })); }
  };

  const performSynthesize = async () => {
    try {
      setAiState({ isThinking: true, message: "Synthesizing Knowledge Base...", error: null });

      // 使用活动面板的文件内容更新当前活动文件
      const currentContent = getActivePaneContent();
      let filesToSynthesize = files;
      if (currentContent && activeFile) {
        filesToSynthesize = files.map(f =>
          f.id === activeFile.id ? { ...f, content: currentContent } : f
        );
      }

      const summary = await synthesizeKnowledgeBase(filesToSynthesize, aiConfig);
      const newFile: MarkdownFile = { id: generateId(), name: 'Master-Summary', content: summary, lastModified: Date.now(), path: 'Master-Summary.md' };
      setFiles([...files, newFile]);
      setActiveFileId(newFile.id);
      setViewMode(ViewMode.Preview);
    } catch (e: any) { showToast(e.message, true); }
    finally { setAiState(p => ({ ...p, isThinking: false, message: null })); }
  };

  const handleChatMessage = async (text: string) => {
    // 1. Add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, userMsg]);

    // 2. Create placeholder AI message
    const aiMessageId = generateId();
    const aiMsg: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, aiMsg]);

    try {
      // 3. Build conversation history (filter out RAG result cards)
      const historyForAI = chatMessages
        .filter(m => !m.ragResults)
        .slice(-20);  // Limit to last 20 messages to control token usage

      // ===== 统一工具执行器 (内置优先, MCP 其次) =====
      const executeToolUnified = async (toolName: string, args: Record<string, JsonValue>): Promise<{ success: boolean; result: JsonValue; formatted: string }> => {
        console.log('[Tool] Executing:', toolName, args);
        const getString = (value: JsonValue | undefined): string =>
          typeof value === 'string' ? value : '';
        const getNumber = (value: JsonValue | undefined): number | undefined =>
          typeof value === 'number' ? value : undefined;

        // ===== 内置工具优先 =====
        // 1. search_knowledge_base - RAG 搜索
        if (toolName === 'search_knowledge_base') {
          try {
            if (await vectorStore.hasFilesToIndex(filesRef.current)) {
              await handleIndexKnowledgeBase();
            }
            // 限制默认结果数为5，避免上下文过大
            const maxResultsValue = getNumber(args.maxResults) ?? 5;
            const maxResults = Math.min(maxResultsValue, 8);
            const ragResponse = await vectorStore.searchWithResults(
              getString(args.query),
              aiConfig,
              maxResults
            );

            // 精简返回结果，只保留必要信息
            const result: JsonValue = {
              success: true,
              query: getString(args.query),
              matchCount: ragResponse.results.length,
              // 只返回简洁的来源信息，不返回完整 context
              sources: ragResponse.results.map(r => ({
                file: r.chunk.metadata.fileName,
                relevance: Math.round(r.score * 100) + '%',
                // 限制摘要长度为100字符
                excerpt: r.chunk.text.substring(0, 100).replace(/\n/g, ' ').trim() + '...'
              })),
              // 返回简洁的上下文摘要而非完整内容
              summary: ragResponse.context.length > 500
                ? ragResponse.context.substring(0, 500) + '...(truncated)'
                : ragResponse.context
            };
            // 使用紧凑 JSON 减少传输量
            return { success: true, result, formatted: JSON.stringify(result) };
          } catch (error: any) {
            return { success: false, result: { error: error.message }, formatted: JSON.stringify({ success: false, error: error.message }) };
          }
        }

        // 2. create_file - 创建应用内文件
        if (toolName === 'create_file') {
          const filename = getString(args.filename);
          const content = getString(args.content);
          if (!filename) {
            return { success: false, result: { error: 'Missing filename' }, formatted: JSON.stringify({ success: false, error: 'Missing filename' }) };
          }
          const newFile: MarkdownFile = {
            id: generateId(),
            name: filename.replace('.md', ''),
            content,
            lastModified: Date.now(),
            path: filename
          };
          setFiles(prev => [...prev, newFile]);
          const result: JsonValue = { success: true, message: `Created file: ${filename}` };
          return { success: true, result, formatted: JSON.stringify(result) };
        }

        // 3. update_file - 更新应用内文件
        if (toolName === 'update_file') {
          // 使用 filesRef 同步检查文件是否存在（避免 setFiles 异步问题）
          const filename = getString(args.filename);
          const content = getString(args.content);
          const targetFile = filesRef.current.find(f =>
            f.name === filename.replace('.md', '') ||
            f.name === filename ||
            f.path === filename ||
            f.path?.endsWith(filename)
          );

          if (targetFile) {
            setFiles(prev => prev.map(f =>
              f.id === targetFile.id
                ? { ...f, content, lastModified: Date.now() }
                : f
            ));
            const result: JsonValue = { success: true, message: `Updated file: ${filename}` };
            return { success: true, result, formatted: JSON.stringify(result) };
          }
          return { success: false, result: { error: 'File not found' }, formatted: JSON.stringify({ success: false, error: 'File not found' }) };
        }

        // 4. delete_file - 删除应用内文件
        if (toolName === 'delete_file') {
          // 使用 filesRef 同步检查文件是否存在
          const filename = getString(args.filename);
          const targetFile = filesRef.current.find(f =>
            f.name === filename.replace('.md', '') ||
            f.name === filename ||
            f.path === filename ||
            f.path?.endsWith(filename)
          );

          if (targetFile) {
            setFiles(prev => prev.filter(f => f.id !== targetFile.id));
            const result: JsonValue = { success: true, message: `Deleted file: ${filename}` };
            return { success: true, result, formatted: JSON.stringify(result) };
          }
          return { success: false, result: { error: 'File not found' }, formatted: JSON.stringify({ success: false, error: 'File not found' }) };
        }

        // 5. read_file - 精确读取文件内容（支持行范围）
        if (toolName === 'read_file') {
          const path = getString(args.path);
          const targetFile = filesRef.current.find(f =>
            f.name === path.replace('.md', '') ||
            f.name === path ||
            f.path === path ||
            f.path?.endsWith(path)
          );

          if (!targetFile) {
            const availableFiles = filesRef.current.map(f => f.name || f.path).filter(Boolean);
            return {
              success: false,
              result: { error: 'File not found', availableFiles },
              formatted: JSON.stringify({ error: 'File not found', availableFiles })
            };
          }

          const lines = targetFile.content.split('\n');
          const startLineValue = getNumber(args.startLine) ?? 1;
          const endLineValue = getNumber(args.endLine) ?? lines.length;
          const startLine = Math.max(0, startLineValue - 1);
          const endLine = Math.min(lines.length, endLineValue);
          const selectedContent = lines.slice(startLine, endLine).join('\n');

          const result: JsonValue = {
            success: true,
            fileName: targetFile.name || targetFile.path,
            content: selectedContent,
            lineRange: { start: startLine + 1, end: endLine },
            totalLines: lines.length
          };
          return { success: true, result, formatted: JSON.stringify(result, null, 2) };
        }

        // 6. search_files - 全文搜索（内存实现）
        if (toolName === 'search_files') {
          const keyword = getString(args.keyword);
          const filePattern = getString(args.filePattern);
          if (!keyword) {
            return {
              success: false,
              result: { error: 'Missing keyword parameter' },
              formatted: JSON.stringify({ error: 'Missing keyword parameter' })
            };
          }

          const results: Array<{ fileName: string; matches: Array<{ line: number; content: string }> }> = [];

          for (const file of filesRef.current) {
            // 如果指定了文件模式，进行过滤
            const fileName = file.name || file.path || '';
            if (filePattern && !fileName.includes(filePattern)) continue;

            const lines = file.content.split('\n');
            const matches: Array<{ line: number; content: string }> = [];

            lines.forEach((line, idx) => {
              if (line.toLowerCase().includes(keyword.toLowerCase())) {
                matches.push({
                  line: idx + 1,
                  content: line.trim()
                });
              }
            });

            if (matches.length > 0) {
              results.push({
                fileName,
                matches: matches.slice(0, 10) // 每个文件最多10条匹配
              });
            }
          }

          const result: JsonValue = {
            success: true,
            keyword,
            filePattern: filePattern || null,
            totalFiles: results.length,
            totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
            results: results.slice(0, 20) // 最多返回20个文件的结果
          };
          return { success: true, result, formatted: JSON.stringify(result, null, 2) };
        }

        // ===== 外部 MCP 工具 =====
        try {
          const mcpResult = await window.electronAPI?.mcp?.callTool(toolName, args);
          if (mcpResult?.success) {
            return { success: true, result: mcpResult.result as JsonValue, formatted: JSON.stringify(mcpResult.result, null, 2) };
          } else {
            return { success: false, result: { error: mcpResult?.error || 'Unknown error' }, formatted: `Error: ${mcpResult?.error || 'Unknown error'}` };
          }
        } catch (error: any) {
          return { success: false, result: { error: error.message }, formatted: `Error: ${error.message}` };
        }
      };

      // 4. Check if streaming is enabled
      if (aiConfig.enableStreaming) {
        // ===== 流式模式：使用渐进式解析 =====
        setIsStreaming(true);
        setAiState({ isThinking: false, message: null, error: null });
        abortControllerRef.current = new AbortController();

        let fullContent = '';
        let conversationHistory = [...historyForAI];
        let currentPrompt = text;

        // 超时保护配置
        const MAX_TOTAL_TIME = 10 * 60 * 1000; // 10分钟总超时
        const ROUND_TIMEOUT = 60 * 1000; // 60秒单轮超时
        const startTime = Date.now();
        let toolRound = 0;

        try {
          while (true) {
            toolRound++;
            const roundStartTime = Date.now();

            // 检查总超时
            if (Date.now() - startTime > MAX_TOTAL_TIME) {
              fullContent += '\n\n⏱️ **提示**: 对话已运行10分钟，自动结束以保护系统资源。如需继续，请发送新消息。';
              console.log('[Stream] Total timeout reached after 10 minutes');
              break;
            }

            console.log(`[Stream] Tool round ${toolRound}`);

            const stream = generateAIResponseStream(
              currentPrompt,
              aiConfig,
              `You are ZhangNote AI assistant. You can use tools to help users.

## Built-in Tools (应用内工具 - 最高优先级)

### File Operations (文件操作)
- **create_file**: Create a new file in the app (filename, content)
- **update_file**: Update an existing file (filename, content)
- **delete_file**: Delete a file (filename)
- **read_file**: Read specific file content with optional line range. Use when user asks to "read", "view", "show", "open" a specific file. Parameters: path (required), startLine (optional), endLine (optional)
- **search_files**: Search keyword across ALL files. Returns matching lines with line numbers. Use when user asks to "find", "search", "look for" a keyword. Parameters: keyword (required), filePattern (optional)

### Knowledge Base (知识库搜索)
- **search_knowledge_base**: Semantic search in user's notes using RAG vectors. Use when user asks general questions about their notes or needs relevant context. Parameters: query (required)

## When to Use Which Tool
- User says "read file X" / "show me X.md" → use **read_file**
- User says "search for keyword Y" / "find all mentions of Y" → use **search_files**
- User asks "what do my notes say about..." / "what documents mention..." → use **search_knowledge_base**
- User says "create a note about..." → use **create_file**

## Tool Call Format
When you need to use a tool, output EXACTLY:
\`\`\`tool_call
{"tool": "tool_name", "arguments": {"param": "value"}}
\`\`\`

## Task Completion Signal
When you have fully completed the user's request and no more tool calls are needed, end your response with:
[TASK_COMPLETE]

This signal tells the system you are done. Use it when:
- You have answered the user's question completely
- All requested operations have been performed
- No more tool calls are necessary

IMPORTANT:
- Use create_file/update_file for app files, NOT external MCP tools
- Use read_file to read specific files by name
- Use search_files to find keywords across all files
- Output COMPLETE JSON in tool_call block
- After tool result, continue your response
- End with [TASK_COMPLETE] when fully done`,
              [],
              undefined,
              conversationHistory
            );

            let roundContent = '';
            let pendingToolCall = '';
            let inToolBlock = false;
            let toolBlockStart = -1;

            for await (const chunk of stream) {
              roundContent += chunk;

              // 渐进式检测 tool_call 块
              const toolBlockMatch = roundContent.match(/```tool_call\s*\n/);
              if (toolBlockMatch && !inToolBlock) {
                inToolBlock = true;
                toolBlockStart = toolBlockMatch.index! + toolBlockMatch[0].length;
              }

              // 更新显示（过滤掉不完整的 tool_call 块）
              let displayContent = fullContent + roundContent;
              if (inToolBlock) {
                // 检查是否有完整的 tool_call 块
                const completeMatch = roundContent.match(/```tool_call\s*\n([\s\S]*?)```/);
                if (!completeMatch) {
                  // 隐藏不完整的 tool_call 块，显示执行提示
                  const beforeBlock = roundContent.substring(0, roundContent.indexOf('```tool_call'));
                  displayContent = fullContent + beforeBlock + '\n\n🔧 *Preparing tool call...*';
                }
              }

              setChatMessages(prev => prev.map(msg =>
                msg.id === aiMessageId
                  ? { ...msg, content: displayContent }
                  : msg
              ));
            }

            // 流结束后检查完整的 tool_call
            const toolCallMatch = roundContent.match(/```tool_call\s*\n([\s\S]*?)```/);

            // 检测 AI 主动结束信号
            if (roundContent.includes('[TASK_COMPLETE]')) {
              console.log('[Stream] AI signaled task completion');
              const cleanContent = roundContent.replace(/\[TASK_COMPLETE\]/g, '').trim();
              fullContent += cleanContent;
              break;
            }

            // 检查单轮超时
            const roundDuration = Date.now() - roundStartTime;
            if (roundDuration > ROUND_TIMEOUT) {
              console.warn(`[Stream] Round ${toolRound} exceeded timeout (${roundDuration}ms)`);
              fullContent += roundContent + '\n\n⚠️ **警告**: 本轮响应超时（60秒），已自动结束。';
              break;
            }

            if (toolCallMatch) {
              try {
                // 尝试解析 JSON
                let jsonStr = toolCallMatch[1].trim();

                // 修复常见的 JSON 问题
                jsonStr = jsonStr.replace(/,\s*}/, '}').replace(/,\s*]/, ']');

                const toolCall = JSON.parse(jsonStr);
                const toolName = toolCall.tool || toolCall.name;
                const toolArgs = (toolCall.arguments || toolCall.args || {}) as Record<string, JsonValue>;

                if (!toolName) {
                  throw new Error('Missing tool name');
                }

                // 显示执行状态
                const beforeTool = roundContent.substring(0, roundContent.indexOf('```tool_call'));
                setChatMessages(prev => prev.map(msg =>
                  msg.id === aiMessageId
                    ? { ...msg, content: fullContent + beforeTool + `\n\n🔧 **Executing: ${toolName}**...\n` }
                    : msg
                ));

                // 执行工具
                const toolResult = await executeToolUnified(toolName, toolArgs);

                // 更新内容
                const toolResultBlock = buildToolResultBlock(toolName, toolResult);
                const afterToolContent = `${beforeTool}\n\n${toolResultBlock}\n`;

                fullContent += afterToolContent;

                setChatMessages(prev => prev.map(msg =>
                  msg.id === aiMessageId
                    ? { ...msg, content: fullContent }
                    : msg
                ));

                // 更新对话历史继续下一轮
                conversationHistory = [
                  ...conversationHistory,
                  { id: generateId(), role: 'assistant' as const, content: roundContent, timestamp: Date.now() },
                  { id: generateId(), role: 'user' as const, content: `Tool "${toolName}" result:\n${toolResult.formatted}\n\nContinue with the next step or provide your final answer.`, timestamp: Date.now() }
                ];
                currentPrompt = `Tool "${toolName}" result:\n${toolResult.formatted}\n\nContinue with the next step or provide your final answer.`;

              } catch (parseError) {
                console.error('[Stream] Tool call parse error:', parseError, toolCallMatch[1]);
                // 解析失败，显示原始内容并停止循环
                fullContent += roundContent;
                break;
              }
            } else {
              // 没有工具调用，正常结束
              fullContent += roundContent;
              break;
            }
          }

          // 最终更新
          setChatMessages(prev => prev.map(msg =>
            msg.id === aiMessageId
              ? { ...msg, content: fullContent }
              : msg
          ));

        } finally {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }

      } else {
        // ===== 非流式模式：使用原生 Function Calling + 实时UI反馈 =====
        // 注意：不再设置 aiState.isThinking，因为已经有占位消息
        // 这避免了双重 "思考中" 显示

        const upsertToolCall = (existing: ToolCall[] | undefined, toolCall: ToolCall): ToolCall[] => {
          const current = existing ? [...existing] : [];
          const index = current.findIndex(call => call.id === toolCall.id);
          if (index >= 0) {
            current[index] = { ...current[index], ...toolCall };
            return current;
          }
          return [...current, toolCall];
        };

        const handleToolEvent = (toolCall: ToolCall) => {
          setChatMessages(prev => prev.map(msg =>
            msg.id === aiMessageId
              ? { ...msg, toolCalls: upsertToolCall(msg.toolCalls, toolCall) }
              : msg
          ));
        };

        // 带UI反馈的工具调用回调
        const nativeToolCallback = async (name: string, args: Record<string, JsonValue>) => {
          // 执行工具
          const result = await executeToolUnified(name, args);

          return result.result;
        };

        const response = await generateAIResponse(
          text,
          aiConfig,
          `You are ZhangNote AI assistant with the following tools:
- **read_file**: Read specific file content (use when user wants to read/view a file)
- **search_files**: Search keyword across all files (use when user wants to find/search text)
- **search_knowledge_base**: Semantic search in notes (use for general questions about notes)
- **create_file**, **update_file**, **delete_file**: File management`,
          false,
          [],
          nativeToolCallback,
          undefined,
          historyForAI,
          false,
          handleToolEvent
        );

        // 更新消息
        setChatMessages(prev => prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, content: response }
            : msg
        ));
      }

    } catch (err: any) {
      console.error("Chat error:", err);
      setAiState({ isThinking: false, message: null, error: err.message });

      // Update AI message with error
      setChatMessages(prev => prev.map(msg =>
        msg.id === aiMessageId
          ? { ...msg, content: `**Error**: ${err.message}` }
          : msg
      ));
    }
  };

  const handleCompactChat = async () => {
    if (chatMessages.length <= 3) {
      showToast("Not enough history to compact.", true);
      return;
    }

    // Analyze session for memory candidate and show prompt
    if (chatMessages.length >= 5) {
      setAiState({ isThinking: true, message: "Analyzing conversation...", error: null });
      
      try {
        const candidate = analyzeSessionForMemory(
          chatMessages.map(m => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: m.timestamp
          }))
        );
        
        setCompactMemoryCandidate(candidate);
        setShowCompactMemoryPrompt(true);
        setAiState(prev => ({ ...prev, isThinking: false, message: null }));
      } catch (e: any) {
        console.error('[CompactChat] Analysis failed:', e);
        // If analysis fails, proceed with compaction directly
        await performCompact();
      }
    } else {
      // Not enough messages for memory, just compact
      await performCompact();
    }
  };

  // Perform the actual compaction
  const performCompact = async () => {
    setAiState({ isThinking: true, message: "Summarizing conversation...", error: null });
    try {
      const compacted = await compactConversation(chatMessages, aiConfig);
      setChatMessages(compacted);
      showToast("Context compacted.");
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  // Handle saving memory from compact prompt
  const handleCompactMemorySave = async (editedSummary: string, autoInject: boolean, markImportant: boolean) => {
    if (!compactMemoryCandidate) return;
    
    setIsCompactSaving(true);
    try {
      const sessionId = `session_${Date.now()}`;
      
      // Create embedding service
      const embeddingService = async (text: string): Promise<number[]> => {
        try {
          return await getEmbedding(text, aiConfig);
        } catch (error) {
          console.warn('[CompactMemory] Embedding failed:', error);
          return [];
        }
      };

      // Initialize persistent memory service
      await initPersistentMemory();

      const memory = await createMemoryFromCandidate(
        sessionId,
        compactMemoryCandidate,
        editedSummary,
        embeddingService
      );

      if (memory) {
        showToast(lang === 'zh'
          ? `已创建永久记忆: ${memory.topics.slice(0, 2).join(', ')}`
          : `Created permanent memory: ${memory.topics.slice(0, 2).join(', ')}`);
      }

      // Close prompt and perform compaction
      setShowCompactMemoryPrompt(false);
      setCompactMemoryCandidate(null);
      await performCompact();
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setIsCompactSaving(false);
    }
  };

  // Handle skipping memory save from compact prompt
  const handleCompactMemorySkip = async () => {
    setShowCompactMemoryPrompt(false);
    setCompactMemoryCandidate(null);
    await performCompact();
  };

  // --- Keyboard Shortcuts Logic ---
  const handleShortcutCommand = (actionId: string) => {
    switch (actionId) {
      case 'save':
        // Explicit save to disk
        if (activeFile.isLocal && activeFile.handle) {
          setIsSaving(true);
          saveFileToDisk(activeFile).then(() => {
            showToast('File Saved', false);
            setIsSaving(false);
          }).catch(() => setIsSaving(false));
        } else {
          showToast('Saved locally', false);
        }
        break;
      case 'toggle_sidebar':
        setIsSidebarOpen(prev => !prev);
        break;
      case 'toggle_chat':
        setIsChatOpen(prev => !prev);
        break;
      case 'open_settings':
        setIsSettingsOpen(true);
        break;
      case 'new_file':
        handleCreateItem('file', 'Untitled', '');
        break;
      case 'ai_polish':
        if (!aiState.isThinking) performPolish();
        break;
      case 'build_graph':
        if (!aiState.isThinking) performGraph();
        break;
      case 'smart_organize':
        if (activeFileId) {
          const file = files.find(f => f.id === activeFileId);
          if (file) {
            setSmartOrganizeFile(file);
            setIsSmartOrganizeOpen(true);
          }
        }
        break;
      case 'search':
        setIsSearchOpen(true);
        break;
      // Link Insert shortcuts
      case 'insert_wikilink':
        setLinkInsertMode('wikilink');
        setIsLinkInsertOpen(true);
        break;
      case 'insert_blockref':
        setLinkInsertMode('blockref');
        setIsLinkInsertOpen(true);
        break;
      case 'quick_link':
        setLinkInsertMode('quick_link');
        setIsLinkInsertOpen(true);
        break;
      default:
        console.warn(`Unknown action ID: ${actionId}`);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Construct key string from event
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.metaKey) parts.push('Cmd');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');

      let key = e.key;
      if (key === ' ') key = 'Space';
      if (key.length === 1) key = key.toUpperCase();

      // Don't add key if it is a modifier
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        parts.push(key);
      }

      const combo = parts.join('+');

      const match = shortcuts.find(s => s.keys === combo);
      if (match) {
        e.preventDefault();
        handleShortcutCommand(match.actionId);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [shortcuts, activeFile, aiState.isThinking]); // Dependencies crucial for actions to access latest state

  const handleUpdateShortcut = (id: string, keys: string) => {
    setShortcuts(prev => prev.map(s => s.id === id ? { ...s, keys } : s));
  };

  const handleResetShortcuts = () => {
    setShortcuts(DEFAULT_SHORTCUTS);
  };

  // --- WikiLink Navigation Handler ---
  useEffect(() => {
    const handleWikiLinkNavigation = (e: CustomEvent) => {
      const { target } = e.detail;
      if (!target) return;

      const normalizedTarget = target.toLowerCase();

      // Handle exam links
      if (normalizedTarget.startsWith('exam:')) {
        const examName = target.substring(5).trim();
        // Find exam file or create navigation
        const examFile = files.find(f =>
          f.name.toLowerCase() === examName.toLowerCase() ||
          f.name.toLowerCase().includes(examName.toLowerCase())
        );
        if (examFile) {
          openFileInPane(examFile.id);
        } else {
          showToast(`Exam not found: ${examName}`, true);
        }
        return;
      }

      // Handle question links
      if (normalizedTarget.startsWith('question:')) {
        const questionId = target.substring(9).trim();
        showToast(`Question reference: ${questionId}`);
        return;
      }

      // Handle regular wiki links
      const targetFile = files.find(f => {
        const name = f.name.toLowerCase();
        const path = f.path?.toLowerCase() || '';
        return name === normalizedTarget ||
          path.endsWith(`/${normalizedTarget}`) ||
          name.includes(`/${normalizedTarget}`) ||
          name === `${normalizedTarget}.md` ||
          path === `${normalizedTarget}.md`;
      });

      if (targetFile) {
        openFileInPane(targetFile.id);
      } else {
        showToast(`Page not found: ${target}`, true);
      }
    };

    window.addEventListener('navigate-to-wikilink', handleWikiLinkNavigation as EventListener);
    return () => window.removeEventListener('navigate-to-wikilink', handleWikiLinkNavigation as EventListener);
  }, [files, showToast]);

  const currentThemeObj = themes.find(t => t.id === activeThemeId) || themes[0];

  // Loading Screen
  if (isCheckingAuth) {
    return (
      <div className="flex w-full h-screen bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))] items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-[rgb(var(--primary-500))] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Login Screen
  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={() => setIsAuthenticated(true)}
        showConfirmDialog={showConfirmDialog}
      />
    );
  }

  // Main Application
  return (
    <div className="flex w-full h-screen bg-paper-50 dark:bg-cyber-900 text-slate-800 dark:text-slate-200 overflow-hidden transition-colors duration-300">

      <Sidebar
        files={files}
        setFiles={setFiles}
        activeFileId={activeFileId}
        onSelectFile={openFileInPane}
        onCreateItem={handleCreateItem}
        onDeleteFile={handleDeleteFile}
        onMoveItem={handleMoveItem}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        onOpenFolder={handleOpenFolder}
        onImportFolderFiles={handleImportFolderFiles}
        onImportPdf={handleImportPdf}
        onImportQuiz={handleImportQuiz}
        language={lang}
        ragStats={ragStats}
        ocrStats={ocrStats}
        onRefreshIndex={() => handleIndexKnowledgeBase()}
        snippets={snippets}
        onCreateSnippet={handleCreateSnippet}
        onDeleteSnippet={handleDeleteSnippet}
        onInsertSnippet={handleInsertSnippet}
        onOpenTagSuggestion={() => setIsTagSuggestionOpen(true)}
        onOpenSmartOrganize={(file) => {
          setSmartOrganizeFile(file);
          setIsSmartOrganizeOpen(true);
        }}
        onOpenReview={() => setIsStudyPlanOpen(true)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Toolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          onClear={() => updateActiveFile('')}
          onExport={handleExport}
          onAIPolish={performPolish}
          onAIExpand={async () => {
            // 使用活动面板的文件内容
            const currentContent = getActivePaneContent();

            // 验证内容非空
            if (!currentContent.trim()) {
              showToast(t.polishEmptyError || "Please add content before expanding", true);
              return;
            }

            try {
              saveSnapshot();
              setAiState({ isThinking: true, message: "Expanding...", error: null });
              const res = await expandContent(currentContent, aiConfig);
              updateActiveFile(res);
              showToast("Expanded!");
            } catch (e: any) { showToast(e.message, true); }
            finally { setAiState(p => ({ ...p, isThinking: false, message: null })); }
          }}
          onBuildGraph={performGraph}
          onSynthesize={performSynthesize}
          onGenerateMindMap={handleGenerateMindMap}
          onGenerateQuiz={handleGenerateQuiz}
          onFormatBold={() => handleTextFormat('**', '**')}
          onFormatItalic={() => handleTextFormat('*', '*')}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isAIThinking={aiState.isThinking}
          theme={currentThemeObj?.type || 'dark'}
          toggleTheme={toggleTheme}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          toggleChat={() => setIsChatOpen(!isChatOpen)}
          toggleSettings={() => setIsSettingsOpen(true)}
          fileName={activeFile.name}
          onRename={renameActiveFile}
          activeProvider={aiConfig.provider}
          language={lang}
          splitMode={splitMode}
          onSplitModeChange={setSplitMode}
          onVoiceTranscription={() => setIsVoiceTranscriptionOpen(true)}
          onOpenQuestionBank={() => setIsQuestionBankOpen(true)}
        />

        {/* Editor Tabs */}
        <EditorTabs
          panes={openPanes}
          activePane={activePaneId}
          files={files}
          onSelectPane={selectPane}
          onClosePane={closePane}
          onToggleMode={togglePaneMode}
          language={lang}
        />

        <div className="flex-1 flex flex-col overflow-hidden relative">

          {viewMode === ViewMode.Graph && (
            <KnowledgeGraph
              key={activeThemeId}
              data={graphData}
              theme={currentThemeObj?.type || 'dark'}
              onNodeClick={handleNodeClick}
              language={lang}
            />
          )}

          {viewMode === ViewMode.Quiz && currentQuiz && (
            <QuizPanel
              quiz={currentQuiz}
              aiConfig={aiConfig}
              theme={currentThemeObj?.type || 'dark'}
              onClose={() => setViewMode(ViewMode.Editor)}
              contextContent={quizContext || activeFile.content}
              language={lang}
            />
          )}

          {viewMode === ViewMode.MindMap && (
            <MindMap
              key={activeThemeId}
              content={mindMapContent}
              theme={currentThemeObj?.type || 'dark'}
              language={lang}
            />
          )}

          {viewMode === ViewMode.Diff && (
            <DiffView
              originalText={diffOriginal}
              modifiedText={diffModified}
              onApply={handleApplyDiff}
              onCancel={handleCancelDiff}
              language={lang}
            />
          )}

          {viewMode === ViewMode.Analytics && (
            <AnalyticsDashboard
              examResults={examHistory}
              knowledgeStats={knowledgeStats}
              totalStudyTime={0}
              language={lang}
            />
          )}

          {viewMode === ViewMode.Roadmap && (
            <LearningRoadmap
              studyPlans={studyPlans}
              onCompleteTask={handleCompleteTask}
              onCreatePlan={handleCreatePlan}
              onDeletePlan={handleDeletePlan}
              language={lang}
              showConfirmDialog={showConfirmDialog}
            />
          )}

          {(viewMode === ViewMode.Editor || viewMode === ViewMode.Split || viewMode === ViewMode.Preview) && (
            <SplitEditor
              panes={openPanes}
              activePane={activePaneId}
              files={files}
              onContentChange={handlePaneContentChange}
              onCursorChange={handleCursorChange}
              onCursorSave={handleCursorSave}
              getCursorPosition={getCursorPosition}
              onToggleMode={togglePaneMode}
              onSelectPane={selectPane}
              splitMode={splitMode}
              language={lang}
              codeMirrorRef={codeMirrorRef}
            />
          )}

          {/* Link Insert Modal */}
          <LinkInsertModal
            isOpen={isLinkInsertOpen}
            mode={linkInsertMode}
            files={files}
            currentFileId={activeFileId}
            onInsert={handleLinkInsert}
            onClose={() => setIsLinkInsertOpen(false)}
            selectedText={getSelectedText()}
          />

          {/* Backlinks Panel */}
          {backlinks.length > 0 && (viewMode === ViewMode.Editor || viewMode === ViewMode.Split || viewMode === ViewMode.Preview) && (
            <div className="w-64 border-l border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900 overflow-y-auto">
              <BacklinkPanel
                currentFileName={activeFile?.name || ''}
                backlinks={backlinks}
                onNavigate={(fileId) => {
                  openFileInPane(fileId);
                }}
              />
            </div>
          )}

          <ChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            messages={chatMessages}
            onSendMessage={handleChatMessage}
            onClearChat={() => setChatMessages([])}
            onCompactChat={handleCompactChat}
            aiState={aiState}
            language={lang}
            isStreaming={isStreaming}
            onStopStreaming={handleStopStreaming}
            showToast={showToast}
          />

          {(aiState.message || aiState.error) && (
            <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 z-50 animate-bounce-in ${aiState.error ? 'bg-red-500/20 border-red-500/50 text-red-600 dark:text-red-200' : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-800 dark:text-cyan-200'}`}>
              {aiState.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
              <span className="text-sm font-medium">{aiState.message || aiState.error}</span>
            </div>
          )}
        </div>
      </div>

      <AISettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={aiConfig}
        onSave={async (c) => {
          setAiConfig(c);
          // Load MCP configuration if available
          if (c.mcpTools && c.mcpTools.trim() !== '[]' && mcpService.isAvailable()) {
            try {
              const result = await mcpService.loadConfig(c.mcpTools);
              if (result.success) {
                console.log('[MCP] Configuration loaded successfully');
              } else {
                console.warn('[MCP] Failed to load configuration:', result.error);
              }
            } catch (e) {
              console.error('[MCP] Error loading configuration:', e);
            }
          }
        }}
        themes={themes}
        activeThemeId={activeThemeId}
        onSelectTheme={handleThemeChange}
        onImportTheme={(t) => { saveCustomTheme(t); setThemes(getAllThemes()); handleThemeChange(t.id); }}
        onDeleteTheme={(id) => { deleteCustomTheme(id); setThemes(getAllThemes()); if (activeThemeId === id) handleThemeChange(getAllThemes()[0].id); }}
        language={lang}
        shortcuts={shortcuts}
        onUpdateShortcut={handleUpdateShortcut}
        onResetShortcuts={handleResetShortcuts}
        showToast={showToast}
        onDataImported={() => {
          // Close modal first, then reload to apply imported data
          setIsSettingsOpen(false);
          setTimeout(() => {
            window.location.reload();
          }, 300);
        }}
        showConfirmDialog={showConfirmDialog}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirmDialog}
      />

      <VoiceTranscriptionModal
        isOpen={isVoiceTranscriptionOpen}
        onClose={() => setIsVoiceTranscriptionOpen(false)}
        files={files}
        onSaveToFile={(fileId, content, mode) => {
          const targetFile = files.find(f => f.id === fileId);
          if (targetFile) {
            const newContent = mode === 'append'
              ? targetFile.content + '\n\n' + content
              : content;
            const updatedFile = { ...targetFile, content: newContent, lastModified: Date.now() };
            setFiles(prev => prev.map(f => f.id === fileId ? updatedFile : f));
            // If this is the active file, update it
            if (activeFileId === fileId) {
              setActiveFileId(fileId); // Trigger re-render
            }
            showToast(translations[lang].transcription.savedToFile, false);
          }
        }}
        onCreateNewFile={(content) => {
          // Generate unique filename with full timestamp (date + time) to avoid conflicts
          const now = new Date();
          const timestamp = now.toISOString()
            .replace(/[-:]/g, '')
            .replace('T', '_')
            .slice(0, 15); // Format: YYYYMMDD_HHmmss
          const newFile: MarkdownFile = {
            id: generateId(),
            name: `Transcription_${timestamp}.md`,
            content,
            lastModified: Date.now()
          };
          setFiles(prev => [...prev, newFile]);
          setActiveFileId(newFile.id);
          showToast(translations[lang].transcription.savedToFile, false);
        }}
        language={lang}
      />

      <QuestionBankModal
        isOpen={isQuestionBankOpen}
        onClose={() => setIsQuestionBankOpen(false)}
        banks={questionBanks}
        onCreateBank={handleCreateQuestionBank}
        onDeleteBank={handleDeleteQuestionBank}
        onUpdateBank={handleUpdateQuestionBank}
        onAddQuestionsToBank={async () => { }}
        onGenerateQuestions={handleGenerateQuestions}
        onRemoveQuestion={handleRemoveQuestion}
        files={files}
        aiConfig={aiConfig}
        onShowToast={showToast}
        language={lang}
      />

      <TagSuggestionModal
        isOpen={isTagSuggestionOpen}
        onClose={() => setIsTagSuggestionOpen(false)}
        content={getActivePaneContent()}
        aiConfig={aiConfig}
        existingTags={extractTags(getActivePaneContent())}
        onApplyTags={handleApplyTags}
        onShowToast={showToast}
        language={lang}
      />

      <SmartOrganizeModal
        isOpen={isSmartOrganizeOpen}
        onClose={() => { setIsSmartOrganizeOpen(false); setSmartOrganizeFile(null); }}
        file={smartOrganizeFile || DEFAULT_FILE}
        aiConfig={aiConfig}
        onUpdateFile={handleSmartOrganizeUpdate}
        onApplySuggestions={() => { }}
        allFiles={files}
        language={lang}
      />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        files={files}
        onSelectFile={openFileInPane}
      />

      <StudyPlanPanel
        isOpen={isStudyPlanOpen}
        onClose={() => setIsStudyPlanOpen(false)}
        studyPlans={studyPlans}
        onCompleteTask={handleCompleteTask}
        onCreatePlan={handleCreatePlan}
        onDeletePlan={handleDeletePlan}
        language={lang}
      />

      <LinkInsertModal
        isOpen={isLinkInsertOpen}
        mode={linkInsertMode}
        files={files}
        currentFileId={activeFileId}
        onInsert={handleLinkInsert}
        onClose={() => setIsLinkInsertOpen(false)}
        selectedText={getSelectedText()}
      />

      <CompactMemoryPrompt
        isOpen={showCompactMemoryPrompt}
        candidate={compactMemoryCandidate}
        language={lang}
        onSave={handleCompactMemorySave}
        onSkip={handleCompactMemorySkip}
        onClose={() => {
          setShowCompactMemoryPrompt(false);
          setCompactMemoryCandidate(null);
        }}
      />
    </div>
  );
};

export default App;
