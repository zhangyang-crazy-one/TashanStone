import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { MarkdownFile } from '@/types';
import type { TranslationMap } from '@/utils/translations';
import { generateId } from '@/src/app/appDefaults';
import type { VectorStore } from '@/services/ragService';

interface UseFileOperationsOptions {
  files: MarkdownFile[];
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  activeFileId: string;
  setActiveFileId: Dispatch<SetStateAction<string>>;
  vectorStore: VectorStore;
  showToast: (message: string, isError?: boolean) => void;
  showConfirmDialog: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info', confirmText?: string, cancelText?: string) => void;
  t: TranslationMap;
}

interface UseFileOperationsResult {
  handleCreateItem: (type: 'file' | 'folder', name: string, parentPath?: string) => void;
  handleMoveItem: (sourceId: string, targetFolderPath: string | null) => void;
  handleDeleteFile: (id: string) => Promise<void>;
}

export const useFileOperations = ({
  files,
  setFiles,
  activeFileId,
  setActiveFileId,
  vectorStore,
  showToast,
  showConfirmDialog,
  t
}: UseFileOperationsOptions): UseFileOperationsResult => {
  const handleCreateItem = useCallback((type: 'file' | 'folder', name: string, parentPath: string = '') => {
    const sanitizedName = name.replace(/[\\/:*?"<>|]/g, '-');
    let finalPath = parentPath ? `${parentPath}/${sanitizedName}` : sanitizedName;

    if (files.some(file => (file.path || file.name) === finalPath || (file.path || file.name) === `${finalPath}.md`)) {
      showToast('An item with this name already exists', true);
      return;
    }

    const newFileId = generateId();

    if (type === 'folder') {
      const folderKeeper: MarkdownFile = {
        id: newFileId,
        name: '.keep',
        content: '',
        lastModified: Date.now(),
        path: `${finalPath}/.keep`
      };
      setFiles(prev => [...prev, folderKeeper]);
      showToast(`Folder '${sanitizedName}' created`);
    } else {
      if (!finalPath.toLowerCase().endsWith('.md')) {
        finalPath += '.md';
      }

      const newFile: MarkdownFile = {
        id: newFileId,
        name: sanitizedName,
        content: '',
        lastModified: Date.now(),
        path: finalPath
      };
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);
      showToast(`File '${sanitizedName}' created`);
    }
  }, [files, setActiveFileId, setFiles, showToast]);

  const handleMoveItem = useCallback((sourceId: string, targetFolderPath: string | null) => {
    const sourceFile = files.find(file => file.id === sourceId);
    if (!sourceFile) return;

    const sourcePath = sourceFile.path || sourceFile.name;
    const isFolder = sourceFile.name === '.keep';
    const actualSourcePath = isFolder ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : sourcePath;
    const sourceName = isFolder ? actualSourcePath.split('/').pop() : sourceFile.name;

    if (isFolder && targetFolderPath) {
      if (targetFolderPath === actualSourcePath || targetFolderPath.startsWith(`${actualSourcePath}/`)) {
        showToast('Cannot move folder into itself', true);
        return;
      }
    }

    const newFiles = files.map(file => {
      const currentPath = file.path || file.name;

      if (!isFolder && file.id === sourceId) {
        const fileName = currentPath.split('/').pop();
        const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;
        if (files.some(existing => (existing.path || existing.name) === newPath && existing.id !== sourceId)) {
          showToast('File with same name exists in destination', true);
          return file;
        }
        return { ...file, path: newPath! };
      }

      if (isFolder && currentPath.startsWith(actualSourcePath!)) {
        const relativePath = currentPath.substring(actualSourcePath!.length);
        const newRootPath = targetFolderPath ? `${targetFolderPath}/${sourceName}` : sourceName;
        return { ...file, path: newRootPath + relativePath };
      }

      return file;
    });

    setFiles(newFiles);
  }, [files, setFiles, showToast]);

  const handleDeleteFile = useCallback(async (id: string) => {
    if (files.length <= 1) return;
    const fileToDelete = files.find(file => file.id === id);
    const fileName = fileToDelete?.name || 'this file';

    showConfirmDialog(
      t.deleteFileTitle,
      t.deleteFileMessage.replace('this file', fileName),
      async () => {
        await vectorStore.deleteByFile(id);

        const newFiles = files.filter(file => file.id !== id);
        setFiles(newFiles);
        if (activeFileId === id && newFiles.length > 0) setActiveFileId(newFiles[0].id);
      },
      'danger',
      t.delete,
      t.cancel
    );
  }, [activeFileId, files, setActiveFileId, setFiles, showConfirmDialog, t, vectorStore]);

  return {
    handleCreateItem,
    handleMoveItem,
    handleDeleteFile
  };
};
