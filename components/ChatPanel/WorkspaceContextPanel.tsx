import React from 'react';

import type { AssistantContextScope } from '@/src/app/hooks/useAppWorkspaceState';
import { translations, type Language } from '@/utils/translations';

interface WorkspaceContextPanelProps {
  workspaceContext: {
    activeFileId?: string;
    selectedFileIds: string[];
    selectedText?: string;
  };
  activeFileName?: string;
  contextScope: AssistantContextScope;
  includeSelectedText: boolean;
  onContextScopeChange: (scope: AssistantContextScope) => void;
  onIncludeSelectedTextChange: (value: boolean) => void;
  language?: Language;
}

const SELECTED_TEXT_PREVIEW_LIMIT = 160;

function buildSelectedTextPreview(selectedText?: string): string | null {
  if (!selectedText) {
    return null;
  }

  const normalized = selectedText.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return null;
  }

  return normalized.length <= SELECTED_TEXT_PREVIEW_LIMIT
    ? normalized
    : `${normalized.slice(0, SELECTED_TEXT_PREVIEW_LIMIT - 1)}…`;
}

export function WorkspaceContextPanel({
  workspaceContext,
  activeFileName,
  contextScope,
  includeSelectedText,
  onContextScopeChange,
  onIncludeSelectedTextChange,
  language = 'en',
}: WorkspaceContextPanelProps) {
  const t = translations[language];
  const activeNoteLabel = activeFileName ?? workspaceContext.activeFileId ?? t.chatContext.noActiveNote;
  const selectedFileCount = workspaceContext.selectedFileIds.length;
  const selectedTextPreview = buildSelectedTextPreview(workspaceContext.selectedText);
  const scopeSummary = contextScope === 'focused-note'
    ? t.chatContext.focusedNoteOnly
    : t.chatContext.openPanes;
  const selectedTextSummary = selectedTextPreview
    ? includeSelectedText
      ? t.chatContext.highlightedTextIncluded
      : t.chatContext.highlightedTextExcluded
    : t.chatContext.noHighlightedText;

  return (
    <section
      aria-label={t.chatContext.workspaceContext}
      className="border-b border-violet-200/30 bg-violet-50/70 px-3 py-3 dark:border-violet-700/30 dark:bg-violet-950/20"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500 dark:text-violet-300">
            {t.chatContext.workspaceContext}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {t.chatContext.workspaceContextHint}
          </p>
        </div>
        <span className="rounded-full border border-violet-200/70 bg-white px-2 py-1 text-[11px] font-medium text-violet-600 dark:border-violet-700 dark:bg-cyber-900 dark:text-violet-300">
          {selectedFileCount} {selectedFileCount === 1 ? t.chatContext.noteCountSingle : t.chatContext.noteCountPlural}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-paper-200 bg-white/90 px-3 py-2 dark:border-cyber-700 dark:bg-cyber-900/70">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t.chatContext.activeNote}
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {activeNoteLabel}
          </dd>
        </div>
        <div className="rounded-xl border border-paper-200 bg-white/90 px-3 py-2 dark:border-cyber-700 dark:bg-cyber-900/70">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t.chatContext.scope}
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {scopeSummary}
          </dd>
        </div>
        <div className="rounded-xl border border-paper-200 bg-white/90 px-3 py-2 dark:border-cyber-700 dark:bg-cyber-900/70">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t.chatContext.selectedText}
          </dt>
          <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
            {selectedTextSummary}
          </dd>
        </div>
      </dl>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {t.chatContext.scope}
        </legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-paper-200 bg-white/90 px-3 py-2 text-sm text-slate-700 transition hover:border-violet-300 dark:border-cyber-700 dark:bg-cyber-900/70 dark:text-slate-200">
            <input
              type="radio"
              name="workspace-context-scope"
              checked={contextScope === 'focused-note'}
              onChange={() => onContextScopeChange('focused-note')}
              className="h-4 w-4 text-violet-500"
            />
            <span>{t.chatContext.focusedNoteOnly}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-paper-200 bg-white/90 px-3 py-2 text-sm text-slate-700 transition hover:border-violet-300 dark:border-cyber-700 dark:bg-cyber-900/70 dark:text-slate-200">
            <input
              type="radio"
              name="workspace-context-scope"
              checked={contextScope === 'open-panes'}
              onChange={() => onContextScopeChange('open-panes')}
              className="h-4 w-4 text-violet-500"
            />
            <span>{t.chatContext.openPanes}</span>
          </label>
        </div>
      </fieldset>

      <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-paper-200 bg-white/90 px-3 py-2 text-sm text-slate-700 transition hover:border-violet-300 dark:border-cyber-700 dark:bg-cyber-900/70 dark:text-slate-200">
        <input
          type="checkbox"
          checked={includeSelectedText}
          onChange={(event) => onIncludeSelectedTextChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-violet-500"
        />
        <span>{t.chatContext.includeHighlightedText}</span>
      </label>

      {selectedTextPreview && (
        <div className="mt-3 rounded-xl border border-dashed border-violet-300/70 bg-white/80 px-3 py-2 dark:border-violet-700 dark:bg-cyber-900/60">
          <p className="text-[11px] font-medium uppercase tracking-wide text-violet-500 dark:text-violet-300">
            {t.chatContext.selectedText}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
            {selectedTextPreview}
          </p>
        </div>
      )}
    </section>
  );
}
