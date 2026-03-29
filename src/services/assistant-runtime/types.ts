import type { AIConfig, JsonValue } from '@/types';
import type { Language } from '@/utils/translations';

export type AssistantSessionScope = 'notebook' | 'workspace' | 'channel' | 'automation';
export type AssistantSessionOrigin = 'app' | 'channel' | 'automation' | 'test';
export type AssistantCallerSurface = 'app-chat' | 'command' | 'automation' | 'channel';
export type AssistantCallerTransport = 'in-app' | 'ipc' | 'webhook' | 'cli' | 'job';
export type AssistantTransportChannel = 'electron-ipc' | 'http' | 'webhook' | 'cli' | 'internal';
export type AssistantContextAdapterKind = 'notebook' | 'workspace' | 'knowledge' | 'channel';
export type AssistantRuntimeLifecyclePhase =
  | 'queued'
  | 'assembling-context'
  | 'executing'
  | 'streaming'
  | 'completed'
  | 'cancelled';
export type AssistantRuntimeToolStatus = 'pending' | 'running' | 'success' | 'error';
export type AssistantRuntimeMediaStatus = 'pending' | 'processing' | 'ready' | 'error';
export type AssistantMediaKind = 'text' | 'image' | 'audio' | 'document' | 'selection';

export interface AssistantSessionRef {
  sessionId: string;
  threadId?: string;
  scope: AssistantSessionScope;
  origin: AssistantSessionOrigin;
  parentSessionId?: string;
}

export interface AssistantRuntimeCallerCapabilities {
  streaming: boolean;
  toolStatus: boolean;
  multimodalInput: boolean;
  structuredOutput?: boolean;
}

