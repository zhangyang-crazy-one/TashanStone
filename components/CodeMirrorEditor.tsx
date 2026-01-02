import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, hoverTooltip, Tooltip, showTooltip } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, LanguageSupport } from '@codemirror/language';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { extractWikiLinks, WikiLink } from '../src/types/wiki';
import { findFileByWikiLinkTarget } from '../src/services/wiki/wikiLinkService';
import { FileText } from 'lucide-react';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCursorChange?: (position: { start: number; end: number }) => void;
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

          const tooltip: Tooltip = {
            pos: linkStart,
            end: linkEnd,
            above: true,
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
        lineHeight: '1.7',
        overflow: 'auto'
      },
      '.cm-content': {
        padding: '32px',
        caretColor: '#0ea5e9'
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#0ea5e9'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgba(6, 182, 212, 0.2)'
      },
      '.wikilink-highlight': {
        color: '#0891b2',
        fontWeight: '500',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '2px',
        cursor: 'pointer'
      },
      '.wikilink-not-found': {
        color: '#f59e0b',
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
      }
    })
  ];
};

export const CodeMirrorEditor: React.FC<EditorProps> = ({
  content,
  onChange,
  onUndo,
  onRedo,
  onCursorChange,
  initialCursor,
  files = [],
  onNavigate
}) => {
  const viewRef = useRef<EditorView | null>(null);
  const [currentWikiLink, setCurrentWikiLink] = useState<WikiLink | null>(null);
  const [linkTargetExists, setLinkTargetExists] = useState(false);
  const lastCursorRef = useRef<{ start: number; end: number } | null>(null);
  const initializedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // 使用 refs 存储最新的回调和状态，避免 extensions 重建
  const onCursorChangeRef = useRef(onCursorChange);
  const onNavigateRef = useRef(onNavigate);
  const filesRef = useRef(files);
  const currentWikiLinkRef = useRef(currentWikiLink);
  const linkTargetExistsRef = useRef(linkTargetExists);

  // 同步更新 refs
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
    onNavigateRef.current = onNavigate;
    filesRef.current = files;
  }, [onCursorChange, onNavigate, files]);

  useEffect(() => {
    currentWikiLinkRef.current = currentWikiLink;
    linkTargetExistsRef.current = linkTargetExists;
  }, [currentWikiLink, linkTargetExists]);

  const handleChange = useCallback((value: string) => {
    onChange(value);
  }, [onChange]);

  // 稳定的回调，使用 refs 获取最新值
  const handleCursorChange = useCallback((update: ViewUpdate) => {
    if (update.selectionSet) {
      const view = update.view;
      const { from, to } = view.state.selection.main;
      onCursorChangeRef.current?.({ start: from, end: to });

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

  // extensions 现在只在 files 变化时重建（用于 WikiLink 装饰）
  const extensions = React.useMemo(() => [
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(defaultHighlightStyle),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.updateListener.of(handleCursorChange),
    EditorView.domEventHandlers({
      click: handleClick
    }),
    ...getWikiLinkExtensions(files)
  ], [files]); // 只依赖 files，因为 WikiLink 装饰需要它

  useEffect(() => {
    if (!viewRef.current || !initialCursor) return;

    const view = viewRef.current;

    // 检查是否需要设置光标
    const currentSelection = view.state.selection.main;
    const needsInitialization = !initializedRef.current ||
      currentSelection.from !== initialCursor.start ||
      currentSelection.to !== initialCursor.end;

    if (!needsInitialization) return;

    initializedRef.current = true;

    // 使用 CodeMirror 内置的 scrollIntoView effect
    // 这是正确的方式，它会在适当的时机自动处理滚动
    view.dispatch({
      selection: { anchor: initialCursor.start, head: initialCursor.end },
      effects: EditorView.scrollIntoView(initialCursor.start, { y: 'center' })
    });

    // 短暂延迟后移除初始化状态
    requestAnimationFrame(() => {
      setIsInitializing(false);
    });
  }, [initialCursor]);

  // 同步外部 content 变化到 CodeMirror EditorView
  // 解决 Snippets 插入后内容不更新的问题
  // 同时避免在用户正常输入时干扰光标位置
  useEffect(() => {
    if (!viewRef.current) return;
    
    const view = viewRef.current;
    const currentContent = view.state.doc.toString();
    
    // 只有当内容真正不同时才同步
    if (currentContent !== content) {
      // 获取当前光标位置
      const currentSelection = view.state.selection.main;
      const currentPos = currentSelection.from;
      
      console.log('[CodeMirror] 同步内容变化');
      
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content
        }
      });
      
      // 恢复光标位置（同步后光标会回到开头）
      // 延迟执行以确保内容已更新
      requestAnimationFrame(() => {
        if (!viewRef.current) return;
        
        const newContent = viewRef.current.state.doc.toString();
        const newPos = Math.min(currentPos, newContent.length);
        
        viewRef.current.dispatch({
          selection: { anchor: newPos, head: newPos }
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
};

export default CodeMirrorEditor;
