
import React, { forwardRef, useEffect, useRef, useImperativeHandle, useCallback } from 'react';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCursorChange?: (position: { start: number; end: number }) => void;
  initialCursor?: { start: number; end: number };
}

export const Editor = forwardRef<HTMLTextAreaElement, EditorProps>(({
  content,
  onChange,
  onUndo,
  onRedo,
  onCursorChange,
  initialCursor
}, ref) => {
  // 内部 ref 用于光标恢复
  const internalRef = useRef<HTMLTextAreaElement>(null);
  // 保存最新的光标位置（用于组件卸载时保存）
  // 关键修复：用 initialCursor 初始化，避免 null 导致位置丢失
  const lastCursorRef = useRef<{ start: number; end: number } | null>(initialCursor || null);
  // 保存回调函数的引用（避免闭包问题）
  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;

  // 同步更新 lastCursorRef（当 initialCursor 变化时）
  if (initialCursor && !lastCursorRef.current) {
    lastCursorRef.current = initialCursor;
  }

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
    if (initialCursor && internalRef.current) {
      const textarea = internalRef.current;
      requestAnimationFrame(() => {
        if (internalRef.current) {
          // 1. 设置选区
          textarea.setSelectionRange(initialCursor.start, initialCursor.end);

          // 2. 计算光标所在行并滚动到该位置
          const textBeforeCursor = content.substring(0, initialCursor.start);
          const linesBeforeCursor = textBeforeCursor.split('\n').length;
          const computedStyle = window.getComputedStyle(textarea);
          const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
          const targetScrollTop = (linesBeforeCursor - 5) * lineHeight;
          textarea.scrollTop = Math.max(0, targetScrollTop);

          // 3. 最后 focus
          textarea.focus();
        }
      });
    }
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
  };

  // 跟踪光标位置变化（用于在卸载时保存正确位置）
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    lastCursorRef.current = { start: target.selectionStart, end: target.selectionEnd };
  };

  return (
    <div className="flex-1 h-full min-h-0 w-full bg-paper-100 dark:bg-cyber-800 relative group transition-colors duration-300 flex flex-col">
      <textarea
        ref={internalRef}
        className="flex-1 min-h-0 w-full p-8 bg-transparent text-slate-800 dark:text-slate-300 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-0 custom-scrollbar selection:bg-cyan-200 dark:selection:bg-cyber-500/30 placeholder-slate-400 dark:placeholder-slate-600"
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
    </div>
  );
});

Editor.displayName = 'Editor';
