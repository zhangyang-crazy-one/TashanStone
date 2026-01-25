import React, { memo } from 'react';

import { AppOverlays, type AppOverlaysProps } from './AppOverlays';

interface AppOverlaysContainerProps {
  overlays: AppOverlaysProps;
}

export const AppOverlaysContainer = memo(({ overlays }: AppOverlaysContainerProps) => {
  return <AppOverlays {...overlays} />;
});

AppOverlaysContainer.displayName = 'AppOverlaysContainer';
