import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ViewMode } from '@/types';
import type {
  AIState,
  MarkdownFile,
  MemoryCandidate,
  RAGStats,
  OCRStats
} from '@/types';

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
}

interface UseAppUiStateResult {
  viewMode: ViewMode;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  isSaving: boolean;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  isSidebarOpen: boolean;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  isChatOpen: boolean;
  setIsChatOpen: Dispatch<SetStateAction<boolean>>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: Dispatch<SetStateAction<boolean>>;
  isVoiceTranscriptionOpen: boolean;
  setIsVoiceTranscriptionOpen: Dispatch<SetStateAction<boolean>>;
  isSearchOpen: boolean;
  setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
  aiState: AIState;
  setAiState: Dispatch<SetStateAction<AIState>>;
  ragStats: RAGStats;
  setRagStats: Dispatch<SetStateAction<RAGStats>>;
  ocrStats: OCRStats;
  setOcrStats: Dispatch<SetStateAction<OCRStats>>;
  isQuestionBankOpen: boolean;
  setIsQuestionBankOpen: Dispatch<SetStateAction<boolean>>;
  isTagSuggestionOpen: boolean;
  setIsTagSuggestionOpen: Dispatch<SetStateAction<boolean>>;
  isSmartOrganizeOpen: boolean;
  setIsSmartOrganizeOpen: Dispatch<SetStateAction<boolean>>;
  smartOrganizeFile: MarkdownFile | null;
  setSmartOrganizeFile: Dispatch<SetStateAction<MarkdownFile | null>>;
  isStudyPlanOpen: boolean;
  setIsStudyPlanOpen: Dispatch<SetStateAction<boolean>>;
  confirmDialog: ConfirmDialogState;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>;
  isLinkInsertOpen: boolean;
  setIsLinkInsertOpen: Dispatch<SetStateAction<boolean>>;
  linkInsertMode: 'wikilink' | 'blockref' | 'quick_link';
  setLinkInsertMode: Dispatch<SetStateAction<'wikilink' | 'blockref' | 'quick_link'>>;
  showCompactMemoryPrompt: boolean;
  setShowCompactMemoryPrompt: Dispatch<SetStateAction<boolean>>;
  compactMemoryCandidate: MemoryCandidate | null;
  setCompactMemoryCandidate: Dispatch<SetStateAction<MemoryCandidate | null>>;
  isCompactSaving: boolean;
  setIsCompactSaving: Dispatch<SetStateAction<boolean>>;
}

export const useAppUiState = (): UseAppUiStateResult => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Split);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVoiceTranscriptionOpen, setIsVoiceTranscriptionOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [aiState, setAiState] = useState<AIState>({ isThinking: false, error: null, message: null });
  const [ragStats, setRagStats] = useState<RAGStats>({ totalFiles: 0, indexedFiles: 0, totalChunks: 0, isIndexing: false });
  const [ocrStats, setOcrStats] = useState<OCRStats>({ isProcessing: false, totalPages: 0, processedPages: 0 });
  const [isQuestionBankOpen, setIsQuestionBankOpen] = useState(false);
  const [isTagSuggestionOpen, setIsTagSuggestionOpen] = useState(false);
  const [isSmartOrganizeOpen, setIsSmartOrganizeOpen] = useState(false);
  const [smartOrganizeFile, setSmartOrganizeFile] = useState<MarkdownFile | null>(null);
  const [isStudyPlanOpen, setIsStudyPlanOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });
  const [isLinkInsertOpen, setIsLinkInsertOpen] = useState(false);
  const [linkInsertMode, setLinkInsertMode] = useState<'wikilink' | 'blockref' | 'quick_link'>('wikilink');
  const [showCompactMemoryPrompt, setShowCompactMemoryPrompt] = useState(false);
  const [compactMemoryCandidate, setCompactMemoryCandidate] = useState<MemoryCandidate | null>(null);
  const [isCompactSaving, setIsCompactSaving] = useState(false);

  return {
    viewMode,
    setViewMode,
    isSaving,
    setIsSaving,
    isSidebarOpen,
    setIsSidebarOpen,
    isChatOpen,
    setIsChatOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    isVoiceTranscriptionOpen,
    setIsVoiceTranscriptionOpen,
    isSearchOpen,
    setIsSearchOpen,
    aiState,
    setAiState,
    ragStats,
    setRagStats,
    ocrStats,
    setOcrStats,
    isQuestionBankOpen,
    setIsQuestionBankOpen,
    isTagSuggestionOpen,
    setIsTagSuggestionOpen,
    isSmartOrganizeOpen,
    setIsSmartOrganizeOpen,
    smartOrganizeFile,
    setSmartOrganizeFile,
    isStudyPlanOpen,
    setIsStudyPlanOpen,
    confirmDialog,
    setConfirmDialog,
    isLinkInsertOpen,
    setIsLinkInsertOpen,
    linkInsertMode,
    setLinkInsertMode,
    showCompactMemoryPrompt,
    setShowCompactMemoryPrompt,
    compactMemoryCandidate,
    setCompactMemoryCandidate,
    isCompactSaving,
    setIsCompactSaving
  };
};
