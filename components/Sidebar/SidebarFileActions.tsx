import React, { useRef } from 'react';
import { BookOpen, FolderInput, GraduationCap, Plus, Upload } from 'lucide-react';

import Tooltip from '../Tooltip';

interface SidebarFileActionsProps {
  onOpenCreation: (type: 'file' | 'folder') => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportPdf: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  onOpenReview?: () => void;
  t: {
    newFile: string;
    openDir: string;
    importFiles: string;
    quiz: string;
    review?: string;
    tooltips?: {
      newFile?: string;
      newFolder?: string;
    };
  };
}

type DirectoryInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

export const SidebarFileActions: React.FC<SidebarFileActionsProps> = ({
  onOpenCreation,
  onOpenFolder,
  onImportFolderFiles,
  onImportPdf,
  onImportQuiz,
  onOpenReview,
  t
}) => {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const quizInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onImportPdf(e.target.files[0]);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const handleQuizUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportQuiz) onImportQuiz(e.target.files[0]);
    if (quizInputRef.current) quizInputRef.current.value = '';
  };

  const handleDirUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFolderFiles) onImportFolderFiles(e.target.files);
    if (dirInputRef.current) dirInputRef.current.value = '';
  };

  const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFolderFiles) {
      onImportFolderFiles(e.target.files);
    }
    if (filesInputRef.current) filesInputRef.current.value = '';
  };

  const handleOpenFolderClick = async () => {
    try {
      await onOpenFolder();
    } catch (e) {
      console.warn("Modern directory picker failed, falling back to legacy input.", e);
      dirInputRef.current?.click();
    }
  };

  const directoryInputProps: DirectoryInputProps = {
    webkitdirectory: "",
    directory: ""
  };

  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      <div className="w-full">
        <Tooltip content={t.tooltips?.newFile || "New File"} className="w-full">
          <button
            onClick={() => onOpenCreation('file')}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/20 text-xs font-medium"
            aria-label={t.tooltips?.newFile || "New File"}
          >
            <Plus size={14} /> {t.newFile}
          </button>
        </Tooltip>
      </div>

      <div className="w-full">
        <Tooltip content={t.tooltips?.newFolder || "New Folder"} className="w-full">
          <button
            onClick={() => onOpenCreation('folder')}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-amber-400 transition-colors text-xs font-medium"
            aria-label={t.tooltips?.newFolder || "New Folder"}
          >
            <FolderInput size={14} className="text-amber-500" /> Folder
          </button>
        </Tooltip>
      </div>

      <button
        onClick={() => filesInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-cyan-400 transition-colors text-xs font-medium"
      >
        <Upload size={14} /> {t.importFiles}
      </button>

      <button
        onClick={handleOpenFolderClick}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-200 dark:bg-cyber-900 hover:bg-slate-300 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium"
      >
        <FolderInput size={14} /> {t.openDir}
      </button>

      <button
        onClick={() => quizInputRef.current?.click()}
        className="col-span-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-violet-400 transition-colors text-xs font-medium"
      >
        <GraduationCap size={14} className="text-violet-400" /> {t.quiz}
      </button>

      {onOpenReview && (
        <button
          onClick={onOpenReview}
          className="col-span-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-emerald-400 transition-colors text-xs font-medium"
        >
          <BookOpen size={14} className="text-emerald-400" /> {t.review}
        </button>
      )}

      <input type="file" accept=".pdf" ref={pdfInputRef} className="hidden" onChange={handlePdfUpload} />
      <input type="file" accept=".csv,.pdf,.md,.txt,.docx,.doc" ref={quizInputRef} className="hidden" onChange={handleQuizUpload} />
      <input type="file" accept=".md,.markdown,.txt,.csv,.pdf,.docx,.doc" multiple ref={filesInputRef} className="hidden" onChange={handleFilesUpload} />
      <input type="file" ref={dirInputRef} className="hidden" onChange={handleDirUpload} multiple {...directoryInputProps} />
    </div>
  );
};
