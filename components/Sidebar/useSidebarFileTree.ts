import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MarkdownFile } from '../../types';
import type { FileTreeNode, FlatNode } from './sidebarTypes';
import { DISPLAY_EXTENSIONS, isExtensionInList } from './sidebarUtils';

interface UseSidebarFileTreeOptions {
  files: MarkdownFile[];
  activeFileId: string;
  searchQuery: string;
}

export const useSidebarFileTree = ({ files, activeFileId, searchQuery }: UseSidebarFileTreeOptions) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('neon-sidebar-expanded');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.warn("Failed to load sidebar state", e);
      return {};
    }
  });

  const [memoryNodes, setMemoryNodes] = useState<FileTreeNode[]>([]);
  const memoryNodesHashRef = useRef('');

  useEffect(() => {
    try {
      localStorage.setItem('neon-sidebar-expanded', JSON.stringify(expandedFolders));
    } catch (e) {
      console.error("Failed to save sidebar state", e);
    }
  }, [expandedFolders]);

  const filesRef = useRef(files);
  filesRef.current = files;

  const filesStructureHash = useMemo(() => {
    if (!files || !Array.isArray(files)) return "";
    return files
      .filter(f => isExtensionInList(f.path || f.name, DISPLAY_EXTENSIONS))
      .map(f => `${f.id}|${f.path || f.name}`)
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

    if (memoryNodes.length > 0) {
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
      if (memoryFolderNode.children) {
        memoryFolderNode.children = [...memoryNodes];
      }
    }

    const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
      return nodes.sort((a, b) => {
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

  useEffect(() => {
    const loadMemoryFiles = async () => {
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.file) {
          const memoriesFolder = '.memories';
          const files = await window.electronAPI.file.listFiles(memoriesFolder);

          if (!files || files.length === 0) {
            if (memoryNodesHashRef.current !== '') {
              memoryNodesHashRef.current = '';
              setMemoryNodes([]);
            }
            return;
          }

          const nodes: FileTreeNode[] = [];

          for (const file of files || []) {
            if (file.name?.startsWith('memory_') && file.name.endsWith('.md')) {
              let importance: 'low' | 'medium' | 'high' = 'medium';
              try {
                const content = await window.electronAPI.file.readFile(file.path);
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

          nodes.sort((a, b) => {
            const aTime = files.find((f) => f.path === a.path)?.lastModified || 0;
            const bTime = files.find((f) => f.path === b.path)?.lastModified || 0;
            return bTime - aTime;
          });

          const nextHash = nodes.map(node => `${node.id}|${node.path}|${node.memoryImportance || ''}`).join(';');
          if (nextHash !== memoryNodesHashRef.current) {
            memoryNodesHashRef.current = nextHash;
            setMemoryNodes(nodes);
          }
        }
      } catch (error) {
        console.error('Failed to load memory files:', error);
        if (memoryNodesHashRef.current !== '') {
          memoryNodesHashRef.current = '';
          setMemoryNodes([]);
        }
      }
    };

    loadMemoryFiles();
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
  }, [activeFileId, files]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  }, []);

  const expandFolder = useCallback((path: string) => {
    if (!path) return;
    setExpandedFolders(prev => (prev[path] ? prev : { ...prev, [path]: true }));
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

  return {
    visibleFlatNodes,
    toggleFolder,
    expandFolder
  };
};
