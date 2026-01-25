import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ChatMessage, MarkdownFile, MemoryCandidate } from '@/types';
import type { TranslationMap } from '@/utils/translations';
import { generateId } from '@/src/app/appDefaults';

interface UseOverlayActionsOptions {
  files: MarkdownFile[];
  activeFileId: string;
  setFiles: Dispatch<SetStateAction<MarkdownFile[]>>;
  setActiveFileId: Dispatch<SetStateAction<string>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setIsChatOpen: Dispatch<SetStateAction<boolean>>;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setIsVoiceTranscriptionOpen: Dispatch<SetStateAction<boolean>>;
  setIsQuestionBankOpen: Dispatch<SetStateAction<boolean>>;
  setIsTagSuggestionOpen: Dispatch<SetStateAction<boolean>>;
  setIsSmartOrganizeOpen: Dispatch<SetStateAction<boolean>>;
  setSmartOrganizeFile: Dispatch<SetStateAction<MarkdownFile | null>>;
  setIsStudyPlanOpen: Dispatch<SetStateAction<boolean>>;
  setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
  setIsLinkInsertOpen: Dispatch<SetStateAction<boolean>>;
  setShowCompactMemoryPrompt: Dispatch<SetStateAction<boolean>>;
  setCompactMemoryCandidate: Dispatch<SetStateAction<MemoryCandidate | null>>;
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  showToast: (message: string, isError?: boolean) => void;
  t: TranslationMap;
}

interface UseOverlayActionsResult {
  handleCloseSidebarMobile: () => void;
  handleToggleSidebar: () => void;
  handleToggleChat: () => void;
  handleOpenSettings: () => void;
  handleCloseSettings: () => void;
  handleOpenVoiceTranscription: () => void;
  handleCloseVoiceTranscription: () => void;
  handleOpenQuestionBank: () => void;
  handleCloseQuestionBank: () => void;
  handleOpenTagSuggestion: () => void;
  handleCloseTagSuggestion: () => void;
  handleOpenSmartOrganize: (file: MarkdownFile) => void;
  handleCloseSmartOrganize: () => void;
  handleOpenReview: () => void;
  handleCloseStudyPlan: () => void;
  handleCloseSearch: () => void;
  handleCloseCompactMemory: () => void;
  handleCloseLinkInsert: () => void;
  handleCloseChat: () => void;
  handleClearChat: () => void;
  handleTranscriptionSaveToFile: (fileId: string, content: string, mode: 'append' | 'replace') => void;
  handleTranscriptionCreateNewFile: (content: string) => void;
}

