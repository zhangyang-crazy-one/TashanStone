import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { AIState, AppShortcut, MarkdownFile } from '@/types';
import { DEFAULT_SHORTCUTS } from '@/src/app/appDefaults';
import { saveFileToDisk } from '@/services/fileService';

interface UseKeyboardShortcutsOptions {
  activeFile: MarkdownFile;
  activeFileId: string;
  aiState: AIState;
  files: MarkdownFile[];
  handleCreateItem: (type: 'file' | 'folder', name: string, parentPath?: string) => void;
  performPolish: () => Promise<void>;
  performGraph: (useActiveFileOnly?: boolean, graphTypeOverride?: 'concept' | 'filelink') => Promise<void>;
  showToast: (message: string, isError?: boolean) => void;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setIsChatOpen: Dispatch<SetStateAction<boolean>>;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
  setIsSmartOrganizeOpen: Dispatch<SetStateAction<boolean>>;
  setSmartOrganizeFile: Dispatch<SetStateAction<MarkdownFile | null>>;
  setLinkInsertMode: Dispatch<SetStateAction<'wikilink' | 'blockref' | 'quick_link'>>;
  setIsLinkInsertOpen: Dispatch<SetStateAction<boolean>>;
}

interface UseKeyboardShortcutsResult {
  shortcuts: AppShortcut[];
  handleUpdateShortcut: (id: string, keys: string) => void;
  handleResetShortcuts: () => void;
}

export const useKeyboardShortcuts = ({
  activeFile,
  activeFileId,
  aiState,
  files,
  handleCreateItem,
  performPolish,
  performGraph,
  showToast,
  setIsSaving,
  setIsSidebarOpen,
  setIsChatOpen,
  setIsSettingsOpen,
  setIsSearchOpen,
  setIsSmartOrganizeOpen,
  setSmartOrganizeFile,
  setLinkInsertMode,
  setIsLinkInsertOpen
}: UseKeyboardShortcutsOptions): UseKeyboardShortcutsResult => {
  const [shortcuts, setShortcuts] = useState<AppShortcut[]>(() => {
    try {
      const saved = localStorage.getItem('neon-shortcuts');
      return saved ? JSON.parse(saved) : DEFAULT_SHORTCUTS;
    } catch {
      return DEFAULT_SHORTCUTS;
    }
  });

  useEffect(() => {
    localStorage.setItem('neon-shortcuts', JSON.stringify(shortcuts));
  }, [shortcuts]);

  const handleShortcutCommand = useCallback((actionId: string) => {
    switch (actionId) {
      case 'save':
        if (activeFile.isLocal && activeFile.handle) {
          setIsSaving(true);
          saveFileToDisk(activeFile).then(() => {
            showToast('File Saved', false);
            setIsSaving(false);
          }).catch(() => setIsSaving(false));
        } else {
          showToast('Saved locally', false);
        }
        break;
      case 'toggle_sidebar':
        setIsSidebarOpen(prev => !prev);
        break;
      case 'toggle_chat':
        setIsChatOpen(prev => !prev);
        break;
      case 'open_settings':
        setIsSettingsOpen(true);
        break;
      case 'new_file':
        handleCreateItem('file', 'Untitled', '');
        break;
      case 'ai_polish':
        if (!aiState.isThinking) void performPolish();
        break;
      case 'build_graph':
        if (!aiState.isThinking) void performGraph();
        break;
      case 'smart_organize': {
        const file = files.find(item => item.id === activeFileId);
        if (file) {
          setSmartOrganizeFile(file);
          setIsSmartOrganizeOpen(true);
        }
        break;
      }
      case 'search':
        setIsSearchOpen(true);
        break;
      case 'insert_wikilink':
        setLinkInsertMode('wikilink');
        setIsLinkInsertOpen(true);
        break;
      case 'insert_blockref':
        setLinkInsertMode('blockref');
        setIsLinkInsertOpen(true);
        break;
      case 'quick_link':
        setLinkInsertMode('quick_link');
        setIsLinkInsertOpen(true);
        break;
      default:
        console.warn(`Unknown action ID: ${actionId}`);
    }
  }, [
    activeFile,
    activeFileId,
    aiState.isThinking,
    files,
    handleCreateItem,
    performGraph,
    performPolish,
    setIsChatOpen,
    setIsSaving,
    setIsSearchOpen,
    setIsSettingsOpen,
    setIsSidebarOpen,
    setIsSmartOrganizeOpen,
    setIsLinkInsertOpen,
    setLinkInsertMode,
    setSmartOrganizeFile,
    showToast
  ]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const parts: string[] = [];
      if (event.ctrlKey) parts.push('Ctrl');
      if (event.metaKey) parts.push('Cmd');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');

      let key = event.key;
      if (key === ' ') key = 'Space';
      if (key.length === 1) key = key.toUpperCase();

      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        parts.push(key);
      }

      const combo = parts.join('+');
      const match = shortcuts.find(shortcut => shortcut.keys === combo);
      if (match) {
        event.preventDefault();
        handleShortcutCommand(match.actionId);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleShortcutCommand, shortcuts]);

  const handleUpdateShortcut = useCallback((id: string, keys: string) => {
    setShortcuts(prev => prev.map(s => (s.id === id ? { ...s, keys } : s)));
  }, []);

  const handleResetShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
  }, []);

  return {
    shortcuts,
    handleUpdateShortcut,
    handleResetShortcuts
  };
};
