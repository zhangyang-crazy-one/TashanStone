
import React, { useState, useRef, useEffect } from 'react';
import { EditorPane, MarkdownFile } from '../types';
import { Editor } from './Editor';
import { Preview } from './Preview';
import { translations, Language } from '../utils/translations';

interface SplitEditorProps {
  panes: EditorPane[];
  activePane: string | null;
  files: MarkdownFile[];
  onContentChange: (fileId: string, content: string) => void;
  onCursorChange?: (fileId: string, position: { start: number; end: number }) => void;
  getCursorPosition?: (fileId: string) => { start: number; end: number } | undefined;
  onToggleMode?: (paneId: string) => void;
  splitMode: 'none' | 'horizontal' | 'vertical';
  language?: Language;
  editorRef?: React.RefObject<HTMLTextAreaElement>;
}

export const SplitEditor: React.FC<SplitEditorProps> = ({
  panes,
  activePane,
  files,
  onContentChange,
  onCursorChange,
  getCursorPosition,
  onToggleMode,
  splitMode,
  language = 'en',
  editorRef
}) => {
  const t = translations[language];
  const [splitRatio, setSplitRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取当前活动面板
  const activeEditorPane = panes.find(p => p.id === activePane);

  // 计算可见面板列表
  // 单文件分屏: 当只有一个面板时，自动创建一个虚拟的第二面板（同一文件，不同模式）
  const getVisiblePanes = (): EditorPane[] => {
    if (splitMode === 'none') {
      return activeEditorPane ? [activeEditorPane] : [];
    }

    // 分屏模式下
    if (panes.length >= 2) {
      // 有两个以上面板时，使用前两个
      return panes.slice(0, 2);
    } else if (panes.length === 1 || activeEditorPane) {
      // 只有一个面板时，创建虚拟的第二面板（用于单文件分屏）
      const mainPane = activeEditorPane || panes[0];
      if (!mainPane) return [];

      // 虚拟面板：同一文件，但模式相反（编辑器<->预览）
      const virtualPane: EditorPane = {
        id: `${mainPane.id}-split-virtual`,
        fileId: mainPane.fileId,
        mode: mainPane.mode === 'editor' ? 'preview' : 'editor'
      };

      return [mainPane, virtualPane];
    }

    return [];
  };

  const visiblePanes = getVisiblePanes();

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

    const modeIcon = pane.mode === 'editor'
      ? <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;

    const modeLabel = pane.mode === 'editor' ? 'Editor' : 'Preview';

    // 只有当这是活动编辑器面板且模式是 editor 时才传递 ref
    const shouldPassRef = isActiveEditorPane && pane.mode === 'editor' && editorRef;

    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Panel Title Bar */}
        <div className="h-9 px-4 flex items-center gap-2 border-b border-paper-200 dark:border-cyber-700 bg-paper-100 dark:bg-cyber-800 shrink-0">
          <button
            onClick={() => onToggleMode?.(pane.id)}
            className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-paper-200 dark:hover:bg-cyber-700 px-2 py-1 rounded transition-colors cursor-pointer"
            title={pane.mode === 'editor' ? t.preview : t.editor}
          >
            {modeIcon}
            <span className="text-xs font-semibold">{modeLabel}</span>
          </button>
          <div className="h-3 w-px bg-paper-300 dark:bg-cyber-600" />
          <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1" title={file.name}>
            {file.name}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {pane.mode === 'editor' ? (
            <Editor
              key={`editor-${file.id}-${pane.id}`}
              ref={shouldPassRef ? editorRef : undefined}
              content={file.content}
              onChange={(content) => onContentChange(file.id, content)}
              onCursorChange={(position) => onCursorChange?.(file.id, position)}
              initialCursor={getCursorPosition?.(file.id) || file.cursorPosition}
            />
          ) : (
            <Preview
              key={`preview-${file.id}-${pane.id}`}
              content={file.content}
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
      if (splitMode === 'horizontal') {
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
  }, [isDragging, splitMode]);

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

  // 单窗格显示
  if (visiblePanes.length === 1 || splitMode === 'none') {
    return <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{renderPane(visiblePanes[0], true)}</div>;
  }

  // 分屏模式
  const flexDirection = splitMode === 'horizontal' ? 'flex-row' : 'flex-col';
  const cursorClass = splitMode === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize';
  const dividerClass = splitMode === 'horizontal' ? 'w-1' : 'h-1';

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 flex ${flexDirection} overflow-hidden`}
    >
      {/* 第一个面板 */}
      <div
        style={{
          flex: `0 0 ${splitRatio}%`,
          [splitMode === 'horizontal' ? 'width' : 'height']: `${splitRatio}%`
        }}
        className="min-h-0 min-w-0 overflow-hidden flex flex-col"
      >
        {renderPane(visiblePanes[0], true)}
      </div>

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
          absolute ${splitMode === 'horizontal' ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'}
          w-8 h-8 rounded-full bg-cyan-500 dark:bg-cyan-400 shadow-lg
          flex items-center justify-center
          opacity-0 group-hover:opacity-100 transition-opacity duration-200
          ${isDragging ? 'opacity-100' : ''}
        `}>
          <div className={`flex ${splitMode === 'horizontal' ? 'flex-col' : 'flex-row'} gap-0.5`}>
            <div className="w-0.5 h-3 bg-white rounded"></div>
            <div className="w-0.5 h-3 bg-white rounded"></div>
          </div>
        </div>
      </div>

      {/* 第二个面板 */}
      <div
        style={{
          flex: `0 0 ${100 - splitRatio}%`,
          [splitMode === 'horizontal' ? 'width' : 'height']: `${100 - splitRatio}%`
        }}
        className="min-h-0 min-w-0 overflow-hidden flex flex-col"
      >
        {visiblePanes[1] && renderPane(visiblePanes[1], false)}
      </div>
    </div>
  );
};
