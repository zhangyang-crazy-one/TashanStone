import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { visit } from 'unist-util-visit';
import { Check, Copy, FileCode, Terminal, AlertTriangle, ZoomIn, ZoomOut, Maximize, WrapText, FileJson, ImageOff, ExternalLink, GraduationCap, HelpCircle, Link2, FileText, Tag } from 'lucide-react';
import mermaid from 'mermaid';
import { preprocessWikiLinks, extractBlockReferencesWithContent } from '../src/types/wiki';
import { MarkdownFile } from '../types';
import { findFileByWikiLinkTarget } from '../src/services/wiki/wikiLinkService';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

// --- Types ---
interface PreviewProps {
  content: string;
  initialScrollRatio?: number;
  files?: MarkdownFile[];
  language?: Language;
}

// --- Rehype Plugin to skip mermaid code blocks from highlighting ---
// This prevents rehype-highlight from processing mermaid blocks
const rehypeSkipMermaid = () => {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      // Find code elements with language-mermaid class
      if (node.tagName === 'code' && node.properties?.className) {
        const classes = Array.isArray(node.properties.className)
          ? node.properties.className
          : [node.properties.className];
        if (classes.some((c: string) => c === 'language-mermaid' || c === 'mermaid')) {
          // Add a marker class to skip highlighting
          node.properties['data-no-highlight'] = true;
        }
      }
    });
  };
};

// --- Rehype Plugin to filter dangerous HTML attributes ---
// Removes event handlers (onclick, onmouseover, etc.) and contentEditable
const rehypeFilterAttributes = () => {
  return (tree: any) => {
    visit(tree, 'element', (node: any) => {
      if (node.properties) {
        // List of attributes to remove
        const dangerousAttrs = Object.keys(node.properties).filter(attr => {
          const lowerAttr = attr.toLowerCase();
          // Remove event handlers (on*)
          if (lowerAttr.startsWith('on')) return true;
          // Remove contentEditable
          if (lowerAttr === 'contenteditable') return true;
          return false;
        });
        dangerousAttrs.forEach(attr => {
          delete node.properties[attr];
        });
      }
    });
  };
};

