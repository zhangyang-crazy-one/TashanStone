
import React from 'react';
import { X, FileText, Eye, Edit3 } from 'lucide-react';
import { EditorPane, MarkdownFile } from '../types';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

interface EditorTabsProps {
  panes: EditorPane[];
  activePane: string | null;
  files: MarkdownFile[];
  onSelectPane: (id: string) => void;
  onClosePane: (id: string) => void;
  onToggleMode: (id: string) => void;
  language?: Language;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  panes,
  activePane,
  files,
  onSelectPane,
  onClosePane,
  onToggleMode,
  language = 'en'
}) => {
  const t = translations[language];

  const getFileName = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    return file?.name || 'Untitled';
  };

  if (panes.length === 0) return null;

  return (
    <div className="flex items-center bg-paper-100 dark:bg-cyber-800 border-b border-paper-200 dark:border-cyber-700 overflow-x-auto transition-colors duration-300 custom-scrollbar-horizontal">
      {panes.map(pane => {
        const isActive = activePane === pane.id;
        return (
          <div
            key={pane.id}
            className={`
              flex items-center gap-2 px-4 py-2.5 cursor-pointer border-r border-paper-200 dark:border-cyber-700
              transition-all duration-200 min-w-fit max-w-48
              ${isActive
                ? 'bg-white dark:bg-cyber-900 border-b-2 border-b-cyan-500 dark:border-b-cyan-400 text-slate-800 dark:text-slate-200'
                : 'bg-paper-50 dark:bg-cyber-800/50 text-slate-500 dark:text-slate-400 hover:bg-paper-100 dark:hover:bg-cyber-700'}
            `}
            onClick={() => onSelectPane(pane.id)}
          >
            <FileText size={14} className="flex-shrink-0" />
            <span className="text-sm truncate flex-1 font-medium">
              {getFileName(pane.fileId)}
            </span>

            {/* 模式切换 */}
            <Tooltip content={pane.mode === 'editor' ? t.preview : t.editor}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMode(pane.id);
                }}
                className={`
                  p-1.5 rounded transition-all flex-shrink-0
                  ${isActive
                    ? 'hover:bg-paper-100 dark:hover:bg-cyber-800 text-cyan-600 dark:text-cyan-400'
                    : 'hover:bg-paper-200 dark:hover:bg-cyber-600 text-slate-400'}
                `}
                aria-label={pane.mode === 'editor' ? t.preview : t.editor}
              >
                {pane.mode === 'editor' ? <Eye size={13} /> : <Edit3 size={13} />}
              </button>
            </Tooltip>

            {/* 关闭按钮 */}
            <Tooltip content={t.tooltips?.closeTab || "Close Tab"}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePane(pane.id);
                }}
                className={`
                  p-1.5 rounded transition-all flex-shrink-0
                  ${isActive
                    ? 'hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400'
                    : 'hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600'}
                `}
                aria-label={t.tooltips?.closeTab || "Close Tab"}
              >
                <X size={13} />
              </button>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
};
