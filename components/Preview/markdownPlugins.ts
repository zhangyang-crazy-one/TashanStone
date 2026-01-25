import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

import type { MarkdownFile } from '../../types';

interface HastBase extends Node {
  type: string;
  [key: string]: unknown;
}

interface HastParent extends HastBase {
  children: HastNode[];
}

interface HastElement extends HastParent {
  type: 'element';
  tagName: string;
  properties?: Record<string, unknown>;
}

interface HastText extends HastBase {
  type: 'text';
  value?: string;
}

type HastNode = HastElement | HastText | HastParent | HastBase;

const isElement = (node: HastNode): node is HastElement => node.type === 'element';
const isText = (node: HastNode): node is HastText => node.type === 'text';
const isParent = (node: HastNode | null | undefined): node is HastParent =>
  Boolean(node && Array.isArray((node as HastParent).children));

const getClassList = (className: unknown): string[] => {
  if (Array.isArray(className)) {
    return className.filter((value): value is string => typeof value === 'string');
  }
  if (typeof className === 'string') {
    return [className];
  }
  return [];
};

const addTextNode = (nodes: HastNode[], value: string) => {
  nodes.push({ type: 'text', value });
};

// --- Rehype Plugin to skip mermaid code blocks from highlighting ---
// This prevents rehype-highlight from processing mermaid blocks
export const rehypeSkipMermaid = () => {
  return (tree: HastNode) => {
    visit(tree, 'element', (node) => {
      if (!isElement(node as HastNode)) return;
      const element = node as HastElement;
      const classes = getClassList(element.properties?.className);
      if (element.tagName === 'code' && classes.some((c) => c === 'language-mermaid' || c === 'mermaid')) {
        const properties = element.properties ?? {};
        properties['data-no-highlight'] = true;
        element.properties = properties;
      }
    });
  };
};

// --- Rehype Plugin to filter dangerous HTML attributes ---
// Removes event handlers (onclick, onmouseover, etc.) and contentEditable
export const rehypeFilterAttributes = () => {
  return (tree: HastNode) => {
    visit(tree, 'element', (node) => {
      if (!isElement(node as HastNode)) return;
      const element = node as HastElement;
      if (!element.properties) return;
      const properties = element.properties;
      const dangerousAttrs = Object.keys(properties).filter((attr) => {
        const lowerAttr = attr.toLowerCase();
        if (lowerAttr.startsWith('on')) return true;
        if (lowerAttr === 'contenteditable') return true;
        return false;
      });
      for (const attr of dangerousAttrs) {
        delete properties[attr];
      }
    });
  };
};