// --- Rehype Plugin to transform Block References ---
// Transforms <<PageName:LineNumber>> or (((PageName#LineNumber))) into custom elements
// IMPORTANT: This is a plugin factory that returns a rehype plugin
const rehypeBlockReferences = (files: MarkdownFile[]) => {
  // Return the actual plugin function (this is what unified expects)
  return () => (tree: any) => {
    if (!tree || typeof tree !== 'object') return;

    try {
      visit(tree, 'text', (node: any, index, parent: any) => {
        // Guard: skip if parent or index is undefined
        if (!parent || index === undefined || !node?.value) return;

        const value = node.value;

        // 支持三种格式:
        // 1. <<filename:line>> 或 <<filename:start-end>>
        // 2. <<{filename}:{line}>> 或 <<{filename}:{start}-{end}>>
        // 3. (((filename#line))) 或 (((filename#start-end))) - 新格式
        const blockRefRegex = /(?:<<\{?([^:}]+)\}?:\{?(\d+)\}?(?:-\{?(\d+)\}?)?>>(?!>)|\(\(\(([^#)]+)#(\d+)(?:-(\d+))?\)\)\))/g;
        const matches = [...value.matchAll(blockRefRegex)];

        if (matches.length > 0) {
          const children: any[] = [];
          let lastIndex = 0;

          matches.forEach((match, idx) => {
            if (match.index > lastIndex) {
              children.push({
                type: 'text',
                value: value.slice(lastIndex, match.index)
              });
            }

            // Handle both formats: match[1-3] for <<>> format, match[4-6] for ((())) format
            const target = (match[1] || match[4])?.trim();
            const startLine = parseInt(match[2] || match[5], 10);
            const endLine = match[3] ? parseInt(match[3], 10) : (match[6] ? parseInt(match[6], 10) : startLine);

            if (target && !isNaN(startLine)) {
              children.push({
                type: 'element',
                tagName: 'blockref',
                properties: {
                  'data-target': target,
                  'data-start-line': startLine,
                  'data-end-line': endLine
                },
                children: [{ type: 'text', value: `${target}#${startLine}${endLine > startLine ? `-${endLine}` : ''}` }]
              });
            }

            lastIndex = match.index + match[0].length;
          });

          if (lastIndex < value.length) {
            children.push({
              type: 'text',
              value: value.slice(lastIndex)
            });
          }

          parent.children.splice(index, 1, ...children);
        }
      });
    } catch (e) {
      // Silently ignore tree traversal errors
    }
  };
};

// --- Rehype Plugin to transform WikiLinks ---
// Transforms [[Link]] or [[Link|Alias]] into custom elements with data-wikilink attribute
const rehypeWikiLinks = () => {
  return (tree: any) => {
    if (!tree || typeof tree !== 'object') return;

    try {
      visit(tree, 'text', (node: any, index, parent: any) => {
        // Guard: skip if parent or index is undefined
        if (!parent || index === undefined || !node?.value) return;

        const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        const value = node.value;
        const matches = [...value.matchAll(wikiLinkRegex)];

        if (matches.length > 0) {
          const children: any[] = [];
          let lastIndex = 0;

          matches.forEach((match) => {
            // Add text before the match
            if (match.index > lastIndex) {
              children.push({
                type: 'text',
                value: value.slice(lastIndex, match.index)
              });
            }

            // 移除首尾花括号，支持 [[{target}|{alias}]] 格式
            const target = match[1].trim().replace(/^\{|\}$/g, '');
            const alias = match[2]?.trim().replace(/^\{|\}$/g, '');

            // Create a custom element for the wiki link
            children.push({
              type: 'element',
              tagName: 'wikilink',
              properties: {
                'data-target': target,
                'data-alias': alias || target
              },
              children: [{ type: 'text', value: alias || target }]
            });

            lastIndex = match.index + match[0].length;
          });

          // Add remaining text
          if (lastIndex < value.length) {
            children.push({
              type: 'text',
              value: value.slice(lastIndex)
            });
          }

          // Replace the text node with new nodes
          parent.children.splice(index, 1, ...children);
        }
      });
    } catch (e) {
      // Silently ignore tree traversal errors
      console.warn('[Preview] WikiLink parsing error:', e);
    }
  };
};

// --- Rehype Plugin to transform Hashtags ---
// Transforms #[tag-name] into custom clickable/styled elements
const rehypeTags = () => {
  return (tree: any) => {
    if (!tree || typeof tree !== 'object') return;

    try {
      visit(tree, 'text', (node: any, index, parent: any) => {
        // Guard: skip if parent or index is undefined
        if (!parent || index === undefined || !node?.value) return;
        // Skip if inside code or pre elements
        if (parent.tagName === 'code' || parent.tagName === 'pre') return;

        // Match #[tag-name] format (supports Chinese, spaces, dash, underscore)
        const hashtagRegex = /#\[([^\]]+)\]/g;
        const value = node.value;
        const matches = [...value.matchAll(hashtagRegex)];

        if (matches.length > 0) {
          const children: any[] = [];
          let lastIndex = 0;

          matches.forEach((match) => {
            const fullMatch = match[0];
            const tag = match[1]; // The tag content inside brackets
            const matchStart = match.index!;

            // Add text before the tag
            if (matchStart > lastIndex) {
              children.push({
                type: 'text',
                value: value.slice(lastIndex, matchStart)
              });
            }

            // Create a custom element for the hashtag
            children.push({
              type: 'element',
              tagName: 'hashtag',
              properties: {
                'data-tag': tag
              },
              children: [{ type: 'text', value: `#[${tag}]` }]
            });

            lastIndex = matchStart + fullMatch.length;
          });

          // Add remaining text
          if (lastIndex < value.length) {
            children.push({
              type: 'text',
              value: value.slice(lastIndex)
            });
          }

          // Replace the text node with new nodes
          parent.children.splice(index, 1, ...children);
        }
      });
    } catch (e) {
      // Silently ignore tree traversal errors
      console.warn('[Preview] Hashtag parsing error:', e);
    }
  };
};

// --- Utils ---
// Generate slug from text (supports Chinese characters)
const generateSlug = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\u4e00-\u9fa5-]/g, '') // Keep only word chars, Chinese, and hyphens
    .replace(/--+/g, '-')           // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start
    .replace(/-+$/, '');            // Trim - from end
};

// Extract text from React children (handles cases where highlighting splits text into spans)
const extractText = (children: React.ReactNode): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (typeof children === 'object' && children !== null && 'props' in children) {
    return extractText((children as any).props.children);
  }
  return '';
};

const PREVIEW_MARGIN = 12;
const PREVIEW_FALLBACK_WIDTH = 320;
const PREVIEW_FALLBACK_HEIGHT = 180;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const useFloatingPreview = (
  isOpen: boolean,
  triggerRef: React.RefObject<HTMLElement>,
  preferredPlacement: 'top' | 'bottom' = 'bottom'
) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: PREVIEW_FALLBACK_WIDTH, height: PREVIEW_FALLBACK_HEIGHT });
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const [arrowOffset, setArrowOffset] = useState(12);
  const [placement, setPlacement] = useState<'top' | 'bottom'>(preferredPlacement);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;

    const rect = triggerRef.current.getBoundingClientRect();
    const { width, height } = sizeRef.current;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    let nextPlacement = preferredPlacement;

    if (preferredPlacement === 'top' && spaceAbove < height + PREVIEW_MARGIN && spaceBelow > spaceAbove) {
      nextPlacement = 'bottom';
    }
    if (preferredPlacement === 'bottom' && spaceBelow < height + PREVIEW_MARGIN && spaceAbove > spaceBelow) {
      nextPlacement = 'top';
    }

    const preferredTop = nextPlacement === 'top'
      ? rect.top - height - PREVIEW_MARGIN
      : rect.bottom + PREVIEW_MARGIN;
    const preferredLeft = rect.left + rect.width / 2 - width / 2;

    const left = clamp(preferredLeft, PREVIEW_MARGIN, Math.max(PREVIEW_MARGIN, window.innerWidth - width - PREVIEW_MARGIN));
    const top = clamp(preferredTop, PREVIEW_MARGIN, Math.max(PREVIEW_MARGIN, window.innerHeight - height - PREVIEW_MARGIN));

    const centerX = rect.left + rect.width / 2;
    const arrowX = clamp(centerX - left - 6, 10, width - 20);

    setPopupPos({ top, left });
    setArrowOffset(arrowX);
    setPlacement(nextPlacement);
  }, [preferredPlacement, triggerRef]);

  useEffect(() => {
    if (!isOpen || !popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    sizeRef.current = { width: rect.width, height: rect.height };
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePosition]);

  return { popupRef, popupPos, arrowOffset, placement };
};

