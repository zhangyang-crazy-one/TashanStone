import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FileText, Plus, Trash2, FolderOpen, Search, X, FolderInput, 
  FileType, List, AlignLeft, ChevronRight, GraduationCap, 
  Folder, FileCode, FileImage, FileJson, FileSpreadsheet, File as FileIcon,
  Lock, Upload, Database, Loader2, RefreshCw, Edit2
} from 'lucide-react';
import { MarkdownFile, RAGStats } from '../types';
import { translations, Language } from '../utils/translations';

interface SidebarProps {
  files: MarkdownFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateItem: (type: 'file' | 'folder', name: string, parentPath: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveItem: (sourceId: string, targetFolderPath: string | null) => void;
  onRenameItem: (id: string, newName: string, type: 'file' | 'folder', path: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportFile: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  language?: Language;
  ragStats?: RAGStats;
  onRefreshIndex?: () => void;
}

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

// Tree Node Interface
interface FileTreeNode {
    id: string; // unique ID
    name: string;
    path: string;
    type: 'file' | 'folder';
    fileId?: string;
    children?: FileTreeNode[];
    level?: number;
}

// Flat Node Interface for Virtual-ish Rendering
interface FlatNode extends FileTreeNode {
    level: number;
    isExpanded?: boolean;
    hasChildren?: boolean;
}

// Config: Extensions to Display in Sidebar
const DISPLAY_EXTENSIONS = ['.md', '.markdown', '.csv', '.pdf', '.docx', '.doc', '.txt', '.keep'];

// Config: Extensions that can be Operated On (Selected/Edited)
const OPERABLE_EXTENSIONS = ['.md', '.markdown', '.csv', '.txt'];

const isExtensionInList = (filename: string, list: string[]) => {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    // Allow any file ending in .keep to be processed as a node, but filtered out of operability usually
    if (lower.endsWith('.keep')) return true;
    return list.some(ext => lower.endsWith(ext));
};

const getIconForFile = (name: string) => {
    const lower = name?.toLowerCase() || '';
    
    // Markdown
    if (lower.endsWith('.md')) return <FileText size={14} className="text-cyan-500" />;
    if (lower.endsWith('.txt')) return <FileText size={14} className="text-slate-500" />;
    
    // Code
    if (lower.endsWith('.js') || lower.endsWith('.jsx')) return <FileCode size={14} className="text-yellow-500" />;
    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return <FileCode size={14} className="text-blue-500" />;
    if (lower.endsWith('.css') || lower.endsWith('.scss')) return <FileCode size={14} className="text-pink-500" />;
    if (lower.endsWith('.html')) return <FileCode size={14} className="text-orange-500" />;
    if (lower.endsWith('.json')) return <FileJson size={14} className="text-green-500" />;
    
    // Data & Docs
    if (lower.endsWith('.csv')) return <FileSpreadsheet size={14} className="text-emerald-500" />;
    if (lower.endsWith('.pdf')) return <FileType size={14} className="text-red-500" />;
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return <FileType size={14} className="text-blue-600" />;
    
    // Images
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some(ext => lower.endsWith(ext))) {
        return <FileImage size={14} className="text-purple-500" />;
    }

    // Default
    return <FileIcon size={14} className="text-slate-400" />;
};

// Memoized Row Component
const FileTreeRow = React.memo<{
    node: FlatNode;
    activeFileId: string;
    onSelect: (id: string) => void;
    onToggle: (path: string) => void;
    onDelete: (id: string) => void;
    onRequestCreate: (type: 'file' | 'folder', parentPath: string) => void;
    onDragStart: (e: React.DragEvent, nodeId: string) => void;
    onDragOver: (e: React.DragEvent, nodeId: string) => void;
    onDrop: (e: React.DragEvent, targetPath: string) => void;
    isDropTarget: boolean;
    isRenaming: boolean;
    renameValue: string;
    onRenameChange: (val: string) => void;
    onRenameSubmit: () => void;
    onRenameCancel: () => void;
    onStartRename: (id: string, initialName: string) => void;
}>(({ 
    node, activeFileId, onSelect, onToggle, onDelete, onRequestCreate, 
    onDragStart, onDragOver, onDrop, isDropTarget,
    isRenaming, renameValue, onRenameChange, onRenameSubmit, onRenameCancel, onStartRename
}) => {
    const indentStyle = { paddingLeft: `${node.level * 12 + 12}px` };
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isRenaming]);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onRenameSubmit();
        } else if (e.key === 'Escape') {
            onRenameCancel();
        }
    };

    if (node.type === 'folder') {
        return (
            <div 
                className={`
                    flex items-center gap-2 py-1.5 pr-2 cursor-pointer transition-colors group select-none relative
                    ${isDropTarget ? 'bg-cyan-100 dark:bg-cyan-900/40 ring-1 ring-cyan-400 inset-0' : 'hover:bg-paper-200 dark:hover:bg-cyber-800 text-slate-600 dark:text-slate-300'}
                `}
                style={indentStyle}
                onClick={() => !isRenaming && onToggle(node.path)}
                draggable={!isRenaming}
                onDragStart={(e) => onDragStart(e, node.fileId || node.id)}
                onDragOver={(e) => onDragOver(e, node.id)}
                onDrop={(e) => onDrop(e, node.path)}
            >
                {/* Indent Guide */}
                {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}
                
                <span className="opacity-60 transition-transform duration-200 shrink-0" style={{ transform: node.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    <ChevronRight size={12} />
                </span>
                <span className="text-amber-400 shrink-0">
                     {node.isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                </span>
                
                {isRenaming ? (
                     <input 
                        ref={inputRef}
                        type="text" 
                        value={renameValue}
                        onChange={(e) => onRenameChange(e.target.value)}
                        onBlur={onRenameSubmit}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 bg-white dark:bg-cyber-900 border border-cyan-500 rounded px-1 text-sm focus:outline-none h-6"
                     />
                ) : (
                    <span className="text-sm font-semibold truncate flex-1">{node.name}</span>
                )}
                
                {/* Actions (Visible on Hover) */}
                {!isRenaming && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                            onClick={(e) => { e.stopPropagation(); onStartRename(node.id, node.name); }}
                            className="p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded text-slate-500 hover:text-cyan-600"
                            title="Rename Folder"
                         >
                             <Edit2 size={12} />
                         </button>
                         <button 
                            onClick={(e) => { e.stopPropagation(); onRequestCreate('file', node.path); }}
                            className="p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded text-slate-500 hover:text-cyan-600"
                            title="New File inside"
                         >
                             <Plus size={12} />
                         </button>
                         <button 
                            onClick={(e) => { e.stopPropagation(); onRequestCreate('folder', node.path); }}
                            className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded text-slate-500 hover:text-amber-600"
                            title="New Folder inside"
                         >
                             <FolderInput size={12} />
                         </button>
                    </div>
                )}
            </div>
        );
    }

    const isActive = activeFileId === node.fileId;
    const isOperable = isExtensionInList(node.name, OPERABLE_EXTENSIONS);
    
    // Hide .keep files from the list view
    if (node.name === '.keep') return null;

    return (
        <div 
           className={`
             group flex items-center gap-2 py-1.5 pr-2 transition-colors relative select-none
             ${isActive 
               ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-800 dark:text-cyan-200' 
               : 'text-slate-600 dark:text-slate-400 hover:bg-paper-200 dark:hover:bg-cyber-800'}
             ${!isOperable ? 'opacity-60 cursor-default' : 'cursor-pointer'}
           `}
           style={indentStyle}
           onClick={() => isOperable && !isRenaming && onSelect(node.fileId!)}
           title={!isOperable ? "Read Only / Extraction Source" : node.name}
           draggable={isOperable && !isRenaming}
           onDragStart={(e) => isOperable && onDragStart(e, node.fileId!)}
        >
           {/* Indent Guide */}
           {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}
           
           {/* Active Indicator */}
           {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500" />}
           
           <span className="opacity-80 shrink-0">{getIconForFile(node.name)}</span>
           
           {isRenaming ? (
                 <input 
                    ref={inputRef}
                    type="text" 
                    value={renameValue}
                    onChange={(e) => onRenameChange(e.target.value)}
                    onBlur={onRenameSubmit}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-white dark:bg-cyber-900 border border-cyan-500 rounded px-1 text-sm focus:outline-none h-6"
                 />
            ) : (
                <span className="text-sm truncate flex-1 leading-none pt-0.5">{node.name}</span>
            )}
           
           {!isOperable && <Lock size={10} className="text-slate-400" />}

           {isOperable && !isRenaming && (
               <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                   <button
                    onClick={(e) => { e.stopPropagation(); onStartRename(node.fileId!, node.name); }}
                    className="p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 hover:text-cyan-500 rounded transition-all"
                    title="Rename File"
                   >
                     <Edit2 size={12} />
                   </button>
                   <button
                    onClick={(e) => { e.stopPropagation(); onDelete(node.fileId!); }}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded transition-all"
                    title="Delete File"
                   >
                     <Trash2 size={12} />
                   </button>
               </div>
           )}
        </div>
    );
});

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateItem,
  onDeleteFile,
  onMoveItem,
  onRenameItem,
  isOpen,
  onCloseMobile,
  onOpenFolder,
  onImportFolderFiles,
  onImportFile,
  onImportQuiz,
  language = 'en',
  ragStats,
  onRefreshIndex
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('files');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Drag and Drop State
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isRootDropTarget, setIsRootDropTarget] = useState(false);
  
  // Creation Modal State
  const [creationModal, setCreationModal] = useState<{
    isOpen: boolean;
    type: 'file' | 'folder';
    parentPath: string;
    value: string;
  }>({ isOpen: false, type: 'file', parentPath: '', value: '' });

  // Renaming State
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const creationInputRef = useRef<HTMLInputElement>(null);

  // Persist expanded state to localStorage
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('neon-sidebar-expanded');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn("Failed to load sidebar state", e);
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('neon-sidebar-expanded', JSON.stringify(expandedFolders));
    } catch (e) {
      console.error("Failed to save sidebar state", e);
    }
  }, [expandedFolders]);

  useEffect(() => {
      if (creationModal.isOpen && creationInputRef.current) {
          setTimeout(() => creationInputRef.current?.focus(), 50);
      }
  }, [creationModal.isOpen]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const quizInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const t = translations[language];

  // Sync ref in render to ensure it's up to date for useMemo calculation
  const filesRef = useRef(files);
  filesRef.current = files;

  // 1. Structure Hash: Create a stable dependency key for tree building
  const filesStructureHash = useMemo(() => {
     if (!files || !Array.isArray(files)) return "";
     return files
        .filter(f => isExtensionInList(f.path || f.name, DISPLAY_EXTENSIONS))
        .map(f => `${f.id}|${f.path || f.name}`)
        .join(';');
  }, [files]);
  
  // 2. Build Tree Structure (Hierarchical)
  const fileTree = useMemo(() => {
    const currentFiles = filesRef.current || [];
    const rootNodes: FileTreeNode[] = [];
    const pathMap = new Map<string, FileTreeNode>();

    // 1. Filter Files
    const visibleFiles = currentFiles.filter(f => 
        f && (f.path || f.name) && isExtensionInList(f.path || f.name, DISPLAY_EXTENSIONS)
    );

    // 2. Build Nodes
    visibleFiles.forEach(file => {
        const rawPath = file.path || file.name;
        const normalizedPath = rawPath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/').filter(p => p);

        let currentPath = '';
        
        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const parentPath = currentPath; 
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            // Find or Create Node
            let node = pathMap.get(currentPath);

            if (!node) {
                node = {
                    id: isFile ? file.id : `folder-${currentPath}`,
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'folder',
                    fileId: isFile ? file.id : undefined,
                    children: isFile ? undefined : []
                };
                pathMap.set(currentPath, node);

                // Attach to Parent or Root
                if (parentPath) {
                    const parent = pathMap.get(parentPath);
                    if (parent && parent.children) {
                        parent.children.push(node);
                    } else {
                        rootNodes.push(node);
                    }
                } else {
                    rootNodes.push(node);
                }
            }
        });
    });

    // 3. Sort Nodes Recursively
    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
        return nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        }).map(node => {
            if (node.children) {
                node.children = sortNodes(node.children);
            }
            return node;
        });
    };

    return sortNodes(rootNodes);
  }, [filesStructureHash]); 

  // Auto-expand to active file
  useEffect(() => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (activeFile && (activeFile.path || activeFile.name)) {
         const rawPath = activeFile.path || activeFile.name;
         const parts = rawPath.replace(/\\/g, '/').split('/');
         if (parts.length > 1) {
             setExpandedFolders(prev => {
                 const next = { ...prev };
                 let currentPath = '';
                 let changed = false;
                 // Expand all parents
                 for (let i = 0; i < parts.length - 1; i++) {
                     currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
                     if (!next[currentPath]) {
                         next[currentPath] = true;
                         changed = true;
                     }
                 }
                 return changed ? next : prev;
             });
         }
    }
    
    // Also update outline
    if (activeFile) {
      const lines = (activeFile.content || '').split('\n');
      const headers: OutlineItem[] = [];
      lines.forEach((line, index) => {
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          headers.push({
            level: match[1].length,
            text: match[2],
            line: index
          });
        }
      });
      setOutline(headers);
    } else {
        setOutline([]);
    }
  }, [activeFileId, files]);

  const toggleFolder = useCallback((path: string) => {
      setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  }, []);

  // 3. Flatten Tree for Rendering
  const visibleFlatNodes = useMemo(() => {
      if (!fileTree) return [];
      const flatList: FlatNode[] = [];
      
      const traverse = (nodes: FileTreeNode[], level: number) => {
          for (const node of nodes) {
              const isFolder = node.type === 'folder';
              const isExpanded = expandedFolders[node.path];
              
              const flatNode: FlatNode = {
                  ...node,
                  level,
                  isExpanded,
                  hasChildren: node.children && node.children.length > 0
              };

              flatList.push(flatNode);

              if (isFolder && (isExpanded || searchQuery)) { // Auto-expand on search
                  if (node.children) {
                      traverse(node.children, level + 1);
                  }
              }
          }
      };
      
      // Filter Logic for Search
      const getFilteredNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
          if (!searchQuery) return nodes;
          const result: FileTreeNode[] = [];
          for (const node of nodes) {
              if (node.type === 'file') {
                  if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) result.push(node);
              } else if (node.children) {
                  const filteredChildren = getFilteredNodes(node.children);
                  if (filteredChildren.length > 0) {
                      result.push({ ...node, children: filteredChildren });
                  } else if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                       result.push(node);
                  }
              }
          }
          return result;
      };

      const nodesToRender = searchQuery ? getFilteredNodes(fileTree) : fileTree;
      if (nodesToRender) {
          traverse(nodesToRender, 0);
      }
      return flatList;
  }, [fileTree, expandedFolders, searchQuery]);


  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onImportFile(e.target.files[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleQuizUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportQuiz) onImportQuiz(e.target.files[0]);
    if (quizInputRef.current) quizInputRef.current.value = '';
  };

  const handleDirUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFolderFiles) onImportFolderFiles(e.target.files);
    if (dirInputRef.current) dirInputRef.current.value = '';
  };

  const handleFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFolderFiles) {
        onImportFolderFiles(e.target.files);
    }
    if (filesInputRef.current) filesInputRef.current.value = '';
  };

  const handleOpenFolderClick = async () => {
    try {
      await onOpenFolder();
    } catch (e) {
      console.warn("Modern directory picker failed, falling back to legacy input.", e);
      dirInputRef.current?.click();
    }
  };

  // Creation Modal Handlers
  const handleOpenCreation = (type: 'file' | 'folder', parentPath: string = '') => {
      setCreationModal({ isOpen: true, type, parentPath, value: '' });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (creationModal.value.trim()) {
          onCreateItem(creationModal.type, creationModal.value.trim(), creationModal.parentPath);
          setCreationModal({ isOpen: false, type: 'file', parentPath: '', value: '' });
          // If created in a folder, ensure it's expanded
          if (creationModal.parentPath) {
              setExpandedFolders(prev => ({ ...prev, [creationModal.parentPath]: true }));
          }
      }
  };

  // Renaming Handlers
  const handleStartRename = useCallback((id: string, initialName: string) => {
      setRenamingId(id);
      setRenameValue(initialName);
  }, []);

  const handleRenameCancel = useCallback(() => {
      setRenamingId(null);
      setRenameValue('');
  }, []);

  const handleRenameSubmit = useCallback(() => {
      if (!renamingId || !renameValue.trim()) {
          handleRenameCancel();
          return;
      }
      
      const node = visibleFlatNodes.find(n => (n.fileId === renamingId) || (n.id === renamingId));
      if (node && node.name !== renameValue.trim()) {
          onRenameItem(node.fileId || node.id, renameValue.trim(), node.type, node.path);
      }
      setRenamingId(null);
      setRenameValue('');
  }, [renamingId, renameValue, visibleFlatNodes, onRenameItem, handleRenameCancel]);

  // Drag and Drop Logic
  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string | null) => {
    e.preventDefault(); // Necessary to allow dropping
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
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm" onClick={onCloseMobile} />}

      <div className={`
        fixed lg:static inset-y-0 left-0 z-40 w-72 bg-paper-100 dark:bg-cyber-800 
        border-r border-paper-200 dark:border-cyber-700 transform transition-transform duration-300 ease-in-out
        flex flex-col relative
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'}
      `}>
        
        {/* Creation Modal Overlay */}
        {creationModal.isOpen && (
            <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-20">
                <form onSubmit={handleCreateSubmit} className="w-64 bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-600 p-3 animate-slideDown">
                    <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                        New {creationModal.type} {creationModal.parentPath ? `in /${creationModal.parentPath.split('/').pop()}` : '(Root)'}
                    </h3>
                    <input 
                        ref={creationInputRef}
                        type="text" 
                        value={creationModal.value}
                        onChange={e => setCreationModal(p => ({ ...p, value: e.target.value }))}
                        className="w-full px-2 py-1.5 mb-2 bg-paper-100 dark:bg-cyber-900/50 border border-paper-300 dark:border-cyber-600 rounded text-sm focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                        placeholder="Enter name..."
                    />
                    <div className="flex gap-2 justify-end">
                        <button 
                            type="button" 
                            onClick={() => setCreationModal(p => ({ ...p, isOpen: false }))}
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

        {/* Header Tabs */}
        <div className="h-14 flex items-center px-2 border-b border-paper-200 dark:border-cyber-700 shrink-0 gap-1 pt-2">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${activeTab === 'files' ? 'border-cyan-500 text-cyan-700 dark:text-cyan-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <FolderOpen size={15} /> {t.explorer}
            </button>
            <button
              onClick={() => setActiveTab('outline')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${activeTab === 'outline' ? 'border-violet-500 text-violet-700 dark:text-violet-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <List size={15} /> Outline
            </button>
        </div>

        {/* Search Bar - Only show when Files tab is active */}
        {activeTab === 'files' && (
            <div className="p-2 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                        type="text" 
                        placeholder="Search files..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-sm bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>
        )}

        {/* Main Content Area */}
        <div 
            className="flex-1 overflow-y-auto custom-scrollbar relative p-1"
            onDragOver={(e) => handleDragOver(e, null)}
            onDrop={(e) => handleDrop(e, null)}
        >
          {activeTab === 'files' ? (
            <div className={`min-h-full ${isRootDropTarget ? 'bg-cyan-100/30 dark:bg-cyan-900/20' : ''}`}>
               {visibleFlatNodes.length === 0 ? (
                   <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-xs text-center p-4">
                       <FolderOpen size={32} className="mb-2 opacity-50" />
                       <p>{searchQuery ? "No matching files" : t.noFilesFound}</p>
                   </div>
               ) : (
                   visibleFlatNodes.map(node => (
                       <FileTreeRow 
                          key={node.id} 
                          node={node}
                          activeFileId={activeFileId}
                          onSelect={onSelectFile}
                          onToggle={toggleFolder}
                          onDelete={onDeleteFile}
                          onRequestCreate={handleOpenCreation}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          isDropTarget={dragOverNodeId === node.id}
                          isRenaming={(renamingId === node.fileId) || (renamingId === node.id)}
                          renameValue={renameValue}
                          onRenameChange={setRenameValue}
                          onRenameSubmit={handleRenameSubmit}
                          onRenameCancel={handleRenameCancel}
                          onStartRename={handleStartRename}
                       />
                   ))
               )}
               {/* Quick Create at Root */}
               <div className="mt-2 px-2 pt-2 border-t border-paper-200 dark:border-cyber-700/50">
                  <button 
                    onClick={() => handleOpenCreation('file', '')}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 hover:text-cyan-600 hover:bg-paper-100 dark:hover:bg-cyber-800 rounded transition-colors"
                  >
                      <Plus size={14} /> New File at Root
                  </button>
                  <button 
                    onClick={() => handleOpenCreation('folder', '')}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 hover:text-amber-600 hover:bg-paper-100 dark:hover:bg-cyber-800 rounded transition-colors"
                  >
                      <FolderInput size={14} /> New Folder at Root
                  </button>
               </div>
            </div>
          ) : (
            <div className="p-4">
              {outline.length === 0 ? (
                <div className="text-center text-slate-400 text-xs mt-10">
                  <AlignLeft size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No headings found in current file</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {outline.map((item, idx) => (
                    <div 
                      key={idx}
                      className="text-sm py-1 px-2 hover:bg-paper-200 dark:hover:bg-cyber-700 rounded cursor-pointer text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors truncate"
                      style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                      onClick={() => {
                          // Simple scroll to line logic
                          // Ideally this would use an Editor ref to scroll to line
                      }}
                    >
                      {item.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* RAG Status Footer */}
        {ragStats && (
            <div className="px-3 py-2 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/80 text-[10px] flex items-center justify-between shrink-0">
                <div className="flex flex-col">
                    <span className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                        <Database size={10} /> Knowledge Base
                    </span>
                    <span className="text-slate-500">
                        {ragStats.indexedFiles}/{ragStats.totalFiles} indexed ({ragStats.totalChunks} chunks)
                    </span>
                </div>
                <button 
                    onClick={onRefreshIndex}
                    disabled={ragStats.isIndexing}
                    className={`p-1.5 rounded hover:bg-paper-200 dark:hover:bg-cyber-700 transition-colors ${ragStats.isIndexing ? 'animate-spin text-cyan-500' : 'text-slate-400'}`}
                    title="Re-index Knowledge Base"
                >
                    {ragStats.isIndexing ? <Loader2 size={12} /> : <RefreshCw size={12} />}
                </button>
            </div>
        )}

        {/* Action Footer */}
        <div className="p-2 border-t border-paper-200 dark:border-cyber-700 bg-paper-100 dark:bg-cyber-800 shrink-0">
          <div className="grid grid-cols-4 gap-1">
            <button 
              onClick={() => handleOpenCreation('file', '')}
              className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white dark:hover:bg-cyber-700 text-slate-500 hover:text-cyan-600 transition-all gap-1"
              title={t.newFile}
            >
              <Plus size={18} />
            </button>
            <button 
              onClick={handleOpenFolderClick}
              className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white dark:hover:bg-cyber-700 text-slate-500 hover:text-amber-500 transition-all gap-1"
              title={t.openDir}
            >
              <FolderOpen size={18} />
            </button>
            <button 
               onClick={() => fileInputRef.current?.click()}
               className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white dark:hover:bg-cyber-700 text-slate-500 hover:text-red-500 transition-all gap-1"
               title={t.importFiles}
            >
               <Upload size={18} />
            </button>
             <button 
               onClick={() => quizInputRef.current?.click()}
               className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white dark:hover:bg-cyber-700 text-slate-500 hover:text-violet-500 transition-all gap-1"
               title={t.quizImport}
            >
               <GraduationCap size={18} />
            </button>
          </div>
        </div>

        {/* Hidden Inputs */}
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".pdf,.md,.markdown,.txt,.csv,.json,.docx,.doc" 
            onChange={handleFileImport} 
        />
        <input 
            type="file" 
            ref={quizInputRef} 
            className="hidden" 
            accept=".md,.txt,.csv,.pdf,.json" 
            onChange={handleQuizUpload} 
        />
        <input 
            type="file" 
            ref={dirInputRef} 
            className="hidden" 
            {...({ webkitdirectory: "", directory: "" } as any)}
            onChange={handleDirUpload} 
        />
        <input
            type="file"
            ref={filesInputRef}
            className="hidden"
            multiple
            onChange={handleFilesUpload}
        />
      </div>
    </>
  );
};