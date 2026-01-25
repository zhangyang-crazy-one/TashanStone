import { useCallback } from 'react';

interface UseToolbarActionsOptions {
  updateActiveFile: (content: string, cursorPosition?: { start: number; end: number }, skipHistory?: boolean) => void;
  handleTextFormat: (startTag: string, endTag: string) => void;
}

interface UseToolbarActionsResult {
  handleClearEditor: () => void;
  handleFormatBold: () => void;
  handleFormatItalic: () => void;
}

export const useToolbarActions = ({
  updateActiveFile,
  handleTextFormat
}: UseToolbarActionsOptions): UseToolbarActionsResult => {
  const handleClearEditor = useCallback(() => {
    updateActiveFile('');
  }, [updateActiveFile]);

  const handleFormatBold = useCallback(() => {
    handleTextFormat('**', '**');
  }, [handleTextFormat]);

  const handleFormatItalic = useCallback(() => {
    handleTextFormat('*', '*');
  }, [handleTextFormat]);

  return {
    handleClearEditor,
    handleFormatBold,
    handleFormatItalic
  };
};
