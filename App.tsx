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
import { ViewMode, AIState, MarkdownFile, AIConfig, ChatMessage, GraphData, AppTheme, Quiz, RAGStats, AppShortcut, PaneType } from './types';
import { polishContent, expandContent, generateAIResponse, generateKnowledgeGraph, synthesizeKnowledgeBase, generateQuiz, generateMindMap, extractQuizFromRawContent, compactConversation } from './services/aiService';
import { applyTheme, getAllThemes, getSavedThemeId, saveCustomTheme, deleteCustomTheme, DEFAULT_THEMES, getLastUsedThemeIdForMode } from './services/themeService';
import { readDirectory, saveFileToDisk, processPdfFile, extractTextFromFile, parseCsvToQuiz, parseJsonToQuiz, isExtensionSupported } from './services/fileService';
import { VectorStore } from './services/ragService';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { translations, Language } from './utils/translations';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';

const generateId = () => Math.random().toString(36).substring(2, 11);

const DEFAULT_CONTENT = "# Welcome to ZhangNote ⚡\n\nTry opening a local folder or importing a PDF!";

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
  }
};

const DEFAULT_SHORTCUTS: AppShortcut[] = [
  { id: 'save', label: 'Save File', keys: 'Ctrl+S', actionId: 'save' },
  { id: 'sidebar', label: 'Toggle Sidebar', keys: 'Ctrl+B', actionId: 'toggle_sidebar' },
  { id: 'settings', label: 'Open Settings', keys: 'Alt+S', actionId: 'open_settings' },
  { id: 'chat', label: 'Toggle Chat', keys: 'Alt+C', actionId: 'toggle_chat' },
  { id: 'new_file', label: 'New File', keys: 'Alt+N', actionId: 'new_file' },
  { id: 'polish', label: 'AI Polish', keys: 'Alt+P', actionId: 'ai_polish' },
  { id: 'graph', label: 'Build Graph', keys: 'Alt+G', actionId: 'build_graph' }
];

interface FileHistory {
  past: string[];
  future: string[];
}

