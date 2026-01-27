import React, { useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';

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
  const [isDragging, setIsDragging] = useState(false);
  const renderNodes = useMemo(
    () => visibleFlatNodes.filter(node => node.name !== '.keep'),
    [visibleFlatNodes]
  );

  const ROW_HEIGHT = 32;
  const ROOT_DROP_ROW_HEIGHT = 72;

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
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
    setIsDragging(false);
    if (sourceId) {
      onMoveItem(sourceId, targetPath);
    }
  };

  const handleDragEnd = () => {
    setDragOverNodeId(null);
    setIsRootDropTarget(false);
    setIsDragging(false);
  };

  interface FileTreeRowData {
    nodes: FlatNode[];
    activeFileId: string;
    tooltips?: SidebarFileTreeProps['tooltips'];
    onSelectFile: (id: string) => void;
    onDeleteRequest: (id: string, fileName: string) => void;
    onToggleFolder: (path: string) => void;
    onOpenCreation: (type: 'file' | 'folder', parentPath: string) => void;
    onShowContextMenu: (fileId: string, fileName: string, x: number, y: number) => void;
    onDragStart: (e: React.DragEvent, nodeId: string) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent, nodeId: string | null) => void;
    onDrop: (e: React.DragEvent, targetPath: string | null) => void;
    dragOverNodeId: string | null;
    isRootDropTarget: boolean;
  }

  const FileTreeRowRenderer = ({ index, style, ariaAttributes, ...rowProps }: RowComponentProps<FileTreeRowData>) => {
    const {
      nodes,
      activeFileId: rowActiveFileId,
      tooltips: rowTooltips,
      onSelectFile: rowSelectFile,
      onDeleteRequest: rowDeleteRequest,
      onToggleFolder: rowToggleFolder,
      onOpenCreation: rowOpenCreation,
      onShowContextMenu: rowShowContextMenu,
      onDragStart: rowDragStart,
      onDragEnd: rowDragEnd,
      onDragOver: rowDragOver,
      onDrop: rowDrop,
      dragOverNodeId: rowDragOverNodeId,
      isRootDropTarget: rowIsRootDropTarget
    } = rowProps;

    if (index >= nodes.length) {
      return (
        <div style={style} className="px-1 py-1" {...ariaAttributes}>
          <div
            className={`border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-slate-400 transition-all min-h-[60px] ${rowIsRootDropTarget ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20' : 'border-transparent'}`}
            onDragOver={(e) => rowDragOver(e, null)}
            onDrop={(e) => rowDrop(e, null)}
          >
            {rowIsRootDropTarget ? "Drop to Root Directory" : ""}
          </div>
        </div>
      );
    }

    const node = nodes[index];
    return (
      <FileTreeRow
        key={node.id}
        node={node}
        activeFileId={rowActiveFileId}
        tooltips={rowTooltips}
        onSelect={rowSelectFile}
        onDelete={rowDeleteRequest}
        onToggle={rowToggleFolder}
        onRequestCreate={rowOpenCreation}
        onDragStart={rowDragStart}
        onDragEnd={rowDragEnd}
        onDragOver={(e) => rowDragOver(e, node.id)}
        onDrop={(e) => rowDrop(e, node.path)}
        isDropTarget={rowDragOverNodeId === node.id}
        onShowContextMenu={rowShowContextMenu}
        style={style}
        ariaAttributes={ariaAttributes}
      />
    );
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      {renderNodes.length === 0 ? (
        <>
          <div className="text-center py-8 text-slate-400 text-xs italic">
            {searchQuery ? 'No matching files' : 'No files open'}
          </div>
          {isDragging && (
            <div className="px-1 py-1">
              <div
                className={`border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-slate-400 transition-all min-h-[60px] ${isRootDropTarget ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20' : 'border-transparent'}`}
                onDragOver={(e) => handleDragOver(e, null)}
                onDrop={(e) => handleDrop(e, null)}
              >
                {isRootDropTarget ? "Drop to Root Directory" : ""}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 min-h-0">
          <AutoSizer
            renderProp={({ height, width }) => {
              if (!height || !width) return null;
              const rowCount = renderNodes.length + (isDragging ? 1 : 0);
              return (
                <List
                  className="custom-scrollbar pr-1"
                  rowCount={rowCount}
                  rowHeight={(index) => (index >= renderNodes.length ? ROOT_DROP_ROW_HEIGHT : ROW_HEIGHT)}
                  rowComponent={FileTreeRowRenderer}
                  rowProps={{
                    nodes: renderNodes,
                    activeFileId,
                    tooltips,
                    onSelectFile,
                    onDeleteRequest,
                    onToggleFolder,
                    onOpenCreation,
                    onShowContextMenu: onShowContextMenu || (() => {}),
                    onDragStart: handleDragStart,
                    onDragEnd: handleDragEnd,
                    onDragOver: handleDragOver,
                    onDrop: handleDrop,
                    dragOverNodeId,
                    isRootDropTarget
                  }}
                  overscanCount={6}
                  style={{ height, width }}
                />
              );
            }}
          />
        </div>
      )}
    </div>
  );
};
