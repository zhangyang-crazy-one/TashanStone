import { MarkdownFile } from '../../../types';
import {
  type WikiLink,
  type BlockReference,
  type Backlink,
  type KnowledgeIndex,
  type PageLinks,
  extractWikiLinks,
  extractBlockReferences,
  extractBlockReferencesWithContent,
  extractTags
} from '../../types/wiki';

export type {
  WikiLink,
  BlockReference,
  Backlink,
  KnowledgeIndex,
  PageLinks
};

export {
  extractWikiLinks,
  extractBlockReferences,
  extractBlockReferencesWithContent,
  extractTags
};

// 性能优化：添加缓存层
interface CacheEntry {
  tags: string[];
  wikiLinks: WikiLink[];
  blockRefs: BlockReference[];
  timestamp: number;
}

const INDEX_CACHE = new Map<string, CacheEntry>();
const FILE_CONTENT_CACHE = new Map<string, { content: string; tags: string[]; links: WikiLink[] }>();
const CACHE_TTL = 30000; // 30秒缓存

const getCachedFileContent = (file: MarkdownFile): { tags: string[]; links: WikiLink[] } => {
  const now = Date.now();
  const cached = FILE_CONTENT_CACHE.get(file.id);

  if (cached && now - file.lastModified! < CACHE_TTL) {
    return cached;
  }

  const tags = extractTags(file.content);
  const links = extractWikiLinks(file.content);

  FILE_CONTENT_CACHE.set(file.id, { content: file.content, tags, links });

  return { tags, links };
};

const clearFileCache = (fileId?: string): void => {
  if (fileId) {
    FILE_CONTENT_CACHE.delete(fileId);
    INDEX_CACHE.delete(fileId);
  } else {
    FILE_CONTENT_CACHE.clear();
    INDEX_CACHE.clear();
  }
};

export const buildKnowledgeIndexFromFiles = (files: MarkdownFile[]): KnowledgeIndex => {
  const index: KnowledgeIndex = {
    tags: new Map(),
    backlinks: new Map(),
    wikilinks: new Map()
  };

  // 使用 Map 加速查找
  const tagMap = new Map<string, string[]>();
  const backlinkMap = new Map<string, string[]>();

  // 单遍遍历优化
  for (const file of files) {
    const { tags, links } = getCachedFileContent(file);

    // 标签索引
    for (const tag of tags) {
      const existing = tagMap.get(tag) || [];
      if (!existing.includes(file.id)) {
        existing.push(file.id);
        tagMap.set(tag, existing);
      }
    }

    // WikiLink 索引
    for (const link of links) {
      const normalizedTarget = link.target.toLowerCase();

      // 出链
      const outgoing = index.wikilinks.get(file.name) || [];
      if (!outgoing.includes(link.target)) {
        outgoing.push(link.target);
        index.wikilinks.set(file.name, outgoing);
      }

      // 反链
      const sources = backlinkMap.get(normalizedTarget) || [];
      if (!sources.includes(file.id)) {
        sources.push(file.id);
        backlinkMap.set(normalizedTarget, sources);
      }
    }
  }

  index.tags = tagMap;
  index.backlinks = backlinkMap;

  return index;
};

export const getPageLinks = (file: MarkdownFile, files: MarkdownFile[], index: KnowledgeIndex): PageLinks => {
  const links = extractWikiLinks(file.content);
  const blockRefs = extractBlockReferencesWithContent(file.content, files);
  
  const backlinks: Backlink[] = [];
  const normalizedName = file.name.toLowerCase();
  
  index.backlinks.forEach((sourceIds, targetName) => {
    if (targetName === normalizedName || targetName === file.name) {
      sourceIds.forEach(sourceId => {
        const sourceFile = files.find(f => f.id === sourceId);
        if (sourceFile) {
          backlinks.push({
            sourceFileId: sourceId,
            sourceFileName: sourceFile.name,
            linkType: 'wikilink'
          });
        }
      });
    }
  });
  
  return {
    fileId: file.id,
    fileName: file.name,
    outgoingLinks: links,
    blockReferences: blockRefs,
    backlinks
  };
};

export const findFileByLinkTarget = (target: string, files: MarkdownFile[]): MarkdownFile | undefined => {
  return findFileByWikiLinkTarget(target, files) as MarkdownFile | undefined;
};

