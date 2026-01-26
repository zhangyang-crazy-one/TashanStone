
import React, { useState, useRef, useEffect } from 'react';
import { EditorPane, MarkdownFile, CodeMirrorEditorRef, ViewMode } from '../types';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { Preview } from './Preview';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

interface SplitEditorProps {
  panes: EditorPane[];
  activePane: string | null;
  files: MarkdownFile[];
  onContentChange: (fileId: string, content: string) => void;
  onCursorChange?: (fileId: string, position: { start: number; end: number }) => void;
  onCursorSave?: (fileId: string, position: { anchor: number; head: number }) => void;  // 保存光标位置回调
  getCursorPosition?: (fileId: string) => { start: number; end: number } | undefined;
  onToggleMode?: (paneId: string) => void;
  onSelectPane?: (paneId: string) => void;
  splitMode: 'none' | 'horizontal' | 'vertical';
  viewMode?: ViewMode;
  language?: Language;
  codeMirrorRef?: React.RefObject<CodeMirrorEditorRef>;
}

export const SplitEditor: React.FC<SplitEditorProps> = ({
  panes,
  activePane,
  files,
  onContentChange,
  onCursorChange,
  onCursorSave,  // 保存光标位置回调
  getCursorPosition,
  onToggleMode,
  onSelectPane,
  splitMode,
  viewMode,
  language = 'en',
  codeMirrorRef,
}) => {
  const t = translations[language];
  const [splitRatio, setSplitRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取当前活动面板
  const activeEditorPane = panes.find(p => p.id === activePane);

  const effectiveSplitMode = viewMode === ViewMode.Preview ? 'none' : splitMode;

  // 计算可见面板列表
  // 修复问题：确保始终包含 activePane，修复选项卡显示错误文件的问题
  const getVisiblePanes = (): EditorPane[] => {
    // 无分屏模式：只显示活动面板
    if (effectiveSplitMode === 'none') {
      return activeEditorPane ? [activeEditorPane] : [];
    }

    // 分屏模式：始终包含 activePane，并找出第二个面板
    if (panes.length === 0) {
      return [];
    }

    if (panes.length === 1) {
      // 只有一个面板时，创建虚拟的第二面板（单文件分屏）
      const mainPane = activeEditorPane || panes[0];
      if (!mainPane) return [];

      const virtualPane: EditorPane = {
        id: `${mainPane.id}-split-virtual`,
        fileId: mainPane.fileId,
        mode: mainPane.mode === 'editor' ? 'preview' : 'editor'
      };

      return [mainPane, virtualPane];
    }

    // 有多个面板时：优先包含 activePane
    if (panes.length >= 2) {
      // 找出 activePane 在 panes 中的索引
      const activeIndex = activePane ? panes.findIndex(p => p.id === activePane) : -1;

      if (activeIndex === -1) {
        // activePane 不在列表中，使用前两个
        return [panes[0], panes[1]];
      }

      if (activeIndex === 0) {
        // activePane 是第一个，直接返回前两个
        return [panes[0], panes[1]];
      }

      if (activeIndex === panes.length - 1) {
        // activePane 是最后一个，返回 activePane 和它前面一个
        return [panes[activeIndex - 1], panes[activeIndex]];
      }

      // activePane 在中间，返回 activePane 和它前面一个
      return [panes[activeIndex - 1], panes[activeIndex]];
    }

    return [];
  };

  const visiblePanes = getVisiblePanes();

  const forcedMode = viewMode === ViewMode.Preview ? 'preview' : undefined;

  const renderPane = (pane: EditorPane, isActiveEditorPane: boolean) => {
    const file = files.find(f => f.id === pane.fileId);
    if (!file) {
      return (
        <div className="flex-1 flex items-center justify-center bg-paper-50 dark:bg-cyber-900 text-slate-400">
          <div className="text-center">
            <p className="text-lg font-medium mb-2">{t.noFilesFound}</p>
            <p className="text-sm opacity-70">File not found in workspace</p>
          </div>
        </div>
      );
    }

    const effectiveMode = forcedMode ?? pane.mode;

    const modeIcon = effectiveMode === 'editor'
      ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;

    const modeLabel = effectiveMode === 'editor' ? 'Editor' : 'Preview';

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Panel Title Bar - 只在分屏模式下显示，避免与 EditorTabs 重复 */}
        {effectiveSplitMode !== 'none' && (
          <div className="h-9 px-4 flex items-center gap-2 border-b border-paper-200 dark:border-cyber-700 bg-paper-100 dark:bg-cyber-800 shrink-0">
            <Tooltip content={pane.mode === 'editor' ? t.preview : t.editor}>
              <button
                onClick={() => onToggleMode?.(pane.id)}
                className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-paper-200 dark:hover:bg-cyber-700 px-2 py-1 rounded transition-colors cursor-pointer"
                aria-label={pane.mode === 'editor' ? t.preview : t.editor}
              >
                {modeIcon}
                <span className="text-xs font-semibold">{modeLabel}</span>
              </button>
            </Tooltip>
            <div className="h-3 w-px bg-paper-300 dark:bg-cyber-600" />
            <Tooltip content={file.name} className="flex-1 min-w-0">
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">
                {file.name}
              </span>
            </Tooltip>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {effectiveMode === 'editor' ? (
            <CodeMirrorEditor
              key={`cm-editor-${file.id}-${pane.id}`}
              ref={isActiveEditorPane ? codeMirrorRef : undefined}
              content={file.content}
              onChange={(content) => onContentChange(file.id, content)}
              onCursorChange={(position) => onCursorChange?.(file.id, position)}
              onCursorSave={(position) => onCursorSave?.(file.id, position)}
              onFocus={() => onSelectPane?.(pane.id)}
              initialCursor={getCursorPosition?.(file.id) || file.cursorPosition}
              files={files}
              onNavigate={(fileId) => {
                const targetPane = panes.find(p => p.fileId === fileId);
                if (targetPane && onSelectPane) {
                  onSelectPane(targetPane.id);
                }
              }}
            />
          ) : (
            <Preview
              key={`preview-${file.id}-${pane.id}`}
              content={file.content}
              files={files}
              language={language}
              initialScrollRatio={(() => {
                // 基于光标位置计算滚动比例
                const cursorPos = getCursorPosition?.(file.id) || file.cursorPosition;
                if (cursorPos && file.content.length > 0) {
                  // 使用光标起始位置占总内容长度的比例
                  return cursorPos.start / file.content.length;
                }
                return undefined;
              })()}
            />
          )}
        </div>
      </div>
    );
  };

  // 处理拖动逻辑
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();

      let newRatio: number;
      if (effectiveSplitMode === 'horizontal') {
        const mouseX = e.clientX - rect.left;
        newRatio = (mouseX / rect.width) * 100;
      } else {
        const mouseY = e.clientY - rect.top;
        newRatio = (mouseY / rect.height) * 100;
      }

      // 限制拖动范围在 20% 到 80% 之间
      newRatio = Math.max(20, Math.min(80, newRatio));
      setSplitRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [effectiveSplitMode, isDragging]);

  // 无文件打开的情况
  if (visiblePanes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-paper-50 dark:bg-cyber-900 text-slate-500 dark:text-slate-400">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-cyan-500 to-violet-500 rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-1">
              {language === 'zh' ? '未选择文件' : 'No File Selected'}
            </p>
            <p className="text-sm opacity-70">
              {language === 'zh' ? '从侧边栏双击文件开始编辑' : 'Double-click a file from the sidebar to start editing'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 统一渲染结构：避免切换模式时 DOM 结构变化导致组件重挂载
  const isSplit = effectiveSplitMode !== 'none' && visiblePanes.length >= 2;
  const flexDirection = effectiveSplitMode === 'horizontal' ? 'flex-row' : 'flex-col';
  const cursorClass = effectiveSplitMode === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize';
  const dividerClass = effectiveSplitMode === 'horizontal' ? 'w-1' : 'h-1';

  return (
    <div
      ref={containerRef}
      data-testid="editor"
      className={`flex-1 min-h-0 flex ${isSplit ? flexDirection : 'flex-col'} overflow-hidden`}
    >
      {/* 第一个面板 - 始终显示 */}
      <div
        style={isSplit ? {
          flex: `0 0 ${splitRatio}%`,
          [effectiveSplitMode === 'horizontal' ? 'width' : 'height']: `${splitRatio}%`
        } : {}}
        className="min-h-0 min-w-0 overflow-hidden flex flex-col"
      >
        {renderPane(visiblePanes[0], visiblePanes[0]?.id === activePane)}
      </div>

      {/* 分割线和第二个面板 - 只在分屏模式下显示 */}
      {isSplit && (
        <>
          {/* 可拖动分割线 */}
          <div
            className={`
              ${dividerClass}
              ${cursorClass}
              bg-paper-200 dark:bg-cyber-700
              hover:bg-cyan-500 dark:hover:bg-cyan-500
              transition-colors duration-200
              ${isDragging ? 'bg-cyan-500' : ''}
              relative
              group
            `}
            onMouseDown={handleMouseDown}
          >
            {/* 拖动提示 */}
            <div className={`
              absolute ${effectiveSplitMode === 'horizontal' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'}
              w-8 h-8 rounded-full bg-cyan-500 dark:bg-cyan-400 shadow-lg
              flex items-center justify-center
              opacity-0 group-hover:opacity-100 transition-opacity duration-200
              ${isDragging ? 'opacity-100' : ''}
            `}>
              <div className={`flex ${effectiveSplitMode === 'horizontal' ? 'flex-col' : 'flex-row'} gap-0.5`}>
                <div className="w-0.5 h-3 bg-white rounded"></div>
                <div className="w-0.5 h-3 bg-white rounded"></div>
              </div>
            </div>
          </div>

          {/* 第二个面板 */}
          <div
            style={{
              flex: `0 0 ${100 - splitRatio}%`,
              [effectiveSplitMode === 'horizontal' ? 'width' : 'height']: `${100 - splitRatio}%`
            }}
            className="min-h-0 min-w-0 overflow-hidden flex flex-col"
          >
            {visiblePanes[1] && renderPane(visiblePanes[1], visiblePanes[1]?.id === activePane)}
          </div>
        </>
      )}
    </div>
  );
};
