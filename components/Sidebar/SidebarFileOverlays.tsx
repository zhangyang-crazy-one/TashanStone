import React from 'react';
import { Trash2 } from 'lucide-react';

interface CreationModalState {
  isOpen: boolean;
  type: 'file' | 'folder';
  parentPath: string;
  value: string;
}

interface DeleteConfirmState {
  isOpen: boolean;
  fileId: string | null;
  fileName: string;
}

interface SidebarFileOverlaysProps {
  creationModal: CreationModalState;
  deleteConfirm: DeleteConfirmState;
  creationInputRef: React.RefObject<HTMLInputElement>;
  onCreationValueChange: (value: string) => void;
  onCreationClose: () => void;
  onCreationSubmit: (event: React.FormEvent) => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

export const SidebarFileOverlays: React.FC<SidebarFileOverlaysProps> = ({
  creationModal,
  deleteConfirm,
  creationInputRef,
  onCreationValueChange,
  onCreationClose,
  onCreationSubmit,
  onDeleteConfirm,
  onDeleteCancel
}) => {
  return (
    <>
      {creationModal.isOpen && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-20">
          <form onSubmit={onCreationSubmit} className="w-64 bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-600 p-3 animate-slideDown">
            <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
              New {creationModal.type} {creationModal.parentPath ? `in /${creationModal.parentPath.split('/').pop()}` : '(Root)'}
            </h3>
            <input
              ref={creationInputRef}
              type="text"
              value={creationModal.value}
              onChange={e => onCreationValueChange(e.target.value)}
              className="w-full px-2 py-1.5 mb-2 bg-paper-100 dark:bg-cyber-900/50 border border-paper-300 dark:border-cyber-600 rounded text-sm focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              placeholder="Enter name..."
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onCreationClose}
                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2 py-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded text-xs font-bold"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteConfirm.isOpen && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="w-72 bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-red-200 dark:border-red-900/50 p-4 animate-slideDown">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 size={18} className="text-red-500" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                确认删除
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              确定要删除文件 <span className="font-semibold text-red-600 dark:text-red-400">"{deleteConfirm.fileName}"</span> 吗？此操作无法撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={onDeleteCancel}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-cyber-700 rounded transition-colors"
              >
                取消
              </button>
              <button
                onClick={onDeleteConfirm}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
