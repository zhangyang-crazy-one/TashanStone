import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { ExternalLink, FileText, GraduationCap, HelpCircle } from 'lucide-react';

import type { MarkdownFile } from '../../types';
import { findFileByWikiLinkTarget } from '../../src/services/wiki/wikiLinkService';
import { useFloatingPreview } from './useFloatingPreview';

type WikiTargetFile = NonNullable<ReturnType<typeof findFileByWikiLinkTarget>>;

interface WikiLinkPreviewProps {
  target: string;
  alias?: string;
  files?: MarkdownFile[];
  onNavigate?: (target: string) => void;
}

export const WikiLinkPreview: React.FC<WikiLinkPreviewProps> = ({ target, alias, files, onNavigate }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [targetFile, setTargetFile] = useState<WikiTargetFile | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const { popupRef, popupPos, arrowOffset, placement } = useFloatingPreview(showPreview, triggerRef, 'bottom');

  const safeFiles = files ?? [];
  const isExamLink = target.toLowerCase().startsWith('exam:');
  const isQuestionLink = target.toLowerCase().startsWith('question:');
  const displayText = alias || target || '';
  const href = `?wiki=${encodeURIComponent(target || '')}`;

  useEffect(() => {
    if (target && !isExamLink && !isQuestionLink && safeFiles.length > 0) {
      const file = findFileByWikiLinkTarget(target, safeFiles);
      setTargetFile(file ?? null);
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

  const handleNavigate = () => {
    if (onNavigate) {
      onNavigate(target);
      return;
    }
    window.dispatchEvent(new CustomEvent('navigate-to-wikilink', { detail: { target } }));
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleNavigate();
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
