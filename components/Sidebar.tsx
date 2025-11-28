
import React, { useRef } from 'react';
import { FileText, Plus, Trash2, FolderOpen, Search, X, FolderInput, FileType } from 'lucide-react';
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
  language?: Language;
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
  language = 'en'
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const t = translations[language];

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportPdf(e.target.files[0]);
      e.target.value = ''; // Reset
    }
  };
  
  const handleDirUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFolderFiles) {
      onImportFolderFiles(e.target.files);
      e.target.value = ''; // Reset
    }
  };

  const handleOpenFolderClick = async () => {
    try {
      await onOpenFolder();
    } catch (e) {
      // Fallback if window.showDirectoryPicker fails or is blocked
      console.warn("Falling back to input directory picker", e);
      dirInputRef.current?.click();
    }
  };

  return (
    <div 
      className={`
        fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out
        bg-paper-100 dark:bg-cyber-900 border-r border-paper-200 dark:border-cyber-700
        md:relative md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
            <FolderOpen size={18} className="text-cyan-600 dark:text-cyber-500" />
            <span>{t.explorer}</span>
          </div>
          <button 
            onClick={onCloseMobile}
            className="md:hidden p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="p-3 space-y-2">
          <button
            onClick={onCreateFile}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md bg-cyan-600 hover:bg-cyan-700 text-white dark:bg-cyber-500 dark:hover:bg-cyan-600 transition-colors shadow-sm text-sm font-medium"
          >
            <Plus size={16} />
            <span>{t.newFile}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleOpenFolderClick}
              className="flex items-center justify-center gap-2 py-2 px-2 rounded-md bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700 transition-colors text-xs font-medium"
            >
              <FolderInput size={14} />
              <span>{t.openDir}</span>
            </button>
             <button
              onClick={() => pdfInputRef.current?.click()}
              className="flex items-center justify-center gap-2 py-2 px-2 rounded-md bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-300 hover:bg-paper-200 dark:hover:bg-cyber-700 transition-colors text-xs font-medium"
            >
              <FileType size={14} />
              <span>{t.pdfImport}</span>
            </button>
            <input 
              type="file" 
              accept=".pdf" 
              ref={pdfInputRef} 
              className="hidden" 
              onChange={handlePdfUpload}
            />
            {/* Fallback for Directory Picker */}
            <input 
              type="file" 
              ref={dirInputRef}
              className="hidden"
              // @ts-ignore - non-standard attribute but necessary for folder selection fallback
              webkitdirectory="" 
              directory="" 
              multiple 
              onChange={handleDirUpload} 
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
          {files.map((file) => (
            <div
              key={file.id}
              onClick={() => {
                onSelectFile(file.id);
                if (window.innerWidth < 768) onCloseMobile();
              }}
              className={`
                group flex items-center justify-between p-2 rounded-md cursor-pointer transition-all duration-200
                ${activeFileId === file.id 
                  ? 'bg-white dark:bg-cyber-800 shadow-sm border border-paper-200 dark:border-cyber-700' 
                  : 'hover:bg-paper-200 dark:hover:bg-cyber-800/50 text-slate-600 dark:text-slate-400'}
              `}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <FileText 
                  size={16} 
                  className={activeFileId === file.id ? 'text-cyan-600 dark:text-cyber-400' : 'text-slate-400'} 
                />
                <span className={`text-sm truncate font-medium ${activeFileId === file.id ? 'text-slate-800 dark:text-slate-200' : ''}`}>
                  {file.name}
                  {file.isLocal && <span className="ml-2 text-[10px] text-cyan-500 bg-cyan-100 dark:bg-cyan-900/30 px-1 rounded">LOC</span>}
                </span>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFile(file.id);
                }}
                className={`
                  p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity
                  hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500
                `}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-paper-200 dark:border-cyber-700 text-xs text-slate-400 dark:text-slate-600 text-center">
          {files.length} {t.filesStored}
        </div>
      </div>
    </div>
  );
};
