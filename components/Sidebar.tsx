
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FileText, Plus, Trash2, FolderOpen, Search, X, FolderInput, 
  FileType, List, AlignLeft, ChevronRight, GraduationCap, 
  Folder, FileCode, FileImage, FileJson, FileSpreadsheet, File as FileIcon,
  Lock
} from 'lucide-react';
import { MarkdownFile } from '../types';
import { translations, Language } from '../utils/translations';

interface SidebarProps {
  files: MarkdownFile[];
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateFile: () => void;
  onDeleteFile: (id: string) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportPdf: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  language?: Language;
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
const DISPLAY_EXTENSIONS = ['.md', '.markdown', '.csv', '.pdf', '.docx', '.doc', '.txt'];

// Config: Extensions that can be Operated On (Selected/Edited)
const OPERABLE_EXTENSIONS = ['.md', '.markdown', '.csv', '.txt'];

const isExtensionInList = (filename: string, list: string[]) => {
    if (!filename) return false;
    const lower = filename.toLowerCase();
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
}>(({ node, activeFileId, onSelect, onToggle, onDelete }) => {
    const indentStyle = { paddingLeft: `${node.level * 12 + 12}px` };
    
    if (node.type === 'folder') {
        return (
            <div 
                className="flex items-center gap-2 py-1.5 pr-2 hover:bg-paper-200 dark:hover:bg-cyber-800 cursor-pointer text-slate-600 dark:text-slate-300 transition-colors group select-none relative"
                style={indentStyle}
                onClick={() => onToggle(node.path)}
            >
                {/* Indent Guide */}
                {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}
                
                <span className="opacity-60 transition-transform duration-200 shrink-0" style={{ transform: node.isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    <ChevronRight size={12} />
                </span>
                <span className="text-amber-400 shrink-0">
                     {node.isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                </span>
                <span className="text-sm font-semibold truncate flex-1">{node.name}</span>
            </div>
        );
    }

    const isActive = activeFileId === node.fileId;
    const isOperable = isExtensionInList(node.name, OPERABLE_EXTENSIONS);

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
           onClick={() => isOperable && onSelect(node.fileId!)}
           title={!isOperable ? "Read Only / Extraction Source" : node.name}
        >
           {/* Indent Guide */}
           {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}
           
           {/* Active Indicator */}
           {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500" />}
           
           <span className="opacity-80 shrink-0">{getIconForFile(node.name)}</span>
           <span className="text-sm truncate flex-1 leading-none pt-0.5">{node.name}</span>
           
           {!isOperable && <Lock size={10} className="text-slate-400" />}

           {isOperable && (
               <button
                onClick={(e) => { e.stopPropagation(); onDelete(node.fileId!); }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded transition-all shrink-0"
                title="Delete File"
               >
                 <Trash2 size={12} />
               </button>
           )}
        </div>
    );
});

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  isOpen,
  onCloseMobile,
  onOpenFolder,
  onImportFolderFiles,
  onImportPdf,
  onImportQuiz,
  language = 'en'
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'outline'>('files');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
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

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const quizInputRef = useRef<HTMLInputElement>(null);
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


  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onImportPdf(e.target.files[0]);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const handleQuizUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportQuiz) onImportQuiz(e.target.files[0]);
    if (quizInputRef.current) quizInputRef.current.value = '';
  };

  const handleDirUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFolderFiles) onImportFolderFiles(e.target.files);
    if (dirInputRef.current) dirInputRef.current.value = '';
  };

