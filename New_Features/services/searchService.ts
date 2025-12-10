
import { MarkdownFile, SearchResult } from '../types';
import { extractTags } from './knowledgeService';

interface SearchFilters {
  tags: string[];
  types: string[];
  after?: number;
  before?: number;
  terms: string[];
}

const parseQuery = (query: string): SearchFilters => {
  const filters: SearchFilters = {
    tags: [],
    types: [],
    terms: []
  };

  const parts = query.split(/\s+/);
  
  parts.forEach(part => {
    const lower = part.toLowerCase();
    
    if (lower.startsWith('tag:') || lower.startsWith('#')) {
      const tag = lower.startsWith('tag:') ? lower.substring(4) : lower;
      if (tag) filters.tags.push(tag);
    } else if (lower.startsWith('type:') || lower.startsWith('ext:')) {
      const type = lower.substring(5);
      if (type) filters.types.push(type);
    } else if (lower.startsWith('after:')) {
      const dateStr = lower.substring(6);
      const date = new Date(dateStr).getTime();
      if (!isNaN(date)) filters.after = date;
    } else if (lower.startsWith('before:')) {
      const dateStr = lower.substring(7);
      const date = new Date(dateStr).getTime();
      if (!isNaN(date)) filters.before = date;
    } else {
      if (part.trim()) filters.terms.push(part);
    }
  });

  return filters;
};

export const performGlobalSearch = (
  files: MarkdownFile[], 
  query: string
): SearchResult[] => {
  if (!query.trim()) return [];

  const filters = parseQuery(query);
  const results: SearchResult[] = [];

  files.forEach(file => {
    // Skip .keep files
    if (file.name.endsWith('.keep')) return;

    let score = 0;
    const matches: SearchResult['matches'] = [];
    const fileTags = extractTags(file.content).map(t => t.toLowerCase().replace('#', ''));
    const fileNameLower = file.name.toLowerCase();
    const contentLower = file.content.toLowerCase();
    const ext = (file.path || file.name).split('.').pop()?.toLowerCase() || '';

    // 1. Filter Checks
    if (filters.tags.length > 0) {
       const hasTag = filters.tags.every(ft => fileTags.some(ftag => ftag.includes(ft.replace('#', ''))));
       if (!hasTag) return;
    }

    if (filters.types.length > 0) {
       if (!filters.types.includes(ext)) return;
    }

    if (filters.after && file.lastModified < filters.after) return;
    if (filters.before && file.lastModified > filters.before) return;

    // 2. Term Matching & Scoring
    
    // If no terms provided but filters passed, add all (e.g. "tag:ui")
    if (filters.terms.length === 0) {
        results.push({
            fileId: file.id,
            fileName: file.name,
            path: file.path || file.name,
            score: 1, // Base score
            matches: [],
            lastModified: file.lastModified,
            tags: fileTags.map(t => '#' + t)
        });
        return;
    }

    let allTermsMatch = true;
    for (const term of filters.terms) {
        const termLower = term.toLowerCase();
        let termScore = 0;

        // Title Match (High Weight)
        if (fileNameLower.includes(termLower)) {
            termScore += 10;
            if (fileNameLower === termLower) termScore += 5; // Exact match bonus
            matches.push({ type: 'title', text: file.name });
        }

        // Tag Match (Medium Weight)
        const matchedTag = fileTags.find(t => t.includes(termLower));
        if (matchedTag) {
            termScore += 5;
            matches.push({ type: 'tag', text: '#' + matchedTag });
        }

        // Content Match (Low Weight, Frequency Capped)
        const contentIdx = contentLower.indexOf(termLower);
        if (contentIdx !== -1) {
            termScore += 1;
            // Extract snippet
            const start = Math.max(0, contentIdx - 30);
            const end = Math.min(file.content.length, contentIdx + term.length + 50);
            const snippet = (start > 0 ? "..." : "") + file.content.substring(start, end) + (end < file.content.length ? "..." : "");
            matches.push({ type: 'content', text: snippet });
        }

        if (termScore === 0) {
            allTermsMatch = false;
            break; 
        }
        score += termScore;
    }

    if (allTermsMatch && score > 0) {
        results.push({
            fileId: file.id,
            fileName: file.name,
            path: file.path || file.name,
            score,
            matches,
            lastModified: file.lastModified,
            tags: fileTags.map(t => '#' + t)
        });
    }
  });

  return results.sort((a, b) => b.score - a.score);
};