// --- WikiLink Preview Component for use in Preview.tsx ---
interface WikiLinkPreviewProps {
  target: string;
  alias?: string;
  files?: MarkdownFile[];
  onNavigate?: (fileId: string) => void;
}

const WikiLinkPreview: React.FC<WikiLinkPreviewProps> = ({ target, alias, files }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [targetFile, setTargetFile] = useState<{ id: string; name: string; path?: string; content?: string; lastModified?: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { popupRef, popupPos, arrowOffset, placement } = useFloatingPreview(showPreview, triggerRef, 'bottom');

  // 防御性检查：确保 files 是数组
  const safeFiles = files || [];

  const isExamLink = target?.toLowerCase().startsWith('exam:') ?? false;
  const isQuestionLink = target?.toLowerCase().startsWith('question:') ?? false;

  const displayText = alias || target || '';
  const href = `?wiki=${encodeURIComponent(target || '')}`;

  // Find target file for preview
  useEffect(() => {
    if (target && !isExamLink && !isQuestionLink && safeFiles.length > 0) {
      const file = findFileByWikiLinkTarget(target, safeFiles);
      setTargetFile(file || null);
    }
  }, [target, safeFiles, isExamLink, isQuestionLink]);

  const handleMouseEnter = () => {
    if (isExamLink || isQuestionLink) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowPreview(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPreview(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isExamLink || isQuestionLink) {
      window.dispatchEvent(new CustomEvent('navigate-to-wikilink', { detail: { target } }));
      return;
    }
    window.dispatchEvent(new CustomEvent('navigate-to-wikilink', { detail: { target } }));
  };

  if (isExamLink) {
    return (
      <a
        href={href}
        onClick={handleClick}
        className="inline-flex items-center gap-1 font-semibold text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
      >
        <GraduationCap size={14} />
        <span>{displayText}</span>
      </a>
    );
  }

  if (isQuestionLink) {
    return (
      <a
        href={href}
        onClick={handleClick}
        className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
      >
        <HelpCircle size={14} />
        <span>{displayText}</span>
      </a>
    );
  }

  return (
    <span
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <a
        href={href}
        onClick={handleClick}
        className={`inline-flex items-center gap-0.5 font-semibold rounded px-1 -mx-1 cursor-pointer no-underline ${targetFile
          ? 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/30'
          : 'text-slate-400 dark:text-slate-500 hover:text-red-400'
          }`}
      >
        <ExternalLink size={12} className="opacity-60" />
        <span className="border-b border-dashed border-current">{displayText}</span>
      </a>

      {/* Hover Preview Popup - Auto Placement */}
      {showPreview && targetFile && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 9999 }}
          className="w-72 pointer-events-none"
        >
          <div
            className={`w-3 h-3 bg-white/95 dark:bg-gray-800/95 rotate-45 absolute border-l border-t border-gray-200 dark:border-gray-700 ${
              placement === 'top' ? '-bottom-1.5' : '-top-1.5'
            }`}
            style={{ left: `${arrowOffset}px` }}
          />
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden p-3">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
              <FileText size={14} className="text-cyan-500 flex-shrink-0" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{targetFile.name}</span>
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-6 leading-relaxed whitespace-pre-wrap">
              {(targetFile.content || '').slice(0, 300).replace(/[#*`_~]/g, '')}...
            </div>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
};

// --- Block Reference Preview Component ---
interface BlockReferencePreviewProps {
  target: string;
  startLine: number;
  endLine?: number;
  files?: MarkdownFile[];
}

const BlockReferencePreview: React.FC<BlockReferencePreviewProps> = ({ target, startLine, endLine, files }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [blockContent, setBlockContent] = useState('');
  const [fileExists, setFileExists] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { popupRef, popupPos, arrowOffset, placement } = useFloatingPreview(showPreview, triggerRef, 'bottom');

  // 防御性检查：确保 files 是数组
  const safeFiles = files || [];

  useEffect(() => {
    if (!target || safeFiles.length === 0) {
      setFileExists(false);
      return;
    }

    const targetLower = target.toLowerCase();
    // 移除 .md 扩展名进行比较
    const targetWithoutExt = targetLower.replace(/\.md$/i, '');

    const targetFile = safeFiles.find(f => {
      const name = f.name.toLowerCase();
      // 移除 .md 扩展名进行比较
      const nameWithoutExt = name.replace(/\.md$/i, '');
      // 比较不带扩展名的名称
      return nameWithoutExt === targetWithoutExt;
    });

    if (targetFile) {
      setFileExists(true);
      const lines = targetFile.content.split('\n');
      if (endLine && endLine >= startLine && endLine <= lines.length) {
        setBlockContent(lines.slice(startLine - 1, endLine).join('\n').trim());
      } else if (startLine <= lines.length) {
        setBlockContent(lines[startLine - 1].trim());
      }
    } else {
      setFileExists(false);
    }
  }, [target, startLine, endLine, safeFiles]);

  const formatLabel = () => {
    if (endLine && endLine > startLine) {
      return `(((${target}#${startLine}-${endLine})))`;
    }
    return `(((${target}#${startLine})))`;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (safeFiles.length === 0) return;

    const targetFile = safeFiles.find(f => {
      const name = f.name.toLowerCase();
      const targetLower = target.toLowerCase();
      return name === targetLower ||
        name === `${targetLower}.md` ||
        f.path?.toLowerCase()?.endsWith(`/${targetLower}`) ||
        f.path?.toLowerCase()?.endsWith(`/${targetLower}.md`);
    });
    if (targetFile) {
      window.dispatchEvent(new CustomEvent('navigate-to-wikilink', { detail: { target } }));
    }
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowPreview(true);
    }, 500);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setShowPreview(false);
    }, 100); // 小延迟让鼠标有时间移到预览框
  };

  const handlePopupEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  const handlePopupLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPreview(false);
  };

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center gap-1 group cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <Link2 size={12} className="text-orange-500" />
      <code className={`
        text-xs px-1.5 py-0.5 rounded font-mono
        ${fileExists
          ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}
      `}>
        {formatLabel()}
      </code>

      {/* 使用 Portal 渲染到 body，避免父元素拦截滚动事件 */}
      {showPreview && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: popupPos.top,
            left: popupPos.left,
            zIndex: 9999
          }}
          className="w-80"
          onMouseEnter={handlePopupEnter}
          onMouseLeave={handlePopupLeave}
        >
          {/* 箭头指示器 */}
          <div
            className={`w-3 h-3 bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-900/80 dark:to-amber-900/60 rotate-45 absolute border-l border-t border-orange-300 dark:border-orange-700 ${
              placement === 'top' ? '-bottom-1.5' : '-top-1.5'
            }`}
            style={{ left: `${arrowOffset}px` }}
          />

          {/* 主容器 */}
          <div className="bg-gradient-to-br from-white/98 to-orange-50/90 dark:from-cyber-900/98 dark:to-orange-950/80 backdrop-blur-xl border border-orange-300/60 dark:border-orange-700/60 rounded-xl shadow-2xl shadow-orange-500/10 dark:shadow-orange-500/5 overflow-hidden">
            {/* 头部标题栏 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-100/80 to-amber-50/60 dark:from-orange-900/40 dark:to-amber-900/30 border-b border-orange-200/60 dark:border-orange-800/40">
              <Link2 size={12} className="text-orange-500 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-300 truncate">
                {target}
              </span>
              <span className="text-[10px] font-mono text-orange-500/70 dark:text-orange-400/60 ml-auto flex-shrink-0">
                {endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`}
              </span>
            </div>

            {/* 内容区域 */}
            <div className="max-h-52 overflow-y-auto custom-scrollbar">
              {blockContent ? (
                <div className="p-3">
                  <div className="flex text-xs font-mono">
                    {/* 行号列 */}
                    <div className="select-none pr-3 text-right border-r border-orange-200/40 dark:border-orange-800/30 mr-3 text-orange-400/60 dark:text-orange-500/40">
                      {blockContent.split('\n').map((_, i) => (
                        <div key={i} className="leading-5">{startLine + i}</div>
                      ))}
                    </div>
                    {/* 代码内容 */}
                    <pre className="flex-1 text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-all m-0 leading-5">
                      {blockContent}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic m-0 p-3">
                  {fileExists ? 'Content not available' : 'File not found'}
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
};

// --- Sub-Components ---

/**
 * MermaidRenderer: Handles rendering of embedded Mermaid diagrams
 * Includes Pan/Zoom and Error Handling
 */
const MermaidRenderer = ({ code, isDark }: { code: string, isDark: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const render = async () => {
      if (!code) return;
      try {
        setError(null);

        // Dynamic Theme Color Extraction
        const style = getComputedStyle(document.documentElement);
        // Helper to extract rgb values and format as needed
        const getVar = (name: string) => {
          const val = style.getPropertyValue(name).trim();
          // Tailwind vars in this project are like '11 17 33'. RGB() needs commas or spaces.
          return val ? `rgb(${val.split(' ').join(', ')})` : '';
        };

        // Fallback colors if vars missing (safety)
        const primary = getVar('--primary-500') || (isDark ? '#06b6d4' : '#0891b2');
        const line = getVar('--neutral-500') || (isDark ? '#94a3b8' : '#475569');
        const bg = 'transparent';

        // Configure Mermaid based on theme
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'loose',
          fontFamily: 'JetBrains Mono, monospace',
          themeVariables: {
            darkMode: isDark,
            background: bg,
            primaryColor: primary,
            lineColor: line,
            textColor: getVar('--text-primary'),
            mainBkg: bg,
            nodeBorder: primary
          }
        });

        const id = `mermaid-embed-${Math.random().toString(36).substr(2, 9)}`;
        const { svg: generatedSvg } = await mermaid.render(id, code);
        setSvg(generatedSvg);
      } catch (err: any) {
        console.error("Mermaid Render Error:", err);
        setError(err.message || "Syntax Error");
      }
    };
    render();
  }, [code, isDark]);

  // Pan/Zoom Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setPosition(p => ({ x: p.x + dx, y: p.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleReset = () => { setScale(1.0); setPosition({ x: 0, y: 0 }); };

  if (error) {
    return (
      <div className="my-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-sm font-mono flex gap-3 items-start">
        <AlertTriangle className="shrink-0 mt-0.5" size={16} />
        <div>
          <div className="font-bold mb-1">Mermaid Error</div>
          <div className="whitespace-pre-wrap opacity-80">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-6 relative group border border-paper-200 dark:border-cyber-700 rounded-xl overflow-hidden bg-paper-100 dark:bg-cyber-800 h-[400px]">
      <div
        className="w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        ref={containerRef}
      >
        <div
          style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transition: isDragging.current ? 'none' : 'transform 0.1s' }}
          dangerouslySetInnerHTML={{ __html: svg }}
          className="pointer-events-none"
        />
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button onClick={() => setScale(s => Math.min(5, s + 0.2))} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><ZoomIn size={16} /></button>
        <button onClick={handleReset} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><Maximize size={16} /></button>
        <button onClick={() => setScale(s => Math.max(0.2, s - 0.2))} className="p-1.5 bg-white dark:bg-cyber-700 rounded shadow hover:bg-paper-100 dark:hover:bg-cyber-600"><ZoomOut size={16} /></button>
      </div>
      <div className="absolute top-3 right-3 px-2 py-1 bg-white/80 dark:bg-black/50 backdrop-blur rounded text-[10px] font-bold text-slate-500 tracking-wider border border-black/5 dark:border-white/10">
        MERMAID
      </div>
    </div>
  );
};

