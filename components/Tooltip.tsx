import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

type TooltipPlacement = 'top' | 'bottom';

interface TooltipProps {
  content?: string;
  placement?: TooltipPlacement;
  className?: string;
  children: React.ReactElement;
}

const TOOLTIP_MARGIN = 8;
const TOOLTIP_FALLBACK_WIDTH = 220;
const TOOLTIP_FALLBACK_HEIGHT = 36;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement = 'top',
  className,
  children
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [arrowOffset, setArrowOffset] = useState(12);
  const [finalPlacement, setFinalPlacement] = useState<TooltipPlacement>(placement);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ width: TOOLTIP_FALLBACK_WIDTH, height: TOOLTIP_FALLBACK_HEIGHT });
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewport = {
      top: 0,
      left: 0,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
    const { width, height } = sizeRef.current;

    const spaceAbove = rect.top - viewport.top;
    const spaceBelow = viewport.bottom - rect.bottom;
    let nextPlacement = placement;

    if (placement === 'top' && spaceAbove < height + TOOLTIP_MARGIN && spaceBelow > spaceAbove) {
      nextPlacement = 'bottom';
    }
    if (placement === 'bottom' && spaceBelow < height + TOOLTIP_MARGIN && spaceAbove > spaceBelow) {
      nextPlacement = 'top';
    }

    const preferredTop = nextPlacement === 'top'
      ? rect.top - height - TOOLTIP_MARGIN
      : rect.bottom + TOOLTIP_MARGIN;
    const preferredLeft = rect.left + rect.width / 2 - width / 2;

    const left = clamp(preferredLeft, viewport.left + TOOLTIP_MARGIN, Math.max(viewport.left + TOOLTIP_MARGIN, viewport.right - width - TOOLTIP_MARGIN));
    const top = clamp(preferredTop, viewport.top + TOOLTIP_MARGIN, Math.max(viewport.top + TOOLTIP_MARGIN, viewport.bottom - height - TOOLTIP_MARGIN));

    const centerX = rect.left + rect.width / 2;
    const arrowX = clamp(centerX - left - 6, 8, width - 20);

    setPosition({ top, left });
    setFinalPlacement(nextPlacement);
    setArrowOffset(arrowX);
  }, [placement]);

  useEffect(() => {
    if (!isVisible) return;
    if (!tooltipRef.current) return;

    const rect = tooltipRef.current.getBoundingClientRect();
    sizeRef.current = { width: rect.width, height: rect.height };
    updatePosition();
  }, [isVisible, content, updatePosition]);

  useEffect(() => {
    if (!isVisible) return;

    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isVisible, updatePosition]);

  if (!content) return children;

  return (
    <span
      ref={triggerRef}
      className={`inline-flex ${className || ''}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocusCapture={() => setIsVisible(true)}
      onBlurCapture={() => setIsVisible(false)}
    >
      {React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
        'aria-describedby': tooltipId
      })}
      {isVisible && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none fixed z-[9999]"
          style={{ top: position.top, left: position.left }}
        >
          <div
            className={`w-2.5 h-2.5 bg-white/95 dark:bg-cyber-900/95 rotate-45 absolute border border-paper-200 dark:border-cyber-700 ${
              finalPlacement === 'top' ? '-bottom-1.5' : '-top-1.5'
            }`}
            style={{ left: `${arrowOffset}px` }}
          />
          <div className="bg-white/95 dark:bg-cyber-900/95 border border-paper-200 dark:border-cyber-700 text-slate-700 dark:text-slate-200 shadow-lg shadow-black/5 dark:shadow-black/30 backdrop-blur-lg rounded-lg px-2.5 py-1.5 text-xs font-medium max-w-xs">
            {content}
          </div>
        </div>,
        document.body
      )}
    </span>
  );
};

export default Tooltip;
