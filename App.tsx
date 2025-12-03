
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Toolbar } from './components/Toolbar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { AISettingsModal } from './components/AISettingsModal';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { QuizPanel } from './components/QuizPanel';
import { MindMap } from './components/MindMap';
import { LoginScreen } from './components/LoginScreen';
import { NoteSpace } from './components/NoteSpace';
import { LibraryView } from './components/LibraryView';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { DrawingModal } from './components/DrawingModal';
import { SearchModal } from './components/SearchModal';
import { ViewMode, AIState, MarkdownFile, AIConfig, ChatMessage, GraphData, AppTheme, Quiz, RAGStats, AppShortcut, PaneType, NoteLayoutItem, BackupFrequency } from './types';
import { polishContent, expandContent, generateAIResponse, synthesizeKnowledgeBase, generateQuiz, generateMindMap, extractQuizFromRawContent, compactConversation, extractEntitiesAndRelationships } from './services/aiService';
import { generateFileLinkGraph } from './services/knowledgeService';
import { applyTheme, getAllThemes, getSavedThemeId, saveCustomTheme, deleteCustomTheme, DEFAULT_THEMES, getLastUsedThemeIdForMode } from './services/themeService';
import { readDirectory, saveFileToDisk, processPdfFile, extractTextFromFile, parseCsvToQuiz, parseJsonToQuiz, isExtensionSupported } from './services/fileService';
import { VectorStore } from './services/ragService';
import { AlertCircle, CheckCircle2, X, Database } from 'lucide-react';
import { translations, Language } from './utils/translations';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';

const generateId = () => Math.random().toString(36).substring(2, 11);

const DEFAULT_CONTENT = "# Welcome to ZhangNote ⚡\n\nTry opening a local folder or importing a PDF!\n\nLink to another file like this: [[My Notes]].\nAdd tags like #project/ideas.";

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
  backup: {
    frequency: 'weekly',
    lastBackup: 0
  }
};

const DEFAULT_SHORTCUTS: AppShortcut[] = [
  // Global
  { id: 'save', label: 'Save File', keys: 'Ctrl+S', actionId: 'save' },
  { id: 'sidebar', label: 'Toggle Sidebar', keys: 'Ctrl+B', actionId: 'toggle_sidebar' },
  { id: 'settings', label: 'Open Settings', keys: 'Alt+S', actionId: 'open_settings' },
  { id: 'chat', label: 'Toggle Chat', keys: 'Alt+C', actionId: 'toggle_chat' },
  { id: 'new_file', label: 'New File', keys: 'Alt+N', actionId: 'new_file' },
  { id: 'polish', label: 'AI Polish', keys: 'Alt+P', actionId: 'ai_polish' },
  { id: 'graph', label: 'Build Graph', keys: 'Alt+G', actionId: 'build_graph' },
  { id: 'draw', label: 'Drawing Canvas', keys: 'Alt+D', actionId: 'open_drawing' },
  { id: 'search', label: 'Global Search', keys: 'Ctrl+K', actionId: 'open_search' },
  
  // Core Formatting
  { id: 'bold', label: 'Bold', keys: 'Ctrl+B', actionId: 'format_bold' },
  { id: 'italic', label: 'Italic', keys: 'Ctrl+I', actionId: 'format_italic' },
  { id: 'strike', label: 'Strikethrough', keys: 'Ctrl+Alt+X', actionId: 'format_strike' },
  { id: 'code_inline', label: 'Inline Code', keys: 'Ctrl+E', actionId: 'format_code_inline' },
  { id: 'blockquote', label: 'Blockquote', keys: 'Ctrl+Shift+B', actionId: 'format_blockquote' },
  
  // Headings
  { id: 'h1', label: 'Heading 1', keys: 'Ctrl+Alt+1', actionId: 'format_h1' },
  { id: 'h2', label: 'Heading 2', keys: 'Ctrl+Alt+2', actionId: 'format_h2' },
  { id: 'h3', label: 'Heading 3', keys: 'Ctrl+Alt+3', actionId: 'format_h3' },
  { id: 'h4', label: 'Heading 4', keys: 'Ctrl+Alt+4', actionId: 'format_h4' },
  { id: 'h5', label: 'Heading 5', keys: 'Ctrl+Alt+5', actionId: 'format_h5' },
  { id: 'h6', label: 'Heading 6', keys: 'Ctrl+Alt+6', actionId: 'format_h6' },
  { id: 'h_reset', label: 'Normal Text', keys: 'Ctrl+Alt+0', actionId: 'format_p' },
  
  // Lists & Structure
  { id: 'list_ol', label: 'Ordered List', keys: 'Ctrl+Alt+7', actionId: 'list_ol' },
  { id: 'list_ul', label: 'Unordered List', keys: 'Ctrl+Alt+8', actionId: 'list_ul' },
  { id: 'indent', label: 'Indent', keys: 'Tab', actionId: 'indent' },
  { id: 'outdent', label: 'Outdent', keys: 'Shift+Tab', actionId: 'outdent' },
  { id: 'code_block', label: 'Code Block', keys: 'Ctrl+Alt+C', actionId: 'format_code_block' },
  { id: 'table_row', label: 'Add Table Row', keys: 'Ctrl+Enter', actionId: 'table_add_row' },
];

