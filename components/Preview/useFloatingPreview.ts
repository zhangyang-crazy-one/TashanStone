import { useCallback, useEffect, useRef, useState } from 'react';

const PREVIEW_MARGIN = 12;
const PREVIEW_FALLBACK_WIDTH = 320;
const PREVIEW_FALLBACK_HEIGHT = 180;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const useFloatingPreview = (
  isOpen: boolean,
  triggerRef: React.RefObject<HTMLElement>,
  preferredPlacement: 'top' | 'bottom' = 'bottom'
) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: PREVIEW_FALLBACK_WIDTH, height: PREVIEW_FALLBACK_HEIGHT });
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const [arrowOffset, setArrowOffset] = useState(12);
  const [placement, setPlacement] = useState<'top' | 'bottom'>(preferredPlacement);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;

    const rect = triggerRef.current.getBoundingClientRect();
    const { width, height } = sizeRef.current;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    let nextPlacement = preferredPlacement;

    if (preferredPlacement === 'top' && spaceAbove < height + PREVIEW_MARGIN && spaceBelow > spaceAbove) {
      nextPlacement = 'bottom';
    }
    if (preferredPlacement === 'bottom' && spaceBelow < height + PREVIEW_MARGIN && spaceAbove > spaceBelow) {
      nextPlacement = 'top';
    }

    const preferredTop = nextPlacement === 'top'
      ? rect.top - height - PREVIEW_MARGIN
      : rect.bottom + PREVIEW_MARGIN;
    const preferredLeft = rect.left + rect.width / 2 - width / 2;

    const left = clamp(preferredLeft, PREVIEW_MARGIN, Math.max(PREVIEW_MARGIN, window.innerWidth - width - PREVIEW_MARGIN));
    const top = clamp(preferredTop, PREVIEW_MARGIN, Math.max(PREVIEW_MARGIN, window.innerHeight - height - PREVIEW_MARGIN));

    const centerX = rect.left + rect.width / 2;
    const arrowX = clamp(centerX - left - 6, 10, width - 20);

    setPopupPos({ top, left });
    setArrowOffset(arrowX);
    setPlacement(nextPlacement);
  }, [preferredPlacement, triggerRef]);

  useEffect(() => {
    if (!isOpen || !popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    sizeRef.current = { width: rect.width, height: rect.height };
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updatePosition]);

  return { popupRef, popupPos, arrowOffset, placement };
};
