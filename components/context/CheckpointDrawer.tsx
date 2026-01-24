import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Trash2, Plus, Clock, FileText, Loader2, Check, Sparkles } from 'lucide-react';
import Tooltip from '../Tooltip';

interface Checkpoint {
  id: string;
  name: string;
  message_count: number;
  token_count: number;
  summary: string;
  created_at: number;
}

interface CheckpointDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  checkpoints: Checkpoint[];
  onRestore: (checkpointId: string) => Promise<void>;
  onDelete: (checkpointId: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onCreateMemory?: (checkpointId: string) => Promise<void>;
  currentSessionId?: string;
  isLoading?: boolean;
  language?: 'zh' | 'en';
}

export const CheckpointDrawer: React.FC<CheckpointDrawerProps> = ({
  isOpen,
  onClose,
  checkpoints,
  onRestore,
  onDelete,
  onCreate,
  onCreateMemory,
  currentSessionId,
  isLoading = false,
  language = 'en',
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsCreating(false);
      setNewName('');
    }
  }, [isOpen]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const handleCreate = async () => {
    if (!newName.trim() || isLoading) return;
    await onCreate(newName.trim());
    setNewName('');
    setIsCreating(false);
  };

  const handleRestore = async (checkpointId: string) => {
    setRestoringId(checkpointId);
    try {
      await onRestore(checkpointId);
      setSuccessId(checkpointId);
      setTimeout(() => setSuccessId(null), 2000);
    } catch (error) {
      console.error('Restore failed:', error);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (checkpointId: string) => {
    if (!confirm('Are you sure you want to delete this checkpoint?')) return;
    setDeletingId(checkpointId);
    try {
      await onDelete(checkpointId);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-96 bg-neutral-900 border-l border-neutral-800 z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Checkpoints</h2>
            <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">
              {checkpoints.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-800 rounded transition-colors"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isCreating ? (
            <div className="checkpoint-create-form mb-4 p-3 bg-neutral-800/50 rounded-lg border border-neutral-700">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Checkpoint name..."
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setIsCreating(false);
                }}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1 text-sm text-neutral-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || isLoading}
                  className="px-3 py-1 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full mb-4 flex items-center justify-center gap-2 p-3 border border-dashed border-neutral-700 rounded-lg text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Checkpoint
            </button>
          )}

          {checkpoints.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No checkpoints yet</p>
              <p className="text-sm mt-1">Create one to save your progress</p>
            </div>
          ) : (
            <div className="space-y-2">
              {checkpoints.map((checkpoint) => (
                <div
                  key={checkpoint.id}
                  className="checkpoint-item p-3 bg-neutral-800/50 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-white truncate">
                          {checkpoint.name}
                        </h3>
                        {successId === checkpoint.id && (
                          <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-1 truncate">
                        {checkpoint.summary}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-neutral-600">
                        <span>{checkpoint.message_count} messages</span>
                        <span>{formatNumber(checkpoint.token_count)} tokens</span>
                        <span>{formatDate(checkpoint.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 mt-3 pt-2 border-t border-neutral-700/50">
                    {onCreateMemory && (
                      <Tooltip content={language === 'zh' ? '创建记忆' : 'Create Memory'}>
                        <button
                          onClick={() => onCreateMemory(checkpoint.id)}
                          className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-violet-400 hover:bg-violet-500/10 rounded transition-colors"
                          aria-label={language === 'zh' ? '创建记忆' : 'Create Memory'}
                        >
                          <Sparkles className="w-3 h-3" />
                          Memory
                        </button>
                      </Tooltip>
                    )}
                    <button
                      onClick={() => handleRestore(checkpoint.id)}
                      disabled={restoringId === checkpoint.id || successId === checkpoint.id}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs text-green-400 hover:bg-green-500/10 rounded transition-colors disabled:opacity-50"
                    >
                      {restoringId === checkpoint.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                      Restore
                    </button>
                    <button
                      onClick={() => handleDelete(checkpoint.id)}
                      disabled={deletingId === checkpoint.id}
                      className="flex items-center justify-center gap-1 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                    >
                      {deletingId === checkpoint.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-neutral-800 text-xs text-neutral-500">
          Checkpoints save your conversation state so you can restore it later.
        </div>
      </div>
    </>
  );
};

interface CheckpointButtonProps {
  onClick: () => void;
  checkpointCount?: number;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const CheckpointButton: React.FC<CheckpointButtonProps> = ({
  onClick,
  checkpointCount = 0,
  disabled = false,
  size = 'md',
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'px-2 py-1 text-xs';
      case 'lg': return 'px-4 py-2 text-base';
      default: return 'px-3 py-1.5 text-sm';
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        checkpoint-button flex items-center gap-1.5 rounded-lg font-medium transition-all
        ${getSizeClasses()}
        bg-neutral-700 hover:bg-neutral-600 text-white border border-neutral-600
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      <Clock className="w-4 h-4 text-blue-400" />
      <span>Checkpoints</span>
      {checkpointCount > 0 && (
        <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full">
          {checkpointCount}
        </span>
      )}
    </button>
  );
};
