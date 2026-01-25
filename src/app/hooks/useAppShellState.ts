import { useCallback } from 'react';

import type { AppShellProps } from '@/components/App/AppShell';

interface UseAppShellStateOptions extends Omit<AppShellProps, 'onRefreshIndex'> {
  handleIndexKnowledgeBase: () => Promise<void>;
}

export const useAppShellState = ({
  handleIndexKnowledgeBase,
  ...rest
}: UseAppShellStateOptions): AppShellProps => {
  const onRefreshIndex = useCallback(() => {
    void handleIndexKnowledgeBase();
  }, [handleIndexKnowledgeBase]);

  return {
    ...rest,
    onRefreshIndex
  };
};
