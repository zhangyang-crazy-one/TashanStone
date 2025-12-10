
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
  splitMode: 'none' | 'horizontal' | 'vertical';
  language?: Language;
}

export const SplitEditor: React.FC<SplitEditorProps> = ({
  panes,
  activePane,
  files,
  onContentChange,
  splitMode,
  language = 'en'
}) => {
  const t = translations[language];
  const [splitRatio, setSplitRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取当前活动面板
  const activeEditorPane = panes.find(p => p.id === activePane);
  const visiblePanes = splitMode === 'none'
    ? (activeEditorPane ? [activeEditorPane] : [])
    : panes.slice(0, 2);

  const renderPane = (pane: EditorPane) => {
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

    if (pane.mode === 'editor') {
      return (
        <Editor
          content={file.content}
          onChange={(content) => onContentChange(file.id, content)}
        />
      );
    } else {
      return <Preview content={file.content} />;
    }
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
    return <div className="flex-1 overflow-hidden">{renderPane(visiblePanes[0])}</div>;
  }

  // 分屏模式
  const flexDirection = splitMode === 'horizontal' ? 'flex-row' : 'flex-col';
  const cursorClass = splitMode === 'horizontal' ? 'cursor-col-resize' : 'cursor-row-resize';
  const dividerClass = splitMode === 'horizontal' ? 'w-1' : 'h-1';

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex ${flexDirection} overflow-hidden`}
    >
      {/* 第一个面板 */}
      <div
        style={{
          flex: `0 0 ${splitRatio}%`,
          [splitMode === 'horizontal' ? 'width' : 'height']: `${splitRatio}%`
        }}
        className="overflow-hidden"
      >
        {renderPane(visiblePanes[0])}
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
        className="overflow-hidden"
      >
        {visiblePanes[1] && renderPane(visiblePanes[1])}
      </div>
    </div>
  );
};