  const handleOpenFolderClick = async () => {
    try {
      await onOpenFolder();
    } catch (e) {
      console.warn("Modern directory picker failed, falling back to legacy input.", e);
      dirInputRef.current?.click();
    }
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm" onClick={onCloseMobile} />}

      <div className={`
        fixed lg:static inset-y-0 left-0 z-40 w-72 bg-paper-100 dark:bg-cyber-900 
        border-r border-paper-200 dark:border-cyber-700 transform transition-transform duration-300 ease-in-out
        flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'}
      `}>
        
        {/* Header Tabs */}
        <div className="h-14 flex items-center px-2 border-b border-paper-200 dark:border-cyber-700 shrink-0 gap-1 pt-2">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${activeTab === 'files' ? 'border-cyan-500 text-cyan-700 dark:text-cyan-400 bg-white/50 dark:bg-cyber-800/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <FolderOpen size={15} /> {t.explorer}
            </button>
            <button
              onClick={() => setActiveTab('outline')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2 ${activeTab === 'outline' ? 'border-violet-500 text-violet-700 dark:text-violet-400 bg-white/50 dark:bg-cyber-800/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              <List size={15} /> Outline
            </button>
        </div>

        {/* Search Bar Fixed Position - Only show when Files tab is active */}
        {activeTab === 'files' && (
            <div className="p-3 border-b border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-900 shrink-0">
               <div className="relative">
                   <input 
                     type="text" 
                     placeholder="Search files..." 
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full pl-8 pr-8 py-1.5 bg-paper-100 dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded text-xs focus:outline-none focus:border-cyan-500 transition-colors"
                   />
                   <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                   {searchQuery && (
                       <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                           <X size={12} />
                       </button>
                   )}
               </div>
            </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          
          {/* FILES TAB */}
          {activeTab === 'files' && (
            <>
               <div className="mb-2 flex gap-2">
                 <button onClick={onCreateFile} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/20 text-xs font-medium">
                   <Plus size={14} /> {t.newFile}
                 </button>
                 <button onClick={handleOpenFolderClick} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-200 dark:bg-cyber-800 hover:bg-slate-300 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium">
                   <FolderInput size={14} /> {t.openDir}
                 </button>
               </div>

               <div className="flex gap-2 mb-3">
                  <button onClick={() => pdfInputRef.current?.click()} className="flex-1 py-1.5 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded text-xs text-slate-600 dark:text-slate-400 hover:border-red-400 transition-colors flex items-center justify-center gap-1">
                      <FileType size={12} className="text-red-400" /> PDF
                  </button>
                  <button onClick={() => quizInputRef.current?.click()} className="flex-1 py-1.5 bg-white dark:bg-cyber-800 border border-paper-200 dark:border-cyber-700 rounded text-xs text-slate-600 dark:text-slate-400 hover:border-violet-400 transition-colors flex items-center justify-center gap-1">
                      <GraduationCap size={12} className="text-violet-400" /> Quiz
                  </button>
               </div>
               
               {/* Hidden Inputs */}
               <input type="file" accept=".pdf" ref={pdfInputRef} className="hidden" onChange={handlePdfUpload} />
               <input type="file" accept=".csv,.pdf,.md,.txt,.docx,.doc" ref={quizInputRef} className="hidden" onChange={handleQuizUpload} />
               <input type="file" ref={dirInputRef} className="hidden" onChange={handleDirUpload} multiple {...({ webkitdirectory: "", directory: "" } as any)} />

               {/* Tree */}
               <div className="pb-10">
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
                               onSelect={onSelectFile}
                               onDelete={onDeleteFile}
                               onToggle={toggleFolder}
                           />
                       ))
                   )}
               </div>
            </>
          )}

          {/* OUTLINE TAB */}
          {activeTab === 'outline' && (
            <div className="space-y-0.5">
              {outline.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center opacity-60">
                   <AlignLeft size={32} className="mb-2" />
                   <p className="text-xs">No headings found</p>
                </div>
              ) : (
                outline.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                        const elements = document.querySelectorAll(`h${item.level}`);
                        if(elements.length > 0) elements[Math.min(idx, elements.length-1)]?.scrollIntoView({behavior: 'smooth'});
                    }}
                    className="w-full text-left py-1 px-2 rounded hover:bg-paper-200 dark:bg-cyber-800 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-2 group"
                    style={{ paddingLeft: `${(item.level - 1) * 12 + 4}px` }}
                  >
                    <span className="text-[10px] opacity-30 font-mono group-hover:opacity-100 transition-opacity">H{item.level}</span>
                    <span className="text-xs truncate">{item.text}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-2 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-800/50 text-[10px] text-slate-400 text-center flex justify-between items-center px-4">
           <span>{files.length} Files</span>
           <span>NeonMark Studio</span>
        </div>
      </div>
    </>
  );
};
