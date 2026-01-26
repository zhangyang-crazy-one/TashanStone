import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, hoverTooltip, Tooltip, keymap } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

import { extractWikiLinks } from '@/src/types/wiki';
import { findFileByWikiLinkTarget } from '@/src/services/wiki/wikiLinkService';

// Custom keymap for link insertion shortcuts (CodeMirror 6 format)
export const linkInsertKeymap = keymap.of([
  {
    key: 'Ctrl-Alt-k',
    run: () => {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'insert_wikilink' }));
      return true;
    }
  },
  {
    key: 'Ctrl-Alt-Shift-k',
    run: () => {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'insert_blockref' }));
      return true;
    }
  },
  {
    key: 'Ctrl-Alt-l',
    run: () => {
      window.dispatchEvent(new CustomEvent('editor-action', { detail: 'quick_link' }));
      return true;
    }
  }
]);

const wikiLinkDecoration = Decoration.mark({
  class: 'wikilink-highlight',
  attributes: {
    style: 'color: rgb(var(--primary-600)); font-weight: 500; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px;'
  }
});

const wikiLinkNotFoundDecoration = Decoration.mark({
  class: 'wikilink-not-found',
  attributes: {
    style: 'color: rgb(var(--secondary-500)); font-weight: 500; opacity: 0.7;'
  }
});

const createWikiLinkHoverTooltip = (files: Array<{ id: string; name: string; path?: string; content?: string }>) => {
  return hoverTooltip((view, pos) => {
    const { from, to } = view.state.doc.lineAt(pos);
    const lineStart = from;
    const lineEnd = to;
    const lineContent = view.state.doc.sliceString(lineStart, lineEnd);

    const links = extractWikiLinks(lineContent);
    for (const link of links) {
      const linkStart = lineStart + link.position.start;
      const linkEnd = lineStart + link.position.end;

      if (pos >= linkStart && pos <= linkEnd) {
        const target = link.target;
        const targetFile = findFileByWikiLinkTarget(target, files);

        if (targetFile) {
          const previewContent = targetFile.content?.slice(0, 200) || 'No preview available';

          const coords = view.coordsAtPos(pos);
          const spaceAbove = coords ? coords.top : 0;
          const spaceBelow = coords ? window.innerHeight - coords.bottom : 0;
          const above = coords ? spaceAbove > spaceBelow : true;

          const tooltip: Tooltip = {
            pos: linkStart,
            end: linkEnd,
            above,
            arrow: true,
            create: () => {
              const dom = document.createElement('div');
              dom.className = 'wikilink-tooltip-container';
              dom.innerHTML = `
                <div class="bg-white/95 dark:bg-cyber-900/95 backdrop-blur-xl border border-cyan-200 dark:border-cyan-800 rounded-lg shadow-xl overflow-hidden p-3 max-w-xs">
                  <div class="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-cyan-500">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <span class="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">${targetFile.name}</span>
                  </div>
                  <div class="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    ${previewContent}${targetFile.content?.length > 200 ? '...' : ''}
                  </div>
                </div>
              `;
              return { dom };
            }
          };

          return tooltip;
        }
      }
    }

    return null;
  });
};

const createWikiLinkPlugin = (files: Array<{ id: string; name: string; path?: string; content?: string }>) => {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.getDecorations(view);
    }

    getDecorations(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const content = view.state.doc.toString();
      const links = extractWikiLinks(content);

      for (const link of links) {
        const from = link.position.start;
        const to = link.position.end;

        const target = link.target;
        const exists = files.some(f => findFileByWikiLinkTarget(target, [f]) !== undefined);

        const decoration = exists ? wikiLinkDecoration : wikiLinkNotFoundDecoration;
        builder.add(from, to, decoration);
      }

      return builder.finish();
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.getDecorations(update.view);
      }
    }
  }, {
    decorations: v => v.decorations
  });
};

export const getWikiLinkExtensions = (files: Array<{ id: string; name: string; path?: string; content?: string }>) => {
  return [
    createWikiLinkPlugin(files),
    createWikiLinkHoverTooltip(files),
    EditorView.theme({
      '&': {
        height: '100%',
        fontSize: '14px'
      },
      '.cm-scroller': {
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
        lineHeight: '1.75',
        overflow: 'auto',
        paddingBottom: '50vh' // Allow scrolling past end
      },
      '.cm-content': {
        padding: '32px',
        caretColor: 'rgb(var(--primary-500))'
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'rgb(var(--primary-500))'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgba(var(--primary-500), 0.15)'
      },
      '.wikilink-highlight': {
        color: 'rgb(var(--primary-600))',
        fontWeight: '500',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '2px',
        cursor: 'pointer'
      },
      '.wikilink-not-found': {
        color: 'rgb(var(--secondary-500))',
        fontWeight: '500',
        opacity: '0.7',
        cursor: 'not-allowed'
      },
      '.cm-tooltip': {
        border: 'none',
        backgroundColor: 'transparent',
        boxShadow: 'none'
      },
      '.cm-tooltip-arrow': {
        display: 'none'
      },
      '.cm-tooltip-below': {
        transform: 'translateY(-8px)'
      },
      '.wikilink-tooltip-container': {
        padding: '0'
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: 'none',
        color: 'rgb(var(--text-secondary))',
        opacity: '0.5'
      }
    })
  ];
};
