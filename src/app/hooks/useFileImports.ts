import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { AIConfig, AIState, MarkdownFile, OCRStats } from '@/types';
import type { TranslationMap } from '@/utils/translations';
import { extractTextFromFile, isExtensionSupported, processPdfFile, readDirectoryEnhanced } from '@/services/fileService';
import { generateId } from '@/src/app/appDefaults';

interface UseFileImportsOptions {
  aiConfig: AIConfig;
  setAiState: Dispatch<SetStateAction<AIState>>;
  setOcrStats: Dispatch<SetStateAction<OCRStats>>;
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  setActiveFileId: Dispatch<SetStateAction<string>>;
  showToast: (message: string, isError?: boolean) => void;
  handleIndexKnowledgeBase: (forceList?: MarkdownFile[]) => Promise<void> | void;
  t: TranslationMap;
}

interface UseFileImportsResult {
  handleOpenFolder: () => Promise<void>;
  handleImportFolderFiles: (fileList: FileList) => Promise<void>;
  handleImportPdf: (file: File) => Promise<void>;
}

export const useFileImports = ({
  aiConfig,
  setAiState,
  setOcrStats,
  setFiles,
  setActiveFileId,
  showToast,
  handleIndexKnowledgeBase,
  t
}: UseFileImportsOptions): UseFileImportsResult => {
  const handleOpenFolder = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('Directory Picker not supported');
    }
    const dirHandle = await window.showDirectoryPicker();

    setAiState({ isThinking: true, message: t.processingFile, error: null });

    const loadedFiles = await readDirectoryEnhanced(
      dirHandle,
      aiConfig.apiKey,
      (progress) => {
        setAiState({
          isThinking: true,
          message: `${t.processingFile} (${progress.processedFiles + 1}/${progress.totalFiles}): ${progress.currentFile}`,
          error: null
        });
      }
    );

    setAiState({ isThinking: false, message: null, error: null });

    if (loadedFiles.length > 0) {
      setFiles(loadedFiles);
      setActiveFileId(loadedFiles[0].id);
      showToast(`${t.filesLoaded}: ${loadedFiles.length}`);
      void handleIndexKnowledgeBase(loadedFiles);
    } else {
      showToast(t.noFilesFound);
    }
  }, [aiConfig.apiKey, handleIndexKnowledgeBase, setActiveFileId, setAiState, setFiles, showToast, t]);

  const handleImportFolderFiles = useCallback(async (fileList: FileList) => {
    const newFiles: MarkdownFile[] = [];
    setAiState({ isThinking: true, message: t.processingFile, error: null });

    const supportedFiles: File[] = [];
    for (let i = 0; i < fileList.length; i += 1) {
      if (isExtensionSupported(fileList[i].name)) {
        supportedFiles.push(fileList[i]);
      }
    }

    setOcrStats({
      isProcessing: true,
      totalPages: supportedFiles.length,
      processedPages: 0,
      currentFile: supportedFiles[0]?.name || ''
    });

    try {
      for (let i = 0; i < supportedFiles.length; i += 1) {
        const file = supportedFiles[i];
        const isPdf = file.name.toLowerCase().endsWith('.pdf');

        setOcrStats(prev => ({
          ...prev,
          processedPages: i,
          currentFile: isPdf ? `${file.name} (OCR)` : file.name
        }));

        let content: string;
        if (isPdf) {
          content = await processPdfFile(file, aiConfig.apiKey, {
            onProgress: (current, total, isOcr) => {
              setOcrStats(prev => ({
                ...prev,
                currentFile: isOcr ? `${file.name} (OCR ${current}/${total})` : `${file.name} (${current}/${total})`
              }));
            }
          });
        } else {
          content = await extractTextFromFile(file, aiConfig.apiKey);
        }

        let path = file.webkitRelativePath || file.name;
        if (path.match(/\.(pdf|docx|doc)$/i)) {
          path = path.replace(/\.(pdf|docx|doc)$/i, '.md');
        }

        newFiles.push({
          id: `${generateId()}-${i}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          content,
          lastModified: file.lastModified,
          isLocal: false,
          path
        });

        setOcrStats(prev => ({
          ...prev,
          processedPages: i + 1
        }));
      }

      if (newFiles.length > 0) {
        let combinedFiles: MarkdownFile[] = [];

        setFiles(prev => {
          const existingPaths = new Set(prev.map(file => file.path || file.name));
          const uniqueNew = newFiles.filter(file => !existingPaths.has(file.path || file.name));
          combinedFiles = [...prev, ...uniqueNew];
          return combinedFiles;
        });

        setActiveFileId(newFiles[0].id);

        if (combinedFiles.length > 0) {
          void handleIndexKnowledgeBase(combinedFiles);
        }

        showToast(`${t.filesLoaded}: ${newFiles.length}`);
      } else {
        showToast(t.noFilesFound);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(message, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
      setOcrStats({ isProcessing: false, totalPages: 0, processedPages: 0 });
    }
  }, [aiConfig.apiKey, handleIndexKnowledgeBase, setActiveFileId, setAiState, setFiles, setOcrStats, showToast, t]);

  const handleImportPdf = useCallback(async (file: File) => {
    setAiState({ isThinking: true, message: t.processingFile, error: null });
    setOcrStats({ isProcessing: true, totalPages: 0, processedPages: 0, currentFile: file.name });
    try {
      const mdContent = await processPdfFile(file, aiConfig.apiKey, {
        onProgress: (current, total, isOcr) => {
          setOcrStats(prev => ({
            ...prev,
            processedPages: current,
            totalPages: total,
            currentFile: isOcr ? `${file.name} (OCR)` : file.name
          }));
        }
      });
      const newFile: MarkdownFile = {
        id: generateId(),
        name: file.name.replace('.pdf', ''),
        content: mdContent,
        lastModified: Date.now(),
        path: file.name.replace('.pdf', '.md')
      };

      let updatedList: MarkdownFile[] = [];
      setFiles(prev => {
        if (prev.some(existing => (existing.path || existing.name) === newFile.path)) {
          updatedList = prev;
          return prev;
        }
        updatedList = [...prev, newFile];
        return updatedList;
      });

      if (updatedList.length > 0) {
        void handleIndexKnowledgeBase(updatedList);
      }

      setActiveFileId(newFile.id);
      showToast(t.importSuccess);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(`${t.importFail}: ${message}`, true);
    } finally {
      setAiState(prev => ({ ...prev, isThinking: false, message: null }));
      setOcrStats({ isProcessing: false, totalPages: 0, processedPages: 0 });
    }
  }, [aiConfig.apiKey, handleIndexKnowledgeBase, setActiveFileId, setAiState, setFiles, setOcrStats, showToast, t]);

  return {
    handleOpenFolder,
    handleImportFolderFiles,
    handleImportPdf
  };
};
