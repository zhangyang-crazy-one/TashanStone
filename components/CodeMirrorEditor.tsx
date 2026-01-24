import React, { useEffect, useRef, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, hoverTooltip, Tooltip, showTooltip, keymap } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, LanguageSupport } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { extractWikiLinks, WikiLink } from '../src/types/wiki';
import { findFileByWikiLinkTarget } from '../src/services/wiki/wikiLinkService';
import { FileText } from 'lucide-react';
import type { CodeMirrorEditorRef } from '../types';
import { Buffer } from 'buffer';

// Image save result type
interface ImageSaveResult {
  success: boolean;
  path?: string;
  error?: string;
}

// Custom keymap for link insertion shortcuts (CodeMirror 6 format)
const linkInsertKeymap = keymap.of([
  {
    key: 'Ctrl-Alt-k',
    run: (view: EditorView) => {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'insert_wikilink' }));
      return true;
    }
  },
  {
    key: 'Ctrl-Alt-Shift-k',
    run: (view: EditorView) => {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'insert_blockref' }));
      return true;
    }
  },
  {
    key: 'Ctrl-Alt-l',
    run: (view: EditorView) => {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'quick_link' }));
      return true;
    }
  }
]);

// Export for external use
export { linkInsertKeymap };

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCursorChange?: (position: { start: number; end: number }) => void;
  onCursorSave?: (position: { anchor: number; head: number }) => void;  // 保存光标位置回调
  initialCursor?: { start: number; end: number };
  files?: Array<{ id: string; name: string; path?: string; content?: string }>;
  onNavigate?: (fileId: string) => void;
}

const wikiLinkDecoration = Decoration.mark({
  class: 'wikilink-highlight',
  attributes: {
    style: 'color: #0891b2; font-weight: 500; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px;'
  }
});

const wikiLinkNotFoundDecoration = Decoration.mark({
  class: 'wikilink-not-found',
  attributes: {
    style: 'color: #f59e0b; font-weight: 500; opacity: 0.7;'
  }
});

const createWikiLinkHoverTooltip = (files: Array<{ id: string; name: string; path?: string; content?: string }>) => {
  return hoverTooltip((view, pos) => {
    const { from, to } = view.state.doc.lineAt(pos);
    const lineStart = from;
    const lineEnd = to;
    const lineContent = view.state.doc.sliceString(lineStart, lineEnd);

    const links = extractWikiLinks(lineContent);
    for (const link of links) {
      const linkStart = lineStart + link.position.start;
      const linkEnd = lineStart + link.position.end;

      if (pos >= linkStart && pos <= linkEnd) {
        const target = link.target;
        const targetFile = findFileByWikiLinkTarget(target, files);

        if (targetFile) {
          const previewContent = targetFile.content?.slice(0, 200) || 'No preview available';

          const coords = view.coordsAtPos(pos);
          const spaceAbove = coords ? coords.top : 0;
          const spaceBelow = coords ? window.innerHeight - coords.bottom : 0;
          const above = coords ? spaceAbove > spaceBelow : true;

          const tooltip: Tooltip = {
            pos: linkStart,
            end: linkEnd,
            above,
            arrow: true,
            create: () => {
              const dom = document.createElement('div');
              dom.className = 'wikilink-tooltip-container';
              dom.innerHTML = `
                <div class="bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border border-cyan-200 dark:border-cyan-800 rounded-lg shadow-xl overflow-hidden p-3 max-w-xs">
                  <div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-cyan-500">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <span class="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">${targetFile.name}</span>
                  </div>
                  <div class="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    ${previewContent}${targetFile.content?.length > 200 ? '...' : ''}
                  </div>
                </div>
              `;
              return { dom };
            }
          };

          return tooltip;
        }
      }
    }

    return null;
  });
};

const createWikiLinkPlugin = (files: Array<{ id: string; name: string; path?: string; content?: string }>) => {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.getDecorations(view);
    }

    getDecorations(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const content = view.state.doc.toString();
      const links = extractWikiLinks(content);

      for (const link of links) {
        const from = link.position.start;
        const to = link.position.end;
        
        const target = link.target;
        const exists = files.some(f => findFileByWikiLinkTarget(target, [f]) !== undefined);

        const decoration = exists ? wikiLinkDecoration : wikiLinkNotFoundDecoration;
        builder.add(from, to, decoration);
      }

      return builder.finish();
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.getDecorations(update.view);
      }
    }
  }, {
    decorations: v => v.decorations
  });
};

