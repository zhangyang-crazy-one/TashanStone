import React from 'react';
import { Tag } from 'lucide-react';

import Tooltip from '../Tooltip';

interface TagPreviewProps {
  tag: string;
  tooltipText: string;
}

export const TagPreview: React.FC<TagPreviewProps> = ({ tag, tooltipText }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('filter-by-tag', { detail: { tag } }));
  };

  return (
    <Tooltip content={tooltipText}>
      <span
        onClick={handleClick}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-all
          bg-gradient-to-r from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40
          text-violet-700 dark:text-violet-300
          border border-violet-200 dark:border-violet-700/50
          hover:from-violet-200 hover:to-purple-200 dark:hover:from-violet-800/50 dark:hover:to-purple-800/50
          hover:border-violet-300 dark:hover:border-violet-600
          hover:shadow-sm hover:scale-105
          select-none"
        aria-label={tooltipText}
      >
        <Tag size={10} className="flex-shrink-0" />
        <span>{tag}</span>
      </span>
    </Tooltip>
  );
};
