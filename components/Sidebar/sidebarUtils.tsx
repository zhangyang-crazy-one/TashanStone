import {
  FileText,
  FileType,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  File as FileIcon
} from 'lucide-react';

export const DISPLAY_EXTENSIONS = ['.md', '.markdown', '.csv', '.pdf', '.docx', '.doc', '.txt', '.keep'];

export const OPERABLE_EXTENSIONS = ['.md', '.markdown', '.csv', '.txt'];

export const isExtensionInList = (filename: string, list: string[]) => {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.keep')) return true;
  return list.some(ext => lower.endsWith(ext));
};

export const getIconForFile = (name: string) => {
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
