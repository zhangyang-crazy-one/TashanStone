
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
import { polishContent, expandContent, generateAIResponse, generateKnowledgeGraph, synthesizeKnowledgeBase, generateQuiz, generateMindMap } from './services/aiService';
import { applyTheme, getAllThemes, getSavedThemeId, saveCustomTheme, deleteCustomTheme, DEFAULT_THEMES } from './services/themeService';
import { readDirectory, saveFileToDisk, processPdfFile } from './services/fileService';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { translations, Language } from './utils/translations';

const generateId = () => Math.random().toString(36).substring(2, 11);

const DEFAULT_CONTENT = "# Welcome to NeonMark ⚡\n\nTry opening a local folder or importing a PDF!";

const DEFAULT_FILE: MarkdownFile = {
  id: 'default-1',
  name: 'Welcome',
  content: DEFAULT_CONTENT,
  lastModified: Date.now()
};

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini', 
  model: 'gemini-2.5-flash',
  baseUrl: 'http://localhost:11434',
  temperature: 0.7,
  language: 'en'
};

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
    const targetTheme = themes.find(t => t.type === targetType);
    if (targetTheme) handleThemeChange(targetTheme.id);
  };

  // --- File System State ---
  const [files, setFiles] = useState<MarkdownFile[]>(() => {
    try {
      const saved = localStorage.getItem('neon-files');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : [DEFAULT_FILE];
      }
    } catch (e) { return [DEFAULT_FILE]; }
    return [DEFAULT_FILE];
  });
  
  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const saved = localStorage.getItem('neon-active-id');
    return saved || 'default-1';
  });

  const activeFile = files.find(f => f.id === activeFileId) || files[0] || DEFAULT_FILE;

  // --- Feature State ---
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => {
    try {
      const saved = localStorage.getItem('neon-ai-config');
      return saved ? { ...DEFAULT_AI_CONFIG, ...JSON.parse(saved) } : DEFAULT_AI_CONFIG;
    } catch (e) { return DEFAULT_AI_CONFIG; }
  });

  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
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

  useEffect(() => {
    const saveToStorage = () => {
      const filesToSave = filesRef.current.map(f => ({
        ...f,
        handle: undefined
      }));
      localStorage.setItem('neon-files', JSON.stringify(filesToSave));
      localStorage.setItem('neon-active-id', activeFileIdRef.current);
    };
    const intervalId = setInterval(saveToStorage, 30000);
    return () => clearInterval(intervalId);
  }, []);

  // --- Handlers ---

  const handleCreateFile = () => {
    const newFile: MarkdownFile = {
      id: generateId(),
      name: `Untitled-${files.length + 1}`,
      content: '',
      lastModified: Date.now()
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

  const updateActiveFile = (content: string) => {
    const updated = files.map(f => 
      f.id === activeFileId ? { ...f, content, lastModified: Date.now() } : f
    );
    setFiles(updated);
    
    // Auto-save to disk if it's a local file
    const current = updated.find(f => f.id === activeFileId);
    if (current?.handle && current.isLocal) {
      saveFileToDisk(current).catch(err => console.error("Failed to save to disk", err));
    }
  };

  const renameActiveFile = (newName: string) => {
    setFiles(files.map(f => f.id === activeFileId ? { ...f, name: newName } : f));
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
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (file.name.endsWith('.md')) {
         const content = await file.text();
         newFiles.push({
           id: generateId() + '-' + i,
           name: file.name.replace('.md', ''),
           content: content,
           lastModified: file.lastModified,
           isLocal: false
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
  };

  const handleImportPdf = async (file: File) => {
    setAiState({ isThinking: true, message: "Reading PDF...", error: null });
    try {
      const mdContent = await processPdfFile(file, aiConfig.apiKey);
      const newFile: MarkdownFile = {
        id: generateId(),
        name: file.name.replace('.pdf', ''),
        content: mdContent,
        lastModified: Date.now()
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
    if (toolName === 'create_file') {
      const newFile: MarkdownFile = {
        id: generateId(),
        name: args.filename.replace('.md', ''),
        content: args.content,
        lastModified: Date.now()
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
    return { success: false, error: "Unknown tool" };
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
    <div className="flex h-screen bg-paper-50 dark:bg-cyber-900 text-slate-800 dark:text-slate-200 overflow-hidden transition-colors duration-300">
      
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
                setAiState({ isThinking: true, message: "Polishing...", error: null });
                const res = await polishContent(activeFile.content, aiConfig);
                updateActiveFile(res);
                showToast("Polished!");
             } catch(e:any) { showToast(e.message, true); }
             finally { setAiState(p => ({...p, isThinking: false, message: null})); }
          }}
          onAIExpand={async () => {
              try {
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
                const newFile: MarkdownFile = { id: generateId(), name: 'Master-Summary', content: summary, lastModified: Date.now() };
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
              contextContent={activeFile.content}
              language={lang}
            />
          )}

          {viewMode === ViewMode.MindMap && (
            <MindMap content={mindMapContent} theme={currentThemeObj?.type || 'dark'} language={lang} />
          )}

          {(viewMode === ViewMode.Editor || viewMode === ViewMode.Split) && (
             <div className={`${viewMode === ViewMode.Split ? 'w-1/2' : 'w-full'} h-full border-r border-paper-200 dark:border-cyber-700`}>
                <Editor ref={editorRef} content={activeFile?.content || ''} onChange={updateActiveFile} />
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
