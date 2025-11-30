
import React from 'react';
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
  Redo
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
}

export const Toolbar: React.FC<ToolbarProps> = ({
  viewMode,
  setViewMode,
  onClear,
  onExport,
  onAIPolish,
  onAIExpand,
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
  language = 'en'
}) => {
  const t = translations[language];

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

        {/* Formatting Controls */}
        <div className="flex bg-paper-100 dark:bg-cyber-800 rounded-lg p-1 border border-paper-200 dark:border-cyber-700 transition-colors hidden sm:flex">
          <button
            onClick={onFormatBold}
            className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all hover:bg-white dark:hover:bg-cyber-700"
            title="Bold"
          >
            <Bold size={18} />
          </button>
          <button
            onClick={onFormatItalic}
            className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all hover:bg-white dark:hover:bg-cyber-700"
            title="Italic"
          >
            <Italic size={18} />
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
            onClick={() => setViewMode(ViewMode.Preview)}
            className={`p-2 rounded-md transition-all ${viewMode === ViewMode.Preview ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title={t.preview}
          >
            <Eye size={18} />
          </button>
          <button
            onClick={() => { onBuildGraph(); }}
            className={`p-2 rounded-md transition-all ${viewMode === ViewMode.Graph ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
            title={t.graph}
          >
            <Network size={18} />
          </button>
        </div>

        <div className="h-6 w-px bg-paper-200 dark:bg-cyber-700 mx-1 hidden md:block"></div>

        {/* AI Action Group */}
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex rounded-lg border border-cyan-500/20 bg-cyan-50/50 dark:bg-cyan-900/10 p-0.5">
            <button
              onClick={onAIPolish}
              disabled={isAIThinking}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-cyan-700 dark:text-cyan-400 hover:bg-white dark:hover:bg-cyber-700/50 transition-all disabled:opacity-50"
              title={`${t.polish} (${activeProvider})`}
            >
              <Sparkles size={14} className={isAIThinking ? 'animate-spin' : ''} />
              <span>{t.polish}</span>
            </button>
            <div className="w-px h-4 bg-cyan-200 dark:bg-cyan-800 mx-1 self-center"></div>
            
            <button onClick={onGenerateMindMap} disabled={isAIThinking} className="p-2 hover:bg-white dark:hover:bg-cyber-700/50 rounded-md text-cyan-700 dark:text-cyan-400 transition-all" title={t.mindMap}>
               <BrainCircuit size={16} />
            </button>
             <button onClick={onGenerateQuiz} disabled={isAIThinking} className="p-2 hover:bg-white dark:hover:bg-cyber-700/50 rounded-md text-cyan-700 dark:text-cyan-400 transition-all" title={t.quiz}>
               <GraduationCap size={16} />
            </button>
          </div>

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
