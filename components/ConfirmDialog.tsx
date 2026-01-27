
import React, { useEffect } from 'react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Button } from './ui/Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning'
}) => {
  // 按 ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  // 根据类型选择图标和颜色
  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      case 'info':
        return <Info className="w-6 h-6 text-cyan-500" />;
    }
  };

  const confirmVariant = type === 'danger' ? 'danger' : 'primary';
  const confirmClassName = type === 'warning'
    ? 'bg-amber-500 hover:bg-amber-600'
    : type === 'info'
      ? 'bg-cyan-500 hover:bg-cyan-600'
      : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="relative bg-white dark:bg-cyber-800 rounded-xl shadow-2xl border border-paper-200 dark:border-cyber-700 max-w-md w-full animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-6 border-b border-paper-200 dark:border-cyber-700">
          <div className="flex-shrink-0 mt-1">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 p-1 rounded-lg hover:bg-paper-100 dark:hover:bg-cyber-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-paper-200 dark:border-cyber-700">
          <Button
            variant="secondary"
            onClick={onCancel}
            size="md"
          >
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            size="md"
            className={confirmClassName}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
