import React from 'react';
import {
  ChevronRight,
  FolderOpen,
  Folder,
  Plus,
  FolderInput,
  Sparkles,
  Lock,
  Trash2
} from 'lucide-react';

import type { FileTreeNode, FileTreeRowTooltips, FlatNode } from './sidebarTypes';
import Tooltip from '../Tooltip';
import { getIconForFile, isExtensionInList, OPERABLE_EXTENSIONS } from './sidebarUtils';

interface FileTreeRowProps {
  node: FlatNode;
  activeFileId: string;
  onSelect: (id: string) => void;
  onToggle: (path: string) => void;
  onDelete: (id: string, fileName: string) => void;
  onRequestCreate: (type: 'file' | 'folder', parentPath: string) => void;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragOver: (e: React.DragEvent, nodeId: string) => void;
  onDrop: (e: React.DragEvent, targetPath: string) => void;
  isDropTarget: boolean;
  tooltips?: FileTreeRowTooltips;
  onShowContextMenu?: (fileId: string, fileName: string, x: number, y: number) => void;
}

export const FileTreeRow = React.memo<FileTreeRowProps>(({
  node,
  activeFileId,
  onSelect,
  onToggle,
  onDelete,
  onRequestCreate,
  onDragStart,
  onDragOver,
  onDrop,
  isDropTarget,
  tooltips,
  onShowContextMenu
}) => {
  const indentStyle = { paddingLeft: `${node.level * 12 + 12}px` };

  if (node.type === 'folder') {
    const isMemoryFolder = node.name === '.memories';
    return (
      <div
        className={`
                    flex items-center gap-2 py-1.5 pr-2 cursor-pointer transition-colors group select-none relative
                    ${isDropTarget ? 'bg-cyan-100 dark:bg-cyan-900/40 ring-1 ring-cyan-400 inset-0' : isMemoryFolder
            ? 'bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-700 dark:text-violet-300'
            : 'hover:bg-paper-200 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300'}
                `}
        style={indentStyle}
        onClick={() => onToggle(node.path)}
        draggable
        onDragStart={(e) => onDragStart(e, node.fileId || node.id)}
        onDragOver={(e) => onDragOver(e, node.id)}
        onDrop={(e) => onDrop(e, node.path)}
      >
        {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}

        <span className="opacity-60 transition-transform duration-200 shrink-0" style={{ transform: node.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRight size={12} />
        </span>
        <span className={`shrink-0 ${isMemoryFolder ? 'text-violet-500' : 'text-amber-400'}`}>
          {node.isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
        </span>
        <span className={`text-sm font-semibold truncate flex-1 ${isMemoryFolder ? 'text-violet-700 dark:text-violet-300' : ''}`}>
          {isMemoryFolder ? '🧠 AI 记忆库' : node.name}
        </span>

        {!isMemoryFolder && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip content={tooltips?.newFileInside || "New File inside"}>
              <button
                onClick={(e) => { e.stopPropagation(); onRequestCreate('file', node.path); }}
                className="p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded text-slate-500 hover:text-cyan-600"
                aria-label={tooltips?.newFileInside || "New File inside"}
              >
                <Plus size={12} />
              </button>
            </Tooltip>
            <Tooltip content={tooltips?.newFolderInside || "New Folder inside"}>
              <button
                onClick={(e) => { e.stopPropagation(); onRequestCreate('folder', node.path); }}
                className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded text-slate-500 hover:text-amber-600"
                aria-label={tooltips?.newFolderInside || "New Folder inside"}
              >
                <FolderInput size={12} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    );
  }

  const isActive = activeFileId === node.fileId;
  const isOperable = isExtensionInList(node.name, OPERABLE_EXTENSIONS);

  if (node.name === '.keep') return null;

  const isMemoryFile = (node as FileTreeNode).isMemory;
  const memoryImportance = (node as FileTreeNode).memoryImportance;

  const getMemoryImportanceColor = (imp: string) => {
    switch (imp) {
      case 'high': return 'text-red-500 bg-red-100 dark:bg-red-900/30';
      case 'medium': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30';
      default: return 'text-slate-400 bg-slate-100 dark:bg-slate-800';
    }
  };

  return (
    <div
      className={`
                    flex items-center gap-2 py-1.5 pr-2 cursor-pointer transition-colors group select-none relative
                    ${isDropTarget ? 'bg-cyan-100 dark:bg-cyan-900/40 ring-1 ring-cyan-400 inset-0' :
          'hover:bg-paper-200 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300'}
                `}
      style={indentStyle}
      onClick={() => isOperable && onSelect(node.fileId!)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (isOperable && node.fileId && onShowContextMenu) {
          onShowContextMenu(node.fileId, node.name, e.clientX, e.clientY);
        }
      }}
      draggable={isOperable}
      onDragStart={(e) => isOperable && onDragStart(e, node.fileId!)}
    >
      {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}

      {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500" />}

      <span className="opacity-80 shrink-0">
        {isMemoryFile ? (
          <Sparkles size={14} className="text-violet-500" />
        ) : (
          getIconForFile(node.name)
        )}
      </span>
      <Tooltip
        content={!isOperable ? (tooltips?.readOnlySource || "Read Only / Extraction Source") : node.name}
        className="flex-1 min-w-0"
      >
        <span className={`text-sm truncate flex-1 leading-none pt-0.5 ${isMemoryFile ? 'text-violet-700 dark:text-violet-300' : ''}`}>
          {node.name}
        </span>
      </Tooltip>

      {isMemoryFile && memoryImportance && (
        <span className={`text-[9px] px-1 py-0.5 rounded ${getMemoryImportanceColor(memoryImportance)}`}>
          {memoryImportance}
        </span>
      )}

      {!isOperable && <Lock size={10} className="text-slate-400" />}

      {isOperable && (
        <Tooltip content={tooltips?.deleteFile || "Delete File"}>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node.fileId!, node.name); }}
            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded transition-all shrink-0"
            aria-label={tooltips?.deleteFile || "Delete File"}
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  );
});

FileTreeRow.displayName = 'FileTreeRow';