// --- Rehype Plugin to transform Block References ---
// Transforms <<PageName:LineNumber>> or (((PageName#LineNumber))) into custom elements
export const rehypeBlockReferences = (_files: MarkdownFile[]) => {
  return () => (tree: HastNode) => {
    if (!tree || typeof tree !== 'object') return;

    try {
      visit(tree, 'text', (node, index, parent) => {
        const hastNode = node as HastNode;
        if (!isText(hastNode) || typeof hastNode.value !== 'string') return;
        if (!isParent(parent as HastNode) || typeof index !== 'number') return;

        const blockRefRegex = /(?:<<\{?([^:}]+)\}?:\{?(\d+)\}?(?:-\{?(\d+)\}?)?>>(?!>)|\(\(\(([^#)]+)#(\d+)(?:-(\d+))?\)\)\))/g;
        const matches = [...hastNode.value.matchAll(blockRefRegex)];
        if (matches.length === 0) return;

        const children: HastNode[] = [];
        let lastIndex = 0;

        for (const match of matches) {
          if (typeof match.index === 'number' && match.index > lastIndex) {
            addTextNode(children, hastNode.value.slice(lastIndex, match.index));
          }

          const target = (match[1] || match[4])?.trim();
          const startLine = parseInt(match[2] || match[5], 10);
          const endLine = match[3]
            ? parseInt(match[3], 10)
            : match[6]
              ? parseInt(match[6], 10)
              : startLine;

          if (target && !Number.isNaN(startLine)) {
            children.push({
              type: 'element',
              tagName: 'blockref',
              properties: {
                'data-target': target,
                'data-start-line': startLine,
                'data-end-line': endLine
              },
              children: [
                {
                  type: 'text',
                  value: `${target}#${startLine}${endLine > startLine ? `-${endLine}` : ''}`
                }
              ]
            });
          }

          if (typeof match.index === 'number') {
            lastIndex = match.index + match[0].length;
          }
        }

        if (lastIndex < hastNode.value.length) {
          addTextNode(children, hastNode.value.slice(lastIndex));
        }

        const parentNode = parent as HastParent;
        parentNode.children.splice(index, 1, ...children);
      });
    } catch (e) {
      // Silently ignore tree traversal errors
    }
  };
};

// --- Rehype Plugin to transform WikiLinks ---
// Transforms [[Link]] or [[Link|Alias]] into custom elements with data-wikilink attribute
export const rehypeWikiLinks = () => {
  return (tree: HastNode) => {
    if (!tree || typeof tree !== 'object') return;

    try {
      visit(tree, 'text', (node, index, parent) => {
        const hastNode = node as HastNode;
        if (!isText(hastNode) || typeof hastNode.value !== 'string') return;
        if (!isParent(parent as HastNode) || typeof index !== 'number') return;

        const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        const matches = [...hastNode.value.matchAll(wikiLinkRegex)];
        if (matches.length === 0) return;

        const children: HastNode[] = [];
        let lastIndex = 0;

        for (const match of matches) {
          if (typeof match.index === 'number' && match.index > lastIndex) {
            addTextNode(children, hastNode.value.slice(lastIndex, match.index));
          }

          const target = match[1].trim().replace(/^\{|\}$/g, '');
          const alias = match[2]?.trim().replace(/^\{|\}$/g, '');

          children.push({
            type: 'element',
            tagName: 'wikilink',
            properties: {
              'data-target': target,
              'data-alias': alias || target
            },
            children: [{ type: 'text', value: alias || target }]
          });

          if (typeof match.index === 'number') {
            lastIndex = match.index + match[0].length;
          }
        }

        if (lastIndex < hastNode.value.length) {
          addTextNode(children, hastNode.value.slice(lastIndex));
        }

        const parentNode = parent as HastParent;
        parentNode.children.splice(index, 1, ...children);
      });
    } catch (e) {
      // Silently ignore tree traversal errors
      console.warn('[Preview] WikiLink parsing error:', e);
    }
  };
};

// --- Rehype Plugin to transform Hashtags ---
// Transforms #[tag-name] into custom clickable/styled elements
export const rehypeTags = () => {
  return (tree: HastNode) => {
    if (!tree || typeof tree !== 'object') return;

    try {
      visit(tree, 'text', (node, index, parent) => {
        const hastNode = node as HastNode;
        if (!isText(hastNode) || typeof hastNode.value !== 'string') return;
        if (!isParent(parent as HastNode) || typeof index !== 'number') return;

        if (isElement(parent as HastNode) && ((parent as HastElement).tagName === 'code' || (parent as HastElement).tagName === 'pre')) {
          return;
        }

        const hashtagRegex = /#\[([^\]]+)\]/g;
        const matches = [...hastNode.value.matchAll(hashtagRegex)];
        if (matches.length === 0) return;

        const children: HastNode[] = [];
        let lastIndex = 0;

        for (const match of matches) {
          if (typeof match.index === 'number' && match.index > lastIndex) {
            addTextNode(children, hastNode.value.slice(lastIndex, match.index));
          }

          const tag = match[1];
          children.push({
            type: 'element',
            tagName: 'hashtag',
            properties: {
              'data-tag': tag
            },
            children: [{ type: 'text', value: `#[${tag}]` }]
          });

          if (typeof match.index === 'number') {
            lastIndex = match.index + match[0].length;
          }
        }

        if (lastIndex < hastNode.value.length) {
          addTextNode(children, hastNode.value.slice(lastIndex));
        }

        const parentNode = parent as HastParent;
        parentNode.children.splice(index, 1, ...children);
      });
    } catch (e) {
      // Silently ignore tree traversal errors
      console.warn('[Preview] Hashtag parsing error:', e);
    }
  };
};