/**
 * EnhancedCodeBlock: Renders code with Header, Copy button, and Wrap toggle
 * When renderHtml is true and language is 'html', renders the HTML instead of showing code
 */
const createEnhancedCodeBlock = (renderHtml: boolean, tooltips: { copyCode: string; toggleWrap: string }) => {
  return ({ children, className, inline, node, ...props }: any) => {
    const [copied, setCopied] = useState(false);
    const [wrap, setWrap] = useState(false);

    // Detect Language
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    // Detect if Mermaid
    const isMermaid = language === 'mermaid';
    const isDark = document.documentElement.classList.contains('dark');

    // Better inline detection for react-markdown v7+
    // 1. Check if inline prop is explicitly set
    // 2. Check if there's no language class (inline code usually has no language)
    // 3. Check if node tagName is not inside a pre element
    const isInline = inline === true || (!className && !language);

    // Handle Inline Code - return <code> element (valid inside <p>)
    if (isInline) {
      return (
        <code className={`${className || ''} bg-paper-200 dark:bg-cyber-800 px-1.5 py-0.5 rounded text-sm text-cyan-700 dark:text-cyan-400 font-mono`} {...props}>
          {children}
        </code>
      );
    }

    // Handle Mermaid Block
    if (isMermaid) {
      const codeText = extractText(children);
      return <MermaidRenderer code={codeText} isDark={isDark} />;
    }

    // Handle HTML Block - render when renderHtml is enabled
    if (renderHtml && language === 'html') {
      const htmlContent = extractText(children);
      return (
        <div className="my-6 rounded-xl border border-paper-200 dark:border-cyber-700 overflow-hidden shadow-lg">
          {/* HTML Render Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border-b border-paper-200 dark:border-cyber-700">
            <div className="flex items-center gap-2">
              <FileCode size={14} className="text-cyan-500" />
              <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                HTML Rendered
              </span>
            </div>
          </div>
          {/* Rendered HTML Content */}
          <div
            className="p-4 bg-paper-50 dark:bg-cyber-900 prose prose-lg max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      );
    }

    // Handle Standard Code Block
    const handleCopy = async () => {
      const text = extractText(children);
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) { console.error(err); }
    };

    return (
      <div className="my-6 rounded-xl border border-paper-200 dark:border-cyber-700 bg-[#282c34] overflow-hidden shadow-lg group">
        {/* Code Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#21252b] border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
            </div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-mono ml-2 select-none">
              {language || 'text'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip content={tooltips.toggleWrap}>
              <button
                onClick={() => setWrap(!wrap)}
                className={`p-1.5 rounded transition-all ${wrap ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
                aria-label={tooltips.toggleWrap}
              >
                <WrapText size={16} />
              </button>
            </Tooltip>
            <Tooltip content={tooltips.copyCode}>
              <button
                onClick={handleCopy}
                className="p-1.5 rounded text-slate-500 hover:text-slate-300 transition-all"
                aria-label={tooltips.copyCode}
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Code Content */}
        <div className={`relative p-0 ${wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto'}`}>
          <pre className={`!m-0 !p-4 !bg-transparent text-sm font-mono leading-relaxed text-gray-300 ${wrap ? '!whitespace-pre-wrap' : '!whitespace-pre'}`} {...props}>
            <code className={className || 'language-text'} style={{ textShadow: 'none' }}>
              {children}
            </code>
          </pre>
        </div>
      </div>
    );
  };
};

