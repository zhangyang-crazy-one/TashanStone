import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components, type Options as ReactMarkdownOptions } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { FileCode } from 'lucide-react';

import type { MarkdownFile } from '../types';
import { generateSlug } from '../utils/slug';
import { translations, Language } from '../utils/translations';
import { BlockReferencePreview } from './Preview/BlockReferencePreview';
import { EnhancedImage } from './Preview/EnhancedImage';
import { rehypeBlockReferences, rehypeFilterAttributes, rehypeSkipMermaid, rehypeTags, rehypeWikiLinks } from './Preview/markdownPlugins';
import { extractText } from './Preview/markdownUtils';
import { createEnhancedCodeBlock } from './Preview/PreviewCodeBlock';
import { TagPreview } from './Preview/TagPreview';
import { WikiLinkPreview } from './Preview/WikiLinkPreview';

interface PreviewProps {
  content: string;
  initialScrollRatio?: number;
  files?: MarkdownFile[];
  language?: Language;
}

interface WikiLinkNodeProps {
  'data-target'?: string;
  'data-alias'?: string;
  children?: React.ReactNode;
}

interface BlockRefNodeProps {
  'data-target'?: string;
  'data-start-line'?: number | string;
  'data-end-line'?: number | string;
}

interface HashTagNodeProps {
  'data-tag'?: string;
}

interface PreviewComponents extends Components {
  wikilink?: React.FC<WikiLinkNodeProps>;
  blockref?: React.FC<BlockRefNodeProps>;
  hashtag?: React.FC<HashTagNodeProps>;
}

const LARGE_CONTENT_THRESHOLD = 120000;

