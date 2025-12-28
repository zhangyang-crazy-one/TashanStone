import React from 'react';
import { Check, Scissors, Archive, Trash2, RotateCcw } from 'lucide-react';

interface ContextActionBadgeProps {
  action: 'none' | 'pruned' | 'compacted' | 'truncated' | 'checkpoint';
  timestamp?: number;
  savedTokens?: number;
  messageCount?: number;
  onRestore?: () => void;
  onDismiss?: () => void;
}

export const ContextActionBadge: React.FC<ContextActionBadgeProps> = ({
  action,
  timestamp,
  savedTokens,
  messageCount,
  onRestore,
  onDismiss,
}) => {
  if (action === 'none') return null;

  const getActionConfig = () => {
    switch (action) {
      case 'pruned':
        return {
          icon: Scissors,
          label: 'Pruned',
          color: 'bg-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/30',
          textColor: 'text-blue-400',
        };
      case 'compacted':
        return {
          icon: Archive,
          label: 'Compacted',
          color: 'bg-purple-500',
          bgColor: 'bg-purple-500/10',
          borderColor: 'border-purple-500/30',
          textColor: 'text-purple-400',
        };
      case 'truncated':
        return {
          icon: Trash2,
          label: 'Truncated',
          color: 'bg-orange-500',
          bgColor: 'bg-orange-500/10',
          borderColor: 'border-orange-500/30',
          textColor: 'text-orange-400',
        };
      case 'checkpoint':
        return {
          icon: RotateCcw,
          label: 'Checkpoint',
          color: 'bg-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/30',
          textColor: 'text-green-400',
        };
      default:
        return null;
    }
  };

  const config = getActionConfig();
  if (!config) return null;

  const Icon = config.icon;

  const formatTime = () => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`context-action-badge flex items-center gap-2 px-3 py-2 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
      <div className={`p-1 rounded-full ${config.color}`}>
        <Icon className="w-3 h-3 text-white" />
      </div>

      <div className="flex flex-col">
        <span className={`text-sm font-medium ${config.textColor}`}>
          {config.label}
          {timestamp && <span className="ml-2 text-xs opacity-60">{formatTime()}</span>}
        </span>
        {(savedTokens !== undefined || messageCount !== undefined) && (
          <div className="text-xs text-neutral-400">
            {savedTokens !== undefined && savedTokens > 0 && (
              <span>Saved {formatNumber(savedTokens)} tokens</span>
            )}
            {messageCount !== undefined && (
              <span className="ml-2">{messageCount} messages</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 ml-2">
        {onRestore && action !== 'checkpoint' && (
          <button
            onClick={onRestore}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Restore previous state"
          >
            <RotateCcw className="w-3 h-3 text-neutral-400" />
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            title="Dismiss"
          >
            <svg className="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

interface ContextStatusIndicatorProps {
  messagesCount: number;
  tokenUsage: number;
  maxTokens: number;
  lastAction?: ContextActionBadgeProps['action'];
  lastActionTime?: number;
  isCheckpointing?: boolean;
}

export const ContextStatusIndicator: React.FC<ContextStatusIndicatorProps> = ({
  messagesCount,
  tokenUsage,
  maxTokens,
  lastAction,
  lastActionTime,
  isCheckpointing = false,
}) => {
  const percentage = tokenUsage / maxTokens;

  const getHealthStatus = () => {
    if (percentage >= 0.9) return { color: 'bg-red-500', text: 'Critical' };
    if (percentage >= 0.75) return { color: 'bg-yellow-500', text: 'High' };
    return { color: 'bg-green-500', text: 'Healthy' };
  };

  const health = getHealthStatus();

  return (
    <div className="context-status-indicator flex items-center gap-3 px-3 py-1.5 bg-neutral-800/30 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">Context:</span>
        <span className="text-sm font-medium text-white">{messagesCount} msgs</span>
      </div>

      <div className="w-px h-4 bg-neutral-700" />

      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${health.color}`} />
        <span className="text-xs text-neutral-400">{health.text}</span>
      </div>

      <div className="w-px h-4 bg-neutral-700" />

      <div className="flex items-center gap-1">
        <span className="text-xs text-neutral-500">Tokens:</span>
        <span className={`text-sm font-medium ${
          percentage >= 0.75 ? 'text-yellow-400' : 'text-white'
        }`}>
          {formatNumber(tokenUsage)}/{formatNumber(maxTokens)}
        </span>
      </div>

      {isCheckpointing && (
        <>
          <div className="w-px h-4 bg-neutral-700" />
          <div className="flex items-center gap-1 text-xs text-blue-400">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Saving checkpoint...
          </div>
        </>
      )}

      {lastAction && !isCheckpointing && (
        <ContextActionBadge
          action={lastAction}
          timestamp={lastActionTime}
        />
      )}
    </div>
  );
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
