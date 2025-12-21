
import React, { useState, useEffect, useRef } from 'react';
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
  Minus,
  Square,
  X,
  Maximize,
  Minimize2,
  Rows,
  BarChart2,
  GitCompare,
  Map,
  GitBranch,
  HelpCircle,
  Edit3,
  ChevronDown,
  Mic
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
  onBuildGraph: (useActiveFileOnly?: boolean) => void;
  onSynthesize: () => void;
  onGenerateMindMap: () => void;
  onGenerateQuiz: () => void;
  onFormatBold: () => void;
  onFormatItalic: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onVoiceTranscription?: () => void;
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
  splitMode?: 'none' | 'horizontal' | 'vertical';
  onSplitModeChange?: (mode: 'none' | 'horizontal' | 'vertical') => void;
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
  onVoiceTranscription,
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
  splitMode = 'none',
  onSplitModeChange
}) => {
  const t = translations[language];

  // Window control state (Electron only)
  const [isMaximized, setIsMaximized] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showAIMenu, setShowAIMenu] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const aiMenuRef = useRef<HTMLDivElement>(null);
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.platform?.isElectron;

  useEffect(() => {
    if (!isElectron) return;

    // Get initial maximized state
    window.electronAPI.window.isMaximized().then(setIsMaximized);

    // Listen for maximize/unmaximize events
    const cleanup = window.electronAPI.window.onMaximizedChange(setIsMaximized);
    return cleanup;
  }, [isElectron]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setShowViewMenu(false);
      }
      if (aiMenuRef.current && !aiMenuRef.current.contains(event.target as Node)) {
        setShowAIMenu(false);
      }
    };
    if (showViewMenu || showAIMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showViewMenu, showAIMenu]);

  const handleMinimize = () => window.electronAPI?.window.minimize();
  const handleMaximize = () => window.electronAPI?.window.maximize();
  const handleClose = () => window.electronAPI?.window.close();

  return (
    <div className="h-16 border-b border-paper-200 dark:border-cyber-700 bg-white/80 dark:bg-cyber-800/80 backdrop-blur-md flex items-center px-4 sticky top-0 z-30 transition-colors duration-300 app-drag-region justify-between gap-4">
      {/* 左侧区域：文件信息 - 固定宽度 */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg hover:bg-paper-100 dark:hover:bg-cyber-800 text-slate-500 dark:text-slate-400 transition-colors flex-shrink-0 app-no-drag"
        >
          <Menu size={20} />
        </button>

        <div className="hidden md:flex w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 items-center justify-center shadow-md flex-shrink-0">
          <FileText className="w-5 h-5 text-white" />
        </div>

        <div className="flex items-center gap-1 min-w-0">
          <input
            type="text"
            value={fileName}
            onChange={(e) => onRename(e.target.value)}
            className="bg-transparent text-lg font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 rounded px-1 min-w-[60px] max-w-[120px] truncate transition-colors app-no-drag"
            placeholder={t.filename}
          />
          <span className="text-slate-400 text-sm font-mono hidden sm:inline flex-shrink-0">.md</span>
        </div>
      </div>

      {/* 中间区域：工具按钮 - 紧凑设计，使用下拉菜单 */}
      <div className="flex items-center gap-2 app-no-drag">

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

        {/* View Mode Dropdown */}
        <div className="relative" ref={viewMenuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowViewMenu(!showViewMenu); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-paper-100 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-cyber-700 transition-all whitespace-nowrap"
            title={t.viewMode || 'View Mode'}
          >
            {viewMode === ViewMode.Editor && <Edit3 size={16} />}
            {viewMode === ViewMode.Split && <Columns size={16} />}
            {viewMode === ViewMode.Preview && <Eye size={16} />}
            {viewMode === ViewMode.Graph && <Network size={16} />}
            {viewMode === ViewMode.MindMap && <GitBranch size={16} />}
            {viewMode === ViewMode.Quiz && <HelpCircle size={16} />}
            {viewMode === ViewMode.Analytics && <BarChart2 size={16} />}
            {viewMode === ViewMode.Diff && <GitCompare size={16} />}
            {viewMode === ViewMode.Roadmap && <Map size={16} />}
            <span className="hidden md:inline text-sm whitespace-nowrap">{t[viewMode.toLowerCase()] || viewMode}</span>
            <ChevronDown size={14} />
          </button>
          {showViewMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg shadow-xl z-50 min-w-[180px] py-1">
              {/* Header with icon */}
              <div className="px-3 py-2 border-b border-paper-200 dark:border-cyber-700 flex items-center gap-2">
                <Eye size={14} className="text-slate-500" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{t.viewMode || 'View Mode'}</span>
              </div>
              {/* Basic View Modes */}
              <button
                onClick={() => { setViewMode(ViewMode.Editor); setShowViewMenu(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 ${viewMode === ViewMode.Editor ? 'text-cyan-600 dark:text-cyan-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}
              >
                <Edit3 size={14} className="text-cyan-500" /> {t.editor}
              </button>
              <button
                onClick={() => {
                  setViewMode(ViewMode.Split);
                  // 确保分屏模式生效：如果当前是'none'则切换到'horizontal'
                  if (splitMode === 'none') {
                    onSplitModeChange?.('horizontal');
                  }
                  setShowViewMenu(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 ${viewMode === ViewMode.Split ? 'text-cyan-600 dark:text-cyan-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}
              >
                <Columns size={14} className="text-blue-500" /> {t.split}
              </button>
              <button
                onClick={() => { setViewMode(ViewMode.Preview); setShowViewMenu(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 ${viewMode === ViewMode.Preview ? 'text-cyan-600 dark:text-cyan-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}
              >
                <Eye size={14} className="text-purple-500" /> {t.preview}
              </button>
              <div className="my-1 h-px bg-paper-200 dark:bg-cyber-700"></div>
              {/* Knowledge Graph Views */}
              <button
                onClick={() => { onBuildGraph(true); setShowViewMenu(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 ${viewMode === ViewMode.Graph ? 'text-cyan-600 dark:text-cyan-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}
              >
                <Network size={14} className="text-emerald-500" /> {t.graph} ({language === 'zh' ? '当前' : 'Current'})
              </button>
              <button
                onClick={() => { onBuildGraph(false); setShowViewMenu(false); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
              >
                <Library size={14} className="text-emerald-400" /> {t.graph} ({language === 'zh' ? '全部' : 'All'})
              </button>
              <div className="my-1 h-px bg-paper-200 dark:bg-cyber-700"></div>
              {/* Analytics & Tools Views */}
              <button
                onClick={() => { setViewMode(ViewMode.Analytics); setShowViewMenu(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 ${viewMode === ViewMode.Analytics ? 'text-cyan-600 dark:text-cyan-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}
              >
                <BarChart2 size={14} className="text-amber-500" /> {t.analytics}
              </button>
              <button
                onClick={() => { setViewMode(ViewMode.Diff); setShowViewMenu(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 ${viewMode === ViewMode.Diff ? 'text-cyan-600 dark:text-cyan-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}
              >
                <GitCompare size={14} className="text-orange-500" /> {t.diff}
              </button>
              <button
                onClick={() => { setViewMode(ViewMode.Roadmap); setShowViewMenu(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2 ${viewMode === ViewMode.Roadmap ? 'text-cyan-600 dark:text-cyan-400 font-medium' : 'text-slate-700 dark:text-slate-200'}`}
              >
                <Map size={14} className="text-teal-500" /> {t.roadmap}
              </button>
            </div>
          )}
        </div>

        {/* Split Mode Controls */}
        {onSplitModeChange && (
          <div className="flex bg-paper-100 dark:bg-cyber-800 rounded-lg p-1 border border-paper-200 dark:border-cyber-700 transition-colors hidden lg:flex">
            <button
              onClick={() => onSplitModeChange('none')}
              className={`p-2 rounded-md transition-all ${splitMode === 'none' ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
              title="Single View"
            >
              <Square size={16} />
            </button>
            <button
              onClick={() => onSplitModeChange('horizontal')}
              className={`p-2 rounded-md transition-all ${splitMode === 'horizontal' ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
              title="Split Horizontal"
            >
              <Columns size={16} />
            </button>
            <button
              onClick={() => onSplitModeChange('vertical')}
              className={`p-2 rounded-md transition-all ${splitMode === 'vertical' ? 'bg-white dark:bg-cyber-500 text-cyan-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
              title="Split Vertical"
            >
              <Rows size={16} />
            </button>
          </div>
        )}

        <div className="h-6 w-px bg-paper-200 dark:bg-cyber-700 mx-1 hidden md:block"></div>

        {/* AI Action Dropdown */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={aiMenuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowAIMenu(!showAIMenu); }}
              disabled={isAIThinking}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-paper-100 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-cyber-700 transition-all disabled:opacity-50 whitespace-nowrap"
              title={t.aiOperations}
            >
              <Sparkles size={16} className={isAIThinking ? 'animate-spin text-cyan-500' : 'text-cyan-500'} />
              <span className="hidden sm:inline text-sm font-medium whitespace-nowrap">{t.aiActions || 'AI'}</span>
              <ChevronDown size={14} />
            </button>
            {showAIMenu && (
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded-lg shadow-xl z-50 min-w-[180px] py-1">
                {/* Header with icon */}
                <div className="px-3 py-2 border-b border-paper-200 dark:border-cyber-700 flex items-center gap-2">
                  <Sparkles size={14} className="text-cyan-500" />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{t.aiOperations || 'AI Tools'}</span>
                </div>
                <button
                  onClick={() => { onAIPolish(); setShowAIMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <Sparkles size={14} className="text-cyan-500" /> {t.polish}
                </button>
                <button
                  onClick={() => { onAIExpand(); setShowAIMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <Maximize2 size={14} className="text-violet-500" /> {t.expand}
                </button>
                <div className="my-1 h-px bg-paper-200 dark:bg-cyber-700"></div>
                <button
                  onClick={() => { onGenerateMindMap(); setShowAIMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <BrainCircuit size={14} className="text-emerald-500" /> {t.mindMap}
                </button>
                <button
                  onClick={() => { onGenerateQuiz(); setShowAIMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <GraduationCap size={14} className="text-amber-500" /> {t.quiz}
                </button>
                <button
                  onClick={() => { onSynthesize(); setShowAIMenu(false); }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                >
                  <Share2 size={14} className="text-indigo-500" /> {t.synthesize}
                </button>
                {/* Voice Transcription - Only show in Electron */}
                {isElectron && onVoiceTranscription && (
                  <>
                    <div className="my-1 h-px bg-paper-200 dark:bg-cyber-700"></div>
                    <button
                      onClick={() => { onVoiceTranscription(); setShowAIMenu(false); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-200 flex items-center gap-2"
                    >
                      <Mic size={14} className="text-purple-500" /> {t.voiceTranscription}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右侧功能区：聊天、设置、主题、下载 - 固定宽度 */}
      <div className="flex items-center gap-1 flex-shrink-0 app-no-drag">
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

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-paper-100 dark:hover:bg-cyber-800 text-amber-500 dark:text-cyber-400 transition-colors"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* File Actions */}
        <button onClick={onExport} className="p-2 text-slate-400 hover:text-cyan-600 dark:hover:text-cyber-400 transition-colors" title={t.download}>
          <Download size={20} />
        </button>
      </div>

      {/* 窗口控制区：最小化、最大化、关闭 - 最右边固定（仅Electron） */}
      {isElectron && (
        <>
          <div className="h-6 w-px bg-paper-200 dark:bg-cyber-700 flex-shrink-0"></div>
          <div className="flex items-center gap-0.5 flex-shrink-0 app-no-drag">
            <button
              onClick={handleMinimize}
              className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-paper-100 dark:hover:bg-cyber-700 transition-all"
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={handleMaximize}
              className="p-2 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-paper-100 dark:hover:bg-cyber-700 transition-all"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Square size={14} />}
            </button>
            <button
              onClick={handleClose}
              className="p-2 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
