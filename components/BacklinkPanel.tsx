import React from 'react';
import { Backlink } from '../src/types/wiki';

interface BacklinkPanelProps {
  currentFileName: string;
  backlinks: Backlink[];
  onNavigate: (fileId: string) => void;
}

export const BacklinkPanel: React.FC<BacklinkPanelProps> = ({ currentFileName, backlinks, onNavigate }) => {
  if (backlinks.length === 0) {
    return (
      <div className="p-3 border-l border-gray-200 dark:border-gray-700 h-full">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
          引用 "{currentFileName}" 的页面
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          暂无页面引用此页面
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 border-l border-gray-200 dark:border-gray-700 h-full overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
        引用 "{currentFileName}" 的页面 ({backlinks.length})
      </h3>
      <ul className="space-y-2">
        {backlinks.map((link, index) => (
          <li key={`${link.sourceFileId}-${index}`}>
            <button
              className="w-full text-left p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() => onNavigate(link.sourceFileId)}
            >
              <span className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline block">
                {link.sourceFileName}
              </span>
              {link.context && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate block mt-1">
                  {link.context}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
