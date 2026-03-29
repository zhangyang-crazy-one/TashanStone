import type { JsonValue } from '@/types';

import type {
  AssistantMediaKind,
  AssistantNotebookAttachment,
  AssistantRuntimeError,
  AssistantRuntimeMediaStatus,
  AssistantRuntimeToolStatus,
  AssistantTransportChannel,
} from './types';

export const ASSISTANT_TOOL_EXECUTION_STATUSES = ['pending', 'running', 'success', 'error'] as const;
export const ASSISTANT_MEDIA_STATUSES = ['pending', 'processing', 'ready', 'error'] as const;
export const ASSISTANT_DELIVERY_MODES = ['single', 'chunked', 'batched'] as const;
export const ASSISTANT_DELIVERY_UNIT_KINDS = ['message', 'tool-status', 'media-status'] as const;
export const ASSISTANT_DELIVERY_UNIT_STATUSES = ['pending', 'ready', 'sent', 'error'] as const;

export type AssistantToolExecutionSource = 'builtin' | 'provider' | 'knowledge' | 'mcp' | 'automation';
export type AssistantToolExecutionVisibility = 'hidden' | 'status' | 'inline';
export type AssistantMediaRole = 'input' | 'context' | 'generated';
export type AssistantDeliveryMode = (typeof ASSISTANT_DELIVERY_MODES)[number];
export type AssistantDeliveryUnitKind = (typeof ASSISTANT_DELIVERY_UNIT_KINDS)[number];
export type AssistantDeliveryUnitStatus = (typeof ASSISTANT_DELIVERY_UNIT_STATUSES)[number];

interface AssistantMediaPartBase {
  partId: string;
  kind: AssistantMediaKind;
  role: AssistantMediaRole;
  label?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantTextMediaPart extends AssistantMediaPartBase {
  kind: 'text';
  text: string;
}

export interface AssistantSelectionMediaPart extends AssistantMediaPartBase {
  kind: 'selection';
  text: string;
  attachment?: AssistantNotebookAttachment;
}

export interface AssistantBinaryMediaPart extends AssistantMediaPartBase {
  kind: 'image' | 'audio' | 'document';
  mimeType?: string;
  uri?: string;
  extractedText?: string;
  attachment?: AssistantNotebookAttachment;
}

export type AssistantNormalizedMediaPart =
  | AssistantTextMediaPart
  | AssistantSelectionMediaPart
  | AssistantBinaryMediaPart;

export interface AssistantNormalizedMediaEnvelope {
  parts: AssistantNormalizedMediaPart[];
  primaryText?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantToolExecutionRequest {
  executionId: string;
  toolCallId: string;
  toolName: string;
  sessionId: string;
  callerId: string;
  transport: AssistantTransportChannel;
  arguments: Record<string, JsonValue>;
  media: AssistantNormalizedMediaPart[];
  source?: AssistantToolExecutionSource;
  visibility?: AssistantToolExecutionVisibility;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantToolExecutionResult {
  executionId: string;
  toolCallId: string;
  toolName: string;
  status: AssistantRuntimeToolStatus;
  result?: JsonValue;
  error?: AssistantRuntimeError;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantMediaStatusRecord {
  mediaId: string;
  kind: AssistantMediaKind;
  status: AssistantRuntimeMediaStatus;
  detail?: string;
  error?: AssistantRuntimeError;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantDeliveryTarget {
  transport?: AssistantTransportChannel;
  routeKey?: string;
  replyTarget?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantDeliveryPolicy {
  policyId: string;
  mode: AssistantDeliveryMode;
  maxChunkCharacters?: number;
  preserveMarkdown: boolean;
  emitToolStatus: boolean;
  emitMediaStatus: boolean;
  target?: AssistantDeliveryTarget;
  metadata?: Record<string, JsonValue>;
}

export interface AssistantDeliveryUnit {
  unitId: string;
  policyId: string;
  kind: AssistantDeliveryUnitKind;
  sequence: number;
  status: AssistantDeliveryUnitStatus;
  content: string;
  toolCallId?: string;
  mediaId?: string;
  target?: AssistantDeliveryTarget;
  metadata?: Record<string, JsonValue>;
}
