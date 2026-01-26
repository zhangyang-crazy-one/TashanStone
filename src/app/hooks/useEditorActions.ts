import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { undo as codeMirrorUndo, redo as codeMirrorRedo } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import type {
  CodeMirrorEditorRef,
  EditorPane,
  LinkInsertResult,
  MarkdownFile
} from '@/types';
import { ViewMode } from '@/types';

interface FileHistory {
  past: string[];
  future: string[];
}

interface UseEditorActionsOptions {
  files: MarkdownFile[];
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  activeFile: MarkdownFile;
  activeFileId: string;
  setActiveFileId: Dispatch<SetStateAction<string>>;
  filesRef: MutableRefObject<MarkdownFile[]>;
  cursorPositionsRef: MutableRefObject<Map<string, { start: number; end: number }>>;
  history: Record<string, FileHistory>;
  setHistory: Dispatch<SetStateAction<Record<string, FileHistory>>>;
  lastEditTimeRef: MutableRefObject<number>;
  historyDebounceMs?: number;
  maxHistory?: number;
  openPanes: EditorPane[];
  setOpenPanes: Dispatch<SetStateAction<EditorPane[]>>;
  activePaneId: string | null;
  setActivePaneId: Dispatch<SetStateAction<string | null>>;
  viewMode: ViewMode;
  editorRef: RefObject<HTMLTextAreaElement>;
  codeMirrorRef: RefObject<CodeMirrorEditorRef>;
  showToast: (message: string, isError?: boolean) => void;
  downloadLabel: string;
}

interface UseEditorActionsResult {
  updateActiveFile: (content: string, cursorPosition?: { start: number; end: number }, skipHistory?: boolean) => void;
  handleLinkInsert: (result: LinkInsertResult) => void;
  handleCursorChange: (fileId: string, position: { start: number; end: number }) => void;
  handleCursorSave: (fileId: string, position: { anchor: number; head: number }) => void;
  getCursorPosition: (fileId: string) => { start: number; end: number } | undefined;
  handleUndo: () => void;
  handleRedo: () => void;
  saveSnapshot: () => void;
  renameActiveFile: (newName: string) => void;
  openFileInPane: (fileId: string) => void;
  closePane: (paneId: string) => void;
  togglePaneMode: (paneId: string) => void;
  getActivePaneContent: () => string;
  getActivePaneFileId: () => string | undefined;
  handleTextFormat: (startTag: string, endTag: string) => void;
  handleExport: () => void;
  selectPane: (paneId: string) => void;
  handlePaneContentChange: (fileId: string, content: string) => void;
}

const isEditorView = (view: unknown): view is EditorView => {
  if (typeof view !== 'object' || view === null) return false;
  const maybeView = view as { state?: unknown; dispatch?: unknown; focus?: unknown };
  return typeof maybeView.dispatch === 'function';
};

