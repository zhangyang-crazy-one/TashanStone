import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { AIState } from '@/types';
import type { ConfirmDialogState } from '@/src/app/hooks/useAppUiState';

interface UseAppNotificationsOptions {
  setAiState: Dispatch<SetStateAction<AIState>>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState>>;
}

interface UseAppNotificationsResult {
  showToast: (message: string, isError?: boolean) => void;
  showConfirmDialog: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: 'danger' | 'warning' | 'info',
    confirmText?: string,
    cancelText?: string
  ) => void;
  closeConfirmDialog: () => void;
}

export const useAppNotifications = ({
  setAiState,
  setConfirmDialog
}: UseAppNotificationsOptions): UseAppNotificationsResult => {
  const showToast = useCallback((message: string, isError: boolean = false) => {
    setAiState({ isThinking: false, error: isError ? message : null, message: isError ? null : message });
    window.setTimeout(() => setAiState(prev => ({ ...prev, message: null, error: null })), 4000);
  }, [setAiState]);

  const showConfirmDialog = useCallback((
    title: string,
    message: string,
    onConfirm: () => void,
    type: 'danger' | 'warning' | 'info' = 'warning',
    confirmText?: string,
    cancelText?: string
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      confirmText,
      cancelText,
      type,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  }, [setConfirmDialog]);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, [setConfirmDialog]);

  return {
    showToast,
    showConfirmDialog,
    closeConfirmDialog
  };
};
