import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Tag, Search, Edit2, Trash2, Merge, Check, X, Plus, FolderOpen, MoreVertical, Wand2 } from 'lucide-react';
import { MarkdownFile } from '../types';
import { extractTags } from '../src/types/wiki';
import {
  getAllTags,
  searchTags,
  renameTag,
  deleteTagGlobally,
  mergeTags,
  TagStats
} from '../src/services/tag/tagService';
import { ConfirmDialog } from './ConfirmDialog';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

interface TagsBrowserProps {
  files: MarkdownFile[];
  onSelectFile: (fileId: string) => void;
  onFileUpdate?: (file: MarkdownFile) => void;
  setFiles?: React.Dispatch<React.SetStateAction<MarkdownFile[]>>;  // 添加 setFiles 回调
  language?: Language;
}

type EditMode = 'none' | 'rename' | 'delete' | 'merge';

export const TagsBrowser: React.FC<TagsBrowserProps> = ({ files, onSelectFile, onFileUpdate, setFiles, language = 'en' }) => {
  const t = translations[language];
  // 当 onFileUpdate 未定义时，本地更新 files 数组
  const handleFileUpdate = (updatedFile: MarkdownFile) => {
    if (onFileUpdate) {
      onFileUpdate(updatedFile);
    } else if (setFiles) {
      // 本地更新 files 数组
      setFiles(prevFiles =>
        prevFiles.map(f => f.id === updatedFile.id ? updatedFile : f)
      );
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    tag: string;
    isBatch: boolean;
    tags?: string[];
  }>({ isOpen: false, tag: '', isBatch: false });

  const tagStats = useMemo(() => {
    return searchQuery.trim()
      ? searchTags(files, searchQuery)
      : getAllTags(files);
  }, [files, searchQuery]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRename = async (oldTag: string) => {
    if (!editInput.trim() || editInput === oldTag) return;

    setProcessing(true);
    try {
      const result = await renameTag(files, oldTag, editInput.trim(), handleFileUpdate);
      if (result.errors.length > 0) {
        showMessage('error', `Updated ${result.updated} files, errors: ${result.errors.join(', ')}`);
      } else {
        showMessage('success', `Renamed "${oldTag}" to "${editInput.trim()}" in ${result.updated} files`);
      }
      setEditingTag(null);
      setEditInput('');
      setEditMode('none');
    } catch (e: any) {
      showMessage('error', e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = (tag: string) => {
    setDeleteConfirm({ isOpen: true, tag, isBatch: false });
  };

  const executeDelete = async () => {
    const { tag } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, tag: '', isBatch: false });
    if (!tag) {
      return;
    }

    setProcessing(true);
    try {
      // 使用 Map 来追踪更新的文件
      const updatedFilesMap = new Map<string, MarkdownFile>();
      files.forEach(f => updatedFilesMap.set(f.id, f));

      // 自定义回调，更新本地 Map
      const localFileUpdate = (updatedFile: MarkdownFile) => {
        updatedFilesMap.set(updatedFile.id, updatedFile);
      };

      const currentFiles = Array.from(updatedFilesMap.values());
      const result = await deleteTagGlobally(currentFiles, tag, localFileUpdate);

      // 更新 React 状态
      const finalFiles = Array.from(updatedFilesMap.values());
      if (setFiles) {
        setFiles(finalFiles);
      }

      if (result.errors.length > 0) {
        showMessage('error', `Deleted from ${result.updated} files, errors: ${result.errors.join(', ')}`);
      } else {
        showMessage('success', `Deleted tag "${tag}" from ${result.updated} files`);
      }
      setEditMode('none');
    } catch (e: any) {
      showMessage('error', e.message);
    } finally {
      setProcessing(false);
    }
  };


  const handleMerge = async (sourceTag: string) => {
    if (!editInput.trim() || editInput === sourceTag) return;

    setProcessing(true);
    try {
      const result = await mergeTags(files, sourceTag, editInput.trim(), handleFileUpdate);
      if (result.errors.length > 0) {
        showMessage('error', `Merged ${result.updated} files, errors: ${result.errors.join(', ')}`);
      } else {
        showMessage('success', `Merged "${sourceTag}" into "${editInput.trim()}" in ${result.updated} files`);
      }
      setEditingTag(null);
      setEditInput('');
      setEditMode('none');
    } catch (e: any) {
      showMessage('error', e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchDelete = () => {
    if (selectedTags.size === 0) return;
    const tagsArray = Array.from(selectedTags);
    setDeleteConfirm({ isOpen: true, tag: tagsArray[0], isBatch: true, tags: tagsArray });
  };


  const executeBatchDelete = async () => {
    const { tags } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, tag: '', isBatch: false });
    if (!tags || tags.length === 0) {
      return;
    }

    setProcessing(true);
    try {
      // 使用 Map 来追踪更新的文件
      const updatedFilesMap = new Map<string, MarkdownFile>();
      files.forEach(f => updatedFilesMap.set(f.id, f));

      // 自定义回调，更新本地 Map
      const localFileUpdate = (updatedFile: MarkdownFile) => {
        updatedFilesMap.set(updatedFile.id, updatedFile);
      };

      for (const tag of tags) {
        // 使用当前 Map 中的最新文件状态
        const currentFiles = Array.from(updatedFilesMap.values());
        await deleteTagGlobally(currentFiles, tag, localFileUpdate);
      }

      // 最终一次性更新 React 状态
      const finalFiles = Array.from(updatedFilesMap.values());
      if (setFiles) {
        setFiles(finalFiles);
      }

      showMessage('success', `Deleted ${tags.length} tag(s) from all files`);
      setSelectedTags(new Set());
      setEditMode('none');
    } catch (e: any) {
      showMessage('error', e.message);
    } finally {
      setProcessing(false);
    }
  };



  const toggleTagSelection = (tag: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedTags(newSelected);
  };

  const handleEditAction = (tag: string, mode: 'rename' | 'delete' | 'merge') => {
    setEditingTag(tag);
    setEditMode(mode);
    setEditInput('');
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setEditInput('');
    setEditMode('none');
  };

  if (tagStats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center opacity-60">
        <Tag size={32} className="mb-2" />
        <p className="text-xs">No tags found</p>
        <p className="text-xs mt-1">Use #tag format in your notes</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message && (
        <div className={`text-xs px-2 py-1 rounded ${message.type === 'success'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
          {message.text}
        </div>
      )}

      <div className="relative">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-7 pr-3 py-1.5 text-xs bg-paper-100 dark:bg-cyber-800 border-0 rounded-lg
                     text-slate-700 dark:text-slate-300 placeholder-slate-400
                     focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      {editMode !== 'none' && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {editMode === 'rename' && <Edit2 size={12} />}
          {editMode === 'delete' && <Trash2 size={12} />}
          {editMode === 'merge' && <Merge size={12} />}
          <span>
            {editMode === 'rename' && 'Click a tag to rename it'}
            {editMode === 'delete' && 'Click a tag to delete it'}
            {editMode === 'merge' && 'Click source tag, then enter target tag'}
          </span>
          <button onClick={() => { setEditMode('none'); setSelectedTags(new Set()); }} className="ml-auto hover:text-slate-700 dark:hover:text-slate-200">
            <X size={12} />
          </button>
        </div>
      )}

      {editMode === 'delete' && selectedTags.size > 0 && (
        <button
          onClick={handleBatchDelete}
          disabled={processing}
          className="w-full py-1.5 px-2 text-xs bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400
                     rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
        >
          Delete {selectedTags.size} selected tag(s)
        </button>
      )}

      <div className="space-y-1 group">
        {tagStats.map(({ tag, count, files: tagFiles }) => (
          <div
            key={tag}
            className="border-b border-paper-100 dark:border-cyber-800 pb-1 last:border-0"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center gap-1">
              {editMode !== 'none' && editMode !== 'merge' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTagSelection(tag);
                  }}
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedTags.has(tag)
                    ? 'bg-cyan-500 border-cyan-500 text-white'
                    : 'border-slate-300 dark:border-slate-600 hover:border-cyan-400'
                    }`}
                >
                  {selectedTags.has(tag) && <Check size={10} />}
                </button>
              )}

              <button
                onClick={(e) => {
                  // 防止事件冒泡
                  e.stopPropagation();

                  if (editMode === 'none') {
                    if (tagFiles.length > 0) {
                      onSelectFile(tagFiles[0].id);
                    }
                  } else if (editingTag === null) {
                    if (editMode === 'delete') {
                      handleDelete(tag);
                    } else {
                      setEditingTag(tag);
                    }
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (editMode === 'none') {
                    setEditMode('rename');
                    setEditingTag(tag);
                  }
                }}
                disabled={processing}
                className={`flex items-center gap-2 flex-1 py-1 px-1.5 rounded transition-colors ${editingTag === tag && (editMode === 'rename' || editMode === 'merge')
                  ? 'bg-cyan-50 dark:bg-cyan-900/20'
                  : 'hover:bg-paper-200 dark:hover:bg-cyber-800'
                  }`}
              >
                <Tag size={12} className="text-emerald-500 shrink-0" />
                {editingTag === tag && (editMode === 'rename' || editMode === 'merge') ? (
                  <input
                    type="text"
                    value={editInput}
                    onChange={(e) => setEditInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editMode === 'rename') handleRename(tag);
                        else handleMerge(tag);
                      } else if (e.key === 'Escape') {
                        cancelEdit();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={editMode === 'merge' ? 'Enter target tag' : 'New tag name'}
                    className="flex-1 text-xs bg-white dark:bg-cyber-900 border border-cyan-300 dark:border-cyan-700
                               rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-300 focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <span className="text-xs text-slate-700 dark:text-slate-300 truncate flex-1 text-left">{tag}</span>
                )}
                <span className="text-[10px] text-slate-400 bg-paper-100 dark:bg-cyber-800 px-1.5 py-0.5 rounded-full shrink-0">
                  {count}
                </span>
              </button>

              {editingTag === tag && (editMode === 'rename' || editMode === 'merge') && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editMode === 'rename') handleRename(tag);
                      else handleMerge(tag);
                    }}
                    disabled={!editInput.trim() || editInput === tag}
                    className="p-0.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded disabled:opacity-30"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelEdit();
                    }}
                    className="p-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {editMode === 'none' && editingTag === null && (
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
                  <Tooltip content={t.tooltips?.rename || "Rename"}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditMode('rename');
                        setEditingTag(tag);
                      }}
                      className="p-0.5 text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded"
                      aria-label={t.tooltips?.rename || "Rename"}
                    >
                      <Edit2 size={10} />
                    </button>
                  </Tooltip>
                  <Tooltip content={t.delete || "Delete"}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(tag);
                      }}
                      className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      aria-label={t.delete || "Delete"}
                    >
                      <Trash2 size={10} />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>

            {tagFiles.length > 0 && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {tagFiles.slice(0, 3).map(file => (
                  <button
                    key={file.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFile(file.id);
                    }}
                    className="block w-full text-left py-0.5 px-2 text-[10px] text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400 truncate"
                  >
                    {file.name}
                  </button>
                ))}
                {tagFiles.length > 3 && (
                  <span className="text-[10px] text-slate-400 px-2">
                    +{tagFiles.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-paper-100 dark:border-cyber-800">
        <span className="text-[10px] text-slate-400">
          {tagStats.length} tag{tagStats.length !== 1 ? 's' : ''}
          {searchQuery && ` found`}
        </span>
        <div className="flex items-center gap-1">
          {editMode === 'none' && (
            <>
              <Tooltip content={t.tooltips?.renameMode || "Rename Mode"}>
                <button
                  onClick={() => setEditMode('rename')}
                  className="p-1 text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded"
                  aria-label={t.tooltips?.renameMode || "Rename Mode"}
                >
                  <Edit2 size={12} />
                </button>
              </Tooltip>
              <Tooltip content={t.tooltips?.deleteMode || "Delete Mode"}>
                <button
                  onClick={() => setEditMode('delete')}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  aria-label={t.tooltips?.deleteMode || "Delete Mode"}
                >
                  <Trash2 size={12} />
                </button>
              </Tooltip>
              <Tooltip content={t.tooltips?.mergeMode || "Merge Mode"}>
                <button
                  onClick={() => setEditMode('merge')}
                  className="p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded"
                  aria-label={t.tooltips?.mergeMode || "Merge Mode"}
                >
                  <Merge size={12} />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal - 使用 Portal 渲染到 body */}
      {typeof document !== 'undefined' && ReactDOM.createPortal(
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          title="确认删除"
          message={
            deleteConfirm.isBatch && deleteConfirm.tags && deleteConfirm.tags.length > 1
              ? `确定要删除 ${deleteConfirm.tags.length} 个标签吗？此操作将从所有文件中移除这些标签。`
              : `确定要删除标签 "${deleteConfirm.tag}" 吗？此操作将从所有文件中移除该标签。`
          }
          confirmText="删除"
          cancelText="取消"
          type="danger"
          onConfirm={deleteConfirm.isBatch ? executeBatchDelete : executeDelete}
          onCancel={() => setDeleteConfirm({ isOpen: false, tag: '', isBatch: false })}
        />,
        document.body
      )}
    </div>
  );
};
