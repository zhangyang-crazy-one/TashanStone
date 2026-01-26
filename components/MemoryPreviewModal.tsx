import React, { useState, useEffect } from 'react';
import { X, Edit3, Save, Star, Eye, FileText, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Tooltip from './Tooltip';

export interface MemoryItem {
  id: string;
  fileName?: string;
  content: string;
  topics?: string[];
  filePath?: string;
  summary?: string;
  isStarred?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

interface MemoryPreviewModalProps {
  memory: MemoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (memory: MemoryItem) => void;
  onSave?: (memory: MemoryItem) => Promise<void>;
  onStar?: (memoryId: string, isStarred: boolean) => Promise<void>;
  language?: 'zh' | 'en';
}

const translations = {
  zh: {
    preview: '预览',
    edit: '编辑',
    save: '保存',
    cancel: '取消',
    confirm: '确认添加',
    starred: '已标星',
    star: '标星',
    source: '来源',
    tags: '标签',
    saveSuccess: '保存成功',
    saveFailed: '保存失败',
    contentPlaceholder: '输入记忆内容...',
    tooltips: {
      openFile: '打开文件'
    }
  },
  en: {
    preview: 'Preview',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm Add',
    starred: 'Starred',
    star: 'Star',
    source: 'Source',
    tags: 'Tags',
    saveSuccess: 'Saved successfully',
    saveFailed: 'Save failed',
    contentPlaceholder: 'Enter memory content...',
    tooltips: {
      openFile: 'Open file'
    }
  }
};

export const MemoryPreviewModal: React.FC<MemoryPreviewModalProps> = ({
  memory,
  isOpen,
  onClose,
  onConfirm,
  onSave,
  onStar,
  language = 'zh'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isStarring, setIsStarring] = useState(false);
  const t = translations[language];

  useEffect(() => {
    if (memory) {
      setEditContent(memory.content || '');
      setIsEditing(false);
    }
  }, [memory]);

  if (!isOpen || !memory) return null;

  const handleSave = async () => {
    if (!onSave) return;

    setIsSaving(true);
    try {
      const updatedMemory = { ...memory, content: editContent, updatedAt: Date.now() };
      await onSave(updatedMemory);
    } catch (error) {
      console.error('[MemoryPreview] Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStar = async () => {
    if (!onStar) return;
    
    setIsStarring(true);
    try {
      await onStar(memory.id, !memory.isStarred);
    } catch (error) {
      console.error('[MemoryPreview] Star toggle failed:', error);
    } finally {
      setIsStarring(false);
    }
  };

  const handleConfirm = () => {
    const finalMemory = isEditing ? { ...memory, content: editContent } : memory;
    onConfirm(finalMemory);
    onClose();
  };

  const openSourceFile = () => {
    if (!memory.filePath) return;
    const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!electronAPI?.file?.openPath) return;
    void electronAPI.file.openPath(memory.filePath);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-white dark:bg-cyber-800 rounded-xl shadow-2xl m-4 flex flex-col max-h-[75vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-paper-200 dark:border-cyber-700">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FileText size={16} className="text-violet-500 shrink-0" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
              {memory.fileName || memory.id}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            {/* Star Button */}
            <Tooltip content={t.star}>
              <button
                onClick={handleStar}
                disabled={isStarring || !onStar}
                className={`p-1.5 rounded-lg transition-colors ${
                  memory.isStarred 
                    ? 'text-amber-500 bg-amber-100/50 dark:bg-amber-900/30' 
                    : 'text-slate-400 hover:text-amber-500 hover:bg-amber-100/50 dark:hover:bg-amber-900/30'
                }`}
                aria-label={t.star}
              >
                <Star size={14} fill={memory.isStarred ? 'currentColor' : 'none'} />
              </button>
            </Tooltip>
            
            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 dark:hover:bg-cyber-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Source Path */}
        {memory.filePath && (
          <div className="px-4 py-2 bg-paper-100/50 dark:bg-cyber-900/50 border-b border-paper-200 dark:border-cyber-700 flex items-center gap-2">
            <span className="text-xs text-slate-500">{t.source}:</span>
            <span className="text-xs text-slate-600 dark:text-slate-400 truncate flex-1 font-mono">
              {memory.filePath}
            </span>
            <Tooltip content={t.tooltips?.openFile || "Open file"}>
              <button
                onClick={openSourceFile}
                className="p-1 text-slate-400 hover:text-violet-500 transition-colors"
                aria-label={t.tooltips?.openFile || "Open file"}
              >
                <ExternalLink size={12} />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Tags */}
        {memory.topics && memory.topics.length > 0 && (
          <div className="px-4 py-2 flex items-center gap-2 flex-wrap border-b border-paper-200 dark:border-cyber-700">
            <span className="text-xs text-slate-500">{t.tags}:</span>
            {memory.topics.map((tag, index) => (
              <span 
                key={index}
                className="text-xs px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder={t.contentPlaceholder}
                className="w-full h-full min-h-[200px] p-3 text-sm bg-paper-100 dark:bg-cyber-900 border border-paper-200 dark:border-cyber-600 rounded-lg focus:outline-none focus:border-violet-500 resize-none text-slate-700 dark:text-slate-300 font-mono"
              />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {editContent}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-paper-200 dark:border-cyber-700 bg-paper-50/50 dark:bg-cyber-900/50 rounded-b-xl">
          
          {/* Left: Mode Toggle */}
          <div className="flex items-center gap-1 bg-paper-200/50 dark:bg-cyber-700 rounded-lg p-0.5">
            <button
              onClick={() => setIsEditing(false)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
                !isEditing 
                  ? 'bg-white dark:bg-cyber-600 text-violet-600 dark:text-violet-400 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Eye size={12} />
              {t.preview}
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
                isEditing 
                  ? 'bg-white dark:bg-cyber-600 text-violet-600 dark:text-violet-400 shadow-sm' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Edit3 size={12} />
              {t.edit}
            </button>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Save Button (only when editing) */}
            {isEditing && onSave && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                {t.save}
              </button>
            )}
            
            {/* Cancel Button */}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              {t.cancel}
            </button>
            
            {/* Confirm Add Button */}
            <button
              onClick={handleConfirm}
              className="flex items-center gap-1 px-4 py-1.5 text-xs bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
            >
              {t.confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryPreviewModal;
