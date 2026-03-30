import React from 'react';
import { Loader2, MessageSquarePlus } from 'lucide-react';

import type { AssistantSessionRecord } from '@/src/services/assistant-runtime/sessionTypes';
import { translations, type Language } from '@/utils/translations';

interface AssistantSessionBarProps {
  sessions: AssistantSessionRecord[];
  activeSessionId: string | null;
  isLoading?: boolean;
  isCreating?: boolean;
  language?: Language;
  onCreateSession: () => Promise<unknown> | void;
  onSelectSession: (sessionId: string) => Promise<void> | void;
}

function formatTimestamp(value?: number): string | null {
  if (!value) {
    return null;
  }

  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return null;
  }
}

export const AssistantSessionBar: React.FC<AssistantSessionBarProps> = ({
  sessions,
  activeSessionId,
  isLoading = false,
  isCreating = false,
  language = 'en',
  onCreateSession,
  onSelectSession,
}) => {
  const threadCopy = translations[language].chatSessions;

  return (
    <div className="border-b border-violet-200/30 bg-slate-50/80 px-3 py-2 dark:border-violet-700/30 dark:bg-cyber-950/40">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {threadCopy.title}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {threadCopy.subtitle}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onCreateSession()}
          disabled={isLoading || isCreating}
          className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2 py-1 text-[11px] font-medium text-violet-600 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-700 dark:bg-cyber-900 dark:text-violet-300 dark:hover:bg-violet-900/30"
          aria-label={threadCopy.newThread}
        >
          {isCreating ? <Loader2 size={12} className="animate-spin" /> : <MessageSquarePlus size={12} />}
          {threadCopy.newThread}
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <div className="font-medium text-slate-700 dark:text-slate-200">
            {threadCopy.emptyTitle}
          </div>
          <div className="mt-1">
            {threadCopy.emptyBody}
          </div>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1" data-testid="assistant-session-list">
          {sessions.map(session => {
            const isActive = session.sessionId === activeSessionId;
            const lastTouched = formatTimestamp(session.lastMessageAt ?? session.updatedAt ?? session.startedAt);

            return (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => void onSelectSession(session.sessionId)}
                className={`min-w-[144px] rounded-xl border px-3 py-2 text-left transition ${isActive
                  ? 'border-violet-400 bg-violet-100/80 shadow-sm dark:border-violet-500 dark:bg-violet-900/30'
                  : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50 dark:border-slate-700 dark:bg-cyber-900/60 dark:hover:border-violet-700 dark:hover:bg-violet-900/20'
                  }`}
                aria-pressed={isActive}
                aria-label={`${session.title ?? session.sessionId}${isActive ? `, ${threadCopy.activeThread}` : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {session.title ?? session.sessionId}
                  </div>
                  {isActive && (
                    <span className="shrink-0 rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-600 dark:bg-violet-900/50 dark:text-violet-200">
                      {threadCopy.activeThread}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {session.status}
                </div>
                {lastTouched && (
                  <div className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">
                    {lastTouched}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
