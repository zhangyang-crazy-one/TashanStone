import React, { useState } from 'react';

import type { FlatNode } from './sidebarTypes';
import { FileTreeRow } from './FileTreeRow';

interface SidebarFileTreeProps {
  activeFileId: string;
  visibleFlatNodes: FlatNode[];
  searchQuery: string;
  onSelectFile: (id: string) => void;
  onDeleteRequest: (id: string, fileName: string) => void;
  onToggleFolder: (path: string) => void;
  onOpenCreation: (type: 'file' | 'folder', parentPath: string) => void;
  onMoveItem: (sourceId: string, targetFolderPath: string | null) => void;
  onShowContextMenu: (fileId: string, fileName: string, x: number, y: number) => void;
  tooltips?: {
    newFileInside?: string;
    newFolderInside?: string;
    readOnlySource?: string;
    deleteFile?: string;
  };
}

export const SidebarFileTree: React.FC<SidebarFileTreeProps> = ({
  activeFileId,
  visibleFlatNodes,
  searchQuery,
  onSelectFile,
  onDeleteRequest,
  onToggleFolder,
  onOpenCreation,
  onMoveItem,
  onShowContextMenu,
  tooltips
}) => {
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isRootDropTarget, setIsRootDropTarget] = useState(false);

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string | null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverNodeId !== nodeId) {
      setDragOverNodeId(nodeId);
      setIsRootDropTarget(nodeId === null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetPath: string | null) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    setDragOverNodeId(null);
    setIsRootDropTarget(false);
    if (sourceId) {
      onMoveItem(sourceId, targetPath);
    }
  };

  return (
    <div className="pb-10 min-h-[100px] flex flex-col">
      {visibleFlatNodes.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-xs italic">
          {searchQuery ? 'No matching files' : 'No files open'}
        </div>
      ) : (
        visibleFlatNodes.map((node) => (
          <FileTreeRow
            key={node.id}
            node={node}
            activeFileId={activeFileId}
            tooltips={tooltips}
            onSelect={onSelectFile}
            onDelete={onDeleteRequest}
            onToggle={onToggleFolder}
            onRequestCreate={onOpenCreation}
            onDragStart={handleDragStart}
            onDragOver={(e) => handleDragOver(e, node.id)}
            onDrop={(e) => handleDrop(e, node.path)}
            isDropTarget={dragOverNodeId === node.id}
            onShowContextMenu={onShowContextMenu}
          />
        ))
      )}

      <div
        className={`flex-1 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-slate-400 transition-all min-h-[60px] mt-4 ${isRootDropTarget ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20' : 'border-transparent'}`}
        onDragOver={(e) => handleDragOver(e, null)}
        onDrop={(e) => handleDrop(e, null)}
      >
        {isRootDropTarget ? "Drop to Root Directory" : ""}
      </div>
    </div>
  );
};
