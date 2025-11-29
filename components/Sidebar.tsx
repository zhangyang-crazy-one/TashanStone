

import React, { useRef, useState, useEffect } from 'react';
import { FileText, Plus, Trash2, FolderOpen, Search, X, FolderInput, FileType, List, AlignLeft, ChevronRight, GraduationCap } from 'lucide-react';
import { MarkdownFile } from '../types';
import { translations, Language } from '../utils/translations';

interface SidebarProps {
  files: MarkdownFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateFile: () => void;
  onDeleteFile: (id: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportPdf: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  language?: Language;
}

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  isOpen,
  onCloseMobile,
  onOpenFolder,
  onImportFolderFiles,
  onImportPdf,
  onImportQuiz,
  language = 'en'
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('files');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const quizInputRef = useRef<HTMLInputElement>(null);
  const t = translations[language];

  // Derive active file content
  const activeFile = files.find(f => f.id === activeFileId);

  useEffect(() => {
    if (activeFile) {
      const lines = activeFile.content.split('\n');
      const headers: OutlineItem[] = [];
      lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headers.push({
            level: match[1].length,
            text: match[2],
            line: index
          });
        }
      });
      setOutline(headers);
    } else {
      setOutline([]);
    }
  }, [activeFile]);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImportPdf(e.target.files[0]);
    }
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const handleQuizUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportQuiz) {
        onImportQuiz(e.target.files[0]);
    }
    if (quizInputRef.current) quizInputRef.current.value = '';
  };

  const handleDirUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFolderFiles) {
        onImportFolderFiles(e.target.files);
    }
    if (dirInputRef.current) dirInputRef.current.value = '';
  };

  const handleOpenFolderClick = async () => {
    try {
      await onOpenFolder();
    } catch (e) {
      console.warn("Modern directory picker failed (likely iframe restriction), falling back to legacy input.", e);
      dirInputRef.current?.click();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-40 w-64 bg-paper-100 dark:bg-cyber-900 
        border-r border-paper-200 dark:border-cyber-700 transform transition-transform duration-300 ease-in-out
        flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'}
      `}>
        
        {/* Header Tabs */}
        <div className="h-16 flex items-center px-2 border-b border-paper-200 dark:border-cyber-700 shrink-0">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'files' ? 'bg-white dark:bg-cyber-800 text-cyan-600 dark:text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <FolderOpen size={16} />
              {t.explorer}
            </button>
            <button
              onClick={() => setActiveTab('outline')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'outline' ? 'bg-white dark:bg-cyber-800 text-violet-600 dark:text-violet-400 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <List size={16} />
              Outline
            </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          
          {/* FILES TAB */}
          {activeTab === 'files' && (
            <>
               <div className="mb-4 space-y-2">
                 <button 
                  onClick={onCreateFile}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/20 text-sm font-medium"
                 >
                   <Plus size={16} /> {t.newFile}
                 </button>
                 
                 <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => pdfInputRef.current?.click()}
                      className="flex flex-col items-center justify-center p-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 hover:border-cyan-500 text-slate-600 dark:text-slate-300 rounded-lg transition-all text-xs"
                    >
                      <FileType size={16} className="mb-1 text-red-400" />
                      {t.pdfImport}
                    </button>
                    <button 
                      onClick={handleOpenFolderClick}
                      className="flex flex-col items-center justify-center p-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 hover:border-cyan-500 text-slate-600 dark:text-slate-300 rounded-lg transition-all text-xs"
                    >
                      <FolderInput size={16} className="mb-1 text-amber-400" />
                      {t.openDir}
                    </button>
                 </div>
                 
                 {/* Quiz Import Button */}
                 <button 
                   onClick={() => quizInputRef.current?.click()}
                   className="w-full flex items-center justify-center gap-2 p-2 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 hover:border-violet-500 text-slate-600 dark:text-slate-300 rounded-lg transition-all text-xs"
                 >
                   <GraduationCap size={16} className="text-violet-500" />
                   {t.quizImport} (PDF, DOCX, CSV)
                 </button>
                 
                 <input type="file" accept=".pdf" ref={pdfInputRef} className="hidden" onChange={handlePdfUpload} />
                 <input type="file" accept=".csv,.pdf,.md,.txt,.docx,.doc" ref={quizInputRef} className="hidden" onChange={handleQuizUpload} />
                 <input 
                   type="file" 
                   ref={dirInputRef} 
                   className="hidden" 
                   onChange={handleDirUpload} 
                   multiple 
                   {...({ webkitdirectory: "", directory: "" } as any)} 
                 />
               </div>

               <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 mb-2 flex justify-between items-center">
                  <span>Files</span>
                  <span className="bg-paper-200 dark:bg-cyber-800 px-1.5 py-0.5 rounded text-[10px]">{files.length}</span>
               </div>

               {files.map(file => (
                 <div 
                   key={file.id}
                   onClick={() => onSelectFile(file.id)}
                   className={`
                     group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border
                     ${activeFileId === file.id 
                       ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800/50 text-cyan-800 dark:text-cyan-200' 
                       : 'bg-transparent border-transparent hover:bg-white dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-400'}
                   `}
                 >
                   <div className="flex items-center gap-3 min-w-0">
                     <FileText size={16} className={activeFileId === file.id ? 'text-cyan-500' : 'opacity-70'} />
                     <span className="truncate text-sm font-medium">{file.name}</span>
                   </div>
                   <button
                    onClick={(e) => { e.stopPropagation(); onDeleteFile(file.id); }}
                    className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                   >
                     <Trash2 size={14} />
                   </button>
                 </div>
               ))}
            </>
          )}

          {/* OUTLINE TAB */}
          {activeTab === 'outline' && (
            <div className="space-y-1">
              {outline.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center">
                   <AlignLeft size={32} className="mb-2 opacity-50" />
                   <p className="text-sm">No headings found in current file.</p>
                </div>
              ) : (
                outline.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                        // Very basic scrolling - in a real app might need exact element targeting
                        const elements = document.querySelectorAll(`h${item.level}`);
                        // This is a rough approximation, real implementation would pair heading IDs
                        if(elements.length > 0) {
                            elements[Math.min(idx, elements.length-1)]?.scrollIntoView({behavior: 'smooth'});
                        }
                    }}
                    className={`w-full text-left py-1.5 px-2 rounded hover:bg-paper-200 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-2`}
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                  >
                    <span className="text-[10px] opacity-40 font-mono">H{item.level}</span>
                    <span className="text-xs truncate">{item.text}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        
        {/* Footer info */}
        <div className="p-3 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 text-xs text-slate-400 text-center">
           NeonMark v2.1
        </div>
      </div>
    </>
  );
};
