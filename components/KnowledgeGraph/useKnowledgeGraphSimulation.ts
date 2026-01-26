import { useCallback, useEffect, useRef, type RefObject } from 'react';
import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
  zoomIdentity,
  type D3DragEvent,
  type D3ZoomEvent,
  type Selection,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
  type ZoomBehavior,
} from 'd3';
import type { GraphData, GraphLink, GraphNode, Theme } from '../../types';

export interface SelectedNode {
  id: string;
  label: string;
  group: number;
  val: number;
  connections: { label: string; type: 'source' | 'target' }[];
}

type D3GraphNode = GraphNode & SimulationNodeDatum;
type D3GraphLink = Omit<GraphLink, 'source' | 'target'> & SimulationLinkDatum<D3GraphNode>;

type GraphSelections = {
  nodes: D3GraphNode[];
  links: D3GraphLink[];
  linkSelection: Selection<SVGLineElement, D3GraphLink, SVGGElement, unknown> | null;
  nodeSelection: Selection<SVGGElement, D3GraphNode, SVGGElement, unknown> | null;
  zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null;
};

type UseKnowledgeGraphSimulationParams = {
  data: GraphData;
  theme: Theme;
  svgRef: RefObject<SVGSVGElement>;
  containerRef: RefObject<HTMLDivElement>;
  onNodeSelect: (node: SelectedNode) => void;
  onClearSelection: () => void;
  onNodeClick?: (nodeId: string) => void;
};

type UseKnowledgeGraphSimulationResult = {
  handleZoom: (factor: number) => void;
  handleReset: () => void;
  highlightNodeAtIndex: (index: number, highlight: boolean) => void;
  selectNodeByIndex: (index: number) => void;
  clearHighlights: () => void;
};

const createDefaultSelections = (): GraphSelections => ({
  nodes: [],
  links: [],
  linkSelection: null,
  nodeSelection: null,
  zoomBehavior: null,
});

const getColorValue = (cssVar: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (value && value.includes(' ')) {
    return `rgb(${value.split(' ').join(', ')})`;
  }
  return value || fallback;
};

const getNodeId = (value: D3GraphNode | string | number): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return value.id;
};

