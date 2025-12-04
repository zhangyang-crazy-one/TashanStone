
import React, { useState, useRef, useEffect } from 'react';
import { 
  Columns, 
  Eye, 
  PenTool, 
  Sparkles, 
  Download, 
  Trash2, 
  FileText,
  Menu,
  Sun,
  Moon,
  MessageSquare,
  Settings,
  Zap,
  Maximize2,
  Share2,
  Network,
  Library,
  Bold,
  Italic,
  BrainCircuit,
  GraduationCap,
  Undo,
  Redo,
  PanelRightOpen,
  PanelRightClose,
  Mic,
  Box,
  LayoutGrid,
  BarChart2,
  ChevronDown,
  Workflow,
  Lightbulb
} from 'lucide-react';
import { ViewMode, Theme, AIProvider } from '../types';
import { translations, Language } from '../utils/translations';

interface ToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onClear: () => void;
  onExport: () => void;
  onAIPolish: () => void;
  onAIExpand: () => void;
  onAIEntityExtraction: () => void;
  onBuildGraph: () => void;
  onSynthesize: () => void;
  onGenerateMindMap: () => void;
  onGenerateQuiz: () => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  isAIThinking: boolean;
  theme: Theme;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  toggleChat: () => void;
  toggleSettings: () => void;
  fileName: string;
  onRename: (newName: string) => void;
  activeProvider: AIProvider;
  language?: Language;
  
  // Multi-File Support
  isSplitView: boolean;
  onToggleSplitView: () => void;

  // Voice Support
  isDictating?: boolean;
  onToggleDictation?: () => void;

  // Smart Organize
  onSmartOrganize?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  setViewMode,
  onClear,
  onExport,
  onAIPolish,
  onAIExpand,
  onAIEntityExtraction,
  onBuildGraph,
  onSynthesize,
  onGenerateMindMap,
  onGenerateQuiz,
  onFormatBold,
  onFormatItalic,
  onUndo,
  onRedo,
  isAIThinking,
  theme,
  toggleTheme,
  toggleSidebar,
  toggleChat,
  toggleSettings,
  fileName,
  onRename,
  activeProvider,
  language = 'en',
  isSplitView,
  onToggleSplitView,
  isDictating,
  onToggleDictation,
  onSmartOrganize
}) => {
  const t = translations[language];
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const aiMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(event.target as Node)) {
        setIsAiMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="h-16 border-b border-paper-200 dark:border-cyber-700 bg-white/80 dark:bg-cyber-800/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-30 transition-colors duration-300">
      <div className="flex items-center gap-3 flex-1 overflow-hidden mr-4">
        <button 
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-paper-100 dark:hover:bg-cyber-800 text-slate-500 dark:text-slate-400 transition-colors"
        >
          <Menu size={20} />
        </button>
        
        <div className="hidden md:flex w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 items-center justify-center shadow-md">
          <FileText className="w-5 h-5 text-white" />
        </div>
        
        <input 
          type="text"
          value={fileName}
          onChange={(e) => onRename(e.target.value)}
          className="bg-transparent text-lg font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded px-1 min-w-[100px] max-w-[200px] truncate transition-colors"
          placeholder={t.filename}
        />
        <span className="text-slate-400 text-sm font-mono hidden sm:inline">.md</span>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Undo/Redo Controls */}
        <div className="flex bg-paper-100 dark:bg-cyber-800 rounded-lg p-1 border border-paper-200 dark:border-cyber-700 transition-colors hidden sm:flex">
          <button
            onClick={onUndo}
            className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all hover:bg-white dark:hover:bg-cyber-700"
            title="Undo (Ctrl+Z)"
          >
            <Undo size={18} />
          </button>
          <button
            onClick={onRedo}
            className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all hover:bg-white dark:hover:bg-cyber-700"
            title="Redo (Ctrl+Y)"
          >
            <Redo size={18} />
          </button>
        </div>

        <div className="h-6 w-px bg-paper-200 dark:bg-cyber-700 mx-1 hidden sm:block"></div>

        {/* Layout Controls */}
        <div className="flex bg-paper-100 dark:bg-cyber-800 rounded-lg p-1 border border-paper-200 dark:border-cyber-700 transition-colors hidden md:flex">
          <button
            onClick={() => setViewMode(ViewMode.Editor)}
            className={`p-2 rounded-md transition-all ${viewMode === ViewMode.Editor ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title={t.editor}
          >
            <PenTool size={18} />
          </button>
          <button
            onClick={() => setViewMode(ViewMode.Split)}
            className={`p-2 rounded-md transition-all ${viewMode === ViewMode.Split ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title={t.split}
          >
            <Columns size={18} />
          </button>
          
          <button
            onClick={() => setViewMode(ViewMode.Library)}
            className={`p-2 rounded-md transition-all ${viewMode === ViewMode.Library ? 'bg-white dark:bg-cyber-500 text-emerald-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title="Library View"
          >
            <LayoutGrid size={18} />
          </button>

          <button
            onClick={() => setViewMode(ViewMode.Analytics)}
            className={`p-2 rounded-md transition-all ${viewMode === ViewMode.Analytics ? 'bg-white dark:bg-cyber-500 text-amber-500 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title="Analytics"
          >
            <BarChart2 size={18} />
          </button>

          <button
            onClick={onBuildGraph}
            className={`p-2 rounded-md transition-all ${viewMode === ViewMode.Graph ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title={t.graph}
          >
            <Network size={18} />
          </button>
          
          <div className="w-px h-full bg-paper-300 dark:bg-cyber-600 mx-1"></div>

          <button
            onClick={onToggleSplitView}
            className={`p-2 rounded-md transition-all ${isSplitView ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title={isSplitView ? "Close Split View" : "Split View (Multi-file)"}
            disabled={viewMode === ViewMode.NoteSpace || viewMode === ViewMode.Library} // Disable in special modes
          >
            {isSplitView ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>

        <div className="h-6 w-px bg-paper-200 dark:bg-cyber-700 mx-1 hidden md:block"></div>

        {/* AI Action Group (Dropdown Menu) */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={aiMenuRef}>
            <button
              onClick={() => setIsAiMenuOpen(!isAiMenuOpen)}
              disabled={isAIThinking || viewMode === ViewMode.NoteSpace || viewMode === ViewMode.Library}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 hover:bg-white dark:hover:bg-cyber-700/50 transition-all disabled:opacity-50"
            >
              <Sparkles size={16} className={isAIThinking ? 'animate-spin' : ''} />
              <span className="text-sm font-medium hidden sm:inline">AI Actions</span>
              <ChevronDown size={14} />
            </button>

            {isAiMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-cyber-800 rounded-xl shadow-xl border border-paper-200 dark:border-cyber-700 py-2 z-50 animate-slideDown">
                <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Editing</div>
                <button
                  onClick={() => { onAIPolish(); setIsAiMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-paper-100 dark:hover:bg-cyber-700 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <PenTool size={14} className="text-cyan-500" /> {t.polish}
                </button>
                <button
                  onClick={() => { onAIExpand(); setIsAiMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-paper-100 dark:hover:bg-cyber-700 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <Maximize2 size={14} className="text-violet-500" /> {t.expand}
                </button>
                
                {onSmartOrganize && (
                  <button
                    onClick={() => { onSmartOrganize(); setIsAiMenuOpen(false); }}
                    className="w-full text-left px-4 py-2 hover:bg-paper-100 dark:hover:bg-cyber-700 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"
                  >
                    <Lightbulb size={14} className="text-amber-500" /> Smart Organize
                  </button>
                )}
                
                <div className="my-1 h-px bg-paper-200 dark:bg-cyber-700"></div>
                <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Generation</div>
                
                <button
                  onClick={() => { onGenerateMindMap(); setIsAiMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-paper-100 dark:hover:bg-cyber-700 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <BrainCircuit size={14} className="text-emerald-500" /> {t.mindMap}
                </button>
                
                <button
                  onClick={() => { onGenerateQuiz(); setIsAiMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-paper-100 dark:hover:bg-cyber-700 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <GraduationCap size={14} className="text-amber-500" /> Question Bank
                </button>

                <div className="my-1 h-px bg-paper-200 dark:bg-cyber-700"></div>
                <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Deep Analysis</div>

                <button
                  onClick={() => { onAIEntityExtraction(); setIsAiMenuOpen(false); }}
                  className="w-full text-left px-4 py-2 hover:bg-paper-100 dark:hover:bg-cyber-700 text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2 group"
                >
                  <Workflow size={14} className="text-red-500 group-hover:scale-110 transition-transform" /> 
                  <span>Extract Entities</span>
                </button>
              </div>
            )}
          </div>
          
          {/* Voice Dictation Toggle */}
          {onToggleDictation && (
            <button
              onClick={onToggleDictation}
              className={`p-2 rounded-lg transition-colors relative ${isDictating ? 'text-red-500 bg-red-50 dark:bg-red-900/20 animate-pulse' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-paper-100 dark:hover:bg-cyber-800'}`}
              title="Dictation Mode (Real-time Transcription)"
            >
              <Mic size={20} />
              {isDictating && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
            </button>
          )}

          <button
            onClick={toggleChat}
            className="p-2 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-lg transition-colors relative"
            title={t.chat}
          >
            <MessageSquare size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-violet-500 rounded-full"></span>
          </button>

          <button
            onClick={toggleSettings}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
            title={t.settings}
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-paper-100 dark:hover:bg-cyber-800 text-amber-500 dark:text-cyber-400 transition-colors"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* File Actions */}
        <div className="flex items-center gap-1 hidden lg:flex">
          <button onClick={onExport} className="p-2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyber-400 transition-colors" title={t.download}>
            <Download size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
