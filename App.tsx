
import React, { useState, useEffect, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { AISettingsModal } from './components/AISettingsModal';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { QuizPanel } from './components/QuizPanel';
import { MindMap } from './components/MindMap';
import { ViewMode, AIState, MarkdownFile, AIConfig, ChatMessage, GraphData, AppTheme, Quiz, RAGStats } from './types';
import { polishContent, expandContent, generateAIResponse, generateKnowledgeGraph, synthesizeKnowledgeBase, generateQuiz, generateMindMap, extractQuizFromRawContent } from './services/aiService';
import { applyTheme, getAllThemes, getSavedThemeId, saveCustomTheme, deleteCustomTheme, DEFAULT_THEMES, getLastUsedThemeIdForMode } from './services/themeService';
import { readDirectory, saveFileToDisk, processPdfFile, extractTextFromFile, parseCsvToQuiz, isExtensionSupported } from './services/fileService';
import { VectorStore } from './services/ragService';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { translations, Language } from './utils/translations';

const generateId = () => Math.random().toString(36).substring(2, 11);

const DEFAULT_CONTENT = "# Welcome to NeonMark ⚡\n\nTry opening a local folder or importing a PDF!";

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

interface FileHistory {
  past: string[];
  future: string[];
}

const App: React.FC = () => {
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
          customPrompts: { ...DEFAULT_AI_CONFIG.customPrompts, ...parsed.customPrompts }
        };
      }
      return DEFAULT_AI_CONFIG;
    } catch (e) { return DEFAULT_AI_CONFIG; }
  });

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

  // Refs
  const filesRef = useRef(files);
  const activeFileIdRef = useRef(activeFileId);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  
  // RAG Service
  const [vectorStore] = useState(() => new VectorStore());

  // Localization
  const lang: Language = aiConfig.language === 'zh' ? 'zh' : 'en';
  const t = translations[lang];

  useEffect(() => {
    filesRef.current = files;
    activeFileIdRef.current = activeFileId;
  }, [files, activeFileId]);
  
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
        // Create a hidden .keep file to persist the folder in our path-based system
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
        // Handle File creation
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
    // Prevent moving folder into itself or its own children
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
            // Replace the old prefix with the new prefix
            // Old: Parent/OldFolder/...
            // New: NewParent/OldFolder/...
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
    if (activeFileId === id) setActiveFileId(newFiles[0].id);
  };

  const updateActiveFile = (content: string, skipHistory = false) => {
    // History Logic
    if (!skipHistory) {
      const now = Date.now();
      // If significant time passed or explicit action, snapshot BEFORE update
      if (now - lastEditTimeRef.current > HISTORY_DEBOUNCE) {
         setHistory(prev => {
           const fileHist = prev[activeFileId] || { past: [], future: [] };
           const newPast = [...fileHist.past, activeFile.content];
           if (newPast.length > MAX_HISTORY) newPast.shift();
           
           return {
             ...prev,
             [activeFileId]: {
               past: newPast,
               future: [] // New typing clears future
             }
           };
         });
      }
      lastEditTimeRef.current = now;
    }

    const updated = files.map(f => 
      f.id === activeFileId ? { ...f, content, lastModified: Date.now() } : f
    );
    setFiles(updated);
  };

  const handleUndo = () => {
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

    updateActiveFile(previous, true); // Skip adding this revert to history stack normally
  };

  const handleRedo = () => {
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

    updateActiveFile(next, true);
  };

  // Helper to force save history explicitly (e.g. before AI modification)
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
    // Reset timer so we don't double save if user types immediately
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

  // --- New Features ---

  const handleIndexKnowledgeBase = async (forceList?: MarkdownFile[]) => {
    if (ragStats.isIndexing) return;
    
    // Use provided list or fallback to current state ref (to avoid stale closures)
    const targetFiles = forceList || filesRef.current;
    
    // Filter out .keep files and empty files before indexing
    const validFiles = targetFiles.filter(f => !f.name.endsWith('.keep') && f.content.trim().length > 0);
    
    setRagStats(prev => ({ ...prev, isIndexing: true, totalFiles: validFiles.length }));
    
    // Cap at 20 files for now for demo robustness
    const filesToIndex = validFiles.slice(0, 20); 
    
    try {
        for (const file of filesToIndex) {
            // Only valid text files
            if (file.content && file.content.length > 0) {
                // We pass config to indexFile because it needs API key/URL
                await vectorStore.indexFile(file, aiConfig);
                // Live update stats
                setRagStats(prev => ({ 
                    ...prev,
                    totalFiles: validFiles.length,
                    indexedFiles: vectorStore.getStats().indexedFiles, 
                    totalChunks: vectorStore.getStats().totalChunks
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
    const loadedFiles = await readDirectory(dirHandle);
    if (loadedFiles.length > 0) {
      setFiles(loadedFiles);
      setActiveFileId(loadedFiles[0].id);
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
           // Pass API Key to allow PDF OCR if needed
           const content = await extractTextFromFile(file, aiConfig.apiKey);
           
           let path = file.webkitRelativePath || file.name;
           // Intelligent extension renaming for converted files
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
        }
      }
      
      if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles]); // Append new files instead of replacing
        setActiveFileId(newFiles[0].id);
        showToast(`${t.filesLoaded}: ${newFiles.length}`);
        
        // Automatically trigger indexing for new files
        // We pass the merged list (current + new) to the indexer
        setTimeout(() => {
           handleIndexKnowledgeBase([...filesRef.current, ...newFiles]);
        }, 500);
      } else {
        showToast(t.noFilesFound);
      }
    } catch (e: any) {
       showToast(e.message, true);
    } finally {
       setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleImportPdf = async (file: File) => {
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    try {
      const mdContent = await processPdfFile(file, aiConfig.apiKey);
      const newFile: MarkdownFile = {
        id: generateId(),
        name: file.name.replace('.pdf', ''),
        content: mdContent,
        lastModified: Date.now(),
        path: file.name.replace('.pdf', '.md')
      };
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);
      showToast(t.importSuccess);
      
      // Auto-index
      setTimeout(() => {
         handleIndexKnowledgeBase([...filesRef.current, newFile]);
      }, 500);
    } catch (e: any) {
      showToast(`${t.importFail}: ${e.message}`, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleImportQuiz = async (file: File) => {
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    try {
      // 1. Try structured CSV import
      if (file.name.toLowerCase().endsWith('.csv')) {
         const csvQuiz = await parseCsvToQuiz(file);
         if (csvQuiz) {
             const textContent = await extractTextFromFile(file, aiConfig.apiKey);
             setQuizContext(textContent); // Store raw CSV text as context for AI explanation
             setCurrentQuiz(csvQuiz);
             setViewMode(ViewMode.Quiz);
             showToast(t.importSuccess);
             setAiState(prev => ({ ...prev, isThinking: false, message: null }));
             return;
         }
         console.log("CSV structured parse failed, falling back to AI extraction");
      }

      // 2. Fallback: Extract raw text for AI processing
      const textContent = await extractTextFromFile(file, aiConfig.apiKey);
      setQuizContext(textContent); // Store extracted text as context
      
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

  const handleGenerateMindMap = async () => {
    if (!activeFile || !activeFile.content.trim()) return;
    setAiState({ isThinking: true, message: "Dreaming up Mind Map...", error: null });
    try {
      const mermaidCode = await generateMindMap(activeFile.content, aiConfig);
      setMindMapContent(mermaidCode);
      setViewMode(ViewMode.MindMap);
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleGenerateQuiz = async () => {
    if (!activeFile || !activeFile.content.trim()) return;
    setAiState({ isThinking: true, message: "Creating Quiz...", error: null });
    try {
      const quiz = await generateQuiz(activeFile.content, aiConfig);
      setQuizContext(activeFile.content); // Store current file as context
      setCurrentQuiz(quiz);
      setViewMode(ViewMode.Quiz);
    } catch (e: any) {
      showToast(e.message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
    }
  };

  const handleTextFormat = (startTag: string, endTag: string) => {
      const textarea = editorRef.current;
      if (!textarea) return;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const content = activeFile.content;
      
      const selectedText = content.substring(start, end);
      const newText = `${startTag}${selectedText}${endTag}`;
      
      const newContent = content.substring(0, start) + newText + content.substring(end);
      
      updateActiveFile(newContent);
      
      // We need to wait for React to re-render with the new content before setting selection
      setTimeout(() => {
          if (editorRef.current) {
              editorRef.current.focus();
              editorRef.current.setSelectionRange(start + startTag.length, end + startTag.length);
          }
      }, 0);
  };

  // --- AI Tool Integration ---
  
  const executeAiTool = async (toolName: string, args: any) => {
    // 1. Core File System Tools
    if (toolName === 'create_file') {
      const newFile: MarkdownFile = {
        id: generateId(),
        name: args.filename.replace('.md', ''),
        content: args.content,
        lastModified: Date.now(),
        path: args.filename
      };
      setFiles(prev => [...prev, newFile]);
      return { success: true, message: `Created file ${args.filename}` };
    }
    if (toolName === 'update_file') {
      let found = false;
      const updated = files.map(f => {
        if (f.name === args.filename.replace('.md', '') || f.name === args.filename) {
          found = true;
          return { ...f, content: args.content, lastModified: Date.now() };
        }
        return f;
      });
      if (found) {
        setFiles(updated);
        return { success: true, message: `Updated file ${args.filename}` };
      }
      return { success: false, message: "File not found" };
    }
    if (toolName === 'delete_file') {
       const filtered = files.filter(f => f.name !== args.filename.replace('.md', '') && f.name !== args.filename);
       if (filtered.length < files.length) {
         setFiles(filtered);
         return { success: true, message: `Deleted ${args.filename}` };
       }
       return { success: false, message: "File not found" };
    }

    // 2. MCP Injection Handling
    // If we reach here, it's an external MCP tool call
    console.log(`[MCP Injection] External Tool Called: ${toolName}`, args);
    return { 
      success: true, 
      message: `[System] Tool '${toolName}' call captured (MCP Injection Mode). Args: ${JSON.stringify(args)}` 
    };
  };

  const handleChatMessage = async (text: string) => {
    const userMsg: ChatMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    
    // RAG Logic: Check if files need indexing
    setAiState({ isThinking: true, message: "Indexing Knowledge Base...", error: null });
    
    // Ensure index is up to date (Just In Time)
    await handleIndexKnowledgeBase();
    
    // Perform Search
    setAiState({ isThinking: true, message: "Searching Knowledge Base...", error: null });
    
    const relevantContext = await vectorStore.search(text, aiConfig);
    
    setAiState({ isThinking: true, message: "Thinking...", error: null });

    try {
      const response = await generateAIResponse(
        text, 
        aiConfig, 
        "You are NeonMark AI. You can edit files using tools. If asked about user's notes, use the provided Knowledge Base context.",
        false,
        [], // No raw files passed, strictly RAG
        executeAiTool,
        relevantContext // Pass retrieved chunks
      );
      
      const botMsg: ChatMessage = { id: generateId(), role: 'assistant', content: response, timestamp: Date.now() };
      setChatMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = { id: generateId(), role: 'assistant', content: `**Error**: ${err.message}`, timestamp: Date.now() };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setAiState({ isThinking: false, message: null, error: null });
    }
  };

  const showToast = (message: string, isError: boolean = false) => {
    setAiState({ isThinking: false, error: isError ? message : null, message: isError ? null : message });
    setTimeout(() => setAiState(prev => ({ ...prev, message: null, error: null })), 4000);
  };

  const currentThemeObj = themes.find(t => t.id === activeThemeId) || themes[0];

  return (
    <div className="flex w-full h-screen bg-paper-50 dark:bg-cyber-900 text-slate-800 dark:text-slate-200 overflow-hidden transition-colors duration-300">
      
      <Sidebar 
        files={files}
        activeFileId={activeFileId}
        onSelectFile={setActiveFileId}
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
        onRefreshIndex={() => handleIndexKnowledgeBase()}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Toolbar 
          viewMode={viewMode} 
          setViewMode={setViewMode} 
          onClear={() => updateActiveFile('')}
          onExport={handleExport}
          onAIPolish={async () => {
             try {
                saveSnapshot(); // Save current state before AI polish
                setAiState({ isThinking: true, message: "Polishing...", error: null });
                const res = await polishContent(activeFile.content, aiConfig);
                updateActiveFile(res);
                showToast("Polished!");
             } catch(e:any) { showToast(e.message, true); }
             finally { setAiState(p => ({...p, isThinking: false, message: null})); }
          }}
          onAIExpand={async () => {
              try {
                saveSnapshot(); // Save current state before AI expand
                setAiState({ isThinking: true, message: "Expanding...", error: null });
                const res = await expandContent(activeFile.content, aiConfig);
                updateActiveFile(res);
                showToast("Expanded!");
             } catch(e:any) { showToast(e.message, true); }
             finally { setAiState(p => ({...p, isThinking: false, message: null})); }
          }}
          onBuildGraph={async () => {
              try {
                setAiState({ isThinking: true, message: "Analyzing Graph...", error: null });
                const data = await generateKnowledgeGraph(files, aiConfig);
                setGraphData(data);
                setViewMode(ViewMode.Graph);
             } catch(e:any) { showToast(e.message, true); }
             finally { setAiState(p => ({...p, isThinking: false, message: null})); }
          }}
          onSynthesize={async () => {
             try {
                setAiState({ isThinking: true, message: "Synthesizing Knowledge Base...", error: null });
                const summary = await synthesizeKnowledgeBase(files, aiConfig);
                const newFile: MarkdownFile = { id: generateId(), name: 'Master-Summary', content: summary, lastModified: Date.now(), path: 'Master-Summary.md' };
                setFiles([...files, newFile]);
                setActiveFileId(newFile.id);
                setViewMode(ViewMode.Preview);
             } catch(e:any) { showToast(e.message, true); }
             finally { setAiState(p => ({...p, isThinking: false, message: null})); }
          }}
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
        />

        <div className="flex-1 flex overflow-hidden relative">
          
          {viewMode === ViewMode.Graph && (
            <KnowledgeGraph 
              key={activeThemeId}
              data={graphData} 
              theme={currentThemeObj?.type || 'dark'} 
              onNodeClick={(id) => showToast(`Selected: ${id}`)} 
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

          {(viewMode === ViewMode.Editor || viewMode === ViewMode.Split) && (
             <div className={`${viewMode === ViewMode.Split ? 'w-1/2' : 'w-full'} h-full border-r border-paper-200 dark:border-cyber-700`}>
                <Editor 
                  ref={editorRef} 
                  content={activeFile?.content || ''} 
                  onChange={updateActiveFile}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                />
             </div>
          )}
          
          {(viewMode === ViewMode.Preview || viewMode === ViewMode.Split) && (
             <div className={`${viewMode === ViewMode.Split ? 'w-1/2' : 'w-full'} h-full overflow-hidden`}>
                <Preview content={activeFile?.content || ''} />
             </div>
          )}

          <ChatPanel 
            isOpen={isChatOpen} 
            onClose={() => setIsChatOpen(false)}
            messages={chatMessages}
            onSendMessage={handleChatMessage}
            onClearChat={() => setChatMessages([])}
            aiState={aiState}
            language={lang}
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
        onSave={(c) => setAiConfig(c)}
        themes={themes}
        activeThemeId={activeThemeId}
        onSelectTheme={handleThemeChange}
        onImportTheme={(t) => { saveCustomTheme(t); setThemes(getAllThemes()); handleThemeChange(t.id); }}
        onDeleteTheme={(id) => { deleteCustomTheme(id); setThemes(getAllThemes()); if(activeThemeId === id) handleThemeChange(getAllThemes()[0].id); }}
        language={lang}
      />
    </div>
  );
};

export default App;
