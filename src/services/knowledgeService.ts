import { MarkdownFile, GraphData, ExamResult, GraphNode, GraphLink } from '../../types';
import { extractWikiLinks, extractTags, extractBlockReferences } from '../types/wiki';

export interface KnowledgeIndex {
  backlinks: Map<string, string[]>;
  tags: Map<string, string[]>;
}

export interface AnalyticsData {
  totalNotes: number;
  totalLinks: number;
  notesPerDay: { date: string; count: number }[];
  cumulativeGrowth: { date: string; count: number }[];
  tagStats: { name: string; count: number }[];
  topConnected: { name: string; connections: number }[];
  density: number;
}

export const buildKnowledgeIndex = (files: MarkdownFile[]): KnowledgeIndex => {
  const backlinks = new Map<string, string[]>();
  const tags = new Map<string, string[]>();

  files.forEach(file => {
    const links = extractWikiLinks(file.content);
    links.forEach(link => {
      const target = link.target.toLowerCase();
      if (!backlinks.has(target)) {
        backlinks.set(target, []);
      }
      const sources = backlinks.get(target)!;
      if (!sources.includes(file.id)) {
        sources.push(file.id);
      }
    });

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

export const generateFileLinkGraph = (files: MarkdownFile[], exams: ExamResult[] = []): GraphData => {
  const nodes: GraphNode[] = files.map(f => ({
    id: f.id,
    label: f.name,
    group: 1,
    val: 1,
    type: 'file'
  }));

  const links: GraphLink[] = [];
  const nameMap = new Map<string, string>();
  
  files.forEach(f => {
    nameMap.set(f.name.toLowerCase(), f.id);
  });

  files.forEach(source => {
    const extracted = extractWikiLinks(source.content);
    extracted.forEach(link => {
      const targetId = nameMap.get(link.target.toLowerCase());
      if (targetId && targetId !== source.id) {
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

  exams.forEach(exam => {
    const examNode: GraphNode = {
      id: exam.id,
      label: exam.quizTitle || 'Exam',
      group: 20,
      val: 2,
      type: 'exam',
      score: exam.score
    };
    nodes.push(examNode);

    if (exam.sourceFileId) {
      links.push({
        source: examNode.id,
        target: exam.sourceFileId,
        relationship: 'generated_from'
      });
    }
  });

  links.forEach(l => {
    const sourceNode = nodes.find(n => n.id === l.source);
    const targetNode = nodes.find(n => n.id === l.target);
    if (sourceNode) sourceNode.val = (sourceNode.val || 1) + 1;
    if (targetNode) targetNode.val = (targetNode.val || 1) + 1;
  });

  files.forEach(f => {
    const tags = extractTags(f.content);
    const node = nodes.find(n => n.id === f.id);
    if (node && tags.length > 0) {
      let hash = 0;
      const str = tags[0];
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      node.group = Math.abs(hash) % 10 + 2;
    }
  });

  return { nodes, links };
};

export const getAnalyticsData = (files: MarkdownFile[]): AnalyticsData => {
  const graph = generateFileLinkGraph(files);
  
  const dateMap = new Map<string, number>();
  files.forEach(f => {
    const date = new Date(f.lastModified).toISOString().split('T')[0];
    dateMap.set(date, (dateMap.get(date) || 0) + 1);
  });
  
  const notesPerDay = Array.from(dateMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let totalSoFar = 0;
  const cumulativeGrowth = notesPerDay.map(day => {
    totalSoFar += day.count;
    return { date: day.date, count: totalSoFar };
  });

  const tagMap = new Map<string, number>();
  files.forEach(f => {
    const tags = extractTags(f.content);
    tags.forEach(t => tagMap.set(t, (tagMap.get(t) || 0) + 1));
  });
  const tagStats = Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const topConnected = graph.nodes
    .filter(n => n.type === 'file')
    .sort((a, b) => (b.val || 0) - (a.val || 0))
    .slice(0, 10)
    .map(n => ({ name: n.label, connections: (n.val || 1) - 1 }));

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
