import React from 'react';
import { FileText, Sparkles, Trash2 } from 'lucide-react';

import type { MarkdownFile } from '../../types';

interface ContextMenuState {
  x: number;
  y: number;
  fileId: string | null;
  fileName: string;
}

interface SidebarContextMenuProps {
  contextMenu: ContextMenuState | null;
  files: MarkdownFile[];
  onSelectFile: (id: string) => void;
  onOpenSmartOrganize?: (file: MarkdownFile) => void;
  onRequestDelete: (fileId: string, fileName: string) => void;
  onClose: () => void;
}

export const SidebarContextMenu: React.FC<SidebarContextMenuProps> = ({
  contextMenu,
  files,
  onSelectFile,
  onOpenSmartOrganize,
  onRequestDelete,
  onClose
}) => {
  if (!contextMenu) return null;

  return (
    <div
      className="fixed z-50 bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-700 py-1 min-w-[160px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          if (contextMenu.fileId) {
            onSelectFile(contextMenu.fileId);
          }
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2"
      >
        <FileText size={14} />
        Open
      </button>
      {onOpenSmartOrganize && (
        <button
          onClick={() => {
            const file = files.find(f => f.id === contextMenu.fileId);
            if (file) onOpenSmartOrganize(file);
            onClose();
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-cyber-700 flex items-center gap-2"
        >
          <Sparkles size={14} className="text-violet-500" />
          Smart Organize
        </button>
      )}
      <div className="border-t border-paper-200 dark:border-cyber-700 my-1" />
      <button
        onClick={() => {
          if (contextMenu.fileId) {
            onRequestDelete(contextMenu.fileId, contextMenu.fileName);
          }
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
        aria-label="Delete file"
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
};
