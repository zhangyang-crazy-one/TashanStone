import React from 'react';

interface TokenUsageIndicatorProps {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  limit: number;
  threshold?: number;
  compactThreshold?: number;
  showDetails?: boolean;
}

export const TokenUsageIndicator: React.FC<TokenUsageIndicatorProps> = ({
  promptTokens,
  completionTokens,
  totalTokens,
  limit,
  threshold = 0.7,
  compactThreshold = 0.85,
  showDetails = false,
}) => {
  const percentage = Math.min(totalTokens / limit, 1);

  const getStatusColor = () => {
    if (percentage >= compactThreshold) return 'bg-red-500';
    if (percentage >= threshold) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (percentage >= compactThreshold) return 'Critical';
    if (percentage >= threshold) return 'High';
    return 'Normal';
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="token-usage-indicator flex items-center gap-2">
      <div className="relative w-16 h-16">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            className="text-neutral-700"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            stroke="currentColor"
            strokeWidth="4"
            fill="transparent"
            strokeDasharray={`${percentage * 176} 176`}
            className={`${getStatusColor()} transition-all duration-300`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-medium text-white">
            {Math.round(percentage * 100)}%
          </span>
        </div>
      </div>

      <div className="flex flex-col">
        <span className="text-xs text-neutral-400">Token Usage</span>
        <span className={`text-sm font-medium ${
          percentage >= compactThreshold ? 'text-red-400' :
          percentage >= threshold ? 'text-yellow-400' : 'text-green-400'
        }`}>
          {formatNumber(totalTokens)} / {formatNumber(limit)}
        </span>
        {showDetails && (
          <span className="text-xs text-neutral-500">
            P: {formatNumber(promptTokens)} • C: {formatNumber(completionTokens)}
          </span>
        )}
      </div>

      <div className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
        percentage >= compactThreshold ? 'bg-red-500/20 text-red-400' :
        percentage >= threshold ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'
      }`}>
        {getStatusText()}
      </div>
    </div>
  );
};

interface CompactTokenIndicatorProps {
  currentTokens: number;
  maxTokens: number;
  onCompact?: () => void;
  compactDisabled?: boolean;
}

export const CompactTokenIndicator: React.FC<CompactTokenIndicatorProps> = ({
  currentTokens,
  maxTokens,
  onCompact,
  compactDisabled = false,
}) => {
  const percentage = currentTokens / maxTokens;
  const compactPercentage = 0.85;

  const shouldCompact = percentage >= compactPercentage;

  if (percentage < 0.5) {
    return null;
  }

  return (
    <div className={`compact-token-indicator flex items-center gap-2 px-3 py-1.5 rounded-lg ${
      shouldCompact ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-neutral-800/50'
    }`}>
      <TokenUsageIndicator
        promptTokens={currentTokens}
        completionTokens={0}
        totalTokens={currentTokens}
        limit={maxTokens}
        compactThreshold={0.9}
        showDetails={false}
      />

      {shouldCompact && onCompact && !compactDisabled && (
        <button
          onClick={onCompact}
          className="ml-2 px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-xs rounded-md transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          Compact
        </button>
      )}
    </div>
  );
};
