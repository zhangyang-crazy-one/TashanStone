import React from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';

import type { OCRStats, RAGStats } from '../../types';
import Tooltip from '../Tooltip';

interface SidebarStatusPanelProps {
  ocrStats?: OCRStats;
  ragStats?: RAGStats;
  onRefreshIndex?: () => void;
  t: {
    ocrProcessing: string;
    pdfProcessing: string;
    detecting: string;
    knowledgeBase: string;
    refreshIndex: string;
    filesIndexed: string;
    totalChunks: string;
  };
}

export const SidebarStatusPanel: React.FC<SidebarStatusPanelProps> = ({
  ocrStats,
  ragStats,
  onRefreshIndex,
  t
}) => {
  return (
    <>
      {ocrStats?.isProcessing && (
        <div className="mx-2 mb-2 p-3 bg-white dark:bg-cyber-900 rounded-lg border border-paper-200 dark:border-cyber-700 shadow-sm transition-all duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin text-amber-500" />
              {ocrStats.currentFile?.includes('(OCR)') ? t.ocrProcessing : t.pdfProcessing}
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              {ocrStats.totalPages > 0
                ? `${ocrStats.processedPages}/${ocrStats.totalPages}`
                : t.detecting}
            </span>
          </div>
          <div className="w-full h-1.5 bg-paper-100 dark:bg-cyber-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${ocrStats.totalPages > 0 ? (ocrStats.processedPages / ocrStats.totalPages) * 100 : 0}%` }}
            />
          </div>
          {ocrStats.currentFile && (
            <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {ocrStats.currentFile}
            </div>
          )}
        </div>
      )}

      {ragStats && (
        <div className="mt-auto mb-2 mx-2 p-3 bg-white dark:bg-cyber-900 rounded-lg border border-paper-200 dark:border-cyber-700 shadow-sm transition-all duration-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Database size={12} className="text-cyan-500" /> {t.knowledgeBase}
            </span>
            <div className="flex items-center gap-2">
              {ragStats.isIndexing && <Loader2 size={12} className="animate-spin text-cyan-500" />}
              <Tooltip content={t.refreshIndex}>
                <button
                  onClick={(e) => { e.stopPropagation(); onRefreshIndex?.(); }}
                  className="p-1 hover:bg-paper-100 dark:hover:bg-cyber-800 rounded-md text-slate-400 hover:text-cyan-500 transition-colors"
                  aria-label={t.refreshIndex}
                  disabled={ragStats.isIndexing}
                >
                  <RefreshCw size={12} className={ragStats.isIndexing ? 'animate-spin' : ''} />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
              <span>{t.filesIndexed}</span>
              <span className="font-mono">{ragStats.indexedFiles} / {ragStats.totalFiles}</span>
            </div>
            <div className="w-full h-1 bg-paper-100 dark:bg-cyber-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${ragStats.totalFiles > 0 ? (ragStats.indexedFiles / ragStats.totalFiles) * 100 : 0}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1">
              <span>{t.totalChunks}</span>
              <span className="font-mono">{ragStats.totalChunks}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
