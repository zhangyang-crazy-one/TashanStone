import { MarkdownFile, SearchResult } from '../../../types';
import { extractTags } from '../../types/wiki';

export interface SearchFilter {
  tag?: string;
  type?: 'file' | 'exam';
  ext?: string;
  after?: Date;
  before?: Date;
}

export interface SearchOptions {
  mode: 'instant' | 'semantic';
  maxResults?: number;
  includeContent?: boolean;
  includeTags?: boolean;
}

interface CachedMarkdownFile extends MarkdownFile {
  _cachedTags?: string[];
  _tagsCacheTime?: number;
  _contentIndex?: string; // 小写内容缓存
  _contentIndexTime?: number;
}

const CACHE_TTL = 60000;

// 预编译正则表达式，提升性能
const QUERY_SPLITTER = /\s+/;

const getCachedTags = (file: CachedMarkdownFile): string[] => {
  const now = Date.now();
  if (file._cachedTags && file._tagsCacheTime && (now - file._tagsCacheTime < CACHE_TTL)) {
    return file._cachedTags;
  }

  file._cachedTags = extractTags(file.content);
  file._tagsCacheTime = now;
  return file._cachedTags;
};

const getCachedContentIndex = (file: CachedMarkdownFile): string => {
  const now = Date.now();
  if (file._contentIndex && file._contentIndexTime && (now - file._contentIndexTime < CACHE_TTL)) {
    return file._contentIndex;
  }

  file._contentIndex = file.content.toLowerCase();
  file._contentIndexTime = now;
  return file._contentIndex;
};

export const parseSearchQuery = (query: string): { plainQuery: string; filter: SearchFilter } => {
  const filter: SearchFilter = {};
  let plainQuery = query;

  const tagMatch = query.match(/tag:(\S+)/);
  if (tagMatch) {
    filter.tag = tagMatch[1];
    plainQuery = plainQuery.replace(/tag:\S+/g, '').trim();
  }

  const typeMatch = query.match(/type:(\w+)/);
  if (typeMatch) {
    const type = typeMatch[1].toLowerCase() as 'file' | 'exam';
    if (type === 'file' || type === 'exam') {
      filter.type = type;
    }
    plainQuery = plainQuery.replace(/type:\w+/g, '').trim();
  }

  const extMatch = query.match(/ext:(\w+)/);
  if (extMatch) {
    filter.ext = extMatch[1];
    plainQuery = plainQuery.replace(/ext:\w+/g, '').trim();
  }

  const afterMatch = query.match(/after:(\d{4}-\d{2}(?:-\d{2})?)/);
  if (afterMatch) {
    filter.after = new Date(afterMatch[1]);
    plainQuery = plainQuery.replace(/after:\d{4}-\d{2}(?:-\d{2})?/g, '').trim();
  }

  const beforeMatch = query.match(/before:(\d{4}-\d{2}(?:-\d{2})?)/);
  if (beforeMatch) {
    filter.before = new Date(beforeMatch[1]);
    plainQuery = plainQuery.replace(/before:\d{4}-\d{2}(?:-\d{2})?/g, '').trim();
  }

  return { plainQuery, filter };
};

export const filterFiles = (
  files: MarkdownFile[],
  filter: SearchFilter
): MarkdownFile[] => {
  return files.filter(file => {
    const cachedFile = file as CachedMarkdownFile;

    if (filter.tag) {
      const tags = getCachedTags(cachedFile);
      if (!tags.some(t => t.toLowerCase().includes(filter.tag!.toLowerCase()))) {
        return false;
      }
    }

    if (filter.type === 'exam') {
      if (!file.name.toLowerCase().includes('exam') && !file.name.toLowerCase().includes('quiz')) {
        return false;
      }
    }

    if (filter.ext) {
      if (!file.name.toLowerCase().endsWith(`.${filter.ext.toLowerCase()}`)) {
        return false;
      }
    }

    if (filter.after) {
      if (new Date(file.lastModified) < filter.after) {
        return false;
      }
    }

    if (filter.before) {
      if (new Date(file.lastModified) > filter.before) {
        return false;
      }
    }

    return true;
  });
};

export const instantSearch = (
  files: MarkdownFile[],
  query: string,
  options?: Partial<SearchOptions>
): SearchResult[] => {
  const { plainQuery, filter } = parseSearchQuery(query);
  const maxResults = options?.maxResults || 20;
  const includeTags = options?.includeTags !== false;

  let filteredFiles = filterFiles(files, filter);

  if (!plainQuery.trim()) {
    return filteredFiles.slice(0, maxResults).map(file => ({
      fileId: file.id,
      fileName: file.name,
      path: file.path || file.name,
      score: 1,
      matches: [],
      lastModified: file.lastModified,
      tags: includeTags ? getCachedTags(file as CachedMarkdownFile) : []
    }));
  }

  const lowerQuery = plainQuery.toLowerCase();
  const results: SearchResult[] = [];

  for (const file of filteredFiles) {
    const cachedFile = file as CachedMarkdownFile;
    const matches: SearchResult['matches'] = [];
    let score = 0;
    const fileNameLower = file.name.toLowerCase();

    if (fileNameLower.includes(lowerQuery)) {
      score += 10;
      matches.push({ type: 'title', text: file.name });
    }

    // 使用缓存的内容索引
    const contentLower = getCachedContentIndex(cachedFile);
    let lastIndex = 0;
    let matchCount = 0;

    while (matchCount < 5 && lastIndex < contentLower.length) {
      const index = contentLower.indexOf(lowerQuery, lastIndex);
      if (index === -1) break;

      score += 1;
      matchCount++;
      lastIndex = index + lowerQuery.length;

      const start = Math.max(0, index - 30);
      const end = Math.min(file.content.length, index + lowerQuery.length + 30);
      const snippet = file.content.slice(start, end);
      matches.push({
        type: 'content',
        text: snippet,
        indices: [start, start + lowerQuery.length] as [number, number]
      });
    }

    const tags = getCachedTags(cachedFile);
    const matchingTags = tags.filter(t => t.toLowerCase().includes(lowerQuery));
    if (matchingTags.length > 0) {
      score += 5;
      matchingTags.forEach(tag => {
        matches.push({ type: 'tag', text: tag });
      });
    }

    if (score > 0 || !plainQuery.trim()) {
      results.push({
        fileId: file.id,
        fileName: file.name,
        path: file.path || file.name,
        score,
        matches,
        lastModified: file.lastModified,
        tags: includeTags ? tags : []
      });
    }
  }

  results.sort((a, b) => b.score - a.score);

  return results.slice(0, maxResults);
};

export const highlightMatch = (text: string, query: string): string => {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};