/**
 * EnhancedImage: Handles image rendering with error fallback and loading state
 * Converts relative asset paths to absolute file:// URLs for Electron
 */
interface ImageGetUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Cache for image URLs to prevent duplicate IPC calls
const imageUrlCache = new Map<string, { url: string; timestamp: number }>();
const CACHE_DURATION = 10000; // 10 seconds cache (increased)

const EnhancedImage = ({ src, alt, ...props }: any) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const loadIdRef = useRef<number>(0); // Unique load ID for this component instance

  // Reset state when src changes
  useEffect(() => {
    // Skip if no valid src
    if (!src) {
      setImageSrc(null);
      setLoading(false);
      setError(false);
      return;
    }

    // For data URLs, use directly (no IPC call needed)
    if (src.startsWith('data:')) {
      setImageSrc(src);
      setLoading(false);
      setError(false);
      return;
    }

    // For already absolute URLs, use directly (no IPC call needed)
    if (src.startsWith('file://') || src.startsWith('http://') || src.startsWith('https://')) {
      setImageSrc(src);
      setLoading(false);
      setError(false);
      return;
    }

    // Generate unique load ID for this effect run
    loadIdRef.current++;
    const currentLoadId = loadIdRef.current;

    let isCancelled = false;

    const loadImage = async () => {
      // Check cache FIRST before any IPC call
      if (imageUrlCache.has(src)) {
        const cached = imageUrlCache.get(src)!;
        if (Date.now() - cached.timestamp < CACHE_DURATION) {
          if (!isCancelled) {
            setImageSrc(cached.url);
            setLoading(false);
            setError(false);
          }
          return;
        }
      }

      // For relative paths (assets/xxx.png), convert to absolute URL
      if (src.startsWith('assets/')) {
        try {
          const result = await window.electronAPI.ipcInvoke('image:getUrl', src) as ImageGetUrlResult;

          // Skip if this effect has been cancelled (component unmounted or re-rendered)
          if (isCancelled || currentLoadId !== loadIdRef.current) {
            return;
          }

          if (result.success && result.url) {
            // Cache the URL
            imageUrlCache.set(src, { url: result.url, timestamp: Date.now() });
            setImageSrc(result.url);
            setLoading(false);
            setError(false);
          } else {
            setError(true);
            setLoading(false);
          }
        } catch (err) {
          if (isCancelled || currentLoadId !== loadIdRef.current) {
            return;
          }
          setError(true);
          setLoading(false);
        }
      } else {
        // Unknown path type
        setImageSrc(src);
        setLoading(false);
        setError(false);
      }
    };

    loadImage();

    return () => {
      isCancelled = true;
    };
  }, [src]);

  // 🔧 Fix: Return null for empty/invalid src to avoid browser downloading whole page
  if (!src || src === '') {
    return null;
  }

  // Don't render img until we have a valid src (prevent empty string src warning)
  if (!imageSrc) {
    return (
      <span className="block my-4 relative">
        <span className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-cyber-800 rounded-lg animate-pulse">
          <span className="text-xs text-slate-400">Loading...</span>
        </span>
        {alt && (
          <span className="block mt-2 text-center text-xs text-slate-500 dark:text-slate-400 italic">{alt}</span>
        )}
      </span>
    );
  }

  if (error) {
    return (
      <span className="block my-4 p-4 rounded-lg bg-slate-100 dark:bg-cyber-800 border border-slate-200 dark:border-cyber-700 text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-3">
          <ImageOff size={24} className="text-slate-400 dark:text-slate-500" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-slate-600 dark:text-slate-300">Image failed to load</span>
          <Tooltip content={src}>
            <span className="block text-xs truncate opacity-70">{alt || src}</span>
          </Tooltip>
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className="block my-4 relative">
      <img
        src={imageSrc}
        alt={alt || ''}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        className={`max-w-full h-auto rounded-lg shadow-md border border-paper-200 dark:border-cyber-700 transition-opacity ${loading ? 'opacity-0' : 'opacity-100'}`}
        {...props}
      />
      {alt && !loading && (
        <span className="block mt-2 text-center text-xs text-slate-500 dark:text-slate-400 italic">{alt}</span>
      )}
    </span>
  );
};

