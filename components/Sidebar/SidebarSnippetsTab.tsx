import React from 'react';

import type { Snippet } from '../../types';

type SnippetTranslations = {
  templates?: string;
  clickToInsert?: string;
  mySnippets?: string;
  defaultTemplates?: string;
  codeCategory?: string;
  textCategory?: string;
  wikiLinkCategory?: string;
  templateCategory?: string;
} & Record<string, unknown>;

interface SidebarSnippetsTabProps {
  snippets: Snippet[];
  onInsertSnippet?: (content: string) => void;
  t: SnippetTranslations;
}

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: 'wikilink-plain', name: 'File Link', category: 'wikilink', content: '[[{filename}]]\n' },
  { id: 'wikilink-alias', name: 'Link with Alias', category: 'wikilink', content: '[[{filename}|{alias}]]\n' },
  { id: 'wikilink-block', name: 'Block Reference', category: 'wikilink', content: '(((filename#line)))\n' },
  { id: 'tag', name: 'Tag', category: 'wikilink', content: '#[tag-name]\n' },
  { id: 'tbl', name: 'Table', category: 'template', content: '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n' },
  { id: 'math', name: 'Math Block', category: 'code', content: '$$\n  \\int_0^\\infty x^2 dx\n$$\n' },
  { id: 'mermaid', name: 'Mermaid Diagram', category: 'code', content: '```mermaid\ngraph TD;\n    A-->B;\n    A-->C;\n```\n' },
  { id: 'todo', name: 'Task List', category: 'template', content: '- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n' },
  { id: 'js', name: 'JS Code Block', category: 'code', content: '```javascript\nconsole.log("Hello, World!");\n```\n' },
  { id: 'callout', name: 'Callout', category: 'template', content: '> [!NOTE]\n> This is a note callout\n' },
  { id: 'link', name: 'Link Reference', category: 'text', content: '[Link Text](https://example.com "Title")\n' },
  { id: 'img', name: 'Image', category: 'template', content: '![Alt Text](image-url.png "Image Title")\n' },
];

export const SidebarSnippetsTab: React.FC<SidebarSnippetsTabProps> = ({
  snippets,
  onInsertSnippet,
  t
}) => {
  return (
    <>
      <div className="mb-3">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
          {t.templates || 'Templates'}
        </h3>
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          {t.clickToInsert || 'Click to insert into editor'}
        </p>
      </div>

      {snippets && snippets.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-2">
            {t.mySnippets || 'My Snippets'}
          </h4>
          <div className="space-y-1.5 mb-4">
            {snippets.map(snippet => (
              <div
                key={snippet.id}
                onClick={() => onInsertSnippet?.(snippet.content)}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-900/20 hover:border-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-all cursor-pointer"
              >
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 bg-cyan-100 dark:bg-cyan-800/50 text-cyan-700 dark:text-cyan-300">
                  {snippet.category || 'custom'}
                </span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                  {snippet.name}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h4 className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">
        {t.defaultTemplates || 'Default Templates'}
      </h4>
      <div className="space-y-1.5">
        {DEFAULT_SNIPPETS.map(snippet => {
          const snippetKey = `snippet_${snippet.id}`;
          const translatedName = typeof t[snippetKey] === 'string' ? t[snippetKey] : snippet.name;

          return (
            <div
              key={snippet.id}
              onClick={() => onInsertSnippet?.(snippet.content)}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-paper-200 dark:border-cyber-700 bg-white dark:bg-cyber-900/50 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all cursor-pointer"
            >
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${snippet.category === 'code' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                  snippet.category === 'text' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                    snippet.category === 'wikilink' ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' :
                      'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                }`}>
                {snippet.category === 'code' ? t.codeCategory || 'code' :
                  snippet.category === 'text' ? t.textCategory || 'text' :
                    snippet.category === 'wikilink' ? t.wikiLinkCategory || 'wikilink' :
                      t.templateCategory || 'template'}
              </span>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                {translatedName}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
};
