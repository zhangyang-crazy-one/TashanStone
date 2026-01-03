

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Plus, Trash2, FolderOpen, Search, X, FolderInput,
  FileType, List, AlignLeft, ChevronRight, GraduationCap,
  Folder, FileCode, FileImage, FileJson, FileSpreadsheet, File as FileIcon,
  Lock, Upload, Database, Loader2, RefreshCw, Code2, Edit3, Brain, Sparkles, Tag, ChevronDown, BookOpen
} from 'lucide-react';
import { MarkdownFile, RAGStats, OCRStats, Snippet } from '../types';
import { translations, Language } from '../utils/translations';
import { TagsBrowser } from './TagsBrowser';

interface SidebarProps {
  files: MarkdownFile[];
  setFiles?: React.Dispatch<React.SetStateAction<MarkdownFile[]>>;
  activeFileId: string;
  onSelectFile: (id: string) => void;
  onCreateItem: (type: 'file' | 'folder', name: string, parentPath: string) => void;
  onDeleteFile: (id: string) => void;
  onMoveItem: (sourceId: string, targetFolderPath: string | null) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  onOpenFolder: () => Promise<void>;
  onImportFolderFiles?: (files: FileList) => void;
  onImportPdf: (file: File) => void;
  onImportQuiz?: (file: File) => void;
  language?: Language;
  ragStats?: RAGStats;
  ocrStats?: OCRStats;
  onRefreshIndex?: () => void;
  snippets?: Snippet[];
  onCreateSnippet?: (snippet: Omit<Snippet, 'id'>) => void;
  onDeleteSnippet?: (id: string) => void;
  onInsertSnippet?: (content: string) => void;
  onOpenTagSuggestion?: () => void;
  onOpenSmartOrganize?: (file: MarkdownFile) => void;
  onOpenReview?: () => void;
}

