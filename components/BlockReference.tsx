import React, { useState, useEffect } from 'react';
import { Link2, FileText, Copy, Check } from 'lucide-react';
import { BlockReference } from '../src/types/wiki';
import { MarkdownFile } from '../types';
import { findFileByWikiLinkTarget } from '../src/services/wiki/wikiLinkService';

interface BlockReferenceProps {
  reference: BlockReference;
  files: MarkdownFile[];
  onNavigate: (fileId: string) => void;
}

export const BlockReferenceComponent: React.FC<BlockReferenceProps> = ({
  reference,
  files,
  onNavigate
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [targetFile, setTargetFile] = useState<{ id: string; name: string; path?: string; content?: string; lastModified?: number } | null>(null);

  useEffect(() => {
    const file = findFileByWikiLinkTarget(reference.target, files);
    setTargetFile(file || null);
  }, [reference.target, files]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reference.blockContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNavigate = () => {
    if (targetFile) {
      onNavigate(targetFile.id);
    }
  };

  const formatLabel = () => {
    if (reference.endLine && reference.endLine > reference.startLine) {
      return `(((${reference.target}#${reference.startLine}-${reference.endLine})))`;
    }
    return `(((${reference.target}#${reference.startLine})))`;
  };

  return (
    <span
      className="relative inline-flex items-center gap-1 group"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <Link2 size={12} className="text-orange-500" />
      <code className={`
        text-xs px-1.5 py-0.5 rounded font-mono
        ${targetFile
          ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}
      `}>
        {formatLabel()}
      </code>

      {showPreview && (
        <div className="absolute bottom-full left-0 mb-2 w-80 z-50">
          <div className="bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border border-orange-200 dark:border-orange-800 rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-orange-500" />
                <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                  {reference.target}
                  {reference.endLine && reference.endLine > reference.startLine
                    ? `: Lines ${reference.startLine}-${reference.endLine}`
                    : `: Line ${reference.startLine}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-orange-100 dark:hover:bg-orange-800 rounded transition-colors"
                  title="Copy content"
                >
                  {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} className="text-orange-500" />}
                </button>
                <button
                  onClick={handleNavigate}
                  className="p-1 hover:bg-orange-100 dark:hover:bg-orange-800 rounded transition-colors"
                  title="Navigate to file"
                >
                  <FileText size={12} className="text-orange-500" />
                </button>
              </div>
            </div>
            <div className="p-3 max-h-48 overflow-y-auto">
              {reference.blockContent ? (
                <pre className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap break-all">
                  {reference.blockContent}
                </pre>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                  {targetFile ? 'Content not available' : 'File not found'}
                </p>
              )}
            </div>
          </div>
          <div className="w-3 h-3 bg-white/95 dark:bg-cyber-900/95 rotate-45 absolute left-4 -bottom-1.5 border-r border-b border-orange-200 dark:border-orange-800"></div>
        </div>
      )}
    </span>
  );
};

export const renderBlockReferences = (
  content: string,
  files: MarkdownFile[],
  onNavigate: (fileId: string) => void
): React.ReactNode => {
  const references = extractBlockReferencesWithContent(content, files);

  if (references.length === 0) {
    return content;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  references.forEach((ref, index) => {
    if (ref.position.start > lastIndex) {
      parts.push(content.slice(lastIndex, ref.position.start));
    }

    parts.push(
      <BlockReferenceComponent
        key={index}
        reference={ref}
        files={files}
        onNavigate={onNavigate}
      />
    );

    lastIndex = ref.position.end;
  });

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return <>{parts}</>;
};

import { extractBlockReferencesWithContent, extractBlockReferences } from '../src/types/wiki';
