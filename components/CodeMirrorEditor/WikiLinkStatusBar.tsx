import React from 'react';

import type { WikiLink } from '../../src/types/wiki';

interface WikiLinkFile {
  id: string;
  name: string;
  path?: string;
}

interface WikiLinkStatusBarProps {
  currentWikiLink: WikiLink | null;
  linkTargetExists: boolean;
  files: WikiLinkFile[];
  onNavigate?: (fileId: string) => void;
}

export function WikiLinkStatusBar({
  currentWikiLink,
  linkTargetExists,
  files,
  onNavigate
}: WikiLinkStatusBarProps) {
  if (!currentWikiLink) return null;

  return (
    <div className={`absolute bottom-0 left-0 right-0 px-4 py-2 text-xs border-t flex items-center gap-3 ${
      linkTargetExists
        ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-300'
        : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
    }`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      <span className="flex-1">
        WikiLink: <strong>[[{currentWikiLink.alias || currentWikiLink.target}]]</strong>
      </span>
      {linkTargetExists ? (
        <button
          onClick={() => {
            const target = currentWikiLink.target.toLowerCase();
            const targetFile = files.find(file => (
              file.name.toLowerCase() === target ||
              file.path?.toLowerCase()?.endsWith(`/${target}`) ||
              file.name.toLowerCase() === `${target}.md`
            ));
            if (targetFile && onNavigate) {
              onNavigate(targetFile.id);
            }
          }}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-100 dark:hover:bg-cyan-800 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Navigate
        </button>
      ) : (
        <span className="flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Page not found
        </span>
      )}
    </div>
  );
}