export const useEditorActions = ({
  files,
  setFiles,
  activeFile,
  activeFileId,
  setActiveFileId,
  filesRef,
  cursorPositionsRef,
  history,
  setHistory,
  lastEditTimeRef,
  historyDebounceMs = 1000,
  maxHistory = 50,
  openPanes,
  setOpenPanes,
  activePaneId,
  setActivePaneId,
  viewMode,
  editorRef,
  codeMirrorRef,
  showToast,
  downloadLabel
}: UseEditorActionsOptions): UseEditorActionsResult => {
  const updateActiveFile = useCallback((content: string, cursorPosition?: { start: number; end: number }, skipHistory = false) => {
    if (!skipHistory) {
      const now = Date.now();
      if (now - lastEditTimeRef.current > historyDebounceMs) {
        setHistory(prev => {
          const fileHist = prev[activeFileId] || { past: [], future: [] };
          const newPast = [...fileHist.past, activeFile.content];
          if (newPast.length > maxHistory) newPast.shift();

          return {
            ...prev,
            [activeFileId]: {
              past: newPast,
              future: []
            }
          };
        });
      }
      lastEditTimeRef.current = now;
    }

    const updated = files.map(f =>
      f.id === activeFileId
        ? { ...f, content, lastModified: Date.now(), cursorPosition: cursorPosition || f.cursorPosition }
        : f
    );

    if (cursorPosition && activeFileId) {
      cursorPositionsRef.current.set(activeFileId, cursorPosition);
    }

    setFiles(updated);
  }, [activeFile.content, activeFileId, cursorPositionsRef, files, historyDebounceMs, lastEditTimeRef, maxHistory, setFiles, setHistory]);

  const handleLinkInsert = useCallback((result: LinkInsertResult) => {
    if (!activeFile) return;

    const { type, fileName, alias, startLine, endLine } = result;

    let linkText = '';
    switch (type) {
      case 'wikilink':
        linkText = alias ? `[[${fileName}|${alias}]]` : `[[${fileName}]]`;
        break;
      case 'blockref':
        if (endLine && endLine > startLine) {
          linkText = `(((${fileName}#${startLine}-${endLine})))`;
        } else {
          linkText = `(((${fileName}#${startLine})))`;
        }
        break;
      case 'quick_link':
        linkText = alias ? `[[${fileName}|${alias}]]` : `[[${fileName}]]`;
        break;
    }

    const cursorPos = activeFile.cursorPosition || {
      start: activeFile.content.length,
      end: activeFile.content.length
    };

    const before = activeFile.content.substring(0, cursorPos.start);
    const after = activeFile.content.substring(cursorPos.end);
    const newContent = before + linkText + after;

    const newCursorPos = {
      start: cursorPos.start + linkText.length,
      end: cursorPos.start + linkText.length
    };

    updateActiveFile(newContent, newCursorPos);
  }, [activeFile, updateActiveFile]);

  const handleCursorChange = useCallback((fileId: string, position: { start: number; end: number }) => {
    cursorPositionsRef.current.set(fileId, position);
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, cursorPosition: position } : f
    ));
  }, [cursorPositionsRef, setFiles]);

  const handleCursorSave = useCallback((fileId: string, position: { anchor: number; head: number }) => {
    const positionForState = { start: position.anchor, end: position.head };
    cursorPositionsRef.current.set(fileId, positionForState);
    setFiles(prev => prev.map(f =>
      f.id === fileId ? { ...f, cursorPosition: positionForState } : f
    ));
  }, [cursorPositionsRef, setFiles]);

  const getCursorPosition = useCallback((fileId: string): { start: number; end: number } | undefined => {
    const refPosition = cursorPositionsRef.current.get(fileId);
    if (refPosition) return refPosition;
    const file = filesRef.current.find(f => f.id === fileId);
    return file?.cursorPosition;
  }, [cursorPositionsRef, filesRef]);

  const handleUndo = useCallback(() => {
    const view = codeMirrorRef.current?.view;
    if (isEditorView(view) && codeMirrorUndo(view)) return;

    const fileHist = history[activeFileId];
    if (!fileHist || fileHist.past.length === 0) return;

    const previous = fileHist.past[fileHist.past.length - 1];
    const newPast = fileHist.past.slice(0, -1);
    const newFuture = [activeFile.content, ...fileHist.future];

    setHistory(prev => ({
      ...prev,
      [activeFileId]: {
        past: newPast,
        future: newFuture
      }
    }));

    updateActiveFile(previous, undefined, true);
  }, [activeFile.content, activeFileId, codeMirrorRef, history, setHistory, updateActiveFile]);

  const handleRedo = useCallback(() => {
    const view = codeMirrorRef.current?.view;
    if (isEditorView(view) && codeMirrorRedo(view)) return;

    const fileHist = history[activeFileId];
    if (!fileHist || fileHist.future.length === 0) return;

    const next = fileHist.future[0];
    const newFuture = fileHist.future.slice(1);
    const newPast = [...fileHist.past, activeFile.content];

    setHistory(prev => ({
      ...prev,
      [activeFileId]: {
        past: newPast,
        future: newFuture
      }
    }));

    updateActiveFile(next, undefined, true);
  }, [activeFile.content, activeFileId, codeMirrorRef, history, setHistory, updateActiveFile]);

  const saveSnapshot = useCallback(() => {
    setHistory(prev => {
      const fileHist = prev[activeFileId] || { past: [], future: [] };
      return {
        ...prev,
        [activeFileId]: {
          past: [...fileHist.past, activeFile.content],
          future: []
        }
      };
    });
    lastEditTimeRef.current = Date.now();
  }, [activeFile.content, activeFileId, lastEditTimeRef, setHistory]);

  const renameActiveFile = useCallback((newName: string) => {
    setFiles(prevFiles => prevFiles.map(f => {
      if (f.id === activeFileId) {
        const oldPath = f.path || f.name;
        const pathParts = oldPath.replace(/\\/g, '/').split('/');
        const oldNameWithExt = pathParts[pathParts.length - 1];

        const lastDotIndex = oldNameWithExt.lastIndexOf('.');
        const ext = lastDotIndex !== -1 ? oldNameWithExt.substring(lastDotIndex) : '';

        let finalName = newName;
        if (ext && !finalName.toLowerCase().endsWith(ext.toLowerCase())) {
          if (finalName.indexOf('.') === -1) {
            finalName += ext;
          }
        }

        pathParts[pathParts.length - 1] = finalName;
        const newPath = pathParts.join('/');

        const nameForDisplay = finalName.includes('.') ? finalName.substring(0, finalName.lastIndexOf('.')) : finalName;

        return { ...f, name: nameForDisplay, path: newPath };
      }
      return f;
    }));
  }, [activeFileId, setFiles]);

  const openFileInPane = useCallback((fileId: string) => {
    const existing = openPanes.find(p => p.fileId === fileId);
    if (existing) {
      setActivePaneId(existing.id);
      setActiveFileId(fileId);
      return;
    }

    const newPane: EditorPane = {
      id: crypto.randomUUID(),
      fileId,
      mode: 'editor'
    };
    setOpenPanes([...openPanes, newPane]);
    setActivePaneId(newPane.id);
    setActiveFileId(fileId);
  }, [openPanes, setActiveFileId, setActivePaneId, setOpenPanes]);

  const closePane = useCallback((paneId: string) => {
    const newPanes = openPanes.filter(p => p.id !== paneId);
    setOpenPanes(newPanes);

    if (activePaneId === paneId) {
      if (newPanes.length > 0) {
        const closedIndex = openPanes.findIndex(p => p.id === paneId);
        const nextIndex = Math.min(closedIndex, newPanes.length - 1);
        const nextPane = newPanes[nextIndex];
        setActivePaneId(nextPane.id);
        setActiveFileId(nextPane.fileId);
      } else {
        setActivePaneId(null);
      }
    }
  }, [activePaneId, openPanes, setActiveFileId, setActivePaneId, setOpenPanes]);

  const togglePaneMode = useCallback((paneId: string) => {
    setOpenPanes(openPanes.map(p =>
      p.id === paneId
        ? { ...p, mode: p.mode === 'editor' ? 'preview' : 'editor' }
        : p
    ));
  }, [openPanes, setOpenPanes]);

  const getActivePaneContent = useCallback((): string => {
    if (activePaneId) {
      const activePane = openPanes.find(p => p.id === activePaneId);
      if (activePane) {
        const file = files.find(f => f.id === activePane.fileId);
        if (file) return file.content;
      }
    }
    return activeFile?.content || '';
  }, [activeFile, activePaneId, files, openPanes]);

  const getActivePaneFileId = useCallback((): string | undefined => {
    if (activePaneId) {
      const activePane = openPanes.find(p => p.id === activePaneId);
      if (activePane) return activePane.fileId;
    }
    return activeFileId || undefined;
  }, [activeFileId, activePaneId, openPanes]);

  const handleTextFormat = useCallback((startTag: string, endTag: string) => {
    const view = codeMirrorRef.current?.view;
    if (isEditorView(view)) {
      const { from, to } = view.state.selection.main;
      const selectedText = view.state.sliceDoc(from, to);
      const insertText = `${startTag}${selectedText}${endTag}`;

      view.dispatch({
        changes: { from, to, insert: insertText },
        selection: {
          anchor: from + startTag.length,
          head: from + startTag.length + selectedText.length
        }
      });
      view.focus();
      return;
    }

    const textarea = editorRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const content = activeFile.content;

    const selectedText = content.substring(start, end);
    const newText = `${startTag}${selectedText}${endTag}`;

    const newContent = content.substring(0, start) + newText + content.substring(end);

    updateActiveFile(newContent);

    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(start + startTag.length, end + startTag.length);
      }
    }, 0);
  }, [activeFile.content, codeMirrorRef, editorRef, updateActiveFile]);

  const handleExport = useCallback(() => {
    if (!activeFile) return;
    try {
      const blob = new Blob([activeFile.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = activeFile.name.endsWith('.md') ? activeFile.name : `${activeFile.name}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`${downloadLabel} Success`);
    } catch {
      showToast('Export failed', true);
    }
  }, [activeFile, downloadLabel, showToast]);

  const selectPane = useCallback((paneId: string) => {
    setActivePaneId(paneId);
    const pane = openPanes.find(p => p.id === paneId);
    if (pane) {
      setActiveFileId(pane.fileId);
    }
  }, [openPanes, setActiveFileId, setActivePaneId]);

  const handlePaneContentChange = useCallback((fileId: string, content: string) => {
    const updated = files.map(f =>
      f.id === fileId ? { ...f, content, lastModified: Date.now() } : f
    );
    setFiles(updated);
  }, [files, setFiles]);

  useEffect(() => {
    if (viewMode === ViewMode.Editor || viewMode === ViewMode.Preview) {
      const targetMode = viewMode === ViewMode.Editor ? 'editor' : 'preview';
      const activePane = openPanes.find(p => p.id === activePaneId);

      if (activePane && activePane.mode !== targetMode) {
        setOpenPanes(prev => prev.map(p =>
          p.id === activePaneId
            ? { ...p, mode: targetMode }
            : p
        ));
      }
    }
  }, [activePaneId, openPanes, setOpenPanes, viewMode]);

  return {
    updateActiveFile,
    handleLinkInsert,
    handleCursorChange,
    handleCursorSave,
    getCursorPosition,
    handleUndo,
    handleRedo,
    saveSnapshot,
    renameActiveFile,
    openFileInPane,
    closePane,
    togglePaneMode,
    getActivePaneContent,
    getActivePaneFileId,
    handleTextFormat,
    handleExport,
    selectPane,
    handlePaneContentChange
  };
};
