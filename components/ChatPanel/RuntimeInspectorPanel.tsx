import React from 'react';

import type { AssistantRuntimeInspectionState } from '@/src/app/hooks/useAssistantRuntimeInspection';
import { translations, type Language } from '@/utils/translations';

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
  const labels = translations[language].chatRuntime;
  const isActive = ['queued', 'assembling-context', 'executing', 'streaming'].includes(inspection.lifecyclePhase);
  const updatedAt = inspection.updatedAt ? new Date(inspection.updatedAt).toLocaleString() : labels.notAvailable;
  const streamSummary = inspection.streamed
    ? `${inspection.streamDeltaCount} ${labels.deltaCountShort} · ${inspection.accumulatedTextLength} chars`
    : inspection.lifecyclePhase === 'idle'
      ? labels.idle
      : labels.notStreaming;
  const adapterSummary = inspection.contextAdapterIds.length > 0
    ? inspection.contextAdapterIds.join(', ')
    : labels.notAvailable;
  const lastDelta = inspection.streamed && inspection.lastDelta ? inspection.lastDelta : labels.noLastDelta;
  const showDeltaPill = inspection.streamDeltaCount > 0 || isActive;

  return (
    <div
      className="border-b border-cyan-200/40 bg-cyan-50/70 px-3 py-3 dark:border-cyan-800/50 dark:bg-cyan-950/20"
      data-testid="runtime-inspector-panel"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-300">
            {labels.liveRuntime}
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {labels.subtitle}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-700 dark:bg-cyber-900/70 dark:text-cyan-200">
            {inspection.lifecyclePhase}
          </span>
          {showDeltaPill && (
            <span className="rounded-full bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200">
              {inspection.streamDeltaCount} {labels.deltaCountShort}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label={labels.lifecycle} value={inspection.lifecycleDetail ? `${inspection.lifecyclePhase} · ${inspection.lifecycleDetail}` : inspection.lifecyclePhase} />
        <Field label={labels.stream} value={streamSummary} />
        <Field label={labels.lastDelta} value={lastDelta} />
        <Field label={labels.lastUpdate} value={updatedAt} />
        <Field label={labels.sessionId} value={inspection.sessionId ?? labels.notAvailable} />
        <Field label={labels.requestId} value={inspection.requestId ?? labels.notAvailable} />
        <Field label={labels.threadId} value={inspection.threadId ?? labels.notAvailable} />
        <Field label={labels.routeKey} value={inspection.routeKey ?? labels.notAvailable} />
        <Field label={labels.transport} value={inspection.transport ?? labels.notAvailable} />
        <Field label={labels.caller} value={inspection.callerId ?? labels.notAvailable} />
        <Field label={labels.adapters} value={adapterSummary} />
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
