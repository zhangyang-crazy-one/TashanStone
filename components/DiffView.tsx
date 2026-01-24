import { useState, useMemo } from 'react';
import { diffWords, diffLines, Change } from 'diff';
import { Check, X, SplitSquareHorizontal, AlignLeft, Copy, Download, ArrowLeft } from 'lucide-react';
import Tooltip from './Tooltip';

interface DiffViewProps {
  originalText: string;
  modifiedText: string;
  onApply: (text: string) => void;
  onCancel: () => void;
  language?: 'en' | 'zh';
}

export const DiffView = ({ originalText, modifiedText, onApply, onCancel, language = 'en' }: DiffViewProps) => {
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('inline');
  const [copied, setCopied] = useState(false);

  const t = language === 'zh' ? {
    title: 'AI 润色对比',
    original: '原始文本',
    modified: '润色后',
    inline: '行内对比',
    split: '左右对比',
    apply: '应用润色',
    cancel: '取消',
    copy: '复制润色文本',
    download: '下载对比',
    stats: '变更统计',
    added: '新增',
    removed: '删除',
    unchanged: '未变',
    words: '词',
    copied: '已复制!'
  } : {
    title: 'AI Polish Diff View',
    original: 'Original',
    modified: 'Modified',
    inline: 'Inline',
    split: 'Split',
    apply: 'Apply Changes',
    cancel: 'Cancel',
    copy: 'Copy Modified',
    download: 'Download Diff',
    stats: 'Change Stats',
    added: 'Added',
    removed: 'Removed',
    unchanged: 'Unchanged',
    words: 'words',
    copied: 'Copied!'
  };

  const diff = useMemo(() => {
    return viewMode === 'inline'
      ? diffWords(originalText, modifiedText)
      : diffLines(originalText, modifiedText);
  }, [originalText, modifiedText, viewMode]);

  const stats = useMemo(() => {
    const added = diff.filter(d => d.added).reduce((acc, d) => acc + (d.value.match(/\S+/g)?.length || 0), 0);
    const removed = diff.filter(d => d.removed).reduce((acc, d) => acc + (d.value.match(/\S+/g)?.length || 0), 0);
    const unchanged = diff.filter(d => !d.added && !d.removed).reduce((acc, d) => acc + (d.value.match(/\S+/g)?.length || 0), 0);
    return { added, removed, unchanged };
  }, [diff]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(modifiedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    const content = `# ${t.title}\n\n## ${t.original}\n\n${originalText}\n\n## ${t.modified}\n\n${modifiedText}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diff-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderInlineDiff = (changes: Change[]) => {
    return (
      <div className="space-y-2">
        {changes.map((part, idx) => {
          if (part.added) {
            return (
              <Tooltip content={t.added}>
                <span
                  key={idx}
                  className="bg-green-500/20 text-green-400 px-1 rounded border border-green-500/30"
                  aria-label={t.added}
                >
                  {part.value}
                </span>
              </Tooltip>
            );
          }
          if (part.removed) {
            return (
              <Tooltip content={t.removed}>
                <span
                  key={idx}
                  className="bg-red-500/20 text-red-400 px-1 rounded border border-red-500/30 line-through"
                  aria-label={t.removed}
                >
                  {part.value}
                </span>
              </Tooltip>
            );
          }
          return <span key={idx} className="text-[rgb(var(--text-secondary))]">{part.value}</span>;
        })}
      </div>
    );
  };

  const renderSplitDiff = (changes: Change[]) => {
    const originalLines: { content: string; type: 'normal' | 'removed' }[] = [];
    const modifiedLines: { content: string; type: 'normal' | 'added' }[] = [];

    changes.forEach(part => {
      if (part.removed) {
        part.value.split('\n').forEach(line => {
          if (line || originalLines.length === 0) {
            originalLines.push({ content: line, type: 'removed' });
          }
        });
      } else if (part.added) {
        part.value.split('\n').forEach(line => {
          if (line || modifiedLines.length === 0) {
            modifiedLines.push({ content: line, type: 'added' });
          }
        });
      } else {
        part.value.split('\n').forEach(line => {
          if (line || (originalLines.length === 0 && modifiedLines.length === 0)) {
            originalLines.push({ content: line, type: 'normal' });
            modifiedLines.push({ content: line, type: 'normal' });
          }
        });
      }
    });

    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    return (
      <div className="grid grid-cols-2 gap-4">
        {/* Original Column */}
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-2 px-3 py-2 bg-[rgb(var(--bg-panel))] rounded border-l-4 border-red-500">
            {t.original}
          </div>
          <div className="space-y-1 font-mono text-sm">
            {Array.from({ length: maxLines }).map((_, idx) => {
              const line = originalLines[idx];
              if (!line) return <div key={idx} className="h-6 opacity-20">---</div>;

              const bgClass = line.type === 'removed'
                ? 'bg-red-500/10 border-l-2 border-red-500/50'
                : 'bg-[rgb(var(--bg-element))/30]';

              return (
                <div
                  key={idx}
                  className={`px-3 py-1 rounded ${bgClass} ${line.type === 'removed' ? 'text-red-400' : 'text-[rgb(var(--text-secondary))]'}`}
                >
                  {line.content || '\u00A0'}
                </div>
              );
            })}
          </div>
        </div>

        {/* Modified Column */}
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[rgb(var(--text-primary))] mb-2 px-3 py-2 bg-[rgb(var(--bg-panel))] rounded border-l-4 border-green-500">
            {t.modified}
          </div>
          <div className="space-y-1 font-mono text-sm">
            {Array.from({ length: maxLines }).map((_, idx) => {
              const line = modifiedLines[idx];
              if (!line) return <div key={idx} className="h-6 opacity-20">---</div>;

              const bgClass = line.type === 'added'
                ? 'bg-green-500/10 border-l-2 border-green-500/50'
                : 'bg-[rgb(var(--bg-element))/30]';

              return (
                <div
                  key={idx}
                  className={`px-3 py-1 rounded ${bgClass} ${line.type === 'added' ? 'text-green-400' : 'text-[rgb(var(--text-secondary))]'}`}
                >
                  {line.content || '\u00A0'}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[rgb(var(--bg-main))] text-[rgb(var(--text-primary))]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[rgb(var(--border-main))] bg-[rgb(var(--bg-panel))]">
        <div className="flex items-center gap-3">
          <Tooltip content={t.cancel}>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-[rgb(var(--bg-element))] rounded transition-colors"
              aria-label={t.cancel}
            >
              <ArrowLeft size={20} />
            </button>
          </Tooltip>
          <h2 className="text-xl font-bold text-[rgb(var(--primary-500))]">{t.title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-[rgb(var(--bg-element))] rounded p-1">
            <button
              onClick={() => setViewMode('inline')}
              className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors ${
                viewMode === 'inline'
                  ? 'bg-[rgb(var(--primary-500))] text-white'
                  : 'text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
              }`}
            >
              <AlignLeft size={16} />
              {t.inline}
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors ${
                viewMode === 'split'
                  ? 'bg-[rgb(var(--primary-500))] text-white'
                  : 'text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text-primary))]'
              }`}
            >
              <SplitSquareHorizontal size={16} />
              {t.split}
            </button>
          </div>

          {/* Actions */}
          <Tooltip content={t.copy}>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-[rgb(var(--bg-element))] hover:bg-[rgb(var(--primary-500))] text-[rgb(var(--text-primary))] rounded flex items-center gap-2 text-sm transition-colors"
              aria-label={t.copy}
            >
              <Copy size={16} />
              {copied ? t.copied : t.copy}
            </button>
          </Tooltip>
          <Tooltip content={t.download}>
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[rgb(var(--bg-element))] hover:bg-[rgb(var(--secondary-500))] text-[rgb(var(--text-primary))] rounded flex items-center gap-2 text-sm transition-colors"
              aria-label={t.download}
            >
              <Download size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-6 px-4 py-3 bg-[rgb(var(--bg-panel))/50] border-b border-[rgb(var(--border-main))] text-sm">
        <span className="font-semibold text-[rgb(var(--text-primary))]">{t.stats}:</span>
        <div className="flex items-center gap-2">
          <span className="text-green-400">+{stats.added}</span>
          <span className="text-[rgb(var(--text-secondary))]">{t.added}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-400">-{stats.removed}</span>
          <span className="text-[rgb(var(--text-secondary))]">{t.removed}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[rgb(var(--text-secondary))]">{stats.unchanged}</span>
          <span className="text-[rgb(var(--text-secondary))]">{t.unchanged}</span>
        </div>
        <span className="text-[rgb(var(--text-secondary))]">({t.words})</span>
      </div>

      {/* Diff Content */}
      <div className="flex-1 overflow-auto p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          {viewMode === 'inline' ? renderInlineDiff(diff) : renderSplitDiff(diff)}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 p-4 border-t border-[rgb(var(--border-main))] bg-[rgb(var(--bg-panel))]">
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-[rgb(var(--bg-element))] hover:bg-[rgb(var(--bg-element))]/80 text-[rgb(var(--text-primary))] rounded flex items-center gap-2 transition-colors"
        >
          <X size={18} />
          {t.cancel}
        </button>
        <button
          onClick={() => onApply(modifiedText)}
          className="px-4 py-2 bg-[rgb(var(--primary-500))] hover:bg-[rgb(var(--primary-600))] text-white rounded flex items-center gap-2 transition-colors font-semibold"
        >
          <Check size={18} />
          {t.apply}
        </button>
      </div>
    </div>
  );
};
