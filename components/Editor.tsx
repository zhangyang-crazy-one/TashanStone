
import React, { forwardRef, useEffect, useRef, useImperativeHandle, useCallback, useState } from 'react';
import { extractWikiLinks, WikiLink } from '../src/types/wiki';
import { findFileByWikiLinkTarget } from '../src/services/wiki/wikiLinkService';
import { Link2, ExternalLink, AlertCircle } from 'lucide-react';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCursorChange?: (position: { start: number; end: number }) => void;
  initialCursor?: { start: number; end: number };
  files?: Array<{ id: string; name: string; path?: string }>;
  onNavigate?: (fileId: string) => void;
}

export const Editor = forwardRef<HTMLTextAreaElement, EditorProps>(({
  content,
  onChange,
  onUndo,
  onRedo,
  onCursorChange,
  initialCursor,
  files = [],
  onNavigate
}, ref) => {
  // 内部 ref 用于光标恢复
  const internalRef = useRef<HTMLTextAreaElement>(null);
  // 保存最新的光标位置（用于组件卸载时保存）
  const lastCursorRef = useRef<{ start: number; end: number } | null>(initialCursor || null);
  const initializedRef = useRef(false);
  // 保存回调函数的引用（避免闭包问题）
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  
  // WikiLink 状态
  const [currentWikiLink, setCurrentWikiLink] = useState<WikiLink | null>(null);
  const [linkTargetExists, setLinkTargetExists] = useState(false);

  // 同步更新 lastCursorRef（当 initialCursor 变化时）
  if (initialCursor && !lastCursorRef.current) {
    lastCursorRef.current = initialCursor;
  }

  // 检测光标位置是否在 WikiLink 内
  const checkWikiLinkAtCursor = useCallback((cursorPos: number) => {
    const links = extractWikiLinks(content);
    for (const link of links) {
      if (cursorPos >= link.position.start && cursorPos <= link.position.end) {
        setCurrentWikiLink(link);
        const targetFile = findFileByWikiLinkTarget(link.target, files);
        setLinkTargetExists(targetFile !== undefined);
        return;
      }
    }
    setCurrentWikiLink(null);
    setLinkTargetExists(false);
  }, [content, files]);

  // 同时支持外部传入的 ref
  useImperativeHandle(ref, () => internalRef.current as HTMLTextAreaElement);

  // 保存光标位置的函数
  const saveCursorPosition = useCallback(() => {
    if (internalRef.current) {
      const { selectionStart, selectionEnd } = internalRef.current;
      lastCursorRef.current = { start: selectionStart, end: selectionEnd };
      onCursorChangeRef.current?.({ start: selectionStart, end: selectionEnd });
    }
  }, []);

  // 组件卸载时保存光标位置
  useEffect(() => {
    return () => {
      if (lastCursorRef.current) {
        onCursorChangeRef.current?.(lastCursorRef.current);
      }
    };
  }, []);

  // 恢复光标位置并滚动到可见区域
  useEffect(() => {
    if (!initialCursor || !internalRef.current) return;
    
    const textarea = internalRef.current;
    const currentSelectionStart = textarea.selectionStart;
    const currentSelectionEnd = textarea.selectionEnd;
    
    // 检查光标位置是否需要更新
    // 避免在 content 刚变化时立即重置光标（等待 handleCursorChange 更新状态）
    const cursorFromState = lastCursorRef.current;
    const isStateUpdated = cursorFromState && 
      (Math.abs(cursorFromState.start - currentSelectionStart) < 5 || 
       cursorFromState.start === initialCursor.start);
    
    const needsUpdate = !isStateUpdated && 
      (currentSelectionStart !== initialCursor.start || 
       currentSelectionEnd !== initialCursor.end);
    
    if (!needsUpdate) return;
    
    requestAnimationFrame(() => {
      if (!internalRef.current) return;
      
      // 1. 设置选区
      textarea.setSelectionRange(initialCursor.start, initialCursor.end);

      // 2. 计算光标所在行并滚动到该位置
      const textBeforeCursor = content.substring(0, initialCursor.start);
      const linesBeforeCursor = textBeforeCursor.split('\n').length;
      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
      const targetScrollTop = (linesBeforeCursor - 1) * lineHeight;
      
      console.log('[Plain] 滚动到行:', linesBeforeCursor, 'scrollTop:', targetScrollTop);
      textarea.scrollTop = Math.max(0, targetScrollTop);

      // 3. 最后 focus
      textarea.focus();
    });
  }, [initialCursor, content]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Check for Ctrl/Cmd
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo?.();
        } else {
          onUndo?.();
        }
      } else if (e.key === 'y') {
        e.preventDefault();
        onRedo?.();
      }
    }
  };

  // 保存光标位置（blur时触发）
  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd } = e.target;
    lastCursorRef.current = { start: selectionStart, end: selectionEnd };
    onCursorChange?.({ start: selectionStart, end: selectionEnd });
    // blur 时清除 WikiLink 状态
    setCurrentWikiLink(null);
    setLinkTargetExists(false);
  };

  // 跟踪光标位置变化（用于在卸载时保存正确位置，同时检测 WikiLink）
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    lastCursorRef.current = { start: target.selectionStart, end: target.selectionEnd };
    checkWikiLinkAtCursor(target.selectionStart);
  };

  return (
    <div className="flex-1 h-full min-h-0 w-full bg-paper-100 dark:bg-cyber-800 relative group transition-colors duration-300 flex flex-col overflow-hidden">
      <textarea
        ref={internalRef}
        className="flex-1 w-full p-8 bg-transparent text-slate-800 dark:text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-0 custom-scrollbar selection:bg-cyan-200 dark:selection:bg-cyber-500/30 placeholder-slate-400 dark:placeholder-slate-600 overflow-auto"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        onSelect={handleSelect}
        onBlur={handleBlur}
        placeholder="Type some cool markdown here..."
        spellCheck={false}
      />
      <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono pointer-events-none bg-white/80 dark:bg-cyber-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-200 dark:border-white/5 transition-colors">
        {content.length} chars
      </div>

      {/* WikiLink Status Bar */}
      {currentWikiLink && (
        <div className={`absolute bottom-0 left-0 right-0 px-4 py-2 text-xs border-t flex items-center gap-3 ${
          linkTargetExists 
            ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300' 
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
        }`}>
          <Link2 size={14} />
          <span className="flex-1">
            WikiLink: <strong>[[{currentWikiLink.alias || currentWikiLink.target}]]</strong>
          </span>
          {linkTargetExists ? (
            <button
              onClick={() => {
                const targetFile = findFileByWikiLinkTarget(currentWikiLink.target, files);
                if (targetFile && onNavigate) {
                  onNavigate(targetFile.id);
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-100 dark:hover:bg-cyan-800 transition-colors"
            >
              <ExternalLink size={12} />
              Navigate
            </button>
          ) : (
            <span className="flex items-center gap-1">
              <AlertCircle size={12} />
              Page not found
            </span>
          )}
        </div>
      )}
    </div>
  );
});

Editor.displayName = 'Editor';