export const useKnowledgeGraphSimulation = (params: UseKnowledgeGraphSimulationParams): UseKnowledgeGraphSimulationResult => {
  const { data, theme, svgRef, containerRef, onNodeSelect, onClearSelection, onNodeClick } = params;
  const selectionsRef = useRef<GraphSelections>(createDefaultSelections());
  const onNodeClickRef = useRef(onNodeClick);
  const onNodeSelectRef = useRef(onNodeSelect);
  const onClearSelectionRef = useRef(onClearSelection);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    onNodeSelectRef.current = onNodeSelect;
  }, [onNodeSelect]);

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection;
  }, [onClearSelection]);

  const buildSelectedNode = useCallback((node: D3GraphNode): SelectedNode => {
    const connections: { label: string; type: 'source' | 'target' }[] = [];
    const { links, nodes } = selectionsRef.current;

    links.forEach(link => {
      const sourceId = getNodeId(link.source);
      const targetId = getNodeId(link.target);
      if (sourceId === node.id) {
        const targetNode = nodes.find(item => item.id === targetId);
        if (targetNode) connections.push({ label: targetNode.label, type: 'target' });
      }
      if (targetId === node.id) {
        const sourceNode = nodes.find(item => item.id === sourceId);
        if (sourceNode) connections.push({ label: sourceNode.label, type: 'source' });
      }
    });

    return {
      id: node.id,
      label: node.label,
      group: node.group ?? 0,
      val: node.val || 1,
      connections
    };
  }, []);

  const clearHighlights = useCallback(() => {
    // Intentionally no-op to preserve prior behavior.
  }, []);

  const highlightConnections = useCallback((node: D3GraphNode, highlight: boolean) => {
    const { links, linkSelection, nodeSelection } = selectionsRef.current;
    if (!linkSelection || !nodeSelection) return;

    const connectedNodeIds = new Set<string>();
    connectedNodeIds.add(node.id);

    links.forEach(link => {
      const sourceId = getNodeId(link.source);
      const targetId = getNodeId(link.target);
      if (sourceId === node.id) connectedNodeIds.add(targetId);
      if (targetId === node.id) connectedNodeIds.add(sourceId);
    });

    linkSelection
      .attr('stroke-opacity', link => {
        const sourceId = getNodeId(link.source);
        const targetId = getNodeId(link.target);
        if (!highlight) return 0.4;
        return (sourceId === node.id || targetId === node.id) ? 1 : 0.1;
      })
      .attr('stroke-width', link => {
        const sourceId = getNodeId(link.source);
        const targetId = getNodeId(link.target);
        if (!highlight) return 1.5;
        return (sourceId === node.id || targetId === node.id) ? 3 : 1;
      });

    nodeSelection.select('.node-circle')
      .attr('fill-opacity', item => {
        if (!highlight) return 0.9;
        return connectedNodeIds.has(item.id) ? 1 : 0.3;
      });

    nodeSelection.select('.node-glow')
      .attr('opacity', item => {
        if (!highlight) return 0.3;
        return connectedNodeIds.has(item.id) ? 0.5 : 0.1;
      });

    nodeSelection.select('text')
      .style('opacity', item => {
        if (!highlight) return 1;
        return connectedNodeIds.has(item.id) ? 1 : 0.3;
      });
  }, []);

  const highlightNodeAtIndex = useCallback((index: number, highlight: boolean) => {
    const node = selectionsRef.current.nodes[index];
    if (!node) return;
    highlightConnections(node, highlight);
  }, [highlightConnections]);

  const selectNodeByIndex = useCallback((index: number) => {
    const node = selectionsRef.current.nodes[index];
    if (!node) return;

    const selectedNode = buildSelectedNode(node);
    onNodeSelectRef.current(selectedNode);
    highlightConnections(node, true);
    onNodeClickRef.current?.(node.id);
  }, [buildSelectedNode, highlightConnections]);

  const handleZoom = useCallback((factor: number) => {
    if (!svgRef.current) return;
    const zoomBehavior = selectionsRef.current.zoomBehavior;
    if (!zoomBehavior) return;

    select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehavior.scaleBy, factor);
  }, [svgRef]);

  const handleReset = useCallback(() => {
    if (!svgRef.current) return;
    const zoomBehavior = selectionsRef.current.zoomBehavior;
    if (!zoomBehavior) return;

    select(svgRef.current)
      .transition()
      .duration(750)
      .call(zoomBehavior.transform, zoomIdentity);
  }, [svgRef]);

  useEffect(() => {
    if (!data || !data.nodes || data.nodes.length === 0 || !svgRef.current || !containerRef.current) {
      if (svgRef.current) {
        select(svgRef.current).selectAll('*').remove();
      }
      selectionsRef.current = createDefaultSelections();
      return;
    }

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const nodes: D3GraphNode[] = data.nodes.map(node => ({ ...node }));
    const links: D3GraphLink[] = data.links.map(link => ({ ...link }));

    selectionsRef.current.nodes = nodes;
    selectionsRef.current.links = links;

    const isDark = theme === 'dark';
    const primaryColor = getColorValue('--primary-500', '#06b6d4');
    const secondaryColor = getColorValue('--secondary-500', '#8b5cf6');
    const textColor = getColorValue('--text-primary', isDark ? '#f8fafc' : '#1e293b');
    const neutralColor = getColorValue('--neutral-500', '#64748b');
    const bgPanelColor = getColorValue('--bg-panel', isDark ? '#1e293b' : '#f1f5f9');

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    const simulation = forceSimulation<D3GraphNode>(nodes)
      .force('link', forceLink<D3GraphNode, D3GraphLink>(links).id(node => node.id).distance(120))
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<D3GraphNode>().radius(node => (node.val || 5) * 3 + 20).iterations(2))
      .alphaDecay(0.05);

    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', neutralColor)
      .style('opacity', 0.6);

    const linkSelection = g.append('g')
      .attr('class', 'links')
      .selectAll<SVGLineElement, D3GraphLink>('line')
      .data(links)
      .join('line')
      .attr('stroke', neutralColor)
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', 1.5);

    const nodeSelection = g.append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, D3GraphNode>('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        drag<SVGGElement, D3GraphNode>()
          .on('start', (event: D3DragEvent<SVGGElement, D3GraphNode, D3GraphNode>, node) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            node.fx = node.x;
            node.fy = node.y;
          })
          .on('drag', (event: D3DragEvent<SVGGElement, D3GraphNode, D3GraphNode>, node) => {
            node.fx = event.x;
            node.fy = event.y;
          })
          .on('end', (event: D3DragEvent<SVGGElement, D3GraphNode, D3GraphNode>, node) => {
            if (!event.active) simulation.alphaTarget(0);
            node.fx = null;
            node.fy = null;
          })
      );

    nodeSelection.append('circle')
      .attr('class', 'node-glow')
      .attr('r', node => 12 + Math.sqrt(node.val || 1) * 3)
      .attr('fill', node => (node.group ?? 0) === 1 ? secondaryColor : primaryColor)
      .attr('opacity', 0.3)
      .attr('filter', 'blur(4px)');

    nodeSelection.append('circle')
      .attr('class', 'node-circle')
      .attr('r', node => 8 + Math.sqrt(node.val || 1) * 3)
      .attr('fill', node => (node.group ?? 0) === 1 ? secondaryColor : primaryColor)
      .attr('stroke', bgPanelColor)
      .attr('stroke-width', 2)
      .attr('fill-opacity', 0.9);

    nodeSelection.append('text')
      .text(node => node.label)
      .attr('x', 14)
      .attr('y', 4)
      .style('font-family', 'Inter, sans-serif')
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', textColor)
      .style('pointer-events', 'none')
      .style('text-shadow', isDark ? '0 1px 4px rgba(0,0,0,0.9)' : '0 1px 4px rgba(255,255,255,0.9)')
      .style('opacity', 0)
      .transition()
      .duration(800)
      .style('opacity', 1);

    nodeSelection.on('mouseenter', (_, node) => {
      highlightConnections(node, true);
    }).on('mouseleave', (_, node) => {
      highlightConnections(node, false);
    });

    nodeSelection.on('click', (event: MouseEvent, node) => {
      event.stopPropagation();
      const selectedNode = buildSelectedNode(node);
      onNodeSelectRef.current(selectedNode);
      highlightConnections(node, true);
      onNodeClickRef.current?.(node.id);
    });

    svg.on('click', () => {
      onClearSelectionRef.current();
    });

    nodeSelection.append('title').text(node => node.label);

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', link => {
          const source = link.source;
          return typeof source === 'object' && source !== null ? source.x ?? 0 : 0;
        })
        .attr('y1', link => {
          const source = link.source;
          return typeof source === 'object' && source !== null ? source.y ?? 0 : 0;
        })
        .attr('x2', link => {
          const target = link.target;
          return typeof target === 'object' && target !== null ? target.x ?? 0 : 0;
        })
        .attr('y2', link => {
          const target = link.target;
          return typeof target === 'object' && target !== null ? target.y ?? 0 : 0;
        });

      nodeSelection.attr('transform', node => `translate(${node.x ?? 0},${node.y ?? 0})`);
    });

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoomBehavior);

    selectionsRef.current.linkSelection = linkSelection;
    selectionsRef.current.nodeSelection = nodeSelection;
    selectionsRef.current.zoomBehavior = zoomBehavior;

    return () => {
      simulation.stop();
    };
  }, [data, theme, svgRef, containerRef, buildSelectedNode, highlightConnections]);

  return {
    handleZoom,
    handleReset,
    highlightNodeAtIndex,
    selectNodeByIndex,
    clearHighlights,
  };
};
