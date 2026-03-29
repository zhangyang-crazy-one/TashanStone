import React from 'react';

import type { AssistantRuntimeInspectionState } from '@/src/app/hooks/useAssistantRuntimeInspection';
import type { Language } from '@/utils/translations';

interface RuntimeInspectorPanelProps {
  inspection: AssistantRuntimeInspectionState;
  language?: Language;
}

interface FieldProps {
  label: string;
  value: string;
}

function Field({ label, value }: FieldProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-2 dark:border-slate-700 dark:bg-cyber-900/50">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-all text-xs text-slate-700 dark:text-slate-200">
        {value}
      </div>
    </div>
  );
}

export const RuntimeInspectorPanel: React.FC<RuntimeInspectorPanelProps> = ({
  inspection,
  language = 'en',
}) => {
  const labels = language === 'zh'
    ? {
        title: '运行检查',
        subtitle: '只读显示当前会话、执行阶段与上下文装配结果',
        idle: '尚未产生运行时事件',
        requestId: '请求',
        sessionId: '会话',
        threadId: '线程',
        routeKey: '路由',
        lifecycle: '阶段',
        transport: '传输',
        caller: '调用方',
        stream: '流式状态',
        adapters: '上下文适配器',
        noContext: '当前没有上下文分段',
        updatedAt: '更新时间',
      }
    : {
        title: 'Runtime Inspector',
        subtitle: 'Read-only visibility into session, lifecycle, and assembled context.',
        idle: 'No runtime activity yet.',
        requestId: 'Request',
        sessionId: 'Session',
        threadId: 'Thread',
        routeKey: 'Route',
        lifecycle: 'Lifecycle',
        transport: 'Transport',
        caller: 'Caller',
        stream: 'Streaming',
        adapters: 'Context Adapters',
        noContext: 'No context sections assembled yet.',
        updatedAt: 'Updated',
      };

  const updatedAt = inspection.updatedAt ? new Date(inspection.updatedAt).toLocaleString() : 'n/a';
  const streamSummary = inspection.streamed
    ? `${inspection.streamDeltaCount} deltas · ${inspection.accumulatedTextLength} chars`
    : inspection.lifecyclePhase === 'idle'
      ? 'idle'
      : 'not streaming';
  const adapterSummary = inspection.contextAdapterIds.length > 0
    ? inspection.contextAdapterIds.join(', ')
    : 'none';

  return (
    <div
      className="border-b border-cyan-200/40 bg-cyan-50/70 px-3 py-3 dark:border-cyan-800/50 dark:bg-cyan-950/20"
      data-testid="runtime-inspector-panel"
    >
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
          {labels.title}
        </div>
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          {labels.subtitle}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={labels.lifecycle} value={inspection.lifecycleDetail ? `${inspection.lifecyclePhase} · ${inspection.lifecycleDetail}` : inspection.lifecyclePhase} />
        <Field label={labels.stream} value={streamSummary} />
        <Field label={labels.sessionId} value={inspection.sessionId ?? labels.idle} />
        <Field label={labels.requestId} value={inspection.requestId ?? 'n/a'} />
        <Field label={labels.threadId} value={inspection.threadId ?? 'n/a'} />
        <Field label={labels.routeKey} value={inspection.routeKey ?? 'n/a'} />
        <Field label={labels.transport} value={inspection.transport ?? 'n/a'} />
        <Field label={labels.caller} value={inspection.callerId ?? 'n/a'} />
        <Field label={labels.adapters} value={adapterSummary} />
        <Field label={labels.updatedAt} value={updatedAt} />
      </div>

      <div className="mt-3 space-y-2">
        {inspection.contextSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cyan-200 px-3 py-2 text-xs text-slate-500 dark:border-cyan-800 dark:text-slate-400">
            {labels.noContext}
          </div>
        ) : (
          inspection.contextSections.map(section => (
            <div
              key={section.id}
              className="rounded-xl border border-cyan-200/60 bg-white/90 p-3 dark:border-cyan-800/70 dark:bg-cyber-900/70"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {section.label}
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">
                  {section.source}
                </div>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {section.charCount} chars
              </div>
              <div className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-2 py-2 text-xs text-slate-700 dark:bg-cyber-950/60 dark:text-slate-200">
                {section.preview}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
