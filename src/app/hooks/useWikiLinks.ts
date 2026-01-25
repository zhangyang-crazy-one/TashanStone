import { useCallback, useEffect, useState } from 'react';

import type { MarkdownFile } from '@/types';
import type { Backlink } from '@/src/types/wiki';
import { extractWikiLinks } from '@/src/types/wiki';

interface UseWikiLinksOptions {
  files: MarkdownFile[];
  activeFile: MarkdownFile;
  activeFileId: string;
  openFileInPane: (fileId: string) => void;
  showToast: (message: string, isError?: boolean) => void;
}

interface UseWikiLinksResult {
  backlinks: Backlink[];
  handleNavigateBacklink: (fileId: string) => void;
}

export const useWikiLinks = ({
  files,
  activeFile,
  activeFileId,
  openFileInPane,
  showToast
}: UseWikiLinksOptions): UseWikiLinksResult => {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);

  useEffect(() => {
    if (!activeFile) {
      setBacklinks([]);
      return;
    }

    const currentFileName = activeFile.name.toLowerCase();
    const currentFilePath = activeFile.path?.toLowerCase() || '';
    const nextBacklinks: Backlink[] = [];

    files.forEach(file => {
      if (file.id === activeFileId) return;

      const links = extractWikiLinks(file.content);
      links.forEach(link => {
        const linkTarget = link.target.toLowerCase();
        if (
          linkTarget === currentFileName ||
          linkTarget === currentFilePath ||
          linkTarget.endsWith(`/${currentFileName}`) ||
          linkTarget === `${currentFileName}.md`
        ) {
          nextBacklinks.push({
            sourceFileId: file.id,
            sourceFileName: file.name,
            linkType: 'wikilink',
            context: link.alias || link.target
          });
        }
      });
    });

    setBacklinks(nextBacklinks);
  }, [activeFile, activeFileId, files]);

  useEffect(() => {
    const handleWikiLinkNavigation = (event: CustomEvent) => {
      const { target } = event.detail;
      if (!target) return;

      const normalizedTarget = target.toLowerCase();

      if (normalizedTarget.startsWith('exam:')) {
        const examName = target.substring(5).trim();
        const examFile = files.find(file =>
          file.name.toLowerCase() === examName.toLowerCase() ||
          file.name.toLowerCase().includes(examName.toLowerCase())
        );
        if (examFile) {
          openFileInPane(examFile.id);
        } else {
          showToast(`Exam not found: ${examName}`, true);
        }
        return;
      }

      if (normalizedTarget.startsWith('question:')) {
        const questionId = target.substring(9).trim();
        showToast(`Question reference: ${questionId}`);
        return;
      }

      const targetFile = files.find(file => {
        const name = file.name.toLowerCase();
        const path = file.path?.toLowerCase() || '';
        return (
          name === normalizedTarget ||
          path.endsWith(`/${normalizedTarget}`) ||
          name.includes(`/${normalizedTarget}`) ||
          name === `${normalizedTarget}.md` ||
          path === `${normalizedTarget}.md`
        );
      });

      if (targetFile) {
        openFileInPane(targetFile.id);
      } else {
        showToast(`Page not found: ${target}`, true);
      }
    };

    window.addEventListener('navigate-to-wikilink', handleWikiLinkNavigation as EventListener);
    return () => window.removeEventListener('navigate-to-wikilink', handleWikiLinkNavigation as EventListener);
  }, [files, openFileInPane, showToast]);

  const handleNavigateBacklink = useCallback((fileId: string) => {
    openFileInPane(fileId);
  }, [openFileInPane]);

  return {
    backlinks,
    handleNavigateBacklink
  };
};