export interface AssistantRuntimeCaller {
  callerId: string;
  surface: AssistantCallerSurface;
  transport: AssistantCallerTransport;
  language: Language;
  capabilities: AssistantRuntimeCallerCapabilities;
  routeKey?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantNotebookAttachment {
  kind: 'file' | 'image' | 'audio' | 'document' | 'selection';
  fileId?: string;
  uri?: string;
  mimeType?: string;
  label?: string;
  metadata?: Record<string, JsonValue>;
}

// Notebook context begins here: callers pass notebook/workspace facts and optional
// attachments, while any rendered message arrays or component-owned UI state remain
// outside the runtime contract.
export interface AssistantNotebookContextInput {
  notebookId: string;
  workspaceId?: string;
  activeFileId?: string;
  selectedFileIds?: string[];
  selectedText?: string;
  noteIds?: string[];
  knowledgeQuery?: string;
  attachments?: AssistantNotebookAttachment[];
  metadata?: Record<string, JsonValue>;
}

export interface AssistantRuntimeInputMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantRuntimeInput {
  prompt: string;
  messages?: AssistantRuntimeInputMessage[];
  attachments?: AssistantNotebookAttachment[];
  instructions?: string[];
  locale?: Language;
}

export interface AssistantRuntimeTransportMetadata {
  channel: AssistantTransportChannel;
  messageId?: string;
  correlationId?: string;
  replyTarget?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantRuntimeRequest {
  requestId: string;
  session: AssistantSessionRef;
  caller: AssistantRuntimeCaller;
  modelConfig: AIConfig;
  input: AssistantRuntimeInput;
  notebook?: AssistantNotebookContextInput;
  transport?: AssistantRuntimeTransportMetadata;
}

export interface AssistantContextSection {
  id: string;
  label: string;
  content: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantContextPayload {
  source: AssistantContextAdapterKind;
  sections: AssistantContextSection[];
  metadata?: Record<string, JsonValue>;
}

export interface AssistantRuntimeInspectionSession {
  sessionId: string;
  scope: AssistantSessionScope;
  origin: AssistantSessionOrigin;
  threadId?: string;
  parentSessionId?: string;
  routeKey?: string;
  callerId?: string;
  surface?: AssistantCallerSurface;
  transport?: AssistantCallerTransport;
}

export interface AssistantRuntimeInspectionLifecycle {
  phase: AssistantRuntimeLifecyclePhase;
  detail?: string;
}

export interface AssistantRuntimeInspectionStreaming {
  streamed: boolean;
  deltaCount: number;
  accumulatedTextLength: number;
  lastDelta?: string;
}

export interface AssistantRuntimeInspectionContextSection {
  id: string;
  label: string;
  source: AssistantContextAdapterKind;
  preview: string;
  charCount: number;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantRuntimeInspectionContext {
  adapterIds: string[];
  sources: AssistantContextAdapterKind[];
  sectionCount: number;
  sections: AssistantRuntimeInspectionContextSection[];
}

export interface AssistantRuntimeInspectionMetadata {
  requestId: string;
  session: AssistantRuntimeInspectionSession;
  lifecycle: AssistantRuntimeInspectionLifecycle;
  streaming: AssistantRuntimeInspectionStreaming;
  context: AssistantRuntimeInspectionContext;
}

export interface AssistantContextAdapter {
  adapterId: string;
  kind: AssistantContextAdapterKind;
  assemble: (
    input: AssistantNotebookContextInput,
    request?: Pick<AssistantRuntimeRequest, 'session' | 'caller' | 'input'>,
  ) => Promise<AssistantContextPayload> | AssistantContextPayload;
}

export interface AssistantRuntimeError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, JsonValue>;
}

export interface AssistantRuntimeToolInvocation {
  toolCallId: string;
  toolName: string;
  status: AssistantRuntimeToolStatus;
  result?: JsonValue;
  error?: AssistantRuntimeError;
}

export interface AssistantRuntimeResult {
  status: 'success' | 'error' | 'cancelled';
  sessionId: string;
  outputText: string;
  completedAt: number;
  toolCalls?: AssistantRuntimeToolInvocation[];
  error?: AssistantRuntimeError;
  inspection?: AssistantRuntimeInspectionMetadata;
  metadata?: Record<string, JsonValue>;
}

interface AssistantRuntimeEventBase {
  requestId: string;
  sessionId: string;
  timestamp: number;
  inspection?: AssistantRuntimeInspectionMetadata;
}

export interface AssistantRuntimeLifecycleEvent extends AssistantRuntimeEventBase {
  type: 'lifecycle';
  phase: AssistantRuntimeLifecyclePhase;
  detail?: string;
}

export interface AssistantRuntimeStreamDeltaEvent extends AssistantRuntimeEventBase {
  type: 'stream-delta';
  delta: string;
  accumulatedText: string;
}

export interface AssistantRuntimeToolStatusEvent extends AssistantRuntimeEventBase {
  type: 'tool-status';
  toolCallId: string;
  toolName: string;
  status: AssistantRuntimeToolStatus;
  detail?: string;
  result?: JsonValue;
  error?: AssistantRuntimeError;
}

export interface AssistantRuntimeResultEvent extends AssistantRuntimeEventBase {
  type: 'result';
  result: AssistantRuntimeResult;
}

export interface AssistantRuntimeErrorEvent extends AssistantRuntimeEventBase {
  type: 'error';
  error: AssistantRuntimeError;
}

export interface AssistantRuntimeMediaStatusEvent extends AssistantRuntimeEventBase {
  type: 'media-status';
  mediaId: string;
  kind: AssistantMediaKind;
  status: AssistantRuntimeMediaStatus;
  detail?: string;
  error?: AssistantRuntimeError;
  metadata?: Record<string, JsonValue>;
}

export type AssistantRuntimeEvent =
  | AssistantRuntimeLifecycleEvent
  | AssistantRuntimeStreamDeltaEvent
  | AssistantRuntimeToolStatusEvent
  | AssistantRuntimeResultEvent
  | AssistantRuntimeErrorEvent
  | AssistantRuntimeMediaStatusEvent;
