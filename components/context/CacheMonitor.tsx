import React, { useState, useEffect } from 'react';

export interface CacheStats {
  promptCacheHits: number;
  promptCacheMisses: number;
  promptCacheSize: number;
  messageCacheHits: number;
  messageCacheMisses: number;
  messageCacheSize: number;
  totalTokensSaved: number;
  compressionCount: number;
  lastCompressionTime?: number;
}

interface CacheMonitorProps {
  stats: CacheStats;
  maxCacheSize?: number;
  onCompact?: () => void;
  onClearCache?: () => void;
}

export const CacheMonitor: React.FC<CacheMonitorProps> = ({
  stats,
  maxCacheSize = 1000000,
  onCompact,
  onClearCache,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const promptCacheHitRate = stats.promptCacheHits + stats.promptCacheMisses > 0
    ? (stats.promptCacheHits / (stats.promptCacheHits + stats.promptCacheMisses)) * 100
    : 0;

  const messageCacheHitRate = stats.messageCacheHits + stats.messageCacheMisses > 0
    ? (stats.messageCacheHits / (stats.messageCacheHits + stats.messageCacheMisses)) * 100
    : 0;

  const totalCacheSize = stats.promptCacheSize + stats.messageCacheSize;
  const cacheUsagePercent = (totalCacheSize / maxCacheSize) * 100;

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  const getCacheUsageColor = () => {
    if (cacheUsagePercent >= 90) return 'bg-red-500';
    if (cacheUsagePercent >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="cache-monitor bg-neutral-800/50 rounded-lg border border-neutral-700/50 overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-700/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-sm font-medium text-white">Cache Status</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-neutral-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${getCacheUsageColor()} transition-all duration-300`}
                style={{ width: `${Math.min(cacheUsagePercent, 100)}%` }}
              />
            </div>
            <span className="text-xs text-neutral-400">{Math.round(cacheUsagePercent)}%</span>
          </div>

          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-neutral-700/30 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-400">Prompt Cache</span>
                <span className={`text-xs font-medium ${promptCacheHitRate >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {Math.round(promptCacheHitRate)}% hit
                </span>
              </div>
              <div className="text-sm text-white font-medium">{formatNumber(stats.promptCacheSize)}</div>
              <div className="text-xs text-neutral-500">
                {formatNumber(stats.promptCacheHits)} hits / {formatNumber(stats.promptCacheMisses)} misses
              </div>
            </div>

            <div className="bg-neutral-700/30 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-400">Message Cache</span>
                <span className={`text-xs font-medium ${messageCacheHitRate >= 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                  {Math.round(messageCacheHitRate)}% hit
                </span>
              </div>
              <div className="text-sm text-white font-medium">{formatNumber(stats.messageCacheSize)}</div>
              <div className="text-xs text-neutral-500">
                {formatNumber(stats.messageCacheHits)} hits / {formatNumber(stats.messageCacheMisses)} misses
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between bg-neutral-700/30 rounded p-2">
            <div>
              <span className="text-xs text-neutral-400">Tokens Saved</span>
              <div className="text-lg text-green-400 font-medium">{formatNumber(stats.totalTokensSaved)}</div>
            </div>
            <div className="text-right">
              <span className="text-xs text-neutral-400">Compressions</span>
              <div className="text-lg text-blue-400 font-medium">{stats.compressionCount}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onCompact && (
              <button
                onClick={onCompact}
                className="flex-1 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Run Compression
              </button>
            )}

            {onClearCache && (
              <button
                onClick={onClearCache}
                className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Cache
              </button>
            )}
          </div>

          {stats.lastCompressionTime && (
            <div className="text-xs text-neutral-500 text-center">
              Last compression: {formatTime(stats.lastCompressionTime)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface CacheMonitorPanelProps {
  stats: CacheStats;
  isOpen: boolean;
  onClose: () => void;
  maxCacheSize?: number;
  onCompact?: () => void;
  onClearCache?: () => void;
}

export const CacheMonitorPanel: React.FC<CacheMonitorPanelProps> = ({
  stats,
  isOpen,
  onClose,
  maxCacheSize,
  onCompact,
  onClearCache,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg border border-neutral-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-white">Context Cache Monitor</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-700 rounded-md transition-colors"
          >
            <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          <CacheMonitor
            stats={stats}
            maxCacheSize={maxCacheSize}
            onCompact={onCompact}
            onClearCache={onClearCache}
          />
        </div>
      </div>
    </div>
  );
};

export default CacheMonitor;
