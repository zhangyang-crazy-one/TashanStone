
import { MarkdownFile, GraphData, ExamResult, GraphNode, GraphLink } from '../types';

export interface WikiLink {
  sourceId: string;
  targetName: string;
  // Optional: Block reference ID
  blockId?: string; 
  context: string;
}

export interface Tag {
  name: string; // e.g. "project/ui"
  fileId: string;
}

export interface KnowledgeIndex {
  backlinks: Map<string, string[]>; // targetName -> sourceFileIds
  tags: Map<string, string[]>; // tagName -> fileIds
}

export interface AnalyticsData {
    totalNotes: number;
    totalLinks: number;
    notesPerDay: { date: string, count: number }[];
    cumulativeGrowth: { date: string, count: number }[]; // New: Growth trajectory
    tagStats: { name: string, count: number }[];
    topConnected: { name: string, connections: number }[];
    density: number;
}

// Helper: Parse Wikilinks [[Link|Alias]] or [[Link]]
export const extractLinks = (content: string): { target: string, alias?: string }[] => {
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links: { target: string, alias?: string }[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push({
      target: match[1],
      alias: match[2]
    });
  }
  return links;
};

// Helper: Parse Tags #tag or #nested/tag
// Supports alphaneumeric, underscore, hyphen, forward slash. Must start with #.
export const extractTags = (content: string): string[] => {
  // Regex looks for # followed by valid characters, bounded by word boundary or start/end of line
  // Excludes hex codes (usually 3 or 6 chars) - simplified check by requiring non-hex or longer length, 
  // but for simplicity we assume standard tag format here.
  const regex = /(?:^|\s)(#[a-zA-Z_\u4e00-\u9fa5][\w\-\/\u4e00-\u9fa5]*)/g;
  const tags: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1].trim());
  }
  return tags;
};

export const buildKnowledgeIndex = (files: MarkdownFile[]): KnowledgeIndex => {
  const backlinks = new Map<string, string[]>();
  const tags = new Map<string, string[]>();

  files.forEach(file => {
    // Index Links
    const links = extractLinks(file.content);
    links.forEach(link => {
      // Normalize target name (simple case insensitive)
      const target = link.target.toLowerCase(); 
      if (!backlinks.has(target)) {
        backlinks.set(target, []);
      }
      const sources = backlinks.get(target)!;
      if (!sources.includes(file.id)) {
        sources.push(file.id);
      }
    });

    // Index Tags
    const fileTags = extractTags(file.content);
    fileTags.forEach(tag => {
      if (!tags.has(tag)) {
        tags.set(tag, []);
      }
      const taggedFiles = tags.get(tag)!;
      if (!taggedFiles.includes(file.id)) {
        taggedFiles.push(file.id);
      }
    });
  });

  return { backlinks, tags };
};

// Convert content with [[Link]] to markdown links with query params for the renderer to pick up
// [[Page]] -> [Page](?wiki=Page)
// [[Page|Alias]] -> [Alias](?wiki=Page)
export const preprocessWikiLinks = (content: string): string => {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, link, alias) => {
    const displayText = alias || link;
    const href = `?wiki=${encodeURIComponent(link)}`;
    return `[${displayText}](${href})`;
  });
};

/**
 * Deterministically generates a Knowledge Graph based on file links.
 * Now supports injecting Exam nodes.
 */
export const generateFileLinkGraph = (files: MarkdownFile[], exams: ExamResult[] = []): GraphData => {
    const nodes: GraphNode[] = files.map(f => ({
        id: f.id,
        label: f.name,
        group: 1, // Default group for files
        val: 1, // Base value
        type: 'file'
    }));

    const links: GraphLink[] = [];
    const idMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    
    // Create lookup maps
    files.forEach(f => {
        idMap.set(f.id, f.name);
        nameMap.set(f.name.toLowerCase(), f.id);
    });

    // 1. Process File Links
    files.forEach(source => {
        const extracted = extractLinks(source.content);
        extracted.forEach(link => {
            const targetId = nameMap.get(link.target.toLowerCase());
            // Only add link if target exists in our file set
            if (targetId && targetId !== source.id) {
                // Check if link already exists to prevent duplicates (A->B)
                const exists = links.some(l => l.source === source.id && l.target === targetId);
                if (!exists) {
                    links.push({
                        source: source.id,
                        target: targetId,
                        relationship: 'wikilink'
                    });
                }
            }
        });
    });

    // 2. Process Exams
    exams.forEach(exam => {
        // Create Exam Node
        const examNode: GraphNode = {
            id: exam.id,
            label: exam.quizTitle || 'Exam',
            group: 20, // Distinct group for exams
            val: 2, // Slightly larger base
            type: 'exam',
            score: exam.score
        };
        nodes.push(examNode);

        // Link to Source File if it exists
        if (exam.sourceFileId) {
            // Ensure source file actually exists (might have been deleted)
            if (idMap.has(exam.sourceFileId)) {
                links.push({
                    source: examNode.id,
                    target: exam.sourceFileId,
                    relationship: 'generated_from'
                });
            }
        }
    });

    // Update node values (degree centrality)
    links.forEach(l => {
        const sourceNode = nodes.find(n => n.id === l.source);
        const targetNode = nodes.find(n => n.id === l.target);
        if (sourceNode) sourceNode.val = (sourceNode.val || 1) + 1;
        if (targetNode) targetNode.val = (targetNode.val || 1) + 1;
    });

    // Simple Grouping by Tags (First tag found determines group)
    files.forEach(f => {
        const tags = extractTags(f.content);
        const node = nodes.find(n => n.id === f.id);
        if (node && tags.length > 0) {
            // Hash tag to a number group
            let hash = 0;
            const str = tags[0];
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            node.group = Math.abs(hash) % 10 + 2; // Group 2-11
        }
    });

    return { nodes, links };
};

export const getAnalyticsData = (files: MarkdownFile[]): AnalyticsData => {
    const graph = generateFileLinkGraph(files);
    
    // 1. Note Stats over time
    const dateMap = new Map<string, number>();
    files.forEach(f => {
        const date = new Date(f.lastModified).toISOString().split('T')[0];
        dateMap.set(date, (dateMap.get(date) || 0) + 1);
    });
    
    const notesPerDay = Array.from(dateMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // Cumulative Growth
    let totalSoFar = 0;
    const cumulativeGrowth = notesPerDay.map(day => {
        totalSoFar += day.count;
        return { date: day.date, count: totalSoFar };
    });

    // 2. Tag Stats
    const tagMap = new Map<string, number>();
    files.forEach(f => {
        const tags = extractTags(f.content);
        tags.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1));
    });
    const tagStats = Array.from(tagMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // 3. Connectivity
    const topConnected = graph.nodes
        .filter(n => n.type === 'file') // Only count files
        .sort((a, b) => (b.val || 0) - (a.val || 0))
        .slice(0, 10)
        .map(n => ({ name: n.label, connections: (n.val || 1) - 1 })); // subtract base val 1

    // 4. Density
    // Density = 2 * Links / (Nodes * (Nodes - 1))
    const nodeCount = graph.nodes.filter(n => n.type === 'file').length;
    const linkCount = graph.links.length;
    const possibleLinks = nodeCount * (nodeCount - 1);
    const density = possibleLinks > 0 ? (2 * linkCount) / possibleLinks : 0;

    return {
        totalNotes: nodeCount,
        totalLinks: linkCount,
        notesPerDay,
        cumulativeGrowth,
        tagStats,
        topConnected,
        density
    };
};
