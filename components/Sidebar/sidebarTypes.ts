export type SidebarTab = 'files' | 'snippets' | 'outline';

export interface OutlineItem {
  level: number;
  text: string;
  line: number;
  slug: string;
}

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  fileId?: string;
  children?: FileTreeNode[];
  level?: number;
  isMemory?: boolean;
  memoryImportance?: 'low' | 'medium' | 'high';
}

export interface FlatNode extends FileTreeNode {
  level: number;
  isExpanded?: boolean;
  hasChildren?: boolean;
}

export interface FileTreeRowTooltips {
  newFileInside?: string;
  newFolderInside?: string;
  readOnlySource?: string;
  deleteFile?: string;
}
