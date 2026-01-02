import React, { useState, useRef, useEffect } from 'react';
import { FileText, GraduationCap, HelpCircle } from 'lucide-react';
import { MarkdownFile } from '../types';
import { escapeHtml } from '../utils/escapeHtml';
import { findFileByWikiLinkTarget } from '../src/services/wiki/wikiLinkService';

interface WikiLinkProps {
  href: string;
  children: React.ReactNode;
  files: MarkdownFile[];
  onNavigate: (fileId: string) => void;
}

export const WikiLink: React.FC<WikiLinkProps> = ({ href, children, files, onNavigate }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [targetFile, setTargetFile] = useState<{ id: string; name: string; path?: string; content?: string; lastModified?: number } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const linkTarget = new URLSearchParams(href.split('?')[1]).get('wiki');
  const normalizedTarget = linkTarget?.toLowerCase() || '';
  
  const isExamLink = normalizedTarget.startsWith('exam:');
  const isQuestionLink = normalizedTarget.startsWith('question:');

  useEffect(() => {
    if (normalizedTarget && !isExamLink && !isQuestionLink) {
      const file = findFileByWikiLinkTarget(linkTarget || '', files);
      setTargetFile(file || null);
    }
  }, [normalizedTarget, files, isExamLink, isQuestionLink, linkTarget]);

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
      onNavigate(linkTarget || '');
      return;
    }

    if (targetFile) {
      onNavigate(targetFile.id);
    }
  };

  if (isExamLink) {
    return (
      <a 
        href={href} 
        onClick={handleClick}
        className="inline-flex items-center gap-1 font-semibold text-violet-600 dark:text-violet-400 hover:underline bg-violet-50 dark:bg-violet-900/30 px-1 rounded mx-0.5 cursor-pointer"
      >
        <GraduationCap size={12} />
        <span>{children}</span>
      </a>
    );
  }

  if (isQuestionLink) {
    return (
      <a 
        href={href} 
        onClick={handleClick}
        className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 hover:underline bg-amber-50 dark:bg-amber-900/30 px-1 rounded mx-0.5 cursor-pointer"
      >
        <HelpCircle size={12} />
        <span>{children}</span>
      </a>
    );
  }

  return (
    <span className="relative inline-block group" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <a 
        href={href} 
        onClick={handleClick}
        className={`
            no-underline font-semibold transition-colors rounded px-1 -mx-1
            ${targetFile 
                ? 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 cursor-pointer' 
                : 'text-slate-400 dark:text-slate-500 hover:text-red-400 cursor-not-allowed'}
        `}
      >
        <span className="border-b border-dashed border-current">[[{children}]]</span>
      </a>

      {showPreview && targetFile && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-50">
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden p-3">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                    <FileText size={14} className="text-cyan-500" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{targetFile.name}</span>
                </div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-6 leading-relaxed">
                   {escapeHtml(targetFile.content.slice(0, 300))}...
                </div>
            </div>
            <div className="w-3 h-3 bg-white/90 dark:bg-gray-800/90 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1.5 border-r border-b border-gray-200 dark:border-gray-700"></div>
        </div>
      )}
    </span>
  );
};