interface FileHistory {
  past: string[];
  future: string[];
}

const App: React.FC = () => {
  // --- Auth State ---
  const [isLoginEnabled, setIsLoginEnabled] = useState(() => {
      return localStorage.getItem('neon-login-enabled') === 'true';
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
      const loginEnabled = localStorage.getItem('neon-login-enabled') === 'true';
      return !loginEnabled;
  });

  const handleToggleLogin = (enabled: boolean) => {
      setIsLoginEnabled(enabled);
      localStorage.setItem('neon-login-enabled', String(enabled));
  };

  // --- Theme State ---
  const [themes, setThemes] = useState<AppTheme[]>(() => {
    const t = getAllThemes();
    return t.length > 0 ? t : DEFAULT_THEMES;
  });
  const [activeThemeId, setActiveThemeId] = useState<string>(() => getSavedThemeId());

  useEffect(() => {
    const currentTheme = themes.find(t => t.id === activeThemeId) || themes[0];
    if (currentTheme) {
      applyTheme(currentTheme);
    }
  }, [activeThemeId, themes]);

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
    const lastUsedId = getLastUsedThemeIdForMode(targetType);
    const lastUsedTheme = lastUsedId ? themes.find(t => t.id === lastUsedId) : undefined;
    
    if (lastUsedTheme) {
        handleThemeChange(lastUsedTheme.id);
    } else {
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
        if (Array.isArray(parsed)) {
          const validFiles = parsed.filter(f => f && typeof f === 'object' && f.id && f.name);
          if (validFiles.length > 0) return validFiles;
        }
      }
    } catch (e) { 
      console.error("Failed to load files from storage, using default", e);
    }
    return [DEFAULT_FILE];
  });
  
  // PANE STATE MANAGEMENT
  const [primaryFileId, setPrimaryFileId] = useState<string>(() => {
    const saved = localStorage.getItem('neon-active-id');
    return saved || 'default-1';
  });

  const [secondaryFileId, setSecondaryFileId] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<PaneType>('primary');

  const activeFileId = activePane === 'primary' ? primaryFileId : (secondaryFileId || primaryFileId);
  const activeFile = files.find(f => f.id === activeFileId) || files[0] || DEFAULT_FILE;

  // Refs for Scroll Sync
  const primaryEditorRef = useRef<HTMLTextAreaElement>(null);
  const primaryPreviewRef = useRef<HTMLDivElement>(null);
  const secondaryEditorRef = useRef<HTMLTextAreaElement>(null);
  const secondaryPreviewRef = useRef<HTMLDivElement>(null);

  // --- Note Space Layout State ---
  const [noteLayout, setNoteLayout] = useState<Record<string, NoteLayoutItem>>(() => {
    try {
      const saved = localStorage.getItem('neon-note-layout');
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('neon-note-layout', JSON.stringify(noteLayout));
  }, [noteLayout]);

  // --- Undo/Redo State ---
  const [history, setHistory] = useState<Record<string, FileHistory>>({});
  const lastEditTimeRef = useRef<number>(0);
  const HISTORY_DEBOUNCE = 1000;
  const MAX_HISTORY = 50;

  // --- Feature State ---
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    try {
      const saved = localStorage.getItem('neon-ai-config');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure defaults merge with saved config
        return { 
          ...DEFAULT_AI_CONFIG, 
          ...parsed,
          customPrompts: { ...DEFAULT_AI_CONFIG.customPrompts, ...parsed.customPrompts },
          backup: { ...DEFAULT_AI_CONFIG.backup, ...parsed.backup }
        };
      }
      return DEFAULT_AI_CONFIG;
    } catch (e) { return DEFAULT_AI_CONFIG; }
  });

  const [shortcuts, setShortcuts] = useState<AppShortcut[]>(() => {
    try {
       const saved = localStorage.getItem('neon-shortcuts');
       // Merge saved with default to ensure new defaults (like H4-H6) appear if not overwritten
       if (saved) {
           const parsed = JSON.parse(saved);
           const combined = [...parsed];
           DEFAULT_SHORTCUTS.forEach(def => {
               if (!combined.some(s => s.id === def.id)) {
                   combined.push(def);
               }
           });
           return combined;
       }
       return DEFAULT_SHORTCUTS;
    } catch (e) { return DEFAULT_SHORTCUTS; }
  });

  useEffect(() => {
     localStorage.setItem('neon-shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  const [aiState, setAiState] = useState<AIState>({ isThinking: false, error: null, message: null });
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Split);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'ai' | 'security'>('ai');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
      try {
          const saved = localStorage.getItem('neon-chat-history');
          return saved ? JSON.parse(saved) : [];
      } catch { return []; }
  });

  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [mindMapContent, setMindMapContent] = useState<string | null>(null);
  const [isDrawingOpen, setIsDrawingOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Dictation
  const [isDictating, setIsDictating] = useState(false);

  // Backup Reminder State
  const [showBackupReminder, setShowBackupReminder] = useState(false);

  // RAG State
  const [vectorStore] = useState(() => new VectorStore());
  const [ragStats, setRagStats] = useState<RAGStats>({ totalFiles: 0, indexedFiles: 0, totalChunks: 0, isIndexing: false });

  // --- Effects ---

  useEffect(() => {
    localStorage.setItem('neon-files', JSON.stringify(files.map(({ handle, ...rest }) => rest)));
    // Also save active file ID
    localStorage.setItem('neon-active-id', primaryFileId);
  }, [files, primaryFileId]);

  useEffect(() => {
    localStorage.setItem('neon-ai-config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    localStorage.setItem('neon-chat-history', JSON.stringify(messages));
  }, [messages]);

  // Initial Indexing for RAG
  useEffect(() => {
      if (!files || files.length === 0) return;
      
      const runIndexing = async () => {
          setRagStats(prev => ({ ...prev, isIndexing: true, totalFiles: files.length }));
          
          for (const file of files) {
              await vectorStore.indexFile(file, aiConfig);
          }
          
          setRagStats(prev => ({ 
              ...vectorStore.getStats(), 
              totalFiles: files.length, 
              isIndexing: false 
          }));
      };

      // Only run if we have API Key or valid local config
      if (aiConfig.apiKey || aiConfig.provider === 'ollama') {
           runIndexing();
      }
  }, [files, aiConfig.apiKey, aiConfig.model]); // Re-index if model/key changes or files change significantly (debouncing handled by logic usually, here simple)

  // Backup Scheduler
  useEffect(() => {
      if (!aiConfig.backup) return;
      const { frequency, lastBackup } = aiConfig.backup;
      if (frequency === 'never') return;

      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      let threshold = 0;

      switch (frequency) {
          case 'daily': threshold = ONE_DAY; break;
          case 'weekly': threshold = ONE_DAY * 7; break;
          case 'monthly': threshold = ONE_DAY * 30; break;
      }

      if (now - lastBackup > threshold) {
          setShowBackupReminder(true);
      } else {
          setShowBackupReminder(false);
      }
  }, [aiConfig.backup]);

  // --- Handlers ---
  
  const handleOpenBackupSettings = () => {
      setActiveSettingsTab('security');
      setIsSettingsOpen(true);
      setShowBackupReminder(false);
  };

  const handleUpdateFile = useCallback((content: string, id: string) => {
    setFiles(prev => {
        const next = prev.map(f => f.id === id ? { ...f, content, lastModified: Date.now() } : f);
        return next;
    });

    // History Logic
    const now = Date.now();
    if (now - lastEditTimeRef.current > HISTORY_DEBOUNCE) {
        setHistory(prev => {
            const fileHistory = prev[id] || { past: [], future: [] };
            const newPast = [...fileHistory.past, content];
            if (newPast.length > MAX_HISTORY) newPast.shift();
            
            return {
                ...prev,
                [id]: {
                    past: newPast,
                    future: []
                }
            };
        });
        lastEditTimeRef.current = now;
    }
  }, []);

  const handleUpdateActiveFile = (content: string) => {
      handleUpdateFile(content, activeFileId);
  };

  const handleUndo = () => {
      const fileHistory = history[activeFileId];
      if (!fileHistory || fileHistory.past.length === 0) return;

      const current = activeFile.content;
      const previous = fileHistory.past[fileHistory.past.length - 1];
      const newPast = fileHistory.past.slice(0, -1);

      setHistory(prev => ({
          ...prev,
          [activeFileId]: {
              past: newPast,
              future: [current, ...fileHistory.future]
          }
      }));

      // Update file without triggering history add
      setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: previous, lastModified: Date.now() } : f));
  };

  const handleRedo = () => {
      const fileHistory = history[activeFileId];
      if (!fileHistory || fileHistory.future.length === 0) return;

      const current = activeFile.content;
      const next = fileHistory.future[0];
      const newFuture = fileHistory.future.slice(1);

      setHistory(prev => ({
          ...prev,
          [activeFileId]: {
              past: [...fileHistory.past, current],
              future: newFuture
          }
      }));

      setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: next, lastModified: Date.now() } : f));
  };

  const handleSelectFile = (id: string) => {
    if (viewMode === ViewMode.Split) {
        if (activePane === 'primary') setPrimaryFileId(id);
        else setSecondaryFileId(id);
    } else {
        setPrimaryFileId(id);
        setSecondaryFileId(null);
        setActivePane('primary');
        // If in Graph or Quiz mode, switch back to Editor
        if (viewMode === ViewMode.Graph || viewMode === ViewMode.Quiz || viewMode === ViewMode.MindMap) {
            setViewMode(ViewMode.Editor);
        }
    }
  };

  const handleCreateItem = (type: 'file' | 'folder', name: string, parentPath: string) => {
      if (type === 'file') {
          const fullPath = parentPath ? `${parentPath}/${name}` : name;
          // Check duplicate
          if (files.some(f => (f.path || f.name) === fullPath)) {
              alert("File already exists!");
              return;
          }
          const newFile: MarkdownFile = {
              id: generateId(),
              name: name.endsWith('.md') ? name.slice(0, -3) : name,
              content: '',
              lastModified: Date.now(),
              path: fullPath.endsWith('.md') ? fullPath : `${fullPath}.md`
          };
          setFiles(prev => [...prev, newFile]);
          handleSelectFile(newFile.id);
      }
      // Folders are implicit in paths, so creating a folder usually implies creating a file inside, 
      // but for just structure we can create a .keep file
      else if (type === 'folder') {
          const fullPath = parentPath ? `${parentPath}/${name}/.keep` : `${name}/.keep`;
          const keepFile: MarkdownFile = {
              id: generateId(),
              name: '.keep',
              content: '',
              lastModified: Date.now(),
              path: fullPath
          };
          setFiles(prev => [...prev, keepFile]);
      }
  };

  const handleDeleteFile = (id: string) => {
    if (files.length <= 1) {
        alert("Cannot delete the last file.");
        return;
    }
    if (confirm("Are you sure you want to delete this file?")) {
        setFiles(prev => prev.filter(f => f.id !== id));
        if (activeFileId === id) {
             setPrimaryFileId(files.find(f => f.id !== id)?.id || 'default-1');
        }
    }
  };

  const handleMoveItem = (sourceId: string, targetPath: string | null) => {
      setFiles(prev => prev.map(f => {
          if (f.id === sourceId) {
              const fileName = f.path ? f.path.split('/').pop() : f.name + '.md';
              return {
                  ...f,
                  path: targetPath ? `${targetPath}/${fileName}` : fileName
              };
          }
          return f;
      }));
  };

  const handleRenameItem = (id: string, newName: string, type: 'file' | 'folder', oldPath: string) => {
      setFiles(prev => prev.map(f => {
          if (type === 'file' && f.id === id) {
              const dir = f.path ? f.path.substring(0, f.path.lastIndexOf('/')) : '';
              return { 
                  ...f, 
                  name: newName, 
                  path: dir ? `${dir}/${newName}.md` : `${newName}.md` 
              };
          } else if (type === 'folder') {
              // Rename all files start with oldPath
              // oldPath is something like "Docs/Folder"
              if (f.path && f.path.startsWith(oldPath + '/')) {
                  const suffix = f.path.substring(oldPath.length);
                  // Parent of oldPath
                  const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
                  const newPathStart = parentDir ? `${parentDir}/${newName}` : newName;
                  
                  return {
                      ...f,
                      path: newPathStart + suffix
                  };
              }
          }
          return f;
      }));
  };

  const handleImportFiles = async (fileList: FileList) => {
      setAiState({ isThinking: true, error: null, message: "Importing files..." });
      const newFiles: MarkdownFile[] = [];
      
      for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          if (isExtensionSupported(file.name)) {
             try {
                 const content = await extractTextFromFile(file, aiConfig.apiKey);
                 newFiles.push({
                     id: generateId(),
                     name: file.name.replace(/\.[^/.]+$/, ""),
                     content,
                     lastModified: file.lastModified,
                     path: file.name
                 });
             } catch (e) {
                 console.error(e);
             }
          }
      }
      
      if (newFiles.length > 0) {
          setFiles(prev => [...prev, ...newFiles]);
          setAiState({ isThinking: false, error: null, message: `Imported ${newFiles.length} files.` });
      } else {
          setAiState({ isThinking: false, error: "No valid files imported.", message: null });
      }
  };

  const handleOpenFolder = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        const files = await readDirectory(dirHandle);
        if (files.length > 0) {
            setFiles(files);
            setPrimaryFileId(files[0].id);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      alert(translations[aiConfig.language as Language].errorOpenDir);
    }
  };

  const handleExport = () => {
    const blob = new Blob([activeFile.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeFile.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- AI Actions ---

  const handleAIChat = async (message: string) => {
    setAiState({ isThinking: true, error: null, message: null });
    
    // Add User Message
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: message, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsChatOpen(true);

    try {
      // Create context from active file + RAG if applicable
      const contextFiles = [activeFile];
      
      // Get RAG Context
      let ragContext = "";
      if (aiConfig.apiKey || aiConfig.provider === 'ollama') {
          ragContext = await vectorStore.search(message, aiConfig);
      }

      // Tool Callback
      const toolCallback = async (name: string, args: any) => {
          if (name === 'list_files') {
              return files.map(f => f.path || f.name).join('\n');
          }
          if (name === 'read_file') {
              const target = files.find(f => (f.path === args.filename) || (f.name === args.filename));
              return target ? target.content : "File not found.";
          }
          if (name === 'create_file') {
               handleCreateItem('file', args.filename, '');
               // We need to actually set content
               setFiles(prev => prev.map(f => {
                   if (f.name === args.filename || f.path === args.filename) return { ...f, content: args.content };
                   return f;
               }));
               return `File ${args.filename} created successfully.`;
          }
          if (name === 'update_file') {
              const target = files.find(f => (f.path === args.filename) || (f.name === args.filename));
              if (!target) return "File not found.";
              
              const newContent = args.mode === 'overwrite' ? args.content : target.content + '\n' + args.content;
              handleUpdateFile(newContent, target.id);
              return `File ${args.filename} updated.`;
          }
          return "Unknown tool.";
      };

      // Add conversation history context
      const historyContext = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      const fullSystemPrompt = `
      Current Date: ${new Date().toISOString()}
      User Language: ${aiConfig.language}
      
      Conversation History:
      ${historyContext}
      `;

      const response = await generateAIResponse(
          message, 
          aiConfig, 
          fullSystemPrompt, 
          false, 
          contextFiles, 
          toolCallback,
          ragContext
      );
      
      const botMsg: ChatMessage = { id: generateId(), role: 'assistant', content: response, timestamp: Date.now() };
      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      setAiState({ isThinking: false, error: err.message, message: null });
      setMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: `Error: ${err.message}`, timestamp: Date.now() }]);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false }));
    }
  };

  const handleAIPolish = async () => {
    setAiState({ isThinking: true, error: null, message: 'Polishing content...' });
    try {
      const polished = await polishContent(activeFile.content, aiConfig);
      handleUpdateActiveFile(polished);
      setAiState({ isThinking: false, error: null, message: 'Content polished!' });
    } catch (err: any) {
      setAiState({ isThinking: false, error: err.message, message: null });
    }
  };

  const handleAIExpand = async () => {
    setAiState({ isThinking: true, error: null, message: 'Expanding content...' });
    try {
      const expanded = await expandContent(activeFile.content, aiConfig);
      handleUpdateActiveFile(expanded);
      setAiState({ isThinking: false, error: null, message: 'Content expanded!' });
    } catch (err: any) {
      setAiState({ isThinking: false, error: err.message, message: null });
    }
  };
  
  const handleSynthesize = async () => {
      setAiState({ isThinking: true, error: null, message: 'Synthesizing knowledge base...' });
      try {
          const summary = await synthesizeKnowledgeBase(files, aiConfig);
          // Create a new summary file
          const newFile: MarkdownFile = {
              id: generateId(),
              name: `Summary-${new Date().toISOString().split('T')[0]}`,
              content: summary,
              lastModified: Date.now(),
              path: `Summary-${new Date().toISOString().split('T')[0]}.md`
          };
          setFiles(prev => [...prev, newFile]);
          handleSelectFile(newFile.id);
          setAiState({ isThinking: false, error: null, message: 'Synthesis complete.' });
      } catch (err: any) {
          setAiState({ isThinking: false, error: err.message, message: null });
      }
  };

  const handleGenerateQuiz = async () => {
      setAiState({ isThinking: true, error: null, message: translations[aiConfig.language as Language].analyzingQuiz });
      try {
          const quiz = await generateQuiz(activeFile.content, aiConfig);
          setActiveQuiz(quiz);
          setViewMode(ViewMode.Quiz);
          setAiState({ isThinking: false, error: null, message: null });
      } catch (err: any) {
          setAiState({ isThinking: false, error: err.message, message: null });
      }
  };

  const handleGenerateMindMap = async () => {
      setAiState({ isThinking: true, error: null, message: "Mapping concepts..." });
      try {
          const mermaidCode = await generateMindMap(activeFile.content, aiConfig);
          setMindMapContent(mermaidCode);
          setViewMode(ViewMode.MindMap);
          setAiState({ isThinking: false, error: null, message: null });
      } catch (err: any) {
          setAiState({ isThinking: false, error: err.message, message: null });
      }
  };

  const handleInsertDrawing = (base64: string) => {
      const markdownImage = `\n![Drawing](${base64})\n`;
      handleUpdateActiveFile(activeFile.content + markdownImage);
  };
  
  const handleKeyboardShortcut = useCallback((e: KeyboardEvent) => {
      // Shortcut Manager logic is handled inside Editor, but global ones here
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
          e.preventDefault();
          setIsSidebarOpen(prev => !prev);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          setIsSearchOpen(true);
      }
  }, []);

  useEffect(() => {
      window.addEventListener('keydown', handleKeyboardShortcut);
      return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, [handleKeyboardShortcut]);

  // Voice Dictation
  const { start: startDictation, stop: stopDictation, isListening: isDictationActive } = useSpeechRecognition({
      onResult: (text, isFinal) => {
          if (isFinal) {
              handleUpdateActiveFile(activeFile.content + (activeFile.content ? ' ' : '') + text);
          }
      },
      language: aiConfig.language === 'zh' ? 'zh-CN' : 'en-US'
  });

  const handleToggleDictation = () => {
      if (isDictationActive) {
          stopDictation();
          setIsDictating(false);
      } else {
          startDictation();
          setIsDictating(true);
      }
  };

  if (isLoginEnabled && !isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className={`flex h-screen bg-paper-50 dark:bg-cyber-900 transition-colors duration-300 ${themes.find(t=>t.id===activeThemeId)?.type || 'light'}`}>
      <Sidebar 
        files={files}
        activeFileId={activeFileId}
        onSelectFile={handleSelectFile}
        onCreateItem={handleCreateItem}
        onDeleteFile={handleDeleteFile}
        onMoveItem={handleMoveItem}
        onRenameItem={handleRenameItem}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        onOpenFolder={handleOpenFolder}
        onImportFolderFiles={handleImportFiles}
        onImportFile={(file) => handleImportFiles([file] as unknown as FileList)}
        onImportQuiz={async (file) => {
             const quiz = file.name.endsWith('.json') 
                ? await parseJsonToQuiz(file)
                : await parseCsvToQuiz(file);
             if (quiz) {
                 setActiveQuiz(quiz);
                 setViewMode(ViewMode.Quiz);
             } else {
                 alert("Failed to parse quiz file.");
             }
        }}
        language={aiConfig.language as Language}
        ragStats={ragStats}
        onRefreshIndex={() => setRagStats(p => ({...p, isIndexing: true}))} // Trigger re-index effect
        onInsertSnippet={(text) => handleUpdateActiveFile(activeFile.content + text)}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Toolbar 
          viewMode={viewMode}
          setViewMode={setViewMode}
          onClear={() => handleUpdateActiveFile('')}
          onExport={handleExport}
          onAIPolish={handleAIPolish}
          onAIExpand={handleAIExpand}
          onAIEntityExtraction={async () => {
              const data = await extractEntitiesAndRelationships(activeFile.content, aiConfig);
              // Show in graph view? For now, we just alert or log, or maybe switch to graph view with this data
              // Simpler: Just append raw data to file for inspection
              handleUpdateActiveFile(activeFile.content + `\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``);
          }}
          onBuildGraph={() => setViewMode(ViewMode.Graph)}
          onSynthesize={handleSynthesize}
          onGenerateMindMap={handleGenerateMindMap}
          onGenerateQuiz={handleGenerateQuiz}
          onFormatBold={() => {}} // Editor handles via refs/shortcuts usually, need to pipe through
          onFormatItalic={() => {}}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isAIThinking={aiState.isThinking}
          theme={themes.find(t => t.id === activeThemeId)?.type || 'light'}
          toggleTheme={toggleTheme}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          toggleChat={() => setIsChatOpen(!isChatOpen)}
          toggleSettings={() => { setActiveSettingsTab('ai'); setIsSettingsOpen(true); }}
          fileName={activeFile.name}
          onRename={(newName) => handleRenameItem(activeFile.id, newName, 'file', activeFile.path || '')}
          activeProvider={aiConfig.provider}
          language={aiConfig.language as Language}
          isSplitView={viewMode === ViewMode.Split}
          onToggleSplitView={() => setViewMode(viewMode === ViewMode.Split ? ViewMode.Editor : ViewMode.Split)}
          isDictating={isDictating}
          onToggleDictation={handleToggleDictation}
        />

        <div className="flex-1 overflow-hidden relative">
          {viewMode === ViewMode.Editor && (
             <Editor 
                ref={primaryEditorRef}
                content={activeFile.content} 
                onChange={handleUpdateActiveFile} 
                onUndo={handleUndo}
                onRedo={handleRedo}
                shortcuts={shortcuts}
             />
          )}

          {viewMode === ViewMode.Preview && (
             <Preview 
                ref={primaryPreviewRef}
                content={activeFile.content} 
                files={files}
                onNavigate={handleSelectFile}
             />
          )}

          {viewMode === ViewMode.Split && (
            <div className="flex h-full">
               <div className={`flex-1 border-r border-paper-200 dark:border-cyber-700 ${activePane === 'primary' ? 'ring-2 ring-cyan-500/50 z-10' : ''}`} onClick={() => setActivePane('primary')}>
                  <Editor 
                    ref={primaryEditorRef}
                    content={activeFile.content} 
                    onChange={handleUpdateActiveFile}
                    onScroll={(e) => {
                        if (secondaryPreviewRef.current) {
                            const percent = e.currentTarget.scrollTop / (e.currentTarget.scrollHeight - e.currentTarget.clientHeight);
                            secondaryPreviewRef.current.scrollTop = percent * (secondaryPreviewRef.current.scrollHeight - secondaryPreviewRef.current.clientHeight);
                        }
                    }}
                    shortcuts={shortcuts}
                  />
               </div>
               <div className={`flex-1 bg-paper-50 dark:bg-cyber-900 ${activePane === 'secondary' ? 'ring-2 ring-cyan-500/50 z-10' : ''}`} onClick={() => setActivePane('secondary')}>
                  {secondaryFileId && secondaryFileId !== primaryFileId ? (
                      <Editor 
                        ref={secondaryEditorRef}
                        content={files.find(f => f.id === secondaryFileId)?.content || ''}
                        onChange={(val) => handleUpdateFile(val, secondaryFileId)}
                        shortcuts={shortcuts}
                      />
                  ) : (
                      <Preview 
                        ref={secondaryPreviewRef}
                        content={activeFile.content} 
                        files={files}
                        onNavigate={handleSelectFile}
                      />
                  )}
               </div>
            </div>
          )}

          {viewMode === ViewMode.Graph && (
             <KnowledgeGraph 
                data={generateFileLinkGraph(files)} 
                theme={themes.find(t => t.id === activeThemeId)?.type || 'light'}
                onNodeClick={handleSelectFile}
             />
          )}

          {viewMode === ViewMode.Quiz && activeQuiz && (
             <QuizPanel 
                quiz={activeQuiz} 
                aiConfig={aiConfig}
                theme={themes.find(t => t.id === activeThemeId)?.type || 'light'}
                onClose={() => setViewMode(ViewMode.Editor)}
                contextContent={activeFile.content}
                language={aiConfig.language as Language}
             />
          )}

          {viewMode === ViewMode.MindMap && mindMapContent && (
             <MindMap 
                content={mindMapContent} 
                theme={themes.find(t => t.id === activeThemeId)?.type || 'light'}
                language={aiConfig.language as Language}
             />
          )}

          {viewMode === ViewMode.NoteSpace && (
             <NoteSpace 
                files={files}
                activeFileId={activeFileId}
                onSelectFile={handleSelectFile}
                layout={noteLayout}
                onLayoutChange={setNoteLayout}
                theme={themes.find(t => t.id === activeThemeId)?.type || 'light'}
             />
          )}

          {viewMode === ViewMode.Library && (
             <LibraryView 
                files={files}
                activeFileId={activeFileId}
                onSelectFile={handleSelectFile}
             />
          )}
          
          {viewMode === ViewMode.Analytics && (
             <AnalyticsDashboard files={files} />
          )}

        </div>

        {/* Global Floating Elements */}
        
        {/* Backup Reminder Toast */}
        {showBackupReminder && (
            <div className="absolute bottom-6 left-6 z-50 animate-slideUp">
                <div className="bg-white dark:bg-cyber-800 border-l-4 border-amber-500 shadow-xl rounded-r-lg p-4 flex items-center gap-4 max-w-sm">
                    <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full text-amber-600">
                        <Database size={20} />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Backup Recommended</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">It's been a while since your last database backup.</p>
                    </div>
                    <button 
                        onClick={handleOpenBackupSettings}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded shadow-lg shadow-amber-500/20 transition-all"
                    >
                        Backup
                    </button>
                    <button 
                        onClick={() => setShowBackupReminder(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>
        )}

        <ChatPanel 
          isOpen={isChatOpen} 
          onClose={() => setIsChatOpen(false)}
          messages={messages}
          onSendMessage={handleAIChat}
          onClearChat={() => setMessages([])}
          onCompactChat={async () => {
             const compacted = await compactConversation(messages, aiConfig);
             setMessages(compacted);
          }}
          aiState={aiState}
          language={aiConfig.language as Language}
        />

        <AISettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          config={aiConfig}
          onSave={(cfg) => setAiConfig(cfg)}
          themes={themes}
          activeThemeId={activeThemeId}
          onSelectTheme={handleThemeChange}
          onImportTheme={(t) => saveCustomTheme(t)}
          onDeleteTheme={(id) => deleteCustomTheme(id)}
          language={aiConfig.language as Language}
          shortcuts={shortcuts}
          onUpdateShortcut={(id, keys) => setShortcuts(prev => prev.map(s => s.id === id ? { ...s, keys } : s))}
          onResetShortcuts={() => setShortcuts(DEFAULT_SHORTCUTS)}
          isLoginEnabled={isLoginEnabled}
          onToggleLogin={handleToggleLogin}
          initialTab={activeSettingsTab}
        />

        <DrawingModal 
            isOpen={isDrawingOpen}
            onClose={() => setIsDrawingOpen(false)}
            onSave={handleInsertDrawing}
        />

        <SearchModal
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            files={files}
            onNavigate={(id) => { handleSelectFile(id); }}
            aiConfig={aiConfig}
            semanticSearch={(q, c) => vectorStore.semanticSearch(q, c)}
            relatedFilesProvider={(id) => vectorStore.findRelatedFiles(id)}
        />
        
        {/* Error / Status Toast */}
        {(aiState.error || aiState.message) && !isChatOpen && (
             <div className="absolute bottom-6 right-6 z-50 animate-slideUp">
                 <div className={`px-4 py-3 rounded-lg shadow-xl border flex items-center gap-3 ${aiState.error ? 'bg-red-50 dark:bg-red-900/90 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200' : 'bg-white dark:bg-cyber-800 border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-200'}`}>
                     {aiState.error ? <AlertCircle size={20} /> : (aiState.isThinking ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <CheckCircle2 size={20} className="text-emerald-500" />)}
                     <span className="text-sm font-medium">{aiState.error || aiState.message}</span>
                 </div>
             </div>
        )}
      </div>
    </div>
  );
};

export default App;
