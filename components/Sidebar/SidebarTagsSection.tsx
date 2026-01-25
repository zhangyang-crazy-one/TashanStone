import React, { useState } from 'react';
import { ChevronDown, Sparkles, Tag } from 'lucide-react';

import type { MarkdownFile } from '../../types';
import { TagsBrowser } from '../TagsBrowser';
import type { Language } from '../../utils/translations';

interface SidebarTagsSectionProps {
  files: MarkdownFile[];
  setFiles?: React.Dispatch<React.SetStateAction<MarkdownFile[]>>;
  language: Language;
  onSelectFile: (id: string) => void;
  onOpenTagSuggestion?: () => void;
  t: {
    tags?: string;
    aiTagSuggestions?: string;
  };
}

export const SidebarTagsSection: React.FC<SidebarTagsSectionProps> = ({
  files,
  setFiles,
  language,
  onSelectFile,
  onOpenTagSuggestion,
  t
}) => {
  const [tagsExpanded, setTagsExpanded] = useState(true);

  return (
    <div className="mt-2 border-t border-paper-200 dark:border-cyber-700 pt-2">
      <button
        onClick={() => setTagsExpanded(!tagsExpanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-paper-200 dark:hover:bg-cyber-800 rounded transition-colors"
      >
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
          <Tag size={12} className="text-emerald-500" />
          {t.tags || 'Tags'}
        </span>
        <ChevronDown
          size={12}
          className={`text-slate-400 transition-transform ${tagsExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      {tagsExpanded && (
        <div className="mt-2 px-2">
          <TagsBrowser files={files} onSelectFile={onSelectFile} setFiles={setFiles} language={language} />
          {onOpenTagSuggestion && (
            <button
              onClick={onOpenTagSuggestion}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-gradient-to-r from-cyan-500 to-violet-500 text-white rounded-lg hover:from-cyan-600 hover:to-violet-600 transition-all"
            >
              <Sparkles size={12} />
              {t.aiTagSuggestions || 'AI Suggest Tags'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
