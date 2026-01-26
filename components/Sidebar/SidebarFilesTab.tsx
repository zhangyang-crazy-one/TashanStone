import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

import type { MarkdownFile } from '../../types';
import { SidebarContextMenu } from './SidebarContextMenu';
import { SidebarFileActions } from './SidebarFileActions';
import { SidebarFileOverlays } from './SidebarFileOverlays';
import { SidebarFileTree } from './SidebarFileTree';
import { SidebarTagsSection } from './SidebarTagsSection';
import { useSidebarFileTree } from './useSidebarFileTree';
import type { Language } from '../../utils/translations';

interface CreationModalState {
  isOpen: boolean;
  type: 'file' | 'folder';
  parentPath: string;
  value: string;
}

interface DeleteConfirmState {
  isOpen: boolean;
  fileId: string | null;
  fileName: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  fileId: string | null;
  fileName: string;
}

interface SidebarFilesTabProps {
  isActive: boolean;
  files: MarkdownFile[];
  setFiles?: React.Dispatch<React.SetStateAction<MarkdownFile[]>>;
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateItem: (type: 'file' | 'folder', name: string, parentPath: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveItem: (sourceId: string, targetFolderPath: string | null) => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportPdf: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  onOpenTagSuggestion?: () => void;
  onOpenSmartOrganize?: (file: MarkdownFile) => void;
  onOpenReview?: () => void;
  language: Language;
  t: {
    explorer: string;
    newFile: string;
    openDir: string;
    importFiles: string;
    quiz: string;
    review?: string;
    tags?: string;
    aiTagSuggestions?: string;
    tooltips?: {
      newFile?: string;
      newFolder?: string;
      newFileInside?: string;
      newFolderInside?: string;
      readOnlySource?: string;
      deleteFile?: string;
    };
  };
}

export const SidebarFilesTab: React.FC<SidebarFilesTabProps> = ({
  isActive,
  files,
  setFiles,
  activeFileId,
  onSelectFile,
  onCreateItem,
  onDeleteFile,
  onMoveItem,
  onOpenFolder,
  onImportFolderFiles,
  onImportPdf,
  onImportQuiz,
  onOpenTagSuggestion,
  onOpenSmartOrganize,
  onOpenReview,
  language,
  t
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [creationModal, setCreationModal] = useState<CreationModalState>({
    isOpen: false,
    type: 'file',
    parentPath: '',
    value: ''
  });
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>({
    isOpen: false,
    fileId: null,
    fileName: ''
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const creationInputRef = useRef<HTMLInputElement>(null);

  const { visibleFlatNodes, toggleFolder, expandFolder } = useSidebarFileTree({
    files,
    activeFileId,
    searchQuery
  });

  useEffect(() => {
    if (creationModal.isOpen && creationInputRef.current) {
      setTimeout(() => creationInputRef.current?.focus(), 50);
    }
  }, [creationModal.isOpen]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handleOpenCreation = (type: 'file' | 'folder', parentPath: string = '') => {
    setCreationModal({ isOpen: true, type, parentPath, value: '' });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (creationModal.value.trim()) {
      onCreateItem(creationModal.type, creationModal.value.trim(), creationModal.parentPath);
      setCreationModal({ isOpen: false, type: 'file', parentPath: '', value: '' });
      if (creationModal.parentPath) {
        expandFolder(creationModal.parentPath);
      }
    }
  };

  const handleDeleteRequest = (fileId: string, fileName: string) => {
    setDeleteConfirm({ isOpen: true, fileId, fileName });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm.fileId) {
      onDeleteFile(deleteConfirm.fileId);
      setDeleteConfirm({ isOpen: false, fileId: null, fileName: '' });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, fileId: null, fileName: '' });
  };

  return (
    <div className={isActive ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
      <SidebarFileOverlays
        creationModal={creationModal}
        deleteConfirm={deleteConfirm}
        creationInputRef={creationInputRef}
        onCreationValueChange={(value) => setCreationModal(prev => ({ ...prev, value }))}
        onCreationClose={() => setCreationModal(prev => ({ ...prev, isOpen: false }))}
        onCreationSubmit={handleCreateSubmit}
        onDeleteConfirm={handleDeleteConfirm}
        onDeleteCancel={handleDeleteCancel}
      />

      <SidebarContextMenu
        contextMenu={contextMenu}
        files={files}
        onSelectFile={onSelectFile}
        onOpenSmartOrganize={onOpenSmartOrganize}
        onRequestDelete={handleDeleteRequest}
        onClose={() => setContextMenu(null)}
      />

      <div className="p-3 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-900 shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 bg-paper-100 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded text-xs focus:outline-none focus:border-cyan-500 transition-colors"
          />
          <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-3 space-y-2 flex flex-col">
        <SidebarFileActions
          onOpenCreation={(type) => handleOpenCreation(type)}
          onOpenFolder={onOpenFolder}
          onImportFolderFiles={onImportFolderFiles}
          onImportPdf={onImportPdf}
          onImportQuiz={onImportQuiz}
          onOpenReview={onOpenReview}
          t={t}
        />

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
          <SidebarFileTree
            activeFileId={activeFileId}
            visibleFlatNodes={visibleFlatNodes}
            searchQuery={searchQuery}
            onSelectFile={onSelectFile}
            onDeleteRequest={handleDeleteRequest}
            onToggleFolder={toggleFolder}
            onOpenCreation={handleOpenCreation}
            onMoveItem={onMoveItem}
            onShowContextMenu={(fileId, fileName, x, y) => setContextMenu({ x, y, fileId, fileName })}
            tooltips={{
              newFileInside: t.tooltips?.newFileInside,
              newFolderInside: t.tooltips?.newFolderInside,
              readOnlySource: t.tooltips?.readOnlySource,
              deleteFile: t.tooltips?.deleteFile
            }}
          />
        </div>

        <div className="max-h-56 overflow-y-auto custom-scrollbar pr-1">
          <SidebarTagsSection
            files={files}
            setFiles={setFiles}
            language={language}
            onSelectFile={onSelectFile}
            onOpenTagSuggestion={onOpenTagSuggestion}
            t={t}
          />
        </div>
      </div>
    </div>
  );
};
