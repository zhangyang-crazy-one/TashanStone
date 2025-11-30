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
import { ViewMode, AIState, MarkdownFile, AIConfig, ChatMessage, GraphData, AppTheme, Quiz } from './types';
import { polishContent, expandContent, generateAIResponse, generateKnowledgeGraph, synthesizeKnowledgeBase, generateQuiz, generateMindMap, extractQuizFromRawContent } from './services/aiService';
import { applyTheme, getAllThemes, getSavedThemeId, saveCustomTheme, deleteCustomTheme, DEFAULT_THEMES, getLastUsedThemeIdForMode } from './services/themeService';
import { readDirectory, saveFileToDisk, processPdfFile, extractTextFromFile, parseCsvToQuiz, isExtensionSupported } from './services/fileService';
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
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,
  language: 'en',
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

  // Refs
  const filesRef = useRef(files);
  const activeFileIdRef = useRef(activeFileId);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Localization
  const lang: Language = aiConfig.language === 'zh' ? 'zh' : 'en';
  const t = translations[lang];

  useEffect(() => {
    filesRef.current = files;
    activeFileIdRef.current = activeFileId;
  }, [files, activeFileId]);

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

  const handleCreateFile = () => {
    const newFile: MarkdownFile = {
      id: generateId(),
      name: `Untitled-${files.length + 1}`,
      content: '',
      lastModified: Date.now(),
      path: `Untitled-${files.length + 1}.md`
    };
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
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
           const content = await extractTextFromFile(file);
           const path = file.webkitRelativePath || file.name;
           
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
        setFiles(newFiles);
        setActiveFileId(newFiles[0].id);
        showToast(`${t.filesLoaded}: ${newFiles.length}`);
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
    setAiState({ isThinking: true, message: null, error: null });

    try {
      const response = await generateAIResponse(
        text, 
        aiConfig, 
        "You are NeonMark AI. You can edit files using tools. If asked about user's notes, use the provided Context.",
        false,
        files,
        executeAiTool
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
        onCreateFile={handleCreateFile}
        onDeleteFile={handleDeleteFile}
        isOpen={isSidebarOpen}
        onCloseMobile={() => setIsSidebarOpen(false)}
        onOpenFolder={handleOpenFolder}
        onImportFolderFiles={handleImportFolderFiles}
        onImportPdf={handleImportPdf}
        onImportQuiz={handleImportQuiz}
        language={lang}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <Toolbar 
          viewMode={viewMode} 
          setViewMode={setViewMode} 
          onClear={() => updateActiveFile('')}
          onExport={() => {/* Existing export logic */}}
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
          onFormatBold={() => { /* ... */ }}
          onFormatItalic={() => { /* ... */ }}
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
            <MindMap content={mindMapContent} theme={currentThemeObj?.type || 'dark'} language={lang} />
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