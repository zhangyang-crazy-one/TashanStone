import { MarkdownFile } from '../../../types';
import { extractTags } from '../../types/wiki';
import { saveFileToDisk } from '../../../services/fileService';

export interface TagStats {
  tag: string;
  count: number;
  files: { id: string; name: string }[];
}

export const getAllTags = (files: MarkdownFile[]): TagStats[] => {
  const stats = new Map<string, TagStats>();

  files.forEach(file => {
    const tags = extractTags(file.content);
    tags.forEach(tag => {
      if (!stats.has(tag)) {
        stats.set(tag, {
          tag,
          count: 0,
          files: []
        });
      }
      const entry = stats.get(tag)!;
      entry.count++;
      entry.files.push({ id: file.id, name: file.name });
    });
  });

  return Array.from(stats.values())
    .sort((a, b) => b.count - a.count);
};

export const searchTags = (files: MarkdownFile[], query: string): TagStats[] => {
  const allTags = getAllTags(files);
  const lowerQuery = query.toLowerCase();

  if (!query.trim()) {
    return allTags;
  }

  return allTags.filter(tagStats =>
    tagStats.tag.toLowerCase().includes(lowerQuery)
  );
};

export const replaceTagInFile = (content: string, oldTag: string, newTag: string): string => {
  // 新格式: #[tag-name]
  const regex = new RegExp(`#\\[${escapeRegExp(oldTag)}\\]`, 'g');
  return content.replace(regex, `#[${newTag}]`);
};

export const renameTag = async (
  files: MarkdownFile[],
  oldTag: string,
  newTag: string,
  onFileUpdate?: (file: MarkdownFile) => void
): Promise<{ updated: number; errors: string[] }> => {
  const errors: string[] = [];
  let updated = 0;

  for (const file of files) {
    try {
      const hasOldTag = extractTags(file.content).includes(oldTag);
      if (hasOldTag) {
        const newContent = replaceTagInFile(file.content, oldTag, newTag);
        const updatedFile: MarkdownFile = {
          ...file,
          content: newContent
        };

        if (file.handle) {
          await saveFileToDisk(updatedFile);
        } else if (window.electronAPI?.db?.files) {
          // Electron 内部文件系统
          await window.electronAPI.db.files.update(file.id, { content: newContent });
        }

        onFileUpdate?.(updatedFile);
        updated++;
      }
    } catch (e: any) {
      errors.push(`Failed to update ${file.name}: ${e.message}`);
    }
  }

  return { updated, errors };
};

export const deleteTagFromFile = async (
  file: MarkdownFile,
  tag: string,
  onSave?: (file: MarkdownFile) => void
): Promise<MarkdownFile | null> => {
  try {
    const fileTags = extractTags(file.content);
    if (!fileTags.includes(tag)) {
      return null;
    }

    // 新格式: #[tag-name]
    const regex = new RegExp(`#\\[${escapeRegExp(tag)}\\]`, 'g');
    const newContent = file.content.replace(regex, '');

    const updatedFile: MarkdownFile = {
      ...file,
      content: newContent
    };

    if (file.handle) {
      await saveFileToDisk(updatedFile);
    } else if (window.electronAPI?.db?.files) {
      await window.electronAPI.db.files.update(file.id, { content: newContent });
    }

    onSave?.(updatedFile);
    return updatedFile;
  } catch (e: any) {
    return null;
  }
};


export const mergeTags = async (
  files: MarkdownFile[],
  sourceTag: string,
  targetTag: string,
  onFileUpdate?: (file: MarkdownFile) => void
): Promise<{ updated: number; errors: string[] }> => {
  return renameTag(files, sourceTag, targetTag, onFileUpdate);
};

export const deleteTagGlobally = async (
  files: MarkdownFile[],
  tag: string,
  onFileUpdate?: (file: MarkdownFile) => void
): Promise<{ updated: number; errors: string[] }> => {
  const errors: string[] = [];
  let updated = 0;

  for (const file of files) {
    try {
      const fileTags = extractTags(file.content);
      if (fileTags.includes(tag)) {
        const result = await deleteTagFromFile(file, tag);
        if (result) {
          onFileUpdate?.(result);
          updated++;
        }
      }
    } catch (e: any) {
      errors.push(`Failed to delete tag from ${file.name}: ${e.message}`);
    }
  }

  return { updated, errors };
};


export const batchDeleteTags = async (
  files: MarkdownFile[],
  tags: string[],
  onFileUpdate?: (file: MarkdownFile) => void
): Promise<{ deletedFrom: number; errors: string[] }> => {
  const errors: string[] = [];
  let deletedFrom = 0;

  for (const file of files) {
    let updated = false;
    let currentFile = file;

    for (const tag of tags) {
      const hasTag = extractTags(currentFile.content).includes(tag);
      if (hasTag) {
        const result = await deleteTagFromFile(currentFile, tag);
        if (result) {
          currentFile = result;
          updated = true;
        }
      }
    }

    if (updated) {
      try {
        if (currentFile.handle) {
          await saveFileToDisk(currentFile);
        } else if (window.electronAPI?.db?.files) {
          // Electron 内部文件系统
          await window.electronAPI.db.files.update(currentFile.id, { content: currentFile.content });
        }
        onFileUpdate?.(currentFile);
        deletedFrom++;
      } catch (e: any) {
        errors.push(`Failed to save ${currentFile.name}: ${e.message}`);
      }
    }
  }

  return { deletedFrom, errors };
};

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
