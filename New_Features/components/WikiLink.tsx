

import React, { useState, useRef, useEffect } from 'react';
import { MarkdownFile } from '../types';
import { FileText, GraduationCap, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface WikiLinkProps {
  href: string;
  children: React.ReactNode;
  files: MarkdownFile[];
  onNavigate: (fileId: string) => void;
}

export const WikiLink: React.FC<WikiLinkProps> = ({ href, children, files, onNavigate }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [targetFile, setTargetFile] = useState<MarkdownFile | null>(null);
  const timeoutRef = useRef<any>(null);

  // Parse href query param ?wiki=PageName
  const linkTarget = new URLSearchParams(href.split('?')[1]).get('wiki');
  const normalizedTarget = linkTarget?.toLowerCase() || '';
  
  const isExamLink = normalizedTarget.startsWith('exam:');
  const isQuestionLink = normalizedTarget.startsWith('question:');

  useEffect(() => {
    if (normalizedTarget && !isExamLink && !isQuestionLink) {
      // Find exact match or simple case-insensitive match
      // Also handle finding by path
      const file = files.find(f => {
         const name = f.name.toLowerCase();
         return name === normalizedTarget || name.includes(`/${normalizedTarget}`);
      });
      setTargetFile(file || null);
    }
  }, [normalizedTarget, files, isExamLink, isQuestionLink]);

  const handleMouseEnter = () => {
    if (isExamLink || isQuestionLink) return; // No preview for exams yet
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
        setShowPreview(true);
    }, 500); // 500ms delay before showing
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowPreview(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isExamLink || isQuestionLink) {
        // Navigate using the raw target string, App.tsx handles parsing
        onNavigate(linkTarget || '');
        return;
    }

    if (targetFile) {
      onNavigate(targetFile.id);
    } else {
       // Could implement "Create Page" here if file doesn't exist
       console.log("File not found:", linkTarget);
    }
  };

  if (isExamLink) {
      return (
        <a 
            href={href} 
            onClick={handleClick}
            className="inline-flex items-center gap-1 font-semibold text-violet-600 dark:text-violet-400 hover:underline bg-violet-50 dark:bg-violet-900/30 px-1 rounded mx-0.5"
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
            className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400 hover:underline bg-amber-50 dark:bg-amber-900/30 px-1 rounded mx-0.5"
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
                ? 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/30' 
                : 'text-slate-400 dark:text-slate-500 hover:text-red-400 cursor-not-allowed'}
        `}
      >
        [[{children}]]
      </a>

      {/* Hover Preview Popover */}
      {showPreview && targetFile && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 z-50 animate-fadeIn">
            <div className="bg-white/90 dark:bg-cyber-900/90 backdrop-blur-xl border border-paper-200 dark:border-cyber-700 rounded-lg shadow-xl overflow-hidden p-3">
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-paper-100 dark:border-cyber-700/50">
                    <FileText size={14} className="text-cyan-500" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{targetFile.name}</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-6 leading-relaxed">
                   {targetFile.content.slice(0, 300)}...
                </div>
            </div>
            {/* Arrow */}
            <div className="w-3 h-3 bg-white/90 dark:bg-cyber-900/90 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1.5 border-r border-b border-paper-200 dark:border-cyber-700"></div>
        </div>
      )}
    </span>
  );
};