


import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FileText, Plus, Trash2, FolderOpen, Search, X, FolderInput, 
  FileType, List, AlignLeft, ChevronRight, GraduationCap, 
  Folder, FileCode, FileImage, FileJson, FileSpreadsheet, File as FileIcon,
  Lock, Upload, Database, Loader2, RefreshCw, Edit2, Tag as TagIcon, Hash, Scissors, Copy,
  GitCompare, Map as MapIcon
} from 'lucide-react';
import { MarkdownFile, RAGStats, Snippet } from '../types';
import { translations, Language } from '../utils/translations';
import { extractTags } from '../services/knowledgeService';

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
  onInsertSnippet?: (text: string) => void;
  onGenerateExam?: (fileId: string) => void; 
  onCompareFile?: (id: string) => void;
  onViewRoadmap?: () => void; // New prop for roadmap
}

interface OutlineItem {
  level: number;
  text: string;
  line: number;
}

// Tree Node Interface
interface FileTreeNode {
    id: string; 
    name: string;
    path: string;
    type: 'file' | 'folder';
    fileId?: string;
    children?: FileTreeNode[];
    level?: number;
    importance?: number; 
}

interface FlatNode extends FileTreeNode {
    level: number;
    isExpanded?: boolean;
    hasChildren?: boolean;
}

const DISPLAY_EXTENSIONS = ['.md', '.markdown', '.csv', '.pdf', '.docx', '.doc', '.txt', '.keep'];
const OPERABLE_EXTENSIONS = ['.md', '.markdown', '.csv', '.txt'];

const DEFAULT_SNIPPETS: Snippet[] = [
    { id: 'tbl', name: 'Table', category: 'template', content: '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n' },
    { id: 'math', name: 'Math Block', category: 'code', content: '$$\n  \\int_0^\\infty x^2 dx\n$$\n' },
    { id: 'mermaid', name: 'Mermaid Diagram', category: 'code', content: '```mermaid\ngraph TD;\n    A-->B;\n    A-->C;\n```\n' },
    { id: 'todo', name: 'Task List', category: 'template', content: '- [ ] Task 1\n- [ ] Task 2\n' },
    { id: 'js', name: 'JS Code Block', category: 'code', content: '```javascript\nconsole.log("Hello");\n```\n' },
];

const isExtensionInList = (filename: string, list: string[]) => {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    if (lower.endsWith('.keep')) return true;
    return list.some(ext => lower.endsWith(ext));
};

const getIconForFile = (name: string) => {
    const lower = name?.toLowerCase() || '';
    if (lower.endsWith('.md')) return <FileText size={14} className="text-cyan-500" />;
    if (lower.endsWith('.txt')) return <FileText size={14} className="text-slate-500" />;
    if (lower.endsWith('.js') || lower.endsWith('.jsx')) return <FileCode size={14} className="text-yellow-500" />;
    if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return <FileCode size={14} className="text-blue-500" />;
    if (lower.endsWith('.css') || lower.endsWith('.scss')) return <FileCode size={14} className="text-pink-500" />;
    if (lower.endsWith('.html')) return <FileCode size={14} className="text-orange-500" />;
    if (lower.endsWith('.json')) return <FileJson size={14} className="text-green-500" />;
    if (lower.endsWith('.csv')) return <FileSpreadsheet size={14} className="text-emerald-500" />;
    if (lower.endsWith('.pdf')) return <FileType size={14} className="text-red-500" />;
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return <FileType size={14} className="text-blue-600" />;
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].some(ext => lower.endsWith(ext))) {
        return <FileImage size={14} className="text-purple-500" />;
    }
    return <FileIcon size={14} className="text-slate-400" />;
};

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
    onGenerateExam: (id: string) => void;
    onCompareFile?: (id: string) => void;
    t: any;
}>(({ 
    node, activeFileId, onSelect, onToggle, onDelete, onRequestCreate, 
    onDragStart, onDragOver, onDrop, isDropTarget,
    isRenaming, renameValue, onRenameChange, onRenameSubmit, onRenameCancel, onStartRename, onGenerateExam, onCompareFile, t
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
        if (e.key === 'Enter') onRenameSubmit();
        else if (e.key === 'Escape') onRenameCancel();
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
                
                {!isRenaming && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                            onClick={(e) => { e.stopPropagation(); onStartRename(node.id, node.name); }}
                            className="p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded text-slate-500 hover:text-cyan-600"
                            title={t.rename || "Rename"}
                         >
                             <Edit2 size={12} />
                         </button>
                         <button 
                            onClick={(e) => { e.stopPropagation(); onRequestCreate('file', node.path); }}
                            className="p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded text-slate-500 hover:text-cyan-600"
                            title={t.newFile || "New File"}
                         >
                             <Plus size={12} />
                         </button>
                         <button 
                            onClick={(e) => { e.stopPropagation(); onRequestCreate('folder', node.path); }}
                            className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded text-slate-500 hover:text-amber-600"
                            title="New Folder"
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
    const isImportant = (node.importance || 0) >= 7;
    
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
           title={!isOperable ? "Read Only" : node.name}
           draggable={isOperable && !isRenaming}
           onDragStart={(e) => isOperable && onDragStart(e, node.fileId!)}
        >
           {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}
           
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
                <span className="text-sm truncate flex-1 leading-none pt-0.5 flex items-center gap-2">
                    {node.name}
                    {isImportant && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Important" />}
                </span>
            )}
           
           {!isOperable && <Lock size={10} className="text-slate-400" />}

           {isOperable && !isRenaming && (
               <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                   <button
                    onClick={(e) => { e.stopPropagation(); onGenerateExam(node.fileId!); }}
                    className="p-1 hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:text-violet-500 rounded transition-all"
                    title={t.createExamFromNote}
                   >
                     <GraduationCap size={12} />
                   </button>
                   {onCompareFile && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onCompareFile(node.fileId!); }}
                            className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:text-amber-500 rounded transition-all"
                            title={t.compareActive || "Compare"}
                        >
                            <GitCompare size={12} />
                        </button>
                   )}
                   <button
                    onClick={(e) => { e.stopPropagation(); onStartRename(node.fileId!, node.name); }}
                    className="p-1 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 hover:text-cyan-500 rounded transition-all"
                    title={t.renameFile}
                   >
                     <Edit2 size={12} />
                   </button>
                   <button
                    onClick={(e) => { e.stopPropagation(); onDelete(node.fileId!); }}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded transition-all"
                    title={t.deleteFile}
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
  onRefreshIndex,
  onInsertSnippet,
  onGenerateExam = () => {},
  onCompareFile,
  onViewRoadmap
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'outline' | 'tags' | 'snippets'>('files');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [isRootDropTarget, setIsRootDropTarget] = useState(false);
  
  const [creationModal, setCreationModal] = useState<{
    isOpen: boolean;
    type: 'file' | 'folder';
    parentPath: string;
    value: string;
  }>({ isOpen: false, type: 'file', parentPath: '', value: '' });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const creationInputRef = useRef<HTMLInputElement>(null);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('neon-sidebar-expanded');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('neon-sidebar-expanded', JSON.stringify(expandedFolders));
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

  const filesRef = useRef(files);
  filesRef.current = files;

  const filesStructureHash = useMemo(() => {
     if (!files || !Array.isArray(files)) return "";
     return files
        .filter(f => isExtensionInList(f.path || f.name, DISPLAY_EXTENSIONS))
        .map(f => `${f.id}|${f.path || f.name}|${f.importance || 0}`)
        .join(';');
  }, [files]);
  
  const fileTree = useMemo(() => {
    const currentFiles = filesRef.current || [];
    const rootNodes: FileTreeNode[] = [];
    const pathMap = new Map<string, FileTreeNode>();

    const visibleFiles = currentFiles.filter(f => 
        f && (f.path || f.name) && isExtensionInList(f.path || f.name, DISPLAY_EXTENSIONS)
    );

    visibleFiles.forEach(file => {
        const rawPath = file.path || file.name;
        const normalizedPath = rawPath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/').filter(p => p);

        let currentPath = '';
        
        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const parentPath = currentPath; 
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            let node = pathMap.get(currentPath);

            if (!node) {
                node = {
                    id: isFile ? file.id : `folder-${currentPath}`,
                    name: part,
                    path: currentPath,
                    type: isFile ? 'file' : 'folder',
                    fileId: isFile ? file.id : undefined,
                    importance: isFile ? file.importance : undefined,
                    children: isFile ? undefined : []
                };
                pathMap.set(currentPath, node);

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

  const tagIndex = useMemo(() => {
    const index = new Map<string, string[]>();
    files.forEach(f => {
      extractTags(f.content).forEach(tag => {
        if (!index.has(tag)) index.set(tag, []);
        index.get(tag)?.push(f.id);
      });
    });
    return index;
  }, [files]);

  const toggleFolder = useCallback((path: string) => {
      setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  }, []);

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

              if (isFolder && (isExpanded || searchQuery)) { 
                  if (node.children) {
                      traverse(node.children, level + 1);
                  }
              }
          }
      };
      
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

  const handleOpenCreation = (type: 'file' | 'folder', parentPath: string = '') => {
      setCreationModal({ isOpen: true, type, parentPath, value: '' });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (creationModal.value.trim()) {
          onCreateItem(creationModal.type, creationModal.value.trim(), creationModal.parentPath);
          setCreationModal({ isOpen: false, type: 'file', parentPath: '', value: '' });
          if (creationModal.parentPath) {
              setExpandedFolders(prev => ({ ...prev, [creationModal.parentPath]: true }));
          }
      }
  };

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

  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData('text/plain', nodeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, nodeId: string | null) => {
    e.preventDefault(); 
    e.stopPropagation(); // Prevents bubbling to parent containers
    e.dataTransfer.dropEffect = 'move';
    if (dragOverNodeId !== nodeId) {
        setDragOverNodeId(nodeId);
        setIsRootDropTarget(nodeId === null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetPath: string | null) => {
      e.preventDefault();
      e.stopPropagation(); // Prevents bubbling to parent containers
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
        
        {creationModal.isOpen && (
            <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-20">
                <form onSubmit={handleCreateSubmit} className="w-64 bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-600 p-3 animate-slideDown">
                    <h3 className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                        {t.create || "Create"} {creationModal.type === 'file' ? t.newFile : t.newFolder}
                    </h3>
                    <input 
                        ref={creationInputRef}
                        type="text" 
                        value={creationModal.value}
                        onChange={e => setCreationModal(p => ({ ...p, value: e.target.value }))}
                        className="w-full px-2 py-1.5 mb-2 bg-paper-100 dark:bg-cyber-900/50 border border-paper-300 dark:border-cyber-600 rounded text-sm focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                        placeholder={t.filename || "Enter name..."}
                    />
                    <div className="flex gap-2 justify-end">
                        <button 
                            type="button" 
                            onClick={() => setCreationModal(p => ({ ...p, isOpen: false }))}
                            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                            {t.cancel}
                        </button>
                        <button 
                            type="submit"
                            className="px-2 py-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded-text-xs font-bold"
                        >
                            {t.create}
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
              title={t.files}
            >
              <FolderOpen size={15} />
            </button>
            <button
              onClick={() => setActiveTab('tags')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${activeTab === 'tags' ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              title={t.tags}
            >
              <TagIcon size={15} />
            </button>
            <button
              onClick={() => setActiveTab('outline')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${activeTab === 'outline' ? 'border-violet-500 text-violet-700 dark:text-violet-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              title={t.outline}
            >
              <List size={15} />
            </button>
            <button
              onClick={() => setActiveTab('snippets')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${activeTab === 'snippets' ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
              title={t.snippets}
            >
              <Scissors size={15} />
            </button>
        </div>

        {/* Search Bar */}
        {(activeTab === 'files' || activeTab === 'tags') && (
            <div className="p-2 border-b border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                        type="text" 
                        placeholder={activeTab === 'files' ? t.searchFiles : t.searchTags} 
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
                       <p>{searchQuery ? t.noFilesFound : t.noFilesFound}</p>
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
                          onGenerateExam={onGenerateExam}
                          onCompareFile={onCompareFile}
                          t={t}
                       />
                   ))
               )}
               {/* Quick Create at Root */}
               <div className="mt-2 px-2 pt-2 border-t border-paper-200 dark:border-cyber-700/50">
                  <button 
                    onClick={() => handleOpenCreation('file', '')}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 hover:text-cyan-600 hover:bg-paper-100 dark:hover:bg-cyber-800 rounded transition-colors"
                  >
                      <Plus size={14} /> {t.newFileRoot}
                  </button>
                  <button 
                    onClick={() => handleOpenCreation('folder', '')}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 hover:text-amber-600 hover:bg-paper-100 dark:hover:bg-cyber-800 rounded transition-colors"
                  >
                      <FolderInput size={14} /> {t.newFolderRoot}
                  </button>
               </div>
            </div>
          ) : activeTab === 'tags' ? (
              <div className="p-2">
                  {Array.from(tagIndex.keys()).sort().filter(t => t.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                       <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-xs text-center p-4">
                           <Hash size={32} className="mb-2 opacity-50" />
                           <p>{t.noTagsFound}</p>
                       </div>
                  ) : (
                      <div className="space-y-1">
                          {Array.from(tagIndex.keys()).sort().filter(t => t.toLowerCase().includes(searchQuery.toLowerCase())).map(tag => (
                              <div key={tag} className="group">
                                  <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-paper-200 dark:hover:bg-cyber-700 rounded cursor-pointer font-medium">
                                      <Hash size={12} className="text-emerald-500" />
                                      {tag}
                                      <span className="ml-auto text-xs text-slate-400 bg-paper-200 dark:bg-cyber-800 px-1.5 rounded-full">
                                          {tagIndex.get(tag)?.length}
                                      </span>
                                  </div>
                                  <div className="ml-6 space-y-0.5 mt-0.5 hidden group-hover:block">
                                      {tagIndex.get(tag)?.map(fileId => {
                                          const file = files.find(f => f.id === fileId);
                                          if (!file) return null;
                                          return (
                                              <div 
                                                  key={fileId}
                                                  onClick={() => onSelectFile(fileId)}
                                                  className="text-xs text-slate-500 hover:text-emerald-600 cursor-pointer py-0.5 truncate"
                                              >
                                                  {file.name}
                                              </div>
                                          )
                                      })}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          ) : activeTab === 'snippets' ? (
              <div className="p-2 space-y-2">
                  <div className="text-xs text-slate-500 px-1 font-semibold uppercase tracking-wider mb-2">{t.templatesSnippets}</div>
                  {DEFAULT_SNIPPETS.map(snippet => (
                      <div 
                          key={snippet.id} 
                          onClick={() => onInsertSnippet?.(snippet.content)}
                          className="group flex items-center justify-between p-2 rounded bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 hover:border-amber-400 cursor-pointer shadow-sm transition-all"
                      >
                          <div className="flex items-center gap-2 overflow-hidden">
                               {snippet.category === 'code' ? <FileCode size={14} className="text-blue-500 shrink-0" /> : <List size={14} className="text-amber-500 shrink-0" />}
                               <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{snippet.name}</span>
                          </div>
                          <button className="text-slate-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus size={14} />
                          </button>
                      </div>
                  ))}
                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/10 rounded border border-amber-200 dark:border-amber-800/30 text-xs text-amber-800 dark:text-amber-200">
                      <p>{t.clickToInsert}</p>
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
                        <Database size={10} /> {t.knowledgeBase}
                    </span>
                    <span className="text-slate-500">
                        {ragStats.indexedFiles}/{ragStats.totalFiles} {t.indexed} ({ragStats.totalChunks} chunks)
                    </span>
                </div>
                <button 
                    onClick={onRefreshIndex}
                    disabled={ragStats.isIndexing}
                    className={`p-1.5 rounded hover:bg-paper-200 dark:hover:bg-cyber-700 transition-colors ${ragStats.isIndexing ? 'animate-spin text-cyan-500' : 'text-slate-400'}`}
                    title={t.reindex}
                >
                    {ragStats.isIndexing ? <Loader2 size={12} /> : <RefreshCw size={12} />}
                </button>
            </div>
        )}

        {/* Action Footer */}
        <div className="p-2 border-t border-paper-200 dark:border-cyber-700 bg-paper-100 dark:bg-cyber-800 shrink-0">
          <div className="grid grid-cols-5 gap-1">
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
            {onViewRoadmap && (
                <button 
                    onClick={onViewRoadmap}
                    className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-white dark:hover:bg-cyber-700 text-slate-500 hover:text-indigo-500 transition-all gap-1"
                    title="Study Roadmap"
                >
                    <MapIcon size={18} />
                </button>
            )}
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