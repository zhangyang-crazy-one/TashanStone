import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, AlertTriangle, Download } from 'lucide-react';
import {
  hierarchy,
  select,
  tree,
  zoom,
  zoomIdentity,
  type HierarchyPointLink,
  type HierarchyPointNode,
  type ZoomBehavior,
} from 'd3';
import { Theme } from '../types';
import Tooltip from './Tooltip';
import { translations, Language } from '../utils/translations';

interface MindMapProps {
  content: string;
  theme: Theme;
  language?: Language;
}

interface MindMapNode {
  id: string;
  label: string;
  children: MindMapNode[];
  summary?: string;
}

interface MindMapLine {
  text: string;
  isSummary: boolean;
}

interface MindMapLayoutNode {
  id: string;
  label: string;
  lines: MindMapLine[];
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isRoot: boolean;
  isLeft: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
  badgeShape?: BadgeShape;
  isGhost?: boolean;
  fill: string;
  stroke: string;
  textColor: string;
  fontSize: number;
  summaryFontSize: number;
}

interface MindMapLayoutLink {
  id: string;
  path: string;
  depth: number;
  color: string;
  isGhost?: boolean;
}

interface MindMapLayout {
  nodes: MindMapLayoutNode[];
  links: MindMapLayoutLink[];
  width: number;
  height: number;
  initialScale: number;
}

const CHILD_PALETTE = [
  { fill: '#15803d', stroke: '#14532d', text: '#ffffff' },
  { fill: '#7e22ce', stroke: '#581c87', text: '#ffffff' },
  { fill: '#1d4ed8', stroke: '#1e3a8a', text: '#ffffff' },
  { fill: '#0f766e', stroke: '#115e59', text: '#ffffff' },
  { fill: '#ca8a04', stroke: '#a16207', text: '#0f172a' },
];

const ROOT_STYLE = {
  fill: '#ea580c',
  stroke: '#9a3412',
  text: '#ffffff',
};

type BadgeShape = 'circle' | 'diamond' | 'triangle' | 'square' | 'hex';

const BADGE_SHAPES: BadgeShape[] = ['circle', 'diamond', 'triangle', 'square', 'hex'];

const clampChannel = (value: number): number => Math.min(255, Math.max(0, value));

const parseHex = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
};

const mixColor = (base: string, target: number, amount: number): string => {
  const rgb = parseHex(base);
  if (!rgb) return base;
  const r = clampChannel(Math.round(rgb.r + (target - rgb.r) * amount));
  const g = clampChannel(Math.round(rgb.g + (target - rgb.g) * amount));
  const b = clampChannel(Math.round(rgb.b + (target - rgb.b) * amount));
  return `rgb(${r}, ${g}, ${b})`;
};

const getGradientStops = (base: string, isDark: boolean): { start: string; end: string } => {
  const lighten = isDark ? 0.35 : 0.22;
  const darken = isDark ? 0.25 : 0.15;
  return {
    start: mixColor(base, 255, lighten),
    end: mixColor(base, 0, darken),
  };
};

const gradientIdForColor = (color: string): string => `mindmap-branch-${color.replace('#', '')}`;

const renderBadgeGlyph = (shape: BadgeShape, color: string) => {
  switch (shape) {
    case 'circle':
      return <circle r={4.5} fill={color} />;
    case 'diamond':
      return <path d="M0 -5 L5 0 L0 5 L-5 0 Z" fill={color} />;
    case 'triangle':
      return <path d="M0 -5 L5 4 L-5 4 Z" fill={color} />;
    case 'square':
      return <rect x={-4} y={-4} width={8} height={8} fill={color} rx={1.5} />;
    case 'hex':
      return <path d="M-4 -2 L0 -5 L4 -2 L4 2 L0 5 L-4 2 Z" fill={color} />;
    default:
      return null;
  }
};

const parseLabelParts = (value: string): { title: string; summary?: string } => {
  let label = value.trim();
  if (label.startsWith('((') && label.endsWith('))')) {
    label = label.slice(2, -2).trim();
  } else if (label.startsWith('(') && label.endsWith(')')) {
    label = label.slice(1, -1).trim();
  } else if (label.startsWith('[') && label.endsWith(']')) {
    label = label.slice(1, -1).trim();
  } else if (label.startsWith('{') && label.endsWith('}')) {
    label = label.slice(1, -1).trim();
  }
  const trimmed = label.trim();
  const parts = trimmed.split(' | ').map(part => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { title: trimmed };
  }
  return {
    title: parts[0],
    summary: parts.slice(1).join(' | ')
  };
};

const parseMindmap = (content: string): MindMapNode | null => {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex(line => line.trim() === 'mindmap');
  if (startIndex === -1) return null;

  let baseIndent: number | null = null;
  const stack: Array<{ level: number; node: MindMapNode }> = [];
  let root: MindMapNode | null = null;

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const indentMatch = rawLine.match(/^\s*/);
    const indent = (indentMatch?.[0] ?? '').replace(/\t/g, '  ').length;
    if (baseIndent === null) baseIndent = indent;

    const level = Math.max(0, Math.floor((indent - baseIndent) / 2));
    const { title, summary } = parseLabelParts(rawLine.trim());
    if (!title) continue;

    const node: MindMapNode = {
      id: `mindmap-${i}-${level}`,
      label: title,
      summary,
      children: [],
    };

    if (!root) {
      root = node;
      stack.push({ level, node });
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.node.children.push(node);
    } else {
      root.children.push(node);
    }

    stack.push({ level, node });
  }

  return root;
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const estimateFontSize = (depth: number): number => (depth === 0 ? 18 : depth === 1 ? 13 : 12);

const getNodePadding = (depth: number): { x: number; y: number } => {
  if (depth === 0) return { x: 28, y: 18 };
  if (depth === 1) return { x: 22, y: 14 };
  return { x: 18, y: 12 };
};

const estimateNodeWidth = (label: string, summary: string | undefined, depth: number, paddingX: number): number => {
  const fontSize = estimateFontSize(depth);
  const minWidth = depth === 0 ? 200 : depth === 1 ? 150 : 120;
  const maxWidth = depth === 0 ? 420 : depth === 1 ? 340 : 300;
  const maxLength = Math.max(label.length, summary?.length ?? 0);
  const textWidth = maxLength * (fontSize * 0.62);
  return clamp(textWidth + paddingX * 2, minWidth, maxWidth);
};

const wrapText = (label: string, maxChars: number): string[] => {
  if (label.length <= maxChars) return [label];
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const chunks: string[] = [];
    for (let i = 0; i < label.length; i += maxChars) {
      chunks.push(label.slice(i, i + maxChars));
    }
    return chunks;
  }

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const buildNodeLines = (label: string, summary: string | undefined, maxChars: number): MindMapLine[] => {
  const titleLines = wrapText(label, maxChars).map(text => ({ text, isSummary: false }));
  if (!summary) return titleLines;
  const summaryLines = wrapText(summary, maxChars).map(text => ({ text, isSummary: true }));
  return [...titleLines, ...summaryLines];
};

const buildLinkPath = (source: { x: number; y: number }, target: { x: number; y: number }): string => {
  const dx = target.x - source.x;
  const curvature = Math.min(160, Math.max(80, Math.abs(dx) * 0.5));
  const cx1 = source.x + Math.sign(dx || 1) * curvature;
  const cx2 = target.x - Math.sign(dx || 1) * curvature;
  return `M${source.x},${source.y} C${cx1},${source.y} ${cx2},${target.y} ${target.x},${target.y}`;
};

const collectChildCounts = (node: MindMapNode, map: Map<string, number>): void => {
  map.set(node.id, node.children.length);
  node.children.forEach(child => collectChildCounts(child, map));
};

const buildVisibleTree = (node: MindMapNode, collapsedNodes: ReadonlySet<string>): MindMapNode => {
  const shouldCollapse = collapsedNodes.has(node.id);
  return {
    id: node.id,
    label: node.label,
    summary: node.summary,
    children: shouldCollapse ? [] : node.children.map(child => buildVisibleTree(child, collapsedNodes)),
  };
};

const buildLayout = (rootNode: MindMapNode, width: number, height: number, collapsedNodes: ReadonlySet<string>): MindMapLayout => {
  const childCounts = new Map<string, number>();
  collectChildCounts(rootNode, childCounts);

  const visibleRoot = buildVisibleTree(rootNode, collapsedNodes);
  const rootChildren = visibleRoot.children ?? [];
  const leftChildren: MindMapNode[] = [];
  const rightChildren: MindMapNode[] = [];

  rootChildren.forEach((child, index) => {
    if (index % 2 === 0) {
      rightChildren.push(child);
    } else {
      leftChildren.push(child);
    }
  });

  const branchPalette = new Map<string, { fill: string; stroke: string; text: string }>();
  const branchOrder = new Map<string, number>();
  rootChildren.forEach((child, index) => {
    branchPalette.set(child.id, CHILD_PALETTE[index % CHILD_PALETTE.length]);
    branchOrder.set(child.id, index);
  });

  const metrics: Record<string, { width: number; height: number; lines: MindMapLine[]; fontSize: number; summaryFontSize: number }> = {};
  const measureNode = (node: MindMapNode, depth: number) => {
    const fontSize = estimateFontSize(depth);
    const summaryFontSize = Math.max(10, fontSize - 2);
    const padding = getNodePadding(depth);
    const widthEstimate = estimateNodeWidth(node.label, node.summary, depth, padding.x);
    const contentWidth = Math.max(1, widthEstimate - padding.x * 2);
    const maxChars = Math.max(6, Math.floor(contentWidth / (fontSize * 0.62)));
    const lines = buildNodeLines(node.label, node.summary, maxChars);
    const baseHeight = depth === 0 ? 68 : depth === 1 ? 52 : 44;
    const totalTextHeight = lines.reduce((sum, line) => {
      const lineHeight = line.isSummary ? summaryFontSize + 4 : fontSize + 5;
      return sum + lineHeight;
    }, 0);
    const heightEstimate = Math.max(baseHeight, totalTextHeight + padding.y * 2);
    metrics[node.id] = { width: widthEstimate, height: heightEstimate, lines, fontSize, summaryFontSize };
    node.children.forEach(child => measureNode(child, depth + 1));
  };

  measureNode(visibleRoot, 0);

  const maxWidth = Object.values(metrics).reduce((max, item) => Math.max(max, item.width), 0);
  const maxHeight = Object.values(metrics).reduce((max, item) => Math.max(max, item.height), 0);
  const nodeSizeX = maxHeight + 28;
  const nodeSizeY = maxWidth + 120;

  const layoutTree = tree<MindMapNode>().nodeSize([nodeSizeX, nodeSizeY]);

  const buildSide = (children: MindMapNode[]) => {
    if (!children.length) return { nodes: [] as HierarchyPointNode<MindMapNode>[], links: [] as HierarchyPointLink<MindMapNode>[] };
    const sideRoot: MindMapNode = {
      id: visibleRoot.id,
      label: visibleRoot.label,
      children,
    };
    const root = layoutTree(hierarchy(sideRoot));
    return {
      nodes: root.descendants().filter(node => node.depth > 0),
      links: root.links().filter(link => link.target.depth > 0)
    };
  };

  const leftLayout = buildSide(leftChildren);
  const rightLayout = buildSide(rightChildren);

  const allNodes: MindMapLayoutNode[] = [];
  const allLinks: MindMapLayoutLink[] = [];

  const rootMetrics = metrics[visibleRoot.id];
  allNodes.push({
    id: visibleRoot.id,
    label: visibleRoot.label,
    lines: rootMetrics.lines,
    depth: 0,
    x: 0,
    y: 0,
    width: rootMetrics.width,
    height: rootMetrics.height,
    isRoot: true,
    isLeft: false,
    hasChildren: (childCounts.get(visibleRoot.id) ?? 0) > 0,
    isCollapsed: collapsedNodes.has(visibleRoot.id),
    fill: ROOT_STYLE.fill,
    stroke: ROOT_STYLE.stroke,
    textColor: ROOT_STYLE.text,
    fontSize: rootMetrics.fontSize,
    summaryFontSize: rootMetrics.summaryFontSize,
  });

  const addSideNodes = (nodes: HierarchyPointNode<MindMapNode>[], links: HierarchyPointLink<MindMapNode>[], direction: 'left' | 'right') => {
    const sign = direction === 'left' ? -1 : 1;

    const getBranchId = (node: HierarchyPointNode<MindMapNode>): string => {
      if (node.depth <= 1) return node.data.id;
      let current = node;
      while (current.parent && current.parent.depth > 1) {
        current = current.parent;
      }
      return current.data.id;
    };

    nodes.forEach(node => {
      const metricsForNode = metrics[node.data.id];
      const branchId = getBranchId(node);
      const palette = branchPalette.get(branchId) || CHILD_PALETTE[0];
      const branchIndex = branchOrder.get(branchId) ?? 0;
      const badgeShape = node.depth === 1 ? BADGE_SHAPES[branchIndex % BADGE_SHAPES.length] : undefined;
      const hasChildren = (childCounts.get(node.data.id) ?? 0) > 0;

      allNodes.push({
        id: node.data.id,
        label: node.data.label,
        lines: metricsForNode.lines,
        depth: node.depth,
        x: sign * node.y,
        y: node.x,
        width: metricsForNode.width,
        height: metricsForNode.height,
        isRoot: false,
        isLeft: direction === 'left',
        hasChildren,
        isCollapsed: collapsedNodes.has(node.data.id),
        badgeShape,
        fill: palette.fill,
        stroke: palette.stroke,
        textColor: palette.text,
        fontSize: metricsForNode.fontSize,
        summaryFontSize: metricsForNode.summaryFontSize,
      });
    });

    links.forEach(link => {
      const source = link.source.depth === 0
        ? { x: 0, y: 0 }
        : { x: sign * link.source.y, y: link.source.x };
      const target = { x: sign * link.target.y, y: link.target.x };
      const branchId = getBranchId(link.target);
      const palette = branchPalette.get(branchId) || CHILD_PALETTE[0];
      allLinks.push({
        id: `${link.source.data.id}-${link.target.data.id}`,
        path: buildLinkPath(source, target),
        depth: link.target.depth,
        color: palette.fill,
      });
    });
  };

  addSideNodes(leftLayout.nodes, leftLayout.links, 'left');
  addSideNodes(rightLayout.nodes, rightLayout.links, 'right');

  const extent = allNodes.reduce(
    (acc, node) => {
      acc.minX = Math.min(acc.minX, node.x - node.width / 2);
      acc.maxX = Math.max(acc.maxX, node.x + node.width / 2);
      acc.minY = Math.min(acc.minY, node.y - node.height / 2);
      acc.maxY = Math.max(acc.maxY, node.y + node.height / 2);
      return acc;
    },
    { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  );

  const padding = 80;
  const contentWidth = Math.max(1, extent.maxX - extent.minX + padding * 2);
  const contentHeight = Math.max(1, extent.maxY - extent.minY + padding * 2);
  const scale = Math.min(width / contentWidth, height / contentHeight, 1);

  return {
    nodes: allNodes,
    links: allLinks,
    width,
    height,
    initialScale: scale,
  };
};

const toCssRgb = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return 'rgb(15, 23, 42)';
  if (trimmed.includes(' ')) {
    return `rgb(${trimmed.split(' ').join(', ')})`;
  }
  return trimmed;
};

export const MindMap: React.FC<MindMapProps> = ({ content, theme, language = 'en' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomLayerRef = useRef<SVGGElement>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const previousLayoutRef = useRef<MindMapLayout | null>(null);
  const [layout, setLayout] = useState<MindMapLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [ghostNodes, setGhostNodes] = useState<MindMapLayoutNode[]>([]);
  const [ghostLinks, setGhostLinks] = useState<MindMapLayoutLink[]>([]);
  const [transitionLayout, setTransitionLayout] = useState<MindMapLayout | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const t = translations[language];
  const isDark = theme === 'dark';
  const displayLinks = layout ? [...ghostLinks, ...layout.links] : ghostLinks;
  const displayNodes = layout ? [...ghostNodes, ...layout.nodes] : ghostNodes;
  const linkColors = displayLinks.length > 0 ? Array.from(new Set(displayLinks.map(link => link.color))) : [];
  const gridLine = isDark ? 'rgba(var(--border-main),0.35)' : 'rgba(var(--border-main),0.18)';
  const vignette = isDark
    ? 'radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.9)_100%)'
    : 'radial-gradient(circle_at_center,rgba(255,255,255,0.92)_0%,rgba(226,232,240,0.75)_60%,rgba(148,163,184,0.35)_100%)';
  const previousNodesById = transitionLayout ? new Map(transitionLayout.nodes.map(node => [node.id, node])) : null;
  const previousLinksById = transitionLayout ? new Map(transitionLayout.links.map(link => [link.id, link])) : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        setViewport({
          width: Math.max(1, Math.floor(rect.width)),
          height: Math.max(1, Math.floor(rect.height))
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!content || viewport.width === 0 || viewport.height === 0) {
      setLayout(null);
      setError(null);
      return;
    }

    const parsed = parseMindmap(content);
    if (!parsed) {
      setLayout(null);
      setError('Invalid mindmap format');
      return;
    }

    setLayout(buildLayout(parsed, viewport.width, viewport.height, collapsedNodes));
    setError(null);
  }, [content, viewport.height, viewport.width, collapsedNodes]);

  useEffect(() => {
    setCollapsedNodes(new Set());
  }, [content]);

  useEffect(() => {
    if (!layout) {
      setGhostNodes([]);
      setGhostLinks([]);
      setTransitionLayout(null);
      return;
    }
    const prev = previousLayoutRef.current;
    previousLayoutRef.current = layout;
    if (!prev) {
      setGhostNodes([]);
      setGhostLinks([]);
      setTransitionLayout(null);
      return;
    }
    const currentNodeIds = new Set(layout.nodes.map(node => node.id));
    const currentLinkIds = new Set(layout.links.map(link => link.id));
    const removedNodes = prev.nodes
      .filter(node => !currentNodeIds.has(node.id))
      .map(node => ({ ...node, isGhost: true }));
    const removedLinks = prev.links
      .filter(link => !currentLinkIds.has(link.id))
      .map(link => ({ ...link, isGhost: true }));
    setGhostNodes(removedNodes);
    setGhostLinks(removedLinks);
    setTransitionLayout(prev);
    const timeoutId = window.setTimeout(() => {
      setGhostNodes([]);
      setGhostLinks([]);
      setTransitionLayout(null);
    }, 280);
    return () => window.clearTimeout(timeoutId);
  }, [layout]);

  useEffect(() => {
    const svg = svgRef.current;
    const zoomLayer = zoomLayerRef.current;
    if (!svg || !zoomLayer) return;

    const svgSelection = select(svg);
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', event => {
        select(zoomLayer).attr('transform', event.transform.toString());
        setScale(event.transform.k);
      });

    svgSelection.call(zoomBehavior);
    svgSelection.on('dblclick.zoom', null);
    zoomBehaviorRef.current = zoomBehavior;

    return () => {
      svgSelection.on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    if (!layout || !svgRef.current || !zoomBehaviorRef.current) return;
    const svgSelection = select(svgRef.current);
    const transform = zoomIdentity
      .translate(layout.width / 2, layout.height / 2)
      .scale(layout.initialScale);
    svgSelection.call(zoomBehaviorRef.current.transform, transform);
  }, [layout, content]);

  const handleZoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).call(zoomBehaviorRef.current.scaleBy, factor);
  }, []);

  const handleReset = useCallback(() => {
    if (!svgRef.current || !zoomBehaviorRef.current || !layout) return;
    const transform = zoomIdentity
      .translate(layout.width / 2, layout.height / 2)
      .scale(layout.initialScale);
    select(svgRef.current).call(zoomBehaviorRef.current.transform, transform);
  }, [layout]);

  const handleDownload = useCallback(() => {
    if (!svgRef.current || !layout) return;

    const svgEl = svgRef.current;
    const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement;

    clonedSvg.setAttribute('width', layout.width.toString());
    clonedSvg.setAttribute('height', layout.height.toString());
    clonedSvg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);

    const computedStyle = getComputedStyle(document.documentElement);
    const bgRaw = computedStyle.getPropertyValue('--bg-main');
    const bgColor = toCssRgb(bgRaw || '15 23 42');

    const style = document.createElement('style');
    style.textContent = "text { font-family: 'Inter', sans-serif; }";
    clonedSvg.prepend(style);

    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', bgColor);

    if (clonedSvg.firstChild) {
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
    } else {
      clonedSvg.appendChild(bgRect);
    }

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(clonedSvg);

    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<?xml version="1.0" standalone="no"?>\r\n' + source)}`;
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'mindmap.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [layout]);

  return (
    <div className="w-full h-full min-w-0 min-h-0 bg-[rgb(var(--bg-main))] overflow-hidden relative group font-sans selection:bg-cyan-500/30">
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: vignette, opacity: 1 }}
      />

      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
        <Tooltip content={t.tooltips?.downloadSvg || 'Download SVG'}>
          <button
            onClick={handleDownload}
            className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200 transition-colors"
            aria-label={t.tooltips?.downloadSvg || 'Download SVG'}
          >
            <Download size={20} />
          </button>
        </Tooltip>
        <div className="h-px bg-slate-700 my-1"></div>
        <Tooltip content={t.tooltips?.zoomIn || 'Zoom In'}>
          <button
            onClick={() => handleZoomBy(1.2)}
            className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200"
            aria-label={t.tooltips?.zoomIn || 'Zoom In'}
          >
            <ZoomIn size={20} />
          </button>
        </Tooltip>
        <Tooltip content={t.tooltips?.resetView || 'Reset View'}>
          <button
            onClick={handleReset}
            className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200"
            aria-label={t.tooltips?.resetView || 'Reset View'}
          >
            <Maximize size={20} />
          </button>
        </Tooltip>
        <Tooltip content={t.tooltips?.zoomOut || 'Zoom Out'}>
          <button
            onClick={() => handleZoomBy(0.85)}
            className="p-2 bg-slate-800 rounded-lg shadow-lg border border-slate-700 hover:bg-slate-700 text-slate-200"
            aria-label={t.tooltips?.zoomOut || 'Zoom Out'}
          >
            <ZoomOut size={20} />
          </button>
        </Tooltip>
      </div>

      <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-black/50 backdrop-blur rounded text-xs font-mono text-slate-400 pointer-events-none border border-white/5">
        {Math.round(scale * 100)}% • {t.dragToPan}
      </div>

      <div ref={containerRef} className="w-full h-full relative z-10">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-red-500 p-8 text-center animate-fadeIn">
            <AlertTriangle size={48} className="mb-4" />
            <h3 className="font-bold text-lg">{t.mindMapError}</h3>
            <p className="opacity-80 mt-2 mb-4 text-sm max-w-md bg-red-900/20 p-2 rounded font-mono">{error}</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            width={layout?.width ?? 0}
            height={layout?.height ?? 0}
          >
            <defs>
              {linkColors.map(color => {
                const stops = getGradientStops(color, isDark);
                return (
                  <linearGradient key={color} id={gradientIdForColor(color)} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={stops.start} />
                    <stop offset="100%" stopColor={stops.end} />
                  </linearGradient>
                );
              })}
            </defs>
            <g ref={zoomLayerRef}>
              <g>
                {displayLinks.map(link => {
                  const isGhost = link.isGhost;
                  const previousLink = previousLinksById?.get(link.id);
                  return (
                    <path
                      key={`${link.id}-glow`}
                      d={link.path}
                      fill="none"
                      stroke={`url(#${gradientIdForColor(link.color)})`}
                      strokeWidth={link.depth === 1 ? 12 : link.depth === 2 ? 9 : 6}
                      strokeLinecap="round"
                      opacity={isGhost ? 1 : 0.18}
                      pointerEvents="none"
                    >
                      {isGhost && (
                        <animate attributeName="opacity" from="1" to="0" dur="0.24s" fill="freeze" />
                      )}
                      {!isGhost && previousLink && (
                        <animate
                          key={`${link.id}-glow-${link.path}`}
                          attributeName="d"
                          dur="0.28s"
                          fill="freeze"
                          from={previousLink.path}
                          to={link.path}
                        />
                      )}
                      {!isGhost && !previousLink && (
                        <animate attributeName="opacity" from="0" to="0.18" dur="0.2s" fill="freeze" />
                      )}
                    </path>
                  );
                })}
                {displayLinks.map(link => {
                  const isGhost = link.isGhost;
                  const previousLink = previousLinksById?.get(link.id);
                  return (
                    <path
                      key={link.id}
                      d={link.path}
                      fill="none"
                      stroke={`url(#${gradientIdForColor(link.color)})`}
                      strokeWidth={link.depth === 1 ? 5.5 : link.depth === 2 ? 3.8 : 2.6}
                      strokeLinecap="round"
                      opacity={isGhost ? 1 : 0.95}
                      pointerEvents="none"
                    >
                      {isGhost && (
                        <animate attributeName="opacity" from="1" to="0" dur="0.24s" fill="freeze" />
                      )}
                      {!isGhost && previousLink && (
                        <animate
                          key={`${link.id}-stroke-${link.path}`}
                          attributeName="d"
                          dur="0.28s"
                          fill="freeze"
                          from={previousLink.path}
                          to={link.path}
                        />
                      )}
                      {!isGhost && !previousLink && (
                        <animate attributeName="opacity" from="0" to="0.95" dur="0.2s" fill="freeze" />
                      )}
                    </path>
                  );
                })}
                {displayNodes.map(node => {
                  const badgeOffsetX = node.isLeft ? node.width / 2 + 18 : -node.width / 2 - 18;
                  const indicatorOffsetX = node.isLeft ? -node.width / 2 - 16 : node.width / 2 + 16;
                  const badgeGlyphColor = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.9)';
                  const indicatorColor = isDark ? 'rgba(226,232,240,0.9)' : 'rgba(15,23,42,0.8)';
                  const previousNode = previousNodesById?.get(node.id);
                  const isGhost = node.isGhost;
                  const allowToggle = node.hasChildren && !isGhost;
                  const lineHeights = node.lines.map(line =>
                    line.isSummary ? node.summaryFontSize + 4 : node.fontSize + 5
                  );
                  const totalHeight = lineHeights.reduce((sum, value) => sum + value, 0);
                  const firstOffset = lineHeights.length > 0 ? -totalHeight / 2 + lineHeights[0] / 2 : 0;
                  const cornerRadius = Math.min(node.height / 2, node.isRoot ? 22 : node.depth === 1 ? 18 : 16);
                  return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onClick={(event) => {
                      if (!allowToggle) return;
                      if (event.defaultPrevented) return;
                      event.stopPropagation();
                      setCollapsedNodes(prev => {
                        const next = new Set(prev);
                        if (next.has(node.id)) {
                          next.delete(node.id);
                        } else {
                          next.add(node.id);
                        }
                        return next;
                      });
                    }}
                    style={{ cursor: allowToggle ? 'pointer' : 'default' }}
                    pointerEvents={isGhost ? 'none' : 'auto'}
                  >
                    {previousNode && !isGhost && (previousNode.x !== node.x || previousNode.y !== node.y) && (
                      <animateTransform
                        key={`${node.id}-move-${node.x}-${node.y}`}
                        attributeName="transform"
                        type="translate"
                        dur="0.28s"
                        fill="freeze"
                        from={`${previousNode.x} ${previousNode.y}`}
                        to={`${node.x} ${node.y}`}
                      />
                    )}
                    {!previousNode && !isGhost && (
                      <animate attributeName="opacity" from="0" to="1" dur="0.2s" fill="freeze" />
                    )}
                    {isGhost && (
                      <animate attributeName="opacity" from="1" to="0" dur="0.24s" fill="freeze" />
                    )}
                    <rect
                      x={-node.width / 2}
                      y={-node.height / 2}
                      width={node.width}
                      height={node.height}
                      rx={cornerRadius}
                      ry={cornerRadius}
                      fill={node.fill}
                      stroke={node.stroke}
                      strokeWidth={node.isRoot ? 2 : 1}
                      opacity={node.isRoot ? 0.98 : 0.94}
                      style={{ filter: isDark ? 'drop-shadow(0 10px 18px rgba(0,0,0,0.35))' : 'drop-shadow(0 8px 14px rgba(15,23,42,0.18))' }}
                    />
                    {node.badgeShape && (
                      <g transform={`translate(${badgeOffsetX}, 0)`}>
                        <circle
                          r={12}
                          fill={node.fill}
                          stroke={node.stroke}
                          strokeWidth={1.2}
                          opacity={0.95}
                        />
                        {renderBadgeGlyph(node.badgeShape, badgeGlyphColor)}
                      </g>
                    )}
                    {node.hasChildren && (
                      <g transform={`translate(${indicatorOffsetX}, 0)`}>
                        <circle
                          r={9}
                          fill={isDark ? 'rgba(15,23,42,0.75)' : 'rgba(248,250,252,0.9)'}
                          stroke={indicatorColor}
                          strokeWidth={1.2}
                        />
                        <line x1={-4} y1={0} x2={4} y2={0} stroke={indicatorColor} strokeWidth={1.4} strokeLinecap="round" />
                        {node.isCollapsed && (
                          <line x1={0} y1={-4} x2={0} y2={4} stroke={indicatorColor} strokeWidth={1.4} strokeLinecap="round" />
                        )}
                      </g>
                    )}
                    <text
                      fill={node.textColor}
                      fontSize={node.fontSize}
                      fontWeight={node.isRoot ? 700 : 600}
                      textAnchor="middle"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {node.lines.map((line, index) => {
                        const dy = index === 0 ? firstOffset : lineHeights[index];
                        return (
                          <tspan
                            key={`${node.id}-line-${index}`}
                            x={0}
                            dy={dy}
                            fontSize={line.isSummary ? node.summaryFontSize : node.fontSize}
                            fillOpacity={line.isSummary ? (isDark ? 0.72 : 0.7) : 1}
                          >
                            {line.text}
                          </tspan>
                        );
                      })}
                    </text>
                  </g>
                )})}
              </g>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
};
