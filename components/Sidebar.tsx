import React, { useState } from 'react';

import type { MarkdownFile, OCRStats, RAGStats, Snippet } from '../types';
import type { SidebarTab } from './Sidebar/sidebarTypes';
import { SidebarFilesTab } from './Sidebar/SidebarFilesTab';
import { SidebarOutlineTab } from './Sidebar/SidebarOutlineTab';
import { SidebarSnippetsTab } from './Sidebar/SidebarSnippetsTab';
import { SidebarStatusPanel } from './Sidebar/SidebarStatusPanel';
import { SidebarTabs } from './Sidebar/SidebarTabs';
import { translations, type Language } from '../utils/translations';

interface SidebarProps {
  files: MarkdownFile[];
  setFiles?: React.Dispatch<React.SetStateAction<MarkdownFile[]>>;
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateItem: (type: 'file' | 'folder', name: string, parentPath: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveItem: (sourceId: string, targetFolderPath: string | null) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportPdf: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  language?: Language;
  ragStats?: RAGStats;
  ocrStats?: OCRStats;
  onRefreshIndex?: () => void;
  snippets?: Snippet[];
  onCreateSnippet?: (snippet: Omit<Snippet, 'id'>) => void;
  onDeleteSnippet?: (id: string) => void;
  onInsertSnippet?: (content: string) => void;
  onOpenTagSuggestion?: () => void;
  onOpenSmartOrganize?: (file: MarkdownFile) => void;
  onOpenReview?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  setFiles,
  activeFileId,
  onSelectFile,
  onCreateItem,
  onDeleteFile,
  onMoveItem,
  isOpen,
  onCloseMobile,
  onOpenFolder,
  onImportFolderFiles,
  onImportPdf,
  onImportQuiz,
  language = 'en',
  ragStats,
  ocrStats,
  onRefreshIndex,
  snippets = [],
  onInsertSnippet,
  onOpenTagSuggestion,
  onOpenSmartOrganize,
  onOpenReview
}) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>('files');
  const t = translations[language];

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm" onClick={onCloseMobile} />}

      <div
        data-testid="sidebar"
        className={`
          fixed lg:static inset-y-0 left-0 z-40 w-72 bg-paper-100 dark:bg-cyber-800
          border-r border-paper-200 dark:border-cyber-700 transform transition-transform duration-300 ease-in-out
          flex flex-col relative
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'}
        `}
      >
        <SidebarTabs activeTab={activeTab} onTabChange={setActiveTab} t={t} />

        <SidebarFilesTab
          isActive={activeTab === 'files'}
          files={files}
          setFiles={setFiles}
          activeFileId={activeFileId}
          onSelectFile={onSelectFile}
          onCreateItem={onCreateItem}
          onDeleteFile={onDeleteFile}
          onMoveItem={onMoveItem}
          onOpenFolder={onOpenFolder}
          onImportFolderFiles={onImportFolderFiles}
          onImportPdf={onImportPdf}
          onImportQuiz={onImportQuiz}
          onOpenTagSuggestion={onOpenTagSuggestion}
          onOpenSmartOrganize={onOpenSmartOrganize}
          onOpenReview={onOpenReview}
          language={language}
          t={t}
        />

        {activeTab !== 'files' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {activeTab === 'snippets' && (
              <SidebarSnippetsTab
                snippets={snippets}
                onInsertSnippet={onInsertSnippet}
                t={t}
              />
            )}
            {activeTab === 'outline' && (
              <SidebarOutlineTab
                activeFileId={activeFileId}
                files={files}
              />
            )}
          </div>
        )}

        <SidebarStatusPanel
          ocrStats={ocrStats}
          ragStats={ragStats}
          onRefreshIndex={onRefreshIndex}
          t={t}
        />

        <div className="p-2 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50 text-[10px] text-slate-400 text-center flex justify-between items-center px-4">
          <span>{files.length} Files</span>
          <span>TashanStone</span>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
