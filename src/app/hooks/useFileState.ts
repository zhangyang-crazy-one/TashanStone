import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import type { EditorPane, MarkdownFile } from '@/types';
import { saveFileToDisk } from '@/services/fileService';
import { DEFAULT_FILE, generateId } from '@/src/app/appDefaults';

interface FileHistory {
  past: string[];
  future: string[];
}

interface UseFileStateResult {
  files: MarkdownFile[];
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  activeFileId: string;
  setActiveFileId: Dispatch<SetStateAction<string>>;
  activeFile: MarkdownFile;
  history: Record<string, FileHistory>;
  setHistory: Dispatch<SetStateAction<Record<string, FileHistory>>>;
  lastEditTimeRef: MutableRefObject<number>;
  openPanes: EditorPane[];
  setOpenPanes: Dispatch<SetStateAction<EditorPane[]>>;
  activePaneId: string | null;
  setActivePaneId: Dispatch<SetStateAction<string | null>>;
  splitMode: 'none' | 'horizontal' | 'vertical';
  setSplitMode: Dispatch<SetStateAction<'none' | 'horizontal' | 'vertical'>>;
  filesRef: MutableRefObject<MarkdownFile[]>;
  activeFileIdRef: MutableRefObject<string>;
  cursorPositionsRef: MutableRefObject<Map<string, { start: number; end: number }>>;
}

export const useFileState = (): UseFileStateResult => {
  const [files, setFiles] = useState<MarkdownFile[]>(() => {
    try {
      const saved = localStorage.getItem('neon-files');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Robust sanitization to prevent crashes
        if (Array.isArray(parsed)) {
          const validFiles = parsed.filter(f => f && typeof f === 'object' && f.id && f.name);
          if (validFiles.length > 0) {
            // Deduplicate by name - keep only the latest version of each file
            const deduped = new Map<string, MarkdownFile>();
            for (const file of validFiles) {
              const key = file.path || file.name;
              const existing = deduped.get(key);
              // Keep the one with the latest lastModified, or the first one if timestamps match
              if (!existing || (file.lastModified > existing.lastModified)) {
                deduped.set(key, file);
              }
            }
            const dedupedFiles = Array.from(deduped.values());
            if (dedupedFiles.length !== validFiles.length) {
              console.log(`[App] Deduplicated files: ${validFiles.length} -> ${dedupedFiles.length}`);
            }
            return dedupedFiles;
          }
        }
      }
    } catch (e) {
      console.error('Failed to load files from storage, using default', e);
    }
    return [DEFAULT_FILE];
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const saved = localStorage.getItem('neon-active-id');
    return saved || 'default-1';
  });

  const activeFile = useMemo(
    () => files.find(f => f.id === activeFileId) || files[0] || DEFAULT_FILE,
    [files, activeFileId]
  );

  const [history, setHistory] = useState<Record<string, FileHistory>>({});
  const lastEditTimeRef = useRef<number>(0);

  const [openPanes, setOpenPanes] = useState<EditorPane[]>(() => {
    try {
      const saved = localStorage.getItem('neon-editor-panes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activePaneId, setActivePaneId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('neon-active-pane');
      return saved || null;
    } catch (e) {
      return null;
    }
  });
  const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>(() => {
    try {
      const saved = localStorage.getItem('neon-split-mode');
      return (saved as 'none' | 'horizontal' | 'vertical') || 'none';
    } catch (e) {
      return 'none';
    }
  });

  const filesRef = useRef(files);
  const activeFileIdRef = useRef(activeFileId);
  const cursorPositionsRef = useRef<Map<string, { start: number; end: number }>>(new Map());

  useEffect(() => {
    filesRef.current = files;
    activeFileIdRef.current = activeFileId;
  }, [files, activeFileId]);

  useEffect(() => {
    localStorage.setItem('neon-editor-panes', JSON.stringify(openPanes));
  }, [openPanes]);

  useEffect(() => {
    localStorage.setItem('neon-active-pane', activePaneId || '');
  }, [activePaneId]);

  useEffect(() => {
    localStorage.setItem('neon-split-mode', splitMode);
  }, [splitMode]);

  useEffect(() => {
    if (openPanes.length === 0 && files.length > 0) {
      const defaultFile = files.find(f => f.id === activeFileId) || files[0];
      if (defaultFile) {
        const newPaneId = generateId();
        const newPane: EditorPane = {
          id: newPaneId,
          fileId: defaultFile.id,
          mode: 'editor'
        };
        setOpenPanes([newPane]);
        setActivePaneId(newPaneId);
        console.log('[App] Created default editor pane for:', defaultFile.name);
      }
    }
  }, [openPanes.length, files.length, activeFileId]);

  useEffect(() => {
    const autoSave = async () => {
      const filesToSave = filesRef.current.map(f => ({
        ...f,
        handle: undefined
      }));
      localStorage.setItem('neon-files', JSON.stringify(filesToSave));
      localStorage.setItem('neon-active-id', activeFileIdRef.current);

      const activeId = activeFileIdRef.current;
      const currentActive = filesRef.current.find(f => f.id === activeId);

      if (currentActive && currentActive.isLocal && currentActive.handle) {
        try {
          await saveFileToDisk(currentActive);
          console.log(`[AutoSave] Saved ${currentActive.name} to disk.`);
        } catch (err) {
          console.warn(`[AutoSave] Failed to save ${currentActive.name} to disk`, err);
        }
      }
    };

    const intervalId = setInterval(autoSave, 30000);
    return () => clearInterval(intervalId);
  }, []);

  return {
    files,
    setFiles,
    activeFileId,
    setActiveFileId,
    activeFile,
    history,
    setHistory,
    lastEditTimeRef,
    openPanes,
    setOpenPanes,
    activePaneId,
    setActivePaneId,
    splitMode,
    setSplitMode,
    filesRef,
    activeFileIdRef,
    cursorPositionsRef
  };
};