export const Preview: React.FC<PreviewProps> = ({ content, initialScrollRatio, files = [], language = 'en' }) => {
  const [renderHtml, setRenderHtml] = useState(false);
  const [forceFullRender, setForceFullRender] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const t = translations[language];
  const deferredContent = useDeferredValue(content);
  const isLargeContent = content.length > LARGE_CONTENT_THRESHOLD;
  const enableFullPreview = !isLargeContent || forceFullRender;

  const hasHtml = useMemo(() => {
    return /<[a-z]+(\s+[^>]*)?\/?>/i.test(content) || /<\/[a-z]+>/i.test(content);
  }, [content]);

  const allowHtml = renderHtml && enableFullPreview;

  const codeBlock = useMemo(
    () => createEnhancedCodeBlock(allowHtml, {
      copyCode: t.tooltips?.copyCode || 'Copy code',
      toggleWrap: t.tooltips?.toggleWordWrap || 'Toggle Word Wrap'
    }, {
      enableMermaid: enableFullPreview
    }),
    [allowHtml, enableFullPreview, t.tooltips?.copyCode, t.tooltips?.toggleWordWrap]
  );

  const markdownComponents = useMemo<PreviewComponents>(() => ({
    pre: ({ children }) => <>{children}</>,
    code: codeBlock,
    img: EnhancedImage,
    input: ({ type, checked, ...props }) => {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={Boolean(checked)}
            readOnly
            {...props}
          />
        );
      }
      return <input type={type} {...props} />;
    },
    h1: ({ children, ...props }) => {
      const text = extractText(children);
      const id = `heading-${generateSlug(text)}`;
      return <h1 id={id} {...props}>{children}</h1>;
    },
    h2: ({ children, ...props }) => {
      const text = extractText(children);
      const id = `heading-${generateSlug(text)}`;
      return <h2 id={id} {...props}>{children}</h2>;
    },
    h3: ({ children, ...props }) => {
      const text = extractText(children);
      const id = `heading-${generateSlug(text)}`;
      return <h3 id={id} {...props}>{children}</h3>;
    },
    h4: ({ children, ...props }) => {
      const text = extractText(children);
      const id = `heading-${generateSlug(text)}`;
      return <h4 id={id} {...props}>{children}</h4>;
    },
    h5: ({ children, ...props }) => {
      const text = extractText(children);
      const id = `heading-${generateSlug(text)}`;
      return <h5 id={id} {...props}>{children}</h5>;
    },
    h6: ({ children, ...props }) => {
      const text = extractText(children);
      const id = `heading-${generateSlug(text)}`;
      return <h6 id={id} {...props}>{children}</h6>;
    },
    wikilink: ({ 'data-target': target, 'data-alias': alias, children }) => {
      const linkText = extractText(children);
      const resolvedTarget = target || linkText;
      return (
        <WikiLinkPreview
          target={resolvedTarget}
          alias={alias || linkText}
          files={files}
          onNavigate={(targetValue) => {
            window.dispatchEvent(new CustomEvent('navigate-to-wikilink', { detail: { target: targetValue } }));
          }}
        />
      );
    },
    blockref: ({ 'data-target': target, 'data-start-line': startLine, 'data-end-line': endLine }) => {
      if (!target) return null;
      const startValue = typeof startLine === 'number' ? startLine : parseInt(startLine ?? '', 10);
      if (Number.isNaN(startValue)) return null;
      const endValue = typeof endLine === 'number'
        ? endLine
        : endLine
          ? parseInt(endLine, 10)
          : undefined;
      return (
        <BlockReferencePreview
          target={target}
          startLine={startValue}
          endLine={endValue}
          files={files}
        />
      );
    },
    hashtag: ({ 'data-tag': tag }) => {
      if (!tag) return null;
      const tooltipText = t.tooltips?.filterByTag
        ? t.tooltips.filterByTag.replace('{tag}', tag)
        : `Click to filter by #${tag}`;
      return <TagPreview tag={tag} tooltipText={tooltipText} />;
    },
  }), [codeBlock, files, t.tooltips?.filterByTag]);

  const rehypePlugins = useMemo(() => {
    const plugins: NonNullable<ReactMarkdownOptions['rehypePlugins']> = [];

    if (allowHtml) {
      plugins.push(rehypeRaw, rehypeFilterAttributes);
    }

    if (enableFullPreview) {
      plugins.push(
        rehypeBlockReferences(files),
        rehypeWikiLinks,
        rehypeTags,
        rehypeSkipMermaid,
        [rehypeHighlight, { ignoreMissing: true, detect: false }],
        rehypeKatex
      );
    }

    return plugins;
  }, [allowHtml, enableFullPreview, files]);

  useEffect(() => {
    if (initialScrollRatio !== undefined && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          const { scrollHeight, clientHeight } = scrollContainerRef.current;
          const maxScroll = scrollHeight - clientHeight;
          const targetScroll = maxScroll * initialScrollRatio;
          scrollContainerRef.current.scrollTop = targetScroll;
        }
      });
    }
  }, [initialScrollRatio]);

  return (
    <div data-testid="preview" className="flex-1 h-full min-h-0 w-full bg-paper-50 dark:bg-cyber-900 relative flex flex-col transition-colors duration-300">
      {hasHtml && enableFullPreview && (
        <div className="absolute top-4 right-6 z-20 flex items-center gap-2 bg-white/90 dark:bg-cyber-800/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-paper-200 dark:border-cyber-700 animate-fadeIn">
          <FileCode size={14} className="text-cyan-600 dark:text-cyan-400" />
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2 select-none">
            Render HTML
            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ${renderHtml ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${renderHtml ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <input
              type="checkbox"
              checked={renderHtml}
              onChange={(e) => setRenderHtml(e.target.checked)}
              className="hidden"
            />
          </label>
        </div>
      )}

      {isLargeContent && (
        <div className="absolute top-4 left-6 z-20 flex items-center gap-3 bg-white/90 dark:bg-cyber-800/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm border border-paper-200 dark:border-cyber-700 animate-fadeIn">
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {enableFullPreview
              ? (t.previewLargeContentFull || 'Large document detected. Full preview is enabled.')
              : (t.previewLargeContent || 'Large document detected. Preview is in performance mode.')}
          </span>
          <button
            onClick={() => setForceFullRender(prev => !prev)}
            className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300"
          >
            {enableFullPreview
              ? (t.previewUsePerformance || 'Use performance mode')
              : (t.previewRenderFull || 'Render full preview')}
          </button>
        </div>
      )}

      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-8 custom-scrollbar">
        <div className="prose prose-lg max-w-none dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {deferredContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};