/**
 * 统一的 WikiLink 目标文件查找函数
 * 支持:
 * - [[文件名]] - 匹配 文件名.md 或 文件名
 * - [[文件名.md]] - 精确匹配
 * - [[path/to/文件名]] - 路径匹配
 */
export const findFileByWikiLinkTarget = (
  target: string,
  files: Array<{ id: string; name: string; path?: string; content?: string; lastModified?: number }>
): { id: string; name: string; path?: string; content?: string; lastModified?: number } | undefined => {
  if (!target || !files?.length) {
    return undefined;
  }

  const normalizedTarget = target.toLowerCase().trim();
  const targetWithoutMd = normalizedTarget.replace(/\.md$/i, '');

  return files.find(f => {
    const name = f.name.toLowerCase();
    const nameWithoutExt = name.replace(/\.md$/i, '');

    return (
      name === normalizedTarget ||
      nameWithoutExt === normalizedTarget ||
      name === `${targetWithoutMd}.md` ||
      nameWithoutExt === targetWithoutMd ||
      name.includes(`/${normalizedTarget}`) ||
      nameWithoutExt.includes(`/${normalizedTarget}`) ||
      name.includes(`/${targetWithoutMd}.md`) ||
      nameWithoutExt.includes(`/${targetWithoutMd}`)
    );
  });
};

export const getBacklinksForFile = (file: MarkdownFile, files: MarkdownFile[], index: KnowledgeIndex): Backlink[] => {
  const backlinks: Backlink[] = [];
  const normalizedName = file.name.toLowerCase();
  
  index.backlinks.forEach((sourceIds, targetName) => {
    if (targetName === normalizedName) {
      sourceIds.forEach(sourceId => {
        const sourceFile = files.find(f => f.id === sourceId);
        if (sourceFile) {
          backlinks.push({
            sourceFileId: sourceId,
            sourceFileName: sourceFile.name,
            linkType: 'wikilink'
          });
        }
      });
    }
  });
  
  return backlinks;
};

export const preprocessWikiLinksForMarkdown = (content: string): string => {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, alias) => {
    const displayText = alias || link;
    const href = `?wiki=${encodeURIComponent(link)}`;
    return `[${displayText}](${href})`;
  });
};

export const generateFileLinkGraph = (files: MarkdownFile[], index: KnowledgeIndex) => {
  const nodes = files.map(f => ({
    id: f.id,
    label: f.name,
    group: 1,
    val: 1,
    type: 'file' as const
  }));

  const links: { source: string; target: string; relationship: string }[] = [];

  // 使用 Map 加速查找
  const nameMap = new Map<string, string>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const linkSet = new Set<string>(); // 避免重复链接

  for (const f of files) {
    nameMap.set(f.name.toLowerCase(), f.id);
  }

  // 使用缓存的数据
  const fileDataMap = new Map<string, { links: WikiLink[]; tags: string[] }>();

  for (const f of files) {
    const { tags, links: extractedLinks } = getCachedFileContent(f);
    fileDataMap.set(f.id, { links: extractedLinks, tags });
  }

  // 遍历生成链接
  for (const source of files) {
    const { links: extracted } = fileDataMap.get(source.id)!;

    for (const link of extracted) {
      const targetId = nameMap.get(link.target.toLowerCase());
      if (targetId && targetId !== source.id) {
        const linkKey = `${source.id}-${targetId}`;
        if (!linkSet.has(linkKey)) {
          linkSet.add(linkKey);
          links.push({
            source: source.id,
            target: targetId,
            relationship: 'wikilink'
          });
        }
      }
    }
  }

  // 使用 Map 查找节点，避免数组 find
  for (const l of links) {
    const sourceNode = nodeMap.get(l.source);
    const targetNode = nodeMap.get(l.target);
    if (sourceNode) sourceNode.val = (sourceNode.val || 1) + 1;
    if (targetNode) targetNode.val = (targetNode.val || 1) + 1;
  }

  // 根据标签设置节点分组
  for (const f of files) {
    const { tags } = fileDataMap.get(f.id)!;
    const node = nodeMap.get(f.id);
    if (node && tags.length > 0) {
      let hash = 0;
      const str = tags[0];
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      node.group = Math.abs(hash) % 10 + 2;
    }
  }

  return { nodes, links };
};