const getWikiLinkExtensions = (files: Array<{ id: string; name: string; path?: string; content?: string }>) => {
  return [
    createWikiLinkPlugin(files),
    createWikiLinkHoverTooltip(files),
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px'
      },
      '.cm-scroller': {
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        lineHeight: '1.75',
        overflow: 'auto',
        paddingBottom: '50vh' // Allow scrolling past end
      },
      '.cm-content': {
        padding: '32px',
        caretColor: 'rgb(var(--primary-500))'
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'rgb(var(--primary-500))'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgba(var(--primary-500), 0.15)'
      },
      '.wikilink-highlight': {
        color: 'rgb(var(--primary-600))',
        fontWeight: '500',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '2px',
        cursor: 'pointer'
      },
      '.wikilink-not-found': {
        color: 'rgb(var(--secondary-500))',
        fontWeight: '500',
        opacity: '0.7',
        cursor: 'not-allowed'
      },
      '.cm-tooltip': {
        border: 'none',
        backgroundColor: 'transparent',
        boxShadow: 'none'
      },
      '.cm-tooltip-arrow': {
        display: 'none'
      },
      '.cm-tooltip-below': {
        transform: 'translateY(-8px)'
      },
      '.wikilink-tooltip-container': {
        padding: '0'
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: 'none',
        color: 'rgb(var(--text-secondary))',
        opacity: '0.5'
      }
    })
  ];
};