export const useOverlayActions = ({
  files,
  activeFileId,
  setFiles,
  setActiveFileId,
  setIsSidebarOpen,
  setIsChatOpen,
  setIsSettingsOpen,
  setIsVoiceTranscriptionOpen,
  setIsQuestionBankOpen,
  setIsTagSuggestionOpen,
  setIsSmartOrganizeOpen,
  setSmartOrganizeFile,
  setIsStudyPlanOpen,
  setIsSearchOpen,
  setIsLinkInsertOpen,
  setShowCompactMemoryPrompt,
  setCompactMemoryCandidate,
  setChatMessages,
  showToast,
  t
}: UseOverlayActionsOptions): UseOverlayActionsResult => {
  const handleCloseSidebarMobile = useCallback(() => {
    setIsSidebarOpen(false);
  }, [setIsSidebarOpen]);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, [setIsSidebarOpen]);

  const handleToggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev);
  }, [setIsChatOpen]);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, [setIsSettingsOpen]);

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, [setIsSettingsOpen]);

  const handleOpenVoiceTranscription = useCallback(() => {
    setIsVoiceTranscriptionOpen(true);
  }, [setIsVoiceTranscriptionOpen]);

  const handleCloseVoiceTranscription = useCallback(() => {
    setIsVoiceTranscriptionOpen(false);
  }, [setIsVoiceTranscriptionOpen]);

  const handleOpenQuestionBank = useCallback(() => {
    setIsQuestionBankOpen(true);
  }, [setIsQuestionBankOpen]);

  const handleCloseQuestionBank = useCallback(() => {
    setIsQuestionBankOpen(false);
  }, [setIsQuestionBankOpen]);

  const handleOpenTagSuggestion = useCallback(() => {
    setIsTagSuggestionOpen(true);
  }, [setIsTagSuggestionOpen]);

  const handleCloseTagSuggestion = useCallback(() => {
    setIsTagSuggestionOpen(false);
  }, [setIsTagSuggestionOpen]);

  const handleOpenSmartOrganize = useCallback((file: MarkdownFile) => {
    setSmartOrganizeFile(file);
    setIsSmartOrganizeOpen(true);
  }, [setIsSmartOrganizeOpen, setSmartOrganizeFile]);

  const handleCloseSmartOrganize = useCallback(() => {
    setIsSmartOrganizeOpen(false);
    setSmartOrganizeFile(null);
  }, [setIsSmartOrganizeOpen, setSmartOrganizeFile]);

  const handleOpenReview = useCallback(() => {
    setIsStudyPlanOpen(true);
  }, [setIsStudyPlanOpen]);

  const handleCloseStudyPlan = useCallback(() => {
    setIsStudyPlanOpen(false);
  }, [setIsStudyPlanOpen]);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, [setIsSearchOpen]);

  const handleCloseCompactMemory = useCallback(() => {
    setShowCompactMemoryPrompt(false);
    setCompactMemoryCandidate(null);
  }, [setCompactMemoryCandidate, setShowCompactMemoryPrompt]);

  const handleCloseLinkInsert = useCallback(() => {
    setIsLinkInsertOpen(false);
  }, [setIsLinkInsertOpen]);

  const handleCloseChat = useCallback(() => {
    setIsChatOpen(false);
  }, [setIsChatOpen]);

  const handleClearChat = useCallback(() => {
    setChatMessages([]);
  }, [setChatMessages]);

  const handleTranscriptionSaveToFile = useCallback((fileId: string, content: string, mode: 'append' | 'replace') => {
    const targetFile = files.find(file => file.id === fileId);
    if (!targetFile) return;

    const newContent = mode === 'append'
      ? `${targetFile.content}\n\n${content}`
      : content;
    const updatedFile = { ...targetFile, content: newContent, lastModified: Date.now() };
    setFiles(prev => prev.map(file => (file.id === fileId ? updatedFile : file)));
    if (activeFileId === fileId) {
      setActiveFileId(fileId);
    }
    showToast(t.transcription.savedToFile, false);
  }, [activeFileId, files, setActiveFileId, setFiles, showToast, t]);

  const handleTranscriptionCreateNewFile = useCallback((content: string) => {
    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15);
    const newFile: MarkdownFile = {
      id: generateId(),
      name: `Transcription_${timestamp}.md`,
      content,
      lastModified: Date.now()
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
    showToast(t.transcription.savedToFile, false);
  }, [setActiveFileId, setFiles, showToast, t]);

  return {
    handleCloseSidebarMobile,
    handleToggleSidebar,
    handleToggleChat,
    handleOpenSettings,
    handleCloseSettings,
    handleOpenVoiceTranscription,
    handleCloseVoiceTranscription,
    handleOpenQuestionBank,
    handleCloseQuestionBank,
    handleOpenTagSuggestion,
    handleCloseTagSuggestion,
    handleOpenSmartOrganize,
    handleCloseSmartOrganize,
    handleOpenReview,
    handleCloseStudyPlan,
    handleCloseSearch,
    handleCloseCompactMemory,
    handleCloseLinkInsert,
    handleCloseChat,
    handleClearChat,
    handleTranscriptionSaveToFile,
    handleTranscriptionCreateNewFile
  };
};