/**
 * TagPreview: Renders hashtags with distinctive styling
 */
interface TagPreviewProps {
  tag: string;
  tooltipText: string;
}

const TagPreview: React.FC<TagPreviewProps> = ({ tag, tooltipText }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Dispatch event to filter by tag in sidebar
    window.dispatchEvent(new CustomEvent('filter-by-tag', { detail: { tag } }));
  };

  return (
    <Tooltip content={tooltipText}>
      <span
        onClick={handleClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all
          bg-gradient-to-r from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40
          text-violet-700 dark:text-violet-300
          border border-violet-200 dark:border-violet-700/50
          hover:from-violet-200 hover:to-purple-200 dark:hover:from-violet-800/50 dark:hover:to-purple-800/50
          hover:border-violet-300 dark:hover:border-violet-600
          hover:shadow-sm hover:scale-105
          select-none"
        aria-label={tooltipText}
      >
        <Tag size={10} className="flex-shrink-0" />
        <span>{tag}</span>
      </span>
    </Tooltip>
  );
};


export const Preview: React.FC<PreviewProps> = ({ content, initialScrollRatio, files = [], language = 'en' }) => {
  const [renderHtml, setRenderHtml] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  // Simple heuristic to detect if the content contains HTML tags
  const hasHtml = useMemo(() => {
    return /<[a-z]+(\s+[^>]*)?\/?>/i.test(content) || /<\/[a-z]+>/i.test(content);
  }, [content]);

  // 根据初始滚动比例设置滚动位置
  useEffect(() => {
    if (initialScrollRatio !== undefined && scrollContainerRef.current) {
      // 延迟执行，等待内容渲染完成
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          const { scrollHeight, clientHeight } = scrollContainerRef.current;
          const maxScroll = scrollHeight - clientHeight;
          const targetScroll = maxScroll * initialScrollRatio;
          scrollContainerRef.current.scrollTop = targetScroll;
        }
      });
    }
  }, [initialScrollRatio]);

  return (
    <div data-testid="preview" className="flex-1 h-full min-h-0 w-full bg-paper-50 dark:bg-cyber-900 relative flex flex-col transition-colors duration-300">

      {/* HTML Toggle Header - Only shown if HTML is detected */}
      {hasHtml && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-2 bg-white/90 dark:bg-cyber-800/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-paper-200 dark:border-cyber-700 animate-fadeIn">
          <FileCode size={14} className="text-cyan-600 dark:text-cyan-400" />
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2 select-none">
            Render HTML
            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ${renderHtml ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${renderHtml ? 'translate-x-4' : 'translate-x-0'}`}></div>
            </div>
            <input
              type="checkbox"
              checked={renderHtml}
              onChange={(e) => setRenderHtml(e.target.checked)}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Main Content Area */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-8 custom-scrollbar">
        <div className="prose prose-lg max-w-none dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[
              // Order matters! rehypeRaw must come BEFORE rehypeHighlight
              // so that raw HTML is parsed first, then code blocks get highlighted
              ...(renderHtml ? [rehypeRaw, rehypeFilterAttributes] : []),
              // Transform Block References before WikiLinks
              rehypeBlockReferences(files),
              // Transform WikiLinks before other processing
              rehypeWikiLinks,
              // Transform Tags into styled elements
              rehypeTags,
              // Skip mermaid blocks before highlighting
              rehypeSkipMermaid,
              // Configure rehypeHighlight to ignore mermaid
              [rehypeHighlight, { ignoreMissing: true, detect: false }],
              rehypeKatex
            ]}
            components={{
              // Override pre to simply pass through children, as our 'code' component handles the block wrapper
              pre: ({ children }) => <>{children}</>,
              // Custom Code Block Handler (with HTML rendering support)
              code: createEnhancedCodeBlock(renderHtml, {
                copyCode: t.tooltips?.copyCode || 'Copy code',
                toggleWrap: t.tooltips?.toggleWordWrap || 'Toggle Word Wrap'
              }),
              // Custom Image Handler with error fallback
              img: EnhancedImage,
              input: ({ node, type, checked, ...props }) => {
                if (type === 'checkbox') {
                  return (
                    <input
                      type="checkbox"
                      checked={Boolean(checked)}
                      readOnly
                      {...props}
                    />
                  );
                }
                return <input type={type} {...props} />;
              },
              // Add IDs to headings for outline navigation
              h1: ({ children, ...props }) => {
                const text = extractText(children);
                const id = `heading-${generateSlug(text)}`;
                return <h1 id={id} {...props}>{children}</h1>;
              },
              h2: ({ children, ...props }) => {
                const text = extractText(children);
                const id = `heading-${generateSlug(text)}`;
                return <h2 id={id} {...props}>{children}</h2>;
              },
              h3: ({ children, ...props }) => {
                const text = extractText(children);
                const id = `heading-${generateSlug(text)}`;
                return <h3 id={id} {...props}>{children}</h3>;
              },
              h4: ({ children, ...props }) => {
                const text = extractText(children);
                const id = `heading-${generateSlug(text)}`;
                return <h4 id={id} {...props}>{children}</h4>;
              },
              h5: ({ children, ...props }) => {
                const text = extractText(children);
                const id = `heading-${generateSlug(text)}`;
                return <h5 id={id} {...props}>{children}</h5>;
              },
              h6: ({ children, ...props }) => {
                const text = extractText(children);
                const id = `heading-${generateSlug(text)}`;
                return <h6 id={id} {...props}>{children}</h6>;
              },
              // Custom WikiLink Handler
              wikilink: ({ 'data-target': target, 'data-alias': alias, children }: any) => {
                const linkText = Array.isArray(children) ? extractText(children) : (children as string);
                return (
                  <WikiLinkPreview
                    target={target}
                    alias={alias || linkText}
                    files={files}
                    onNavigate={(target) => {
                      window.dispatchEvent(new CustomEvent('navigate-to-wikilink', { detail: { target } }));
                    }}
                  />
                );
              },
              // Custom Block Reference Handler
              blockref: ({ 'data-target': target, 'data-start-line': startLine, 'data-end-line': endLine }: any) => {
                return (
                  <BlockReferencePreview
                    target={target}
                    startLine={parseInt(startLine, 10)}
                    endLine={endLine ? parseInt(endLine, 10) : undefined}
                    files={files}
                  />
                );
              },
              // Custom Hashtag Handler
              hashtag: ({ 'data-tag': tag }: any) => {
                const tooltipText = t.tooltips?.filterByTag
                  ? t.tooltips.filterByTag.replace('{tag}', tag)
                  : `Click to filter by #${tag}`;
                return <TagPreview tag={tag} tooltipText={tooltipText} />;
              },
            } as any}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};
