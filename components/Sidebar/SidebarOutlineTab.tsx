import React, { useMemo } from 'react';
import { AlignLeft } from 'lucide-react';

import type { MarkdownFile } from '../../types';
import type { OutlineItem } from './sidebarTypes';
import { generateSlug } from '../../utils/slug';

interface SidebarOutlineTabProps {
  activeFileId: string;
  files: MarkdownFile[];
}

export const SidebarOutlineTab: React.FC<SidebarOutlineTabProps> = ({ activeFileId, files }) => {
  const outline = useMemo(() => {
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) return [];

    const lines = (activeFile.content || '').split('\n');
    const headers: OutlineItem[] = [];
    lines.forEach((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const text = match[2];
        headers.push({
          level: match[1].length,
          text,
          line: index,
          slug: generateSlug(text)
        });
      }
    });
    return headers;
  }, [activeFileId, files]);

  if (outline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center opacity-60">
        <AlignLeft size={32} className="mb-2" />
        <p className="text-xs">No headings found</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {outline.map((item, idx) => (
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
      ))}
    </div>
  );
};
