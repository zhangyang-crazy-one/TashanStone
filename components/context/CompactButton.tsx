import React, { useState } from 'react';
import { Scissors, Archive, RefreshCw, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface CompactButtonProps {
  onCompact: () => Promise<void>;
  onPrune?: () => Promise<void>;
  onTruncate?: () => Promise<void>;
  disabled?: boolean;
  tokenUsage?: number;
  maxTokens?: number;
  compactThreshold?: number;
  size?: 'sm' | 'md' | 'lg';
  showMenu?: boolean;
}

export const CompactButton: React.FC<CompactButtonProps> = ({
  onCompact,
  onPrune,
  onTruncate,
  disabled = false,
  tokenUsage = 0,
  maxTokens = 200000,
  compactThreshold = 0.85,
  size = 'md',
  showMenu = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [lastAction, setLastAction] = useState<'compacted' | 'pruned' | 'truncated' | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const percentage = tokenUsage / maxTokens;
  const needsCompact = percentage >= compactThreshold;

  const handleCompact = async () => {
    if (isLoading || disabled) return;
    setIsLoading(true);
    try {
      await onCompact();
      setLastAction('compacted');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Compact failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrune = async () => {
    if (!onPrune || isLoading || disabled) return;
    setIsLoading(true);
    try {
      await onPrune();
      setLastAction('pruned');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Prune failed:', error);
    } finally {
      setIsLoading(false);
      setIsMenuOpen(false);
    }
  };

  const handleTruncate = async () => {
    if (!onTruncate || isLoading || disabled) return;
    setIsLoading(true);
    try {
      await onTruncate();
      setLastAction('truncated');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Truncate failed:', error);
    } finally {
      setIsLoading(false);
      setIsMenuOpen(false);
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'px-2 py-1 text-xs';
      case 'lg': return 'px-4 py-2 text-base';
      default: return 'px-3 py-1.5 text-sm';
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'sm': return 'w-3 h-3';
      case 'lg': return 'w-5 h-5';
      default: return 'w-4 h-4';
    }
  };

  const showDropdown = showMenu && (onPrune || onTruncate);

  return (
    <div className="compact-button-wrapper relative">
      <button
        onClick={handleCompact}
        disabled={disabled || isLoading}
        className={`
          compact-button flex items-center gap-1.5 rounded-lg font-medium transition-all
          ${getSizeClasses()}
          ${needsCompact
            ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30'
            : 'bg-neutral-700 hover:bg-neutral-600 text-white border border-neutral-600'
          }
          ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          ${showSuccess ? 'bg-green-500/20 border-green-500/30 text-green-400' : ''}
        `}
      >
        {isLoading ? (
          <Loader2 className={`${getIconSize()} animate-spin`} />
        ) : showSuccess ? (
          <Check className={getIconSize()} />
        ) : (
          <Archive className={getIconSize()} />
        )}
        <span>
          {showSuccess ? 'Done!' : needsCompact ? 'Compact' : 'Compact Context'}
        </span>
        {showDropdown && (
          <ChevronDown className={`${getIconSize()} ml-1`} />
        )}
      </button>

      {showDropdown && (
        <>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-expanded={isMenuOpen}
          />
          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden">
              <button
                onClick={handlePrune}
                disabled={isLoading || !onPrune}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Scissors className="w-4 h-4 text-blue-400" />
                Prune Tools
              </button>
              <button
                onClick={handleTruncate}
                disabled={isLoading || !onTruncate}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className="w-4 h-4 text-orange-400" />
                Truncate
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface CompactActionMenuProps {
  onCompact: () => Promise<void>;
  onPrune?: () => Promise<void>;
  onTruncate?: () => Promise<void>;
  onCreateCheckpoint?: () => Promise<void>;
  tokenUsage?: number;
  maxTokens?: number;
}

export const CompactActionMenu: React.FC<CompactActionMenuProps> = ({
  onCompact,
  onPrune,
  onTruncate,
  onCreateCheckpoint,
  tokenUsage = 0,
  maxTokens = 200000,
}) => {
  const percentage = tokenUsage / maxTokens;
  const needsAttention = percentage >= 0.7;

  return (
    <div className={`compact-action-menu flex items-center gap-2 p-2 rounded-lg border ${
      needsAttention
        ? 'bg-yellow-500/5 border-yellow-500/20'
        : 'bg-neutral-800/50 border-neutral-700'
    }`}>
      <CompactButton
        onCompact={onCompact}
        onPrune={onPrune}
        onTruncate={onTruncate}
        tokenUsage={tokenUsage}
        maxTokens={maxTokens}
        showMenu={true}
        size="sm"
      />

      {onCreateCheckpoint && (
        <button
          onClick={() => onCreateCheckpoint()}
          className="flex items-center gap-1 px-2 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Save Checkpoint
        </button>
      )}

      <div className="ml-auto text-xs text-neutral-500">
        {needsAttention ? 'Consider compressing context' : 'Context healthy'}
      </div>
    </div>
  );
};
