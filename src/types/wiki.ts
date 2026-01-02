export interface WikiLink {
  target: string;
  alias?: string;
  position: {
    start: number;
    end: number;
  };
}

export interface BlockReference {
  target: string;
  startLine: number;
  endLine?: number;
  blockContent: string;
  position: {
    start: number;
    end: number;
  };
}

export interface Backlink {
  sourceFileId: string;
  sourceFileName: string;
  linkType: 'wikilink' | 'blockref';
  context?: string;
}

export interface PageLinks {
  fileId: string;
  fileName: string;
  outgoingLinks: WikiLink[];
  blockReferences: BlockReference[];
  backlinks: Backlink[];
}

export interface KnowledgeIndex {
  tags: Map<string, string[]>;
  backlinks: Map<string, string[]>;
  wikilinks: Map<string, string[]>;
}

export const extractWikiLinks = (content: string): WikiLink[] => {
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links: WikiLink[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    links.push({
      target: match[1].trim(),
      alias: match[2]?.trim(),
      position: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return links;
};

export const extractBlockReferences = (content: string): BlockReference[] => {
  // 支持两种格式: <<filename:line>> 和 <<{filename}:{line}>>
  const regex = /<<\{?([^:}]+)\}?:\{?(\d+)\}?(?:-\{?(\d+)\}?)?>>(?=(?:[^`]*`[^`]*`)*[^`]*$)/g;
  const refs: BlockReference[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const startLine = parseInt(match[2], 10);
    const endLine = match[3] ? parseInt(match[3], 10) : undefined;

    refs.push({
      target: match[1].trim(),
      startLine,
      endLine,
      blockContent: '',
      position: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return refs;
};

export const extractBlockReferencesWithContent = (
  content: string,
  files: Array<{ name: string; path?: string; content: string }>
): BlockReference[] => {
  // 支持两种格式: <<filename:line>> 和 <<{filename}:{line}>>
  const regex = /<<\{?([^:}]+)\}?:\{?(\d+)\}?(?:-\{?(\d+)\}?)?>>(?=(?:[^`]*`[^`]*`)*[^`]*$)/g;
  const refs: BlockReference[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const targetName = match[1].trim();
    const startLine = parseInt(match[2], 10);
    const endLine = match[3] ? parseInt(match[3], 10) : startLine;

    const targetFile = files.find(f => {
      const name = f.name.toLowerCase();
      const targetLower = targetName.toLowerCase();
      return name === targetLower ||
        name === `${targetLower}.md` ||
        f.path?.toLowerCase()?.endsWith(`/${targetLower}`) ||
        f.path?.toLowerCase()?.endsWith(`/${targetLower}.md`) ||
        name.includes(`/${targetLower}`);
    });

    let blockContent = '';

    if (targetFile && startLine > 0) {
      const lines = targetFile.content.split('\n');

      if (endLine >= startLine && endLine <= lines.length) {
        blockContent = lines.slice(startLine - 1, endLine).join('\n').trim();
      } else if (startLine <= lines.length) {
        blockContent = lines[startLine - 1].trim();
      }
    }

    refs.push({
      target: targetName,
      startLine,
      endLine,
      blockContent,
      position: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return refs;
};

export const extractTags = (content: string): string[] => {
  const regex = /(?:^|\s)(#[a-zA-Z_\u4e00-\u9fa5][\w\-\/\u4e00-\u9fa5]*)/g;
  const tags: string[] = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1].trim());
  }

  return tags;
};

export const preprocessWikiLinks = (content: string): string => {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, alias) => {
    const displayText = alias || link;
    const href = `?wiki=${encodeURIComponent(link)}`;
    return `[${displayText}](${href})`;
  });
};

export const formatBlockReference = (target: string, startLine: number, endLine?: number): string => {
  if (endLine && endLine > startLine) {
    return `<<${target}:${startLine}-${endLine}>>`;
  }
  return `<<${target}:${startLine}>>`;
};