const App: React.FC = () => {
  // --- Auth State ---
  const [isLoginEnabled, setIsLoginEnabled] = useState(() => {
      // Default to false (disabled) if not set
      return localStorage.getItem('neon-login-enabled') === 'true';
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
      // If login is disabled, we are automatically authenticated
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
    // Apply theme on mount and when activeThemeId changes
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

  // Derive active file based on focused pane
  const activeFileId = activePane === 'primary' ? primaryFileId : (secondaryFileId || primaryFileId);
  const activeFile = files.find(f => f.id === activeFileId) || files[0] || DEFAULT_FILE;

  // Refs for Scroll Sync (Primary Pane)
  const primaryEditorRef = useRef<HTMLTextAreaElement>(null);
  const primaryPreviewRef = useRef<HTMLDivElement>(null);
  
  // Refs for Scroll Sync (Secondary Pane)
  const secondaryEditorRef = useRef<HTMLTextAreaElement>(null);
  const secondaryPreviewRef = useRef<HTMLDivElement>(null);

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
          customPrompts: { ...DEFAULT_AI_CONFIG.customPrompts, ...parsed.customPrompts }
        };
      }
      return DEFAULT_AI_CONFIG;
    } catch (e) { return DEFAULT_AI_CONFIG; }
  });

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
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [quizContext, setQuizContext] = useState<string>(''); // Stores raw text for quiz generation context
  const [mindMapContent, setMindMapContent] = useState<string>('');

  // Chat History (Persistent)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('neon-chat-history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Split);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiState, setAiState] = useState<AIState>({ isThinking: false, error: null, message: null });
  const [ragStats, setRagStats] = useState<RAGStats>({ totalFiles: 0, indexedFiles: 0, totalChunks: 0, isIndexing: false });

  // Refs needed for persistence
  const filesRef = useRef(files);
  const activeFileIdRef = useRef(primaryFileId);

  // Scroll Sync Flags
  const isScrollingPrimaryEditor = useRef(false);
  const isScrollingPrimaryPreview = useRef(false);
  const isScrollingSecondaryEditor = useRef(false);
  const isScrollingSecondaryPreview = useRef(false);

  const primaryEditorScrollTimeout = useRef<any>(null);
  const primaryPreviewScrollTimeout = useRef<any>(null);
  const secondaryEditorScrollTimeout = useRef<any>(null);
  const secondaryPreviewScrollTimeout = useRef<any>(null);
  
  // RAG Service
  const [vectorStore] = useState(() => new VectorStore());

  // Localization
  const lang: Language = aiConfig.language === 'zh' ? 'zh' : 'en';
  const t = translations[lang];

  useEffect(() => {
    filesRef.current = files;
    activeFileIdRef.current = primaryFileId; // Persist primarily the main file
  }, [files, primaryFileId]);
  
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

  // Persist Data
  useEffect(() => {
    localStorage.setItem('neon-chat-history', JSON.stringify(chatMessages));
  }, [chatMessages]);
  
  useEffect(() => {
    localStorage.setItem('neon-ai-config', JSON.stringify(aiConfig));
  }, [aiConfig]);

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

  // --- Layout Handlers ---
  const handleToggleSplitView = () => {
    if (secondaryFileId) {
      // Close split
      setSecondaryFileId(null);
      setActivePane('primary');
    } else {
      // Open split (clone active or pick next)
      setSecondaryFileId(primaryFileId);
      setActivePane('secondary');
    }
  };

  const handleSelectFile = (id: string) => {
    if (activePane === 'primary') {
      setPrimaryFileId(id);
    } else {
      setSecondaryFileId(id);
    }
  };
  
  // Memoized Node Click Handler to prevent Graph re-renders
  const handleNodeClick = useCallback((id: string) => {
      showToast(`Selected: ${id}`);
  }, [showToast]);

  // --- Scroll Sync Logic (Primary) ---
  const handlePrimaryEditorScroll = useCallback(() => {
    if (!primaryEditorRef.current || !primaryPreviewRef.current) return;
    if (isScrollingPrimaryPreview.current) return;

    isScrollingPrimaryEditor.current = true;
    const editor = primaryEditorRef.current;
    const preview = primaryPreviewRef.current;
    
    requestAnimationFrame(() => {
        const maxScrollEditor = editor.scrollHeight - editor.clientHeight;
        const maxScrollPreview = preview.scrollHeight - preview.clientHeight;

        if (maxScrollEditor > 0 && maxScrollPreview > 0) {
            const percentage = editor.scrollTop / maxScrollEditor;
            if (Number.isFinite(percentage)) {
                 preview.scrollTop = percentage * maxScrollPreview;
            }
        }
    });
    
    if (primaryEditorScrollTimeout.current) clearTimeout(primaryEditorScrollTimeout.current);
    primaryEditorScrollTimeout.current = setTimeout(() => {
        isScrollingPrimaryEditor.current = false;
    }, 200); 
  }, []);

  const handlePrimaryPreviewScroll = useCallback(() => {
    if (!primaryEditorRef.current || !primaryPreviewRef.current) return;
    if (isScrollingPrimaryEditor.current) return;
    
    isScrollingPrimaryPreview.current = true;
    const editor = primaryEditorRef.current;
    const preview = primaryPreviewRef.current;
    
    requestAnimationFrame(() => {
        const maxScrollEditor = editor.scrollHeight - editor.clientHeight;
        const maxScrollPreview = preview.scrollHeight - preview.clientHeight;
        
        if (maxScrollPreview > 0 && maxScrollEditor > 0) {
            const percentage = preview.scrollTop / maxScrollPreview;
            if (Number.isFinite(percentage)) {
                editor.scrollTop = percentage * maxScrollEditor;
            }
        }
    });
    
    if (primaryPreviewScrollTimeout.current) clearTimeout(primaryPreviewScrollTimeout.current);
    primaryPreviewScrollTimeout.current = setTimeout(() => {
        isScrollingPrimaryPreview.current = false;
    }, 200);
  }, []);

  // --- Scroll Sync Logic (Secondary) ---
  const handleSecondaryEditorScroll = useCallback(() => {
    if (!secondaryEditorRef.current || !secondaryPreviewRef.current) return;
    if (isScrollingSecondaryPreview.current) return;

    isScrollingSecondaryEditor.current = true;
    const editor = secondaryEditorRef.current;
    const preview = secondaryPreviewRef.current;
    
    requestAnimationFrame(() => {
        const maxScrollEditor = editor.scrollHeight - editor.clientHeight;
        const maxScrollPreview = preview.scrollHeight - preview.clientHeight;
        
        if (maxScrollEditor > 0 && maxScrollPreview > 0) {
             const percentage = editor.scrollTop / maxScrollEditor;
             if (Number.isFinite(percentage)) {
                  preview.scrollTop = percentage * maxScrollPreview;
             }
        }
    });
    
    if (secondaryEditorScrollTimeout.current) clearTimeout(secondaryEditorScrollTimeout.current);
    secondaryEditorScrollTimeout.current = setTimeout(() => {
        isScrollingSecondaryEditor.current = false;
    }, 200);
  }, []);

  const handleSecondaryPreviewScroll = useCallback(() => {
    if (!secondaryEditorRef.current || !secondaryPreviewRef.current) return;
    if (isScrollingSecondaryEditor.current) return;
    
    isScrollingSecondaryPreview.current = true;
    const editor = secondaryEditorRef.current;
    const preview = secondaryPreviewRef.current;
    
    requestAnimationFrame(() => {
        const maxScrollEditor = editor.scrollHeight - editor.clientHeight;
        const maxScrollPreview = preview.scrollHeight - preview.clientHeight;
        
        if (maxScrollPreview > 0 && maxScrollEditor > 0) {
            const percentage = preview.scrollTop / maxScrollPreview;
            if (Number.isFinite(percentage)) {
                editor.scrollTop = percentage * maxScrollEditor;
            }
        }
    });
    
    if (secondaryPreviewScrollTimeout.current) clearTimeout(secondaryPreviewScrollTimeout.current);
    secondaryPreviewScrollTimeout.current = setTimeout(() => {
        isScrollingSecondaryPreview.current = false;
    }, 200);
  }, []);


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
        handleSelectFile(newFile.id);
        showToast(`File '${sanitizedName}' created`);
    }
  };

  const handleRenameNode = (id: string, newName: string, type: 'file' | 'folder', oldPath: string) => {
    const sanitizedName = newName.replace(/[\\/:*?"<>|]/g, '-').trim();
    if (!sanitizedName || sanitizedName === oldPath.split('/').pop()) return; // No change

    if (type === 'file') {
         setFiles(prev => prev.map(f => {
             if (f.id === id) {
                 const pathParts = (f.path || f.name).split('/');
                 const oldNameWithExt = pathParts.pop() || '';
                 const oldExt = oldNameWithExt.includes('.') ? oldNameWithExt.split('.').pop() : '';
                 
                 let finalName = sanitizedName;
                 // Preserve extension if user didn't type one and one existed
                 if (oldExt && !finalName.toLowerCase().endsWith(`.${oldExt.toLowerCase()}`)) {
                      if (!finalName.includes('.')) {
                          finalName = `${finalName}.${oldExt}`;
                      }
                 }

                 const newPath = [...pathParts, finalName].join('/');
                 const nameForDisplay = finalName.replace(/\.[^/.]+$/, "");
                 
                 return { ...f, name: nameForDisplay, path: newPath };
             }
             return f;
         }));
    } else {
        // Folder Rename
        const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newFolderPath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName;

        setFiles(prev => prev.map(f => {
            const fPath = f.path || f.name;
            if (fPath === oldPath || fPath.startsWith(oldPath + '/')) {
                const relative = fPath.substring(oldPath.length);
                return { ...f, path: newFolderPath + relative };
            }
            return f;
        }));
    }
    showToast(`${type === 'file' ? 'File' : 'Folder'} renamed to '${sanitizedName}'`);
  };

  const handleMoveItem = (sourceId: string, targetFolderPath: string | null) => {
    const sourceFile = files.find(f => f.id === sourceId);
    if (!sourceFile) return;

    const sourcePath = sourceFile.path || sourceFile.name;
    const isFolder = sourceFile.name === '.keep'; 
    const actualSourcePath = isFolder ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : sourcePath;
    const sourceName = isFolder ? actualSourcePath.split('/').pop() : sourceFile.name;
    
    if (isFolder && targetFolderPath) {
        if (targetFolderPath === actualSourcePath || targetFolderPath.startsWith(actualSourcePath + '/')) {
            showToast("Cannot move folder into itself", true);
            return;
        }
    }
    
    const newFiles = files.map(f => {
        const currentPath = f.path || f.name;

        if (!isFolder && f.id === sourceId) {
             const fileName = currentPath.split('/').pop();
             const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;
             if (files.some(ex => (ex.path || ex.name) === newPath && ex.id !== sourceId)) {
                 showToast("File with same name exists in destination", true);
                 return f;
             }
             return { ...f, path: newPath! };
        }

        if (isFolder && currentPath.startsWith(actualSourcePath!)) {
            const relativePath = currentPath.substring(actualSourcePath!.length);
            const newRootPath = targetFolderPath ? `${targetFolderPath}/${sourceName}` : sourceName;
            return { ...f, path: newRootPath + relativePath };
        }

        return f;
    });
    
    setFiles(newFiles);
  };

  const handleDeleteFile = (id: string) => {
    if (files.length <= 1) return;
    const newFiles = files.filter(f => f.id !== id);
    setFiles(newFiles);
    
    // Safety check for panes
    if (primaryFileId === id) setPrimaryFileId(newFiles[0].id);
    if (secondaryFileId === id) setSecondaryFileId(null);
  };

  const updateActiveFile = (content: string, skipHistory = false) => {
    if (!skipHistory) {
      const now = Date.now();
      if (now - lastEditTimeRef.current > HISTORY_DEBOUNCE) {
         setHistory(prev => {
           const fileHist = prev[activeFileId] || { past: [], future: [] };
           const newPast = [...fileHist.past, activeFile.content];
           if (newPast.length > MAX_HISTORY) newPast.shift();
           
           return { ...prev, [activeFileId]: { past: newPast, future: [] } };
         });
      }
      lastEditTimeRef.current = now;
    }

    const updated = files.map(f => 
      f.id === activeFileId ? { ...f, content, lastModified: Date.now() } : f
    );
    setFiles(updated);
  };
  
  // Real-time Dictation Integration
  const { isListening: isDictating, toggle: toggleDictation } = useSpeechRecognition({
      continuous: true,
      language: aiConfig.language === 'zh' ? 'zh-CN' : 'en-US',
      onResult: (transcript, isFinal) => {
          if (isFinal) {
             const currentContent = activeFile.content;
             const spacer = currentContent.length > 0 && !currentContent.endsWith(' ') && !currentContent.endsWith('\n') ? ' ' : '';
             updateActiveFile(currentContent + spacer + transcript);
          }
      },
      onEnd: () => {
          // Optional: handle auto-restart if desired, but button toggle is safer
      }
  });

  const handleUndo = () => {
    const fileHist = history[activeFileId];
    if (!fileHist || fileHist.past.length === 0) return;
    const previous = fileHist.past[fileHist.past.length - 1];
    const newPast = fileHist.past.slice(0, -1);
    const newFuture = [activeFile.content, ...fileHist.future];
    setHistory(prev => ({ ...prev, [activeFileId]: { past: newPast, future: newFuture } }));
    updateActiveFile(previous, true);
  };

  const handleRedo = () => {
    const fileHist = history[activeFileId];
    if (!fileHist || fileHist.future.length === 0) return;
    const next = fileHist.future[0];
    const newFuture = fileHist.future.slice(1);
    const newPast = [...fileHist.past, activeFile.content];
    setHistory(prev => ({ ...prev, [activeFileId]: { past: newPast, future: newFuture } }));
    updateActiveFile(next, true);
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
             if (finalName.indexOf('.') === -1) finalName += ext;
         }
         pathParts[pathParts.length - 1] = finalName;
         const newPath = pathParts.join('/');
         const nameForDisplay = finalName.includes('.') ? finalName.substring(0, finalName.lastIndexOf('.')) : finalName;
         return { ...f, name: nameForDisplay, path: newPath };
      }
      return f;
    }));
  };

  const handleIndexKnowledgeBase = async (forceList?: MarkdownFile[]) => {
    if (ragStats.isIndexing) return;
    const targetFiles = forceList || filesRef.current;
    const uniqueFilesMap = new Map();
    targetFiles.forEach(f => {
      if (!f.name.endsWith('.keep') && f.content.trim().length > 0) uniqueFilesMap.set(f.id, f);
    });
    const validFiles = Array.from(uniqueFilesMap.values());
    setRagStats(prev => ({ ...prev, isIndexing: true, totalFiles: validFiles.length }));
    const filesToIndex = validFiles.slice(0, 20); 
    try {
        for (const file of filesToIndex) {
            if (file.content && file.content.length > 0) {
                await vectorStore.indexFile(file, aiConfig);
                setRagStats(prev => ({ 
                    ...prev,
                    totalFiles: validFiles.length,
                    indexedFiles: vectorStore.getStats().indexedFiles, 
                    totalChunks: vectorStore.getStats().totalChunks
                }));
            }
        }
    } catch (e) { console.error("Indexing error", e); } finally { setRagStats(prev => ({ ...prev, isIndexing: false })); }
  };

  const handleOpenFolder = async () => {
    if (!('showDirectoryPicker' in window)) throw new Error("Directory Picker not supported");
    const dirHandle = await window.showDirectoryPicker();
    const loadedFiles = await readDirectory(dirHandle);
    if (loadedFiles.length > 0) {
      setFiles(loadedFiles);
      setPrimaryFileId(loadedFiles[0].id);
      showToast(`${t.filesLoaded}: ${loadedFiles.length}`);
    } else {
      showToast(t.noFilesFound);
    }
  };

  const handleImportFolderFiles = async (fileList: FileList) => {
    const newFiles: MarkdownFile[] = [];
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (isExtensionSupported(file.name)) {
           const content = await extractTextFromFile(file, aiConfig.apiKey);
           let path = file.webkitRelativePath || file.name;
           if (path.match(/\.(pdf|docx|doc)$/i)) path = path.replace(/\.(pdf|docx|doc)$/i, '.md');
           newFiles.push({
             id: generateId() + '-' + i,
             name: file.name.replace(/\.[^/.]+$/, ""),
             content: content,
             lastModified: file.lastModified,
             isLocal: false,
             path: path
           });
        }
      }
      if (newFiles.length > 0) {
        let combinedFiles: MarkdownFile[] = [];
        setFiles(prev => {
           const existingPaths = new Set(prev.map(f => f.path || f.name));
           const uniqueNew = newFiles.filter(f => !existingPaths.has(f.path || f.name));
           combinedFiles = [...prev, ...uniqueNew];
           return combinedFiles;
        });
        setPrimaryFileId(newFiles[0].id);
        if (combinedFiles.length > 0) handleIndexKnowledgeBase(combinedFiles);
        showToast(`${t.filesLoaded}: ${newFiles.length}`);
      } else { showToast(t.noFilesFound); }
    } catch (e: any) { showToast(e.message, true); } finally { setAiState(prev => ({ ...prev, isThinking: false, message: null })); }
  };

  const handleImportFile = async (file: File) => {
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    try {
      // 1. Extract content
      let content = "";
      if (file.name.toLowerCase().endsWith('.pdf')) {
          content = await processPdfFile(file, aiConfig.apiKey);
      } else {
          content = await extractTextFromFile(file, aiConfig.apiKey);
      }
      
      // Determine path/name
      const isDoc = file.name.match(/\.(pdf|docx|doc)$/i);
      const path = isDoc ? file.name.replace(/\.(pdf|docx|doc)$/i, '.md') : file.name;
      const name = file.name.replace(/\.[^/.]+$/, "");

      // Access latest files via ref to avoid closure staleness
      const currentFiles = filesRef.current;
      const existingIndex = currentFiles.findIndex(f => (f.path || f.name) === path);
      
      let finalFileId = generateId();
      let updatedFileList = [];

      if (existingIndex !== -1) {
          // Overwrite existing
          const existingFile = currentFiles[existingIndex];
          finalFileId = existingFile.id; // Preserve ID
          
          const updatedFile = {
              ...existingFile,
              content: content,
              lastModified: Date.now()
          };
          
          updatedFileList = [...currentFiles];
          updatedFileList[existingIndex] = updatedFile;
          
          // Re-index this specific file
          handleIndexKnowledgeBase([updatedFile]);
      } else {
          // Create new
          const newFile: MarkdownFile = {
            id: finalFileId,
            name: name,
            content: content,
            lastModified: Date.now(),
            path: path,
            isLocal: false 
          };
          
          updatedFileList = [...currentFiles, newFile];
          
          // Index new file
          handleIndexKnowledgeBase([newFile]);
      }

      setFiles(updatedFileList);
      setPrimaryFileId(finalFileId);
      showToast(t.importSuccess);
      
    } catch (e: any) { 
        showToast(`${t.importFail}: ${e.message}`, true); 
    } finally { 
        setAiState(prev => ({ ...prev, isThinking: false, message: null })); 
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
      if (file.name.toLowerCase().endsWith('.json')) {
         const jsonQuiz = await parseJsonToQuiz(file);
         if (jsonQuiz) {
             const textContent = await extractTextFromFile(file, aiConfig.apiKey);
             setQuizContext(textContent); 
             setCurrentQuiz(jsonQuiz);
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
    } catch (e: any) { showToast(`${t.importFail}: ${e.message}`, true); } finally { setAiState(prev => ({ ...prev, isThinking: false, message: null })); }
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
    } catch (e) { showToast("Export failed", true); }
  };

  const handleGenerateMindMap = async () => {
    if (!activeFile || !activeFile.content.trim()) return;
    setAiState({ isThinking: true, message: "Dreaming up Mind Map...", error: null });
    try {
      const mermaidCode = await generateMindMap(activeFile.content, aiConfig);
      setMindMapContent(mermaidCode);
      setViewMode(ViewMode.MindMap);
    } catch (e: any) { showToast(e.message, true); } finally { setAiState(prev => ({ ...prev, isThinking: false, message: null })); }
  };

  const handleGenerateQuiz = async () => {
    if (!activeFile || !activeFile.content.trim()) return;
    setAiState({ isThinking: true, message: "Creating Quiz...", error: null });
    try {
      const quiz = await generateQuiz(activeFile.content, aiConfig);
      setQuizContext(activeFile.content); 
      setCurrentQuiz(quiz);
      setViewMode(ViewMode.Quiz);
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleAIPolish = async () => {
    if (aiState.isThinking) return;
    setAiState({ isThinking: true, message: t.polish + "...", error: null });
    try {
      const polished = await polishContent(activeFile.content, aiConfig);
      updateActiveFile(polished);
      showToast("Content Polished!");
    } catch (e: any) { showToast(e.message, true); } finally { setAiState(prev => ({ ...prev, isThinking: false, message: null })); }
  };
  
  const handleBuildGraph = async () => {
    if (aiState.isThinking) return;
    setAiState({ isThinking: true, message: "Building Graph...", error: null });
    try {
      const data = await generateKnowledgeGraph(files, aiConfig);
      setGraphData(data);
      setViewMode(ViewMode.Graph);
    } catch (e: any) { showToast(e.message, true); } finally { setAiState(prev => ({ ...prev, isThinking: false, message: null })); }
  };

  // --- AGENTIC TOOL EXECUTION ---
  const executeAiTool = async (name: string, args: any) => {
    try {
        console.log(`[App] Executing tool: ${name}`, args);
        let currentFiles = filesRef.current;

        if (name === 'list_files') {
            const list = currentFiles.map(f => `- ${f.name} (${f.path || f.name})`).join('\n');
            return list || "No files found.";
        }

        if (name === 'read_file') {
            const target = args.filename || args.path;
            const file = currentFiles.find(f => (f.path || f.name) === target || f.name === target);
            if (!file) return { error: `File '${target}' not found.` };
            return file.content;
        }

        if (name === 'create_file') {
             const { filename, content } = args;
             if (currentFiles.some(f => (f.path || f.name) === filename || f.name === filename)) {
                 return { error: `File '${filename}' already exists.` };
             }
             const newFile: MarkdownFile = {
                 id: generateId(),
                 name: filename.replace(/\.(md|txt)$/, ''),
                 content: content || '',
                 lastModified: Date.now(),
                 path: filename
             };
             
             const newFileList = [...currentFiles, newFile];
             filesRef.current = newFileList; 
             setFiles(newFileList);
             return { success: true, message: `File '${filename}' created.` };
        }

        if (name === 'update_file') {
             const { filename, content, mode } = args;
             const fileIndex = currentFiles.findIndex(f => (f.path || f.name) === filename || f.name === filename);
             
             if (fileIndex === -1) {
                 return { 
                     error: `File '${filename}' not found. Cannot update.`, 
                     hint: "File does not exist. Please use 'create_file' first." 
                 };
             }

             const currentFile = currentFiles[fileIndex];
             let newContent = content;

             if (mode !== 'overwrite') {
                 const originalContent = currentFile.content;
                 const separator = (originalContent && !originalContent.endsWith('\n')) ? '\n' : '';
                 newContent = originalContent + separator + content;
             }

             const updatedFile = { ...currentFile, content: newContent, lastModified: Date.now() };
             const newFileList = [...currentFiles];
             newFileList[fileIndex] = updatedFile;
             filesRef.current = newFileList;
             setFiles(newFileList);
             return { success: true, message: `File '${filename}' updated successfully (mode: ${mode || 'append'}).` };
        }

        if (name === 'delete_file') {
            const { filename } = args;
             if (currentFiles.length <= 1) return { error: "Cannot delete the last file." };
             const newFileList = currentFiles.filter(f => (f.path || f.name) !== filename && f.name !== filename);
             if (newFileList.length === currentFiles.length) return { error: "File not found." };
             
             filesRef.current = newFileList;
             setFiles(newFileList);
             if (activeFileIdRef.current === currentFiles.find(f => f.name === filename)?.id) {
                 setPrimaryFileId(newFileList[0].id);
             }
             return { success: true, message: `File '${filename}' deleted.` };
        }

        return { error: `Unknown tool: ${name}` };
    } catch (e: any) {
        return { error: e.message };
    }
  };

  const handleSendMessage = async (text: string) => {
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    
    // RAG Retrieval
    let ragContext = "";
    if (vectorStore.getStats().totalChunks > 0) {
        setAiState({ isThinking: true, message: "Searching Knowledge Base...", error: null });
        try {
            ragContext = await vectorStore.search(text, aiConfig);
        } catch (e) {
            console.warn("RAG search failed", e);
        }
    }

    setAiState({ isThinking: true, message: "Thinking...", error: null });

    try {
      const responseText = await generateAIResponse(
          text, 
          aiConfig, 
          "You are a helpful AI assistant embedded in a Markdown editor. You can read, create, update, and delete files.",
          false,
          [activeFile], // Context
          executeAiTool, // Agentic Capability
          ragContext // Flexible Reference Context
      );

      const aiMsg: ChatMessage = { id: generateId(), role: 'assistant', content: responseText, timestamp: Date.now() };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      setAiState(prev => ({ ...prev, error: e.message }));
      setChatMessages(prev => [...prev, { id: generateId(), role: 'assistant', content: `Error: ${e.message}`, timestamp: Date.now() }]);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };
  
  // Show Login Screen if enabled and not authenticated
  if (isLoginEnabled && !isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  // Helper to render the actual pane content
  const renderPaneContent = (fileId: string, paneType: PaneType) => {
    const file = files.find(f => f.id === fileId) || DEFAULT_FILE;
    const isPrimary = paneType === 'primary';
    const editorRef = isPrimary ? primaryEditorRef : secondaryEditorRef;
    const previewRef = isPrimary ? primaryPreviewRef : secondaryPreviewRef;
    const scrollHandlerEditor = isPrimary ? handlePrimaryEditorScroll : handleSecondaryEditorScroll;
    const scrollHandlerPreview = isPrimary ? handlePrimaryPreviewScroll : handleSecondaryPreviewScroll;

    // Use a wrapper to apply focus styles
    const isActive = activePane === paneType;
    const focusClass = isActive ? "ring-2 ring-cyan-500/50 z-10" : "opacity-80 hover:opacity-100";

    return (
        <div 
          className={`flex-1 relative flex flex-col h-full overflow-hidden transition-all duration-200 ${focusClass} bg-paper-50 dark:bg-cyber-900`}
          onClick={() => setActivePane(paneType)}
        >
            {/* Header / close button for secondary */}
            {paneType === 'secondary' && (
                <div className="absolute top-2 right-4 z-20">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setSecondaryFileId(null); setActivePane('primary'); }}
                        className="p-1 bg-red-100 hover:bg-red-200 text-red-600 rounded-full shadow-sm"
                        title="Close Split View"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            
            <div className="flex-1 relative overflow-hidden min-h-0 min-w-0">
                {viewMode === ViewMode.Editor && (
                  <Editor 
                    ref={editorRef}
                    content={file.content} 
                    onChange={updateActiveFile} 
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    onScroll={scrollHandlerEditor}
                  />
                )}
                {viewMode === ViewMode.Preview && <Preview ref={previewRef} content={file.content} />}
                {viewMode === ViewMode.Split && (
                  <div className="grid grid-cols-2 h-full overflow-hidden">
                    <div className="h-full overflow-hidden min-h-0 min-w-0">
                        <Editor 
                            ref={editorRef}
                            content={file.content} 
                            onChange={updateActiveFile}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            onScroll={scrollHandlerEditor}
                        />
                    </div>
                    <div className="h-full overflow-hidden min-h-0 min-w-0">
                        <Preview 
                            ref={previewRef} 
                            content={file.content}
                            onScroll={scrollHandlerPreview}
                        />
                    </div>
                  </div>
                )}
                {viewMode === ViewMode.Graph && <KnowledgeGraph data={graphData} theme={themes.find(t => t.id === activeThemeId)?.type || 'dark'} />}
                {viewMode === ViewMode.MindMap && <MindMap content={mindMapContent} theme={themes.find(t => t.id === activeThemeId)?.type || 'dark'} language={lang} />}
                {viewMode === ViewMode.Quiz && currentQuiz && (
                  <QuizPanel 
                    quiz={currentQuiz} 
                    aiConfig={aiConfig} 
                    theme={themes.find(t => t.id === activeThemeId)?.type || 'dark'} 
                    onClose={() => setViewMode(ViewMode.Editor)} 
                    contextContent={quizContext}
                    language={lang}
                  />
                )}
             </div>
             {/* File Name Label Overlay */}
             <div className="absolute bottom-2 left-4 text-xs font-mono px-2 py-0.5 bg-paper-200/80 dark:bg-cyber-800/80 rounded backdrop-blur-sm pointer-events-none text-slate-500">
                {file.name}
             </div>
        </div>
    );
  };

  return (
    <div className={`flex h-screen w-full bg-paper-50 dark:bg-cyber-900 transition-colors duration-300 ${activeThemeId}`}>
      <Sidebar 
        files={files} 
        activeFileId={activeFileId} 
        onSelectFile={handleSelectFile} 
        onCreateItem={handleCreateItem}
        onDeleteFile={handleDeleteFile}
        onMoveItem={handleMoveItem}
        onRenameItem={handleRenameNode}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        onOpenFolder={handleOpenFolder}
        onImportFolderFiles={handleImportFolderFiles}
        onImportFile={handleImportFile}
        onImportQuiz={handleImportQuiz}
        language={lang}
        ragStats={ragStats}
        onRefreshIndex={() => handleIndexKnowledgeBase()}
      />
      
      <div className="flex-1 flex flex-col h-full relative overflow-hidden transition-all duration-300">
         <Toolbar 
           viewMode={viewMode}
           setViewMode={setViewMode}
           onClear={() => updateActiveFile('')}
           onExport={handleExport}
           onAIPolish={handleAIPolish}
           onAIExpand={() => {}}
           onBuildGraph={handleBuildGraph}
           onSynthesize={() => {}}
           onGenerateMindMap={handleGenerateMindMap}
           onGenerateQuiz={handleGenerateQuiz}
           onFormatBold={() => {}}
           onFormatItalic={() => {}}
           onUndo={handleUndo}
           onRedo={handleRedo}
           isAIThinking={aiState.isThinking}
           theme={themes.find(t => t.id === activeThemeId)?.type || 'dark'}
           toggleTheme={toggleTheme}
           toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
           toggleChat={() => setIsChatOpen(!isChatOpen)}
           toggleSettings={() => setIsSettingsOpen(true)}
           fileName={activeFile.name}
           onRename={renameActiveFile}
           activeProvider={aiConfig.provider}
           language={lang}
           isSplitView={!!secondaryFileId}
           onToggleSplitView={handleToggleSplitView}
           isDictating={isDictating}
           onToggleDictation={toggleDictation}
         />
         
         {/* Main Content Area: Handles Multi-Pane Logic */}
         <div className="flex-1 flex overflow-hidden">
             {/* Primary Pane */}
             {renderPaneContent(primaryFileId, 'primary')}

             {/* Secondary Pane (Split View) */}
             {secondaryFileId && (
                <>
                    <div className="w-1 bg-paper-200 dark:bg-cyber-700 cursor-col-resize hover:bg-cyan-500 transition-colors" />
                    {renderPaneContent(secondaryFileId, 'secondary')}
                </>
             )}
         </div>
         
         {/* Toast / Status Bar */}
         {aiState.message && (
             <div className="absolute bottom-6 left-1/2 -translate-y-1/2 z-50 bg-slate-800 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-fadeIn">
                 {aiState.error ? <AlertCircle size={16} className="text-red-400" /> : <CheckCircle2 size={16} className="text-emerald-400" />}
                 <span>{aiState.message}</span>
             </div>
         )}
         {aiState.error && !aiState.message && (
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-900 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-fadeIn border border-red-700">
                 <AlertCircle size={16} />
                 <span>{aiState.error}</span>
             </div>
         )}
      </div>
      
      <ChatPanel 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        onClearChat={() => setChatMessages([])}
        onCompactChat={async () => {
             setAiState({ isThinking: true, message: "Summarizing history...", error: null });
             try {
                const compacted = await compactConversation(chatMessages, aiConfig);
                setChatMessages(compacted);
             } catch(e: any) { showToast(e.message, true); }
             finally { setAiState({ isThinking: false, message: null, error: null }); }
        }}
        aiState={aiState}
        language={lang}
      />

      <AISettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        config={aiConfig} 
        onSave={setAiConfig}
        themes={themes}
        activeThemeId={activeThemeId}
        onSelectTheme={handleThemeChange}
        onImportTheme={(t) => saveCustomTheme(t)}
        onDeleteTheme={(id) => { deleteCustomTheme(id); setThemes(prev => prev.filter(t => t.id !== id)); }}
        language={lang}
        shortcuts={shortcuts}
        onUpdateShortcut={(id, keys) => setShortcuts(prev => prev.map(s => s.id === id ? { ...s, keys } : s))}
        onResetShortcuts={() => setShortcuts(DEFAULT_SHORTCUTS)}
        isLoginEnabled={isLoginEnabled}
        onToggleLogin={handleToggleLogin}
      />
    </div>
  );
};

export default App;