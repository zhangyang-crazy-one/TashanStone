import React from 'react';
import { Activity, AlertTriangle, Check, FileText, Trash2 } from 'lucide-react';

import type { MarkdownFile } from '@/types';

interface TranscriptionResultsProps {
  activeTab: 'realtime' | 'file';
  currentText: string;
  wordCount: number;
  isListening: boolean;
  language: 'en' | 'zh';
  targetFileId: string;
  files: MarkdownFile[];
  errorMessage: string;
  status: 'idle' | 'recording' | 'processing' | 'success' | 'error';
  onClear: () => void;
  onTextChange: (value: string) => void;
  onTargetFileChange: (value: string) => void;
  t: {
    transcriptPreview: string;
    clear: string;
    targetFile: string;
    newFile: string;
    transcriptionComplete: string;
  };
}

export const TranscriptionResults: React.FC<TranscriptionResultsProps> = ({
  activeTab,
  currentText,
  wordCount,
  isListening,
  language,
  targetFileId,
  files,
  errorMessage,
  status,
  onClear,
  onTextChange,
  onTargetFileChange,
  t
}) => {
  const hasText = currentText.trim().length > 0;
  const placeholder = isListening
    ? (language === 'zh' ? '正在聆听...' : 'Listening...')
    : (language === 'zh' ? '转录文本将显示在这里...' : 'Transcribed text will appear here...');

  return (
    <div className="bg-[rgba(var(--bg-panel)/0.8)] backdrop-blur-lg rounded-xl p-4 border border-[rgb(var(--border-main))]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[rgba(var(--success-500)/0.2)] to-[rgba(var(--primary-500)/0.2)] flex items-center justify-center">
            <FileText size={16} className="text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[rgb(var(--text-primary))] font-[var(--font-header)]">{t.transcriptPreview}</h3>
            <div className="flex items-center gap-3 text-xs text-[rgb(var(--text-secondary))]">
              <span className="flex items-center gap-1">
                <FileText size={10} />
                {currentText.length} {language === 'zh' ? '字符' : 'chars'}
              </span>
              <span className="flex items-center gap-1">
                <Activity size={10} />
                {wordCount} {language === 'zh' ? '词' : 'words'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClear}
          disabled={!hasText}
          className={`
            flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors
            ${hasText
              ? 'text-[rgb(var(--text-secondary))] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
              : 'text-[rgb(var(--text-secondary))] opacity-50 cursor-not-allowed'
            }
          `}
        >
          <Trash2 size={12} />
          {t.clear}
        </button>
      </div>

      <textarea
        value={currentText}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-28 p-3 rounded-lg border border-[rgb(var(--border-main))] bg-[rgb(var(--bg-element))] text-[rgb(var(--text-primary))] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary-500))] font-[var(--font-primary)] leading-relaxed custom-scrollbar"
      />

      {/* Target file selection */}
      <div className="mt-3 pt-3 border-t border-[rgb(var(--border-main))]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-xs font-medium text-[rgb(var(--text-primary))] font-[var(--font-header)] whitespace-nowrap">
            {t.targetFile}
          </span>
          <select
            value={targetFileId}
            onChange={(e) => onTargetFileChange(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-lg border border-[rgb(var(--border-main))] bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))] text-xs focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary-500))] font-[var(--font-primary)]"
          >
            <option value="">✨ {t.newFile}</option>
            {files.map(file => (
              <option key={file.id} value={file.id}>{file.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error message */}
      {errorMessage && (
        <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
          <AlertTriangle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success message */}
      {status === 'success' && !errorMessage && (
        <div className="mt-3 p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 flex items-center gap-2 text-green-600 dark:text-green-400 text-xs">
          <Check size={14} />
          <span>{t.transcriptionComplete}</span>
        </div>
      )}
    </div>
  );
};
