import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link2 } from 'lucide-react';

import type { MarkdownFile } from '../../types';
import { useFloatingPreview } from './useFloatingPreview';

interface BlockReferencePreviewProps {
  target: string;
  startLine: number;
  endLine?: number;
  files?: MarkdownFile[];
}

export const BlockReferencePreview: React.FC<BlockReferencePreviewProps> = ({ target, startLine, endLine, files }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [blockContent, setBlockContent] = useState('');
  const [fileExists, setFileExists] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { popupRef, popupPos, arrowOffset, placement } = useFloatingPreview(showPreview, triggerRef, 'bottom');

  const safeFiles = files ?? [];

  useEffect(() => {
    if (!target || safeFiles.length === 0) {
      setFileExists(false);
      return;
    }

    const targetLower = target.toLowerCase();
    const targetWithoutExt = targetLower.replace(/\.md$/i, '');

    const targetFile = safeFiles.find((file) => {
      const nameWithoutExt = file.name.toLowerCase().replace(/\.md$/i, '');
      return nameWithoutExt === targetWithoutExt;
    });

    if (!targetFile) {
      setFileExists(false);
      return;
    }

    setFileExists(true);
    const lines = targetFile.content.split('\n');
    if (endLine && endLine >= startLine && endLine <= lines.length) {
      setBlockContent(lines.slice(startLine - 1, endLine).join('\n').trim());
      return;
    }
    if (startLine <= lines.length) {
      setBlockContent(lines[startLine - 1].trim());
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

    const targetLower = target.toLowerCase();
    const targetFile = safeFiles.find((file) => {
      const name = file.name.toLowerCase();
      return name === targetLower ||
        name === `${targetLower}.md` ||
        file.path?.toLowerCase()?.endsWith(`/${targetLower}`) ||
        file.path?.toLowerCase()?.endsWith(`/${targetLower}.md`);
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
    }, 100);
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
          <div
            className={`w-3 h-3 bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-900/80 dark:to-amber-900/60 rotate-45 absolute border-l border-t border-orange-300 dark:border-orange-700 ${
              placement === 'top' ? '-bottom-1.5' : '-top-1.5'
            }`}
            style={{ left: `${arrowOffset}px` }}
          />

          <div className="bg-gradient-to-br from-white/98 to-orange-50/90 dark:from-cyber-900/98 dark:to-orange-950/80 backdrop-blur-xl border border-orange-300/60 dark:border-orange-700/60 rounded-xl shadow-2xl shadow-orange-500/10 dark:shadow-orange-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-100/80 to-amber-50/60 dark:from-orange-900/40 dark:to-amber-900/30 border-b border-orange-200/60 dark:border-orange-800/40">
              <Link2 size={12} className="text-orange-500 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-300 truncate">
                {target}
              </span>
              <span className="text-[10px] font-mono text-orange-500/70 dark:text-orange-400/60 ml-auto flex-shrink-0">
                {endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`}
              </span>
            </div>

            <div className="max-h-52 overflow-y-auto custom-scrollbar">
              {blockContent ? (
                <div className="p-3">
                  <div className="flex text-xs font-mono">
                    <div className="select-none pr-3 text-right border-r border-orange-200/40 dark:border-orange-800/30 mr-3 text-orange-400/60 dark:text-orange-500/40">
                      {blockContent.split('\n').map((_, i) => (
                        <div key={i} className="leading-5">{startLine + i}</div>
                      ))}
                    </div>
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