export const CodeMirrorEditor = forwardRef<CodeMirrorEditorRef, EditorProps>(({
  content,
  onChange,
  onUndo,
  onRedo,
  onCursorChange,
  onCursorSave,  // 保存光标位置回调
  initialCursor,
  files = [],
  onNavigate
}, ref) => {
  const viewRef = useRef<EditorView | null>(null);
  const [currentWikiLink, setCurrentWikiLink] = useState<WikiLink | null>(null);
  const [linkTargetExists, setLinkTargetExists] = useState(false);
  const lastCursorRef = useRef<{ start: number; end: number } | null>(null);
  const initializedRef = useRef(false);
  const mountedRef = useRef(true); // 防止组件卸载后 requestAnimationFrame 执行
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const initializingRef = useRef(true);

  const stopInitializing = useCallback(() => {
    if (!initializingRef.current) return;
    initializingRef.current = false;
    setIsInitializing(false);
  }, []);

  // 使用 refs 存储最新的回调和状态，避免 extensions 重建
  const onCursorChangeRef = useRef(onCursorChange);
  const onCursorSaveRef = useRef(onCursorSave);  // 保存光标位置的 ref
  const onNavigateRef = useRef(onNavigate);
  const filesRef = useRef(files);
  const currentWikiLinkRef = useRef(currentWikiLink);
  const linkTargetExistsRef = useRef(linkTargetExists);

  // Monitor resize to force refresh
  // 🔍 调试日志：组件卸载前保存光标
  useEffect(() => {
    if (!containerRef.current || !viewRef.current) return;
    
    const observer = new ResizeObserver(() => {
      if (viewRef.current) {
        viewRef.current.requestMeasure();
      }
    });
    
    observer.observe(containerRef.current);
    
    // Also force a measure after a short delay to handle animation transitions
    const timers = [
      setTimeout(() => viewRef.current?.requestMeasure(), 100),
      setTimeout(() => viewRef.current?.requestMeasure(), 300),
      setTimeout(() => viewRef.current?.requestMeasure(), 500)
    ];
    
    return () => {
      mountedRef.current = false; // 防止组件卸载后 requestAnimationFrame 执行
      observer.disconnect();
      timers.forEach(clearTimeout);

      // 组件卸载前保存光标
      if (viewRef.current && onCursorSaveRef.current) {
        const { anchor, head } = viewRef.current.state.selection.main;
        onCursorSaveRef.current({ anchor, head });
      }
    };
  }, []);

  // 同步更新 refs
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
    onCursorSaveRef.current = onCursorSave;
    onNavigateRef.current = onNavigate;
    filesRef.current = files;
  }, [onCursorChange, onCursorSave, onNavigate, files]);

  useEffect(() => {
    currentWikiLinkRef.current = currentWikiLink;
    linkTargetExistsRef.current = linkTargetExists;
  }, [currentWikiLink, linkTargetExists]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    view: viewRef.current,
    insertText: (text: string) => {
      if (!viewRef.current) return;
      const { state } = viewRef.current;
      const selection = state.selection.main;
      viewRef.current.dispatch({
        changes: { from: selection.from, to: selection.to, insert: text },
        selection: { anchor: selection.from + text.length }
      });
    },
    getSelection: () => {
      if (!viewRef.current) return '';
      const { state } = viewRef.current;
      return state.sliceDoc(state.selection.main.from, state.selection.main.to);
    }
  }));

  const handleChange = useCallback((value: string) => {
    onChange(value);
  }, [onChange]);

  // 稳定的回调，使用 refs 获取最新值
  // 修复光标记忆：同时调用 onCursorSave 保存光标位置
  const handleCursorChange = useCallback((update: ViewUpdate) => {
    if (update.selectionSet) {
      const view = update.view;
      const { from, to, anchor, head } = view.state.selection.main;
      
      // 通知父组件光标变化
      onCursorChangeRef.current?.({ start: from, end: to });
      
      // 保存光标位置（用于切换文件时恢复）
      onCursorSaveRef.current?.({ anchor, head });

      const content = view.state.doc.toString();
      const links = extractWikiLinks(content);

      for (const link of links) {
        if (from >= link.position.start && from <= link.position.end) {
          setCurrentWikiLink(link);
          const targetFile = findFileByWikiLinkTarget(link.target, filesRef.current);
          setLinkTargetExists(targetFile !== undefined);
          return;
        }
      }
      setCurrentWikiLink(null);
      setLinkTargetExists(false);
    }
  }, []); // 无依赖，回调稳定

  const handleClick = useCallback((event: MouseEvent, view: EditorView) => {
    const wikiLink = currentWikiLinkRef.current;
    const exists = linkTargetExistsRef.current;
    if (wikiLink && exists) {
      const targetFile = findFileByWikiLinkTarget(wikiLink.target, filesRef.current);
      if (targetFile && onNavigateRef.current) {
        onNavigateRef.current(targetFile.id);
      }
    }
  }, []); // 无依赖，回调稳定

  // Handle image paste event
  const handlePaste = useCallback((event: ClipboardEvent, view: EditorView) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          handleImagePaste(file, view);
          return;
        }
      }
    }
  }, []); // 无依赖，回调稳定

  // Handle image paste - save image and insert Markdown
  const handleImagePaste = useCallback(async (file: File, view: EditorView) => {
    try {
      // Check if running in Electron environment
      if (window.electronAPI?.ipcInvoke) {
        // Read file as array buffer and convert to base64
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type || 'image/png';

        // Save image via IPC and get the relative path
        const result = await window.electronAPI.ipcInvoke('image:save', {
          imageData: `data:${mimeType};base64,${base64}`,
          fileName: file.name
        }) as ImageSaveResult;

        if (result.success && result.path) {
          // Insert Markdown image syntax at cursor position
          // Use encodeURI to handle special characters in path (spaces, Chinese chars, etc.)
          const markdownImage = `![${file.name}](<${encodeURI(result.path)}>)\n`;
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: markdownImage },
            selection: { anchor: from + markdownImage.length }
          });
        } else {
          console.error('[ImagePaste] Failed to save image:', result.error);
          // Fallback: insert as data URL
          const markdownImage = `![${file.name}](<data:${mimeType};base64,${base64}>)\n`;
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: markdownImage },
            selection: { anchor: from + markdownImage.length }
          });
        }
      } else {
        // Web environment fallback: use data URL directly
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const markdownImage = `![${file.name}](${dataUrl})\n`;
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: markdownImage },
            selection: { anchor: from + markdownImage.length }
          });
        };
        reader.readAsDataURL(file);
      }
    } catch (error) {
      console.error('[ImagePaste] Error handling pasted image:', error);
    }
  }, []); // 无依赖，回调稳定

  // extensions 现在只在 files 变化时重建（用于 WikiLink 装饰）
  const extensions = React.useMemo(() => [
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(defaultHighlightStyle),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    linkInsertKeymap,  // Add link insertion shortcuts
    EditorView.lineWrapping,
    EditorView.updateListener.of(handleCursorChange),
    EditorView.domEventHandlers({
      click: handleClick,
      paste: handlePaste
    }),
    ...getWikiLinkExtensions(files)
  ], [files]); // 只依赖 files，因为 WikiLink 装饰需要它

  const initialCursorStart = initialCursor?.start ?? null;
  const initialCursorEnd = initialCursor?.end ?? null;

  useEffect(() => {
    if (!viewRef.current || initialCursorStart === null || initialCursorEnd === null) return;

    const view = viewRef.current;

    // 检查是否需要设置光标
    const currentSelection = view.state.selection.main;
    const needsInitialization = !initializedRef.current ||
      currentSelection.from !== initialCursorStart ||
      currentSelection.to !== initialCursorEnd;

    if (!needsInitialization) {
      stopInitializing();
      return;
    }

    initializedRef.current = true;

    // 使用 CodeMirror 内置的 scrollIntoView effect
    // 这是正确的方式，它会在适当的时机自动处理滚动
    view.dispatch({
      selection: { anchor: initialCursorStart, head: initialCursorEnd },
      effects: EditorView.scrollIntoView(initialCursorStart, { y: 'center' })
    });

    // 短暂延迟后移除初始化状态
    requestAnimationFrame(() => {
      stopInitializing();
    });
  }, [initialCursorStart, initialCursorEnd, stopInitializing]);

  // 强力备用机制：无论如何，在组件挂载短暂延迟后必须显示编辑器
  // 这解决了 viewRef 尚未准备好导致 Mount Effect 失效的问题，防止白屏
  useEffect(() => {
    const timer = setTimeout(() => {
      stopInitializing();
    }, 100); // 100ms 兜底
    return () => clearTimeout(timer);
  }, [stopInitializing]);

  // 同步外部 content 变化到 CodeMirror EditorView
  // 解决 Snippets 插入后内容不更新的问题
  // 同时处理 initialCursor 恢复光标位置
  useEffect(() => {
    if (!viewRef.current) return;
    
    const view = viewRef.current;
    const currentContent = view.state.doc.toString();
    let needsCursorRestore = false;
    
    // 如果 content 不同，需要同步
    if (currentContent !== content) {
      // 获取当前光标位置
      const currentSelection = view.state.selection.main;
      const currentPos = currentSelection.from;
      
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content
        }
      });
      
      // 如果有 initialCursor，使用它；否则恢复到之前的位置
      needsCursorRestore = true;
    } else if (initialCursor) {
      // 内容相同但有 initialCursor，检查是否需要应用
      const currentSelection = view.state.selection.main;
      if (currentSelection.from !== initialCursor.start || currentSelection.to !== initialCursor.end) {
        needsCursorRestore = true;
      }
    }
    
    // 恢复光标位置
    if (needsCursorRestore) {
      const cursorPos = initialCursor || { 
        start: view.state.selection.main.from, 
        end: view.state.selection.main.to 
      };
      
      // 延迟执行以确保内容已更新
      requestAnimationFrame(() => {
        if (!viewRef.current) return;
        
        const newContent = viewRef.current.state.doc.toString();
        const newStart = Math.min(cursorPos.start, newContent.length);
        const newEnd = Math.min(cursorPos.end, newContent.length);
        
        viewRef.current.dispatch({
          selection: { anchor: newStart, head: newEnd },
          effects: EditorView.scrollIntoView(newStart, { y: 'center' })
        });
      });
    }
  }, [content]);

  return (
    <div 
      ref={containerRef}
      className={`flex-1 h-full min-h-0 w-full bg-paper-100 dark:bg-cyber-800 relative group transition-colors duration-300 flex flex-col overflow-auto codemirror-container ${isInitializing ? 'codemirror-initializing' : ''}`}
    >
      <CodeMirror
        value={content}
        height="100%"
        extensions={extensions}
        onChange={handleChange}
        theme="none"
        editable={true}
        readOnly={false}
        onCreateEditor={(view: EditorView) => {
          viewRef.current = view;
          
          // 修复：在编辑器创建后立即恢复光标
          // 这是关键修复！因为 useEffect [initialCursor] 可能在 viewRef 还没准备好时就运行了
          // 所以我们需要在 onCreateEditor 中也处理光标恢复
          if (initialCursor && mountedRef.current) {
            requestAnimationFrame(() => {
              if (mountedRef.current && viewRef.current) {
                const currentSelection = viewRef.current.state.selection.main;
                const needsRestore = currentSelection.from !== initialCursor.start ||
                                      currentSelection.to !== initialCursor.end;

                if (needsRestore) {
                  viewRef.current.dispatch({
                    selection: { anchor: initialCursor.start, head: initialCursor.end },
                    effects: EditorView.scrollIntoView(initialCursor.start, { y: 'center' })
                  });
                }
              }
            });
          }

          // 编辑器实例创建后，请求下一帧显示
          requestAnimationFrame(() => {
            if (mountedRef.current) {
              stopInitializing();
            }
          });

          // 光标记忆：添加 blur 事件处理器，在编辑器失去焦点时保存光标
          view.dom.addEventListener('blur', () => {
            if (viewRef.current) {
              const { anchor, head } = viewRef.current.state.selection.main;
              onCursorSaveRef.current?.({ anchor, head });
            }
          });

          // 最健壮的修复：使用 IntersectionObserver 检测可见性变化
          // 当编辑器容器变为可见时，调用 requestMeasure() 强制 CodeMirror 重新测量和渲染
          // 这解决了切换视图模式时出现的空白问题
          if (typeof IntersectionObserver !== 'undefined') {
            const observer = new IntersectionObserver(
              (entries) => {
                const entry = entries[0];
                // 当编辑器进入视口且当前不在视口中时，强制刷新
                if (entry.isIntersecting && viewRef.current && !viewRef.current.inView) {
                  // 使用 requestMeasure 安排测量，这是 CodeMirror 推荐的方式
                  viewRef.current.requestMeasure();
                }
              },
              { threshold: 0.001 }
            );
            
            observer.observe(view.dom);
            
            // 同时监听父容器（处理 flex 布局变化等场景）
            if (containerRef.current) {
              const resizeObserver = new ResizeObserver(() => {
                if (viewRef.current) {
                  viewRef.current.requestMeasure();
                }
              });
              resizeObserver.observe(containerRef.current);
              
              // 将 resizeObserver 存储在 DOM 元素上，以便清理
              (view.dom as any).__resizeObserver = resizeObserver;
            }
            
            // 将 observer 存储在 DOM 元素上，以便在组件卸载时清理
            (view.dom as any).__intersectionObserver = observer;
          }
        }}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true
        }}
      />
      
      <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono pointer-events-none bg-white/80 dark:bg-cyber-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-200 dark:border-white/5 transition-colors">
        {content.length} chars
      </div>

      {currentWikiLink && (
        <div className={`absolute bottom-0 left-0 right-0 px-4 py-2 text-xs border-t flex items-center gap-3 ${
          linkTargetExists 
            ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300' 
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
        }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span className="flex-1">
            WikiLink: <strong>[[{currentWikiLink.alias || currentWikiLink.target}]]</strong>
          </span>
          {linkTargetExists ? (
            <button
              onClick={() => {
                const target = currentWikiLink.target.toLowerCase();
                const targetFile = files.find(f => 
                  f.name.toLowerCase() === target ||
                  f.path?.toLowerCase()?.endsWith(`/${target}`) ||
                  f.name.toLowerCase() === `${target}.md`
                );
                if (targetFile && onNavigate) {
                  onNavigate(targetFile.id);
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-100 dark:hover:bg-cyan-800 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Navigate
            </button>
          ) : (
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Page not found
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default CodeMirrorEditor;
