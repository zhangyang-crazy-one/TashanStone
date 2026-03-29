import React from 'react';
import { Loader2, MessageSquarePlus } from 'lucide-react';

import type { AssistantSessionRecord } from '@/src/services/assistant-runtime/sessionTypes';
import type { Language } from '@/utils/translations';

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
  const sessionLabel = language === 'zh' ? '会话' : 'Sessions';
  const createLabel = language === 'zh' ? '新建会话' : 'New Session';
  const emptyLabel = language === 'zh' ? '暂无可用会话' : 'No assistant sessions yet';

  return (
    <div className="border-b border-violet-200/30 bg-slate-50/80 px-3 py-2 dark:border-violet-700/30 dark:bg-cyber-950/40">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {sessionLabel}
        </div>
        <button
          type="button"
          onClick={() => void onCreateSession()}
          disabled={isLoading || isCreating}
          className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2 py-1 text-[11px] font-medium text-violet-600 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-violet-700 dark:bg-cyber-900 dark:text-violet-300 dark:hover:bg-violet-900/30"
          aria-label={createLabel}
        >
          {isCreating ? <Loader2 size={12} className="animate-spin" /> : <MessageSquarePlus size={12} />}
          {createLabel}
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyLabel}
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
                aria-label={`${session.title ?? session.sessionId}${isActive ? language === 'zh' ? '，当前会话' : ', active session' : ''}`}
              >
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {session.title ?? session.sessionId}
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