interface OutlineItem {
  level: number;
  text: string;
  line: number;
  slug: string;
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
  isMemory?: boolean;  // Mark as memory file
  memoryImportance?: 'low' | 'medium' | 'high';  // Memory importance level
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

// Default preset templates
const DEFAULT_SNIPPETS: Snippet[] = [
  // WikiLink Templates
  { id: 'wikilink-plain', name: 'File Link', category: 'wikilink', content: '[[{filename}]]\n' },
  { id: 'wikilink-alias', name: 'Link with Alias', category: 'wikilink', content: '[[{filename}|{alias}]]\n' },
  { id: 'wikilink-block', name: 'Block Reference', category: 'wikilink', content: '(((filename#line)))\n' },
  // Tag Template
  { id: 'tag', name: 'Tag', category: 'wikilink', content: '#[tag-name]\n' },
  // Content Templates
  { id: 'tbl', name: 'Table', category: 'template', content: '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n' },
  { id: 'math', name: 'Math Block', category: 'code', content: '$$\n  \\int_0^\\infty x^2 dx\n$$\n' },
  { id: 'mermaid', name: 'Mermaid Diagram', category: 'code', content: '```mermaid\ngraph TD;\n    A-->B;\n    A-->C;\n```\n' },
  { id: 'todo', name: 'Task List', category: 'template', content: '- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n' },
  { id: 'js', name: 'JS Code Block', category: 'code', content: '```javascript\nconsole.log("Hello, World!");\n```\n' },
  { id: 'callout', name: 'Callout', category: 'template', content: '> [!NOTE]\n> This is a note callout\n' },
  { id: 'link', name: 'Link Reference', category: 'text', content: '[Link Text](https://example.com "Title")\n' },
  { id: 'img', name: 'Image', category: 'template', content: '![Alt Text](image-url.png "Image Title")\n' },
];

// Generate slug from text (same as Preview.tsx - supports Chinese)
const generateSlug = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

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
  onDelete: (id: string, fileName: string) => void;
  onRequestCreate: (type: 'file' | 'folder', parentPath: string) => void;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragOver: (e: React.DragEvent, nodeId: string) => void;
  onDrop: (e: React.DragEvent, targetPath: string) => void;
  isDropTarget: boolean;
  onShowContextMenu?: (fileId: string, fileName: string, x: number, y: number) => void;
}>(({ node, activeFileId, onSelect, onToggle, onDelete, onRequestCreate, onDragStart, onDragOver, onDrop, isDropTarget, onShowContextMenu }) => {
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
        {/* Indent Guide */}
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

        {/* Quick Add Buttons (Visible on Hover) - Hide for memory folder */}
        {!isMemoryFolder && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

  // Check if this is a memory file
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
      title={!isOperable ? "Read Only / Extraction Source" : node.name}
      draggable={isOperable}
      onDragStart={(e) => isOperable && onDragStart(e, node.fileId!)}
    >
      {/* Indent Guide */}
      {node.level > 0 && <div className="absolute left-0 top-0 bottom-0 border-l border-paper-200 dark:border-cyber-800" style={{ left: `${node.level * 12 + 4}px` }} />}

      {/* Active Indicator */}
      {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-cyan-500" />}

      {/* File Icon - Use special icon for memory files */}
      <span className="opacity-80 shrink-0">
        {isMemoryFile ? (
          <Sparkles size={14} className="text-violet-500" />
        ) : (
          getIconForFile(node.name)
        )}
      </span>
      <span className={`text-sm truncate flex-1 leading-none pt-0.5 ${isMemoryFile ? 'text-violet-700 dark:text-violet-300' : ''}`}>
        {node.name}
      </span>

      {/* Memory importance badge */}
      {isMemoryFile && memoryImportance && (
        <span className={`text-[9px] px-1 py-0.5 rounded ${getMemoryImportanceColor(memoryImportance)}`}>
          {memoryImportance}
        </span>
      )}

      {/* Lock icon for non-operable files */}
      {!isOperable && <Lock size={10} className="text-slate-400" />}

      {/* Delete button - only for operable files */}
      {isOperable && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.fileId!, node.name); }}
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
  setFiles,
  activeFileId,
  onSelectFile,
  onCreateItem,
  onDeleteFile,
  onMoveItem,
  isOpen,
  onCloseMobile,
  onOpenFolder,
  onImportFolderFiles,
  onImportPdf,
  onImportQuiz,
  language = 'en',
  ragStats,
  ocrStats,
  onRefreshIndex,
  snippets = [],
  onCreateSnippet,
  onDeleteSnippet,
  onInsertSnippet,
  onOpenTagSuggestion,
  onOpenSmartOrganize,
  onOpenReview
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'snippets' | 'outline'>('files');
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

  // Snippet Creation Modal State
  const [snippetModal, setSnippetModal] = useState<{
    isOpen: boolean;
    name: string;
    content: string;
    category: 'code' | 'text' | 'template';
  }>({ isOpen: false, name: '', content: '', category: 'code' });

  // Delete Confirmation Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    fileId: string | null;
    fileName: string;
  }>({ isOpen: false, fileId: null, fileName: '' });

  // Tags Section State
  const [tagsExpanded, setTagsExpanded] = useState(true);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string | null;
    fileName: string;
  } | null>(null);

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

  // Memory files state (loaded asynchronously)
  const [memoryNodes, setMemoryNodes] = useState<FileTreeNode[]>([]);

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

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const pdfInputRef = useRef<HTMLInputElement>(null);
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

    // 3. Add Memory Files from state (loaded asynchronously via useEffect)
    if (memoryNodes.length > 0) {
      // Find or create .memories folder node
      const memoriesFolder = '.memories';
      let memoryFolderNode = pathMap.get(memoriesFolder);
      if (!memoryFolderNode) {
        memoryFolderNode = {
          id: 'folder-.memories',
          name: '.memories',
          path: memoriesFolder,
          type: 'folder',
          children: []
        };
        pathMap.set(memoriesFolder, memoryFolderNode);
        rootNodes.push(memoryFolderNode);
      }
      // Merge memory nodes
      if (memoryFolderNode.children) {
        memoryFolderNode.children = [...memoryNodes];
      }
    }

    // 4. Sort Nodes Recursively
    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return nodes.sort((a, b) => {
        // Memory folder always first
        if (a.name === '.memories' && b.name !== '.memories') return -1;
        if (b.name === '.memories' && a.name !== '.memories') return 1;
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
  }, [filesStructureHash, memoryNodes]);

  // Load memory files asynchronously via useEffect
  useEffect(() => {
    const loadMemoryFiles = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.file) {
          const memoriesFolder = '.memories';
          const files = await (window as any).electronAPI.file.listFiles(memoriesFolder);

          if (!files || files.length === 0) {
            setMemoryNodes([]);
            return;
          }

          const nodes: FileTreeNode[] = [];

          // Add memory files
          for (const file of files || []) {
            if (file.name?.startsWith('memory_') && file.name.endsWith('.md')) {
              // Read memory file to get importance
              let importance: 'low' | 'medium' | 'high' = 'medium';
              try {
                const content = await (window as any).electronAPI.file.readFile(file.path);
                const impMatch = content?.match(/importance:\s*(\w+)/);
                if (impMatch) {
                  importance = impMatch[1] as 'low' | 'medium' | 'high';
                }
              } catch (e) {
                // Use default importance
              }

              nodes.push({
                id: file.name.replace('.md', ''),
                name: file.name.replace('.memories/', '').replace('.md', ''),
                path: file.path,
                type: 'file',
                fileId: file.path,
                isMemory: true,
                memoryImportance: importance
              });
            }
          }

          // Sort by modification time (newest first)
          nodes.sort((a, b) => {
            const aTime = files.find((f: any) => f.path === a.path)?.lastModified || 0;
            const bTime = files.find((f: any) => f.path === b.path)?.lastModified || 0;
            return bTime - aTime;
          });

          setMemoryNodes(nodes);
        }
      } catch (error) {
        console.error('Failed to load memory files:', error);
        setMemoryNodes([]);
      }
    };

    loadMemoryFiles();
  }, [files]); // Re-load when files change

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
          const text = match[2];
          headers.push({
            level: match[1].length,
            text: text,
            line: index,
            slug: generateSlug(text)
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

  // Delete confirmation handlers
  const handleDeleteRequest = (fileId: string, fileName: string) => {
    setDeleteConfirm({ isOpen: true, fileId, fileName });
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm.fileId) {
      onDeleteFile(deleteConfirm.fileId);
      setDeleteConfirm({ isOpen: false, fileId: null, fileName: '' });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm({ isOpen: false, fileId: null, fileName: '' });
  };

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

        {/* Delete Confirmation Modal */}
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
                  onClick={handleDeleteCancel}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-cyber-700 rounded transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header Tabs */}
        <div className="h-14 flex items-center px-2 border-b border-paper-200 dark:border-cyber-700 shrink-0 gap-1 pt-2">
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-lg text-xs font-medium transition-colors border-b-2 ${activeTab === 'files' ? 'border-cyan-500 text-cyan-700 dark:text-cyan-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            <FolderOpen size={14} /> {t.explorer}
          </button>
          <button
            onClick={() => setActiveTab('snippets')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-lg text-xs font-medium transition-colors border-b-2 ${activeTab === 'snippets' ? 'border-amber-500 text-amber-700 dark:text-amber-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            <Code2 size={14} /> {t.snippets}
          </button>
          <button
            onClick={() => setActiveTab('outline')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-t-lg text-xs font-medium transition-colors border-b-2 ${activeTab === 'outline' ? 'border-violet-500 text-violet-700 dark:text-violet-400 bg-white/50 dark:bg-cyber-900/50' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            <List size={14} /> Outline
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
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => handleOpenCreation('file')} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors shadow-lg shadow-cyan-500/20 text-xs font-medium" title="New File">
                  <Plus size={14} /> {t.newFile}
                </button>

                <button onClick={() => handleOpenCreation('folder')} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-amber-400 transition-colors text-xs font-medium" title="New Folder">
                  <FolderInput size={14} className="text-amber-500" /> Folder
                </button>

                <button onClick={() => filesInputRef.current?.click()} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-cyan-400 transition-colors text-xs font-medium">
                  <Upload size={14} /> {t.importFiles}
                </button>

                <button onClick={handleOpenFolderClick} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-200 dark:bg-cyber-900 hover:bg-slate-300 dark:hover:bg-cyber-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium">
                  <FolderInput size={14} /> {t.openDir}
                </button>

                <button onClick={() => quizInputRef.current?.click()} className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-violet-400 transition-colors text-xs font-medium">
                  <GraduationCap size={14} className="text-violet-400" /> {t.quiz}
                </button>

                {onOpenReview && (
                  <button
                    onClick={onOpenReview}
                    className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-cyber-900 border border-paper-200 dark:border-cyber-700 rounded-lg text-slate-600 dark:text-slate-300 hover:border-emerald-400 transition-colors text-xs font-medium"
                  >
                    <BookOpen size={14} className="text-emerald-400" /> {t.review}
                  </button>
                )}
              </div>

              {/* Hidden Inputs */}
              <input type="file" accept=".pdf" ref={pdfInputRef} className="hidden" onChange={handlePdfUpload} />
              <input type="file" accept=".csv,.pdf,.md,.txt,.docx,.doc" ref={quizInputRef} className="hidden" onChange={handleQuizUpload} />
              <input type="file" accept=".md,.markdown,.txt,.csv,.pdf,.docx,.doc" multiple ref={filesInputRef} className="hidden" onChange={handleFilesUpload} />
              <input type="file" ref={dirInputRef} className="hidden" onChange={handleDirUpload} multiple {...({ webkitdirectory: "", directory: "" } as any)} />

              {/* Tree */}
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
                      onSelect={onSelectFile}
                      onDelete={handleDeleteRequest}
                      onToggle={toggleFolder}
                      onRequestCreate={handleOpenCreation}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      isDropTarget={dragOverNodeId === node.id}
                      onShowContextMenu={(fileId, fileName, x, y) => {
                        setContextMenu({ x, y, fileId, fileName });
                      }}
                    />
                  ))
                )}

                {/* Root Drop Zone - Only visible when dragging */}
                <div
                  className={`flex-1 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-slate-400 transition-all min-h-[60px] mt-4 ${isRootDropTarget ? 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/20' : 'border-transparent'}`}
                  onDragOver={(e) => handleDragOver(e, null)}
                  onDrop={(e) => handleDrop(e, null)}
                >
                  {isRootDropTarget ? "Drop to Root Directory" : ""}
                </div>
              </div>

              {/* Tags Section */}
              <div className="mt-2 border-t border-paper-200 dark:border-cyber-700 pt-2">
                <button
                  onClick={() => setTagsExpanded(!tagsExpanded)}
                  className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-paper-200 dark:hover:bg-cyber-800 rounded transition-colors"
                >
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Tag size={12} className="text-emerald-500" />
                    {t.tags || 'Tags'}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`text-slate-400 transition-transform ${tagsExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {tagsExpanded && (
                  <div className="mt-2 px-2">
                    <TagsBrowser files={files} onSelectFile={onSelectFile} setFiles={setFiles} />
                    {onOpenTagSuggestion && (
                      <button
                        onClick={onOpenTagSuggestion}
                        className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-gradient-to-r from-cyan-500 to-violet-500 text-white rounded-lg hover:from-cyan-600 hover:to-violet-600 transition-all"
                      >
                        <Sparkles size={12} />
                        {t.aiTagSuggestions || 'AI Suggest Tags'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* SNIPPETS TAB */}
          {activeTab === 'snippets' && (
            <>
              {/* Header */}
              <div className="mb-3">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{t.templates || 'Templates'}</h3>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{t.clickToInsert || 'Click to insert into editor'}</p>
              </div>

              {/* User Custom Snippets */}
              {snippets && snippets.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-2">
                    {t.mySnippets || 'My Snippets'}
                  </h4>
                  <div className="space-y-1.5 mb-4">
                    {snippets.map(snippet => (
                      <div
                        key={snippet.id}
                        onClick={() => onInsertSnippet?.(snippet.content)}
                        className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 hover:border-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-all cursor-pointer"
                      >
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 bg-cyan-100 dark:bg-cyan-800/50 text-cyan-700 dark:text-cyan-300">
                          {snippet.category || 'custom'}
                        </span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                          {snippet.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Default Templates */}
              <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
                {t.defaultTemplates || 'Default Templates'}
              </h4>
              <div className="space-y-1.5">
                {DEFAULT_SNIPPETS.map(snippet => (
                  <div
                    key={snippet.id}
                    onClick={() => onInsertSnippet?.(snippet.content)}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-900/50 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all cursor-pointer"
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${snippet.category === 'code' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                        snippet.category === 'text' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          snippet.category === 'wikilink' ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' :
                            'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                      }`}>
                      {snippet.category === 'code' ? t.codeCategory || 'code' :
                        snippet.category === 'text' ? t.textCategory || 'text' :
                          snippet.category === 'wikilink' ? t.wikiLinkCategory || 'wikilink' :
                            t.templateCategory || 'template'}
                    </span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                      {t[`snippet_${snippet.id}`] || snippet.name}
                    </span>
                  </div>
                ))}
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
                      const elementId = `heading-${item.slug}`;
                      const element = document.getElementById(elementId);
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className="w-full text-left py-1 px-2 rounded hover:bg-paper-200 dark:bg-cyber-900 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-2 group"
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

        {/* OCR Progress - Only shown when processing */}
        {ocrStats?.isProcessing && (
          <div className="mx-2 mb-2 p-3 bg-white dark:bg-cyber-900 rounded-lg border border-paper-200 dark:border-cyber-700 shadow-sm transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin text-amber-500" />
                {ocrStats.currentFile?.includes('(OCR)') ? t.ocrProcessing : t.pdfProcessing}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {ocrStats.totalPages > 0
                  ? `${ocrStats.processedPages}/${ocrStats.totalPages}`
                  : t.detecting}
              </span>
            </div>
            <div className="w-full h-1.5 bg-paper-100 dark:bg-cyber-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${ocrStats.totalPages > 0 ? (ocrStats.processedPages / ocrStats.totalPages) * 100 : 0}%` }}
              />
            </div>
            {ocrStats.currentFile && (
              <div className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {ocrStats.currentFile}
              </div>
            )}
          </div>
        )}

        {/* RAG Status */}
        {ragStats && (
          <div className="mt-auto mb-2 mx-2 p-3 bg-white dark:bg-cyber-900 rounded-lg border border-paper-200 dark:border-cyber-700 shadow-sm transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Database size={12} className="text-cyan-500" /> {t.knowledgeBase}
              </span>
              <div className="flex items-center gap-2">
                {ragStats.isIndexing && <Loader2 size={12} className="animate-spin text-cyan-500" />}
                <button
                  onClick={(e) => { e.stopPropagation(); onRefreshIndex?.(); }}
                  className="p-1 hover:bg-paper-100 dark:hover:bg-cyber-800 rounded-md text-slate-400 hover:text-cyan-500 transition-colors"
                  title={t.refreshIndex}
                  disabled={ragStats.isIndexing}
                >
                  <RefreshCw size={12} className={ragStats.isIndexing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                <span>{t.filesIndexed}</span>
                <span className="font-mono">{ragStats.indexedFiles} / {ragStats.totalFiles}</span>
              </div>
              <div className="w-full h-1 bg-paper-100 dark:bg-cyber-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${ragStats.totalFiles > 0 ? (ragStats.indexedFiles / ragStats.totalFiles) * 100 : 0}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                <span>{t.totalChunks}</span>
                <span className="font-mono">{ragStats.totalChunks}</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-2 border-t border-paper-200 dark:border-cyber-700 bg-paper-50 dark:bg-cyber-900/50 text-[10px] text-slate-400 text-center flex justify-between items-center px-4">
          <span>{files.length} Files</span>
          <span>TashanStone</span>
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-white dark:bg-cyber-800 rounded-lg shadow-xl border border-paper-200 dark:border-cyber-700 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                onSelectFile(contextMenu.fileId!);
                setContextMenu(null);
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
                  setContextMenu(null);
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
                // Open delete confirmation dialog instead of direct delete
                setDeleteConfirm({
                  isOpen: true,
                  fileId: contextMenu.fileId,
                  fileName: contextMenu.fileName
                });
                setContextMenu(null);
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
              aria-label="Delete file"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Sidebar;