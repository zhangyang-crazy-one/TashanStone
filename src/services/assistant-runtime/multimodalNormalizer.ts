import type { JsonValue } from '@/types';

import type { OcrResult } from '@/src/types/electronAPI';

import type { AssistantMediaStatusRecord, AssistantNormalizedMediaEnvelope } from './toolMediaContracts';
import type {
  AssistantMediaKind,
  AssistantNotebookAttachment,
  AssistantNotebookContextInput,
  AssistantRuntimeInput,
} from './types';

export interface AudioTranscriptionResult {
  success: boolean;
  text?: string;
  error?: string;
  language?: string;
  duration?: number;
}

export interface AssistantMultimodalNormalizerDependencies {
  recognizeImage?: (source: string) => Promise<OcrResult>;
  transcribeAudio?: (attachment: AssistantNotebookAttachment) => Promise<AudioTranscriptionResult>;
  createPartId?: (kind: AssistantMediaKind) => string;
}

export interface AssistantMultimodalNormalizationInput {
  input: AssistantRuntimeInput;
  notebook?: AssistantNotebookContextInput;
}

export interface AssistantMultimodalNormalizationOptions {
  onStatus?: (record: AssistantMediaStatusRecord) => void;
}

export interface AssistantMultimodalNormalizer {
  normalize: (
    payload: AssistantMultimodalNormalizationInput,
    options?: AssistantMultimodalNormalizationOptions,
  ) => Promise<AssistantNormalizedMediaEnvelope>;
}

const createDefaultPartId = (kind: AssistantMediaKind): string =>
  `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const extensionMimeMap: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const guessMimeType = (attachment: AssistantNotebookAttachment): string | undefined => {
  if (attachment.mimeType) {
    return attachment.mimeType;
  }

  const rawPath = typeof attachment.uri === 'string'
    ? attachment.uri
    : typeof attachment.metadata?.path === 'string'
      ? attachment.metadata.path
      : undefined;
  if (!rawPath) {
    return undefined;
  }

  const normalized = rawPath.toLowerCase();
  const entry = Object.entries(extensionMimeMap).find(([extension]) => normalized.endsWith(extension));
  return entry?.[1];
};

const resolveAttachmentKind = (attachment: AssistantNotebookAttachment): AssistantMediaKind => {
  if (attachment.kind !== 'file') {
    return attachment.kind;
  }

  const mimeType = guessMimeType(attachment);
  if (mimeType?.startsWith('image/')) {
    return 'image';
  }
  if (mimeType?.startsWith('audio/')) {
    return 'audio';
  }

  return 'document';
};

const emitStatus = (
  onStatus: AssistantMultimodalNormalizationOptions['onStatus'],
  mediaId: string,
  kind: AssistantMediaKind,
  status: AssistantMediaStatusRecord['status'],
  detail?: string,
  metadata?: Record<string, JsonValue>,
  error?: AssistantMediaStatusRecord['error'],
) => {
  onStatus?.({
    mediaId,
    kind,
    status,
    detail,
    metadata,
    error,
  });
};

const getAttachmentSource = (attachment: AssistantNotebookAttachment): string | undefined => {
  if (typeof attachment.metadata?.dataUrl === 'string') {
    return attachment.metadata.dataUrl;
  }
  if (typeof attachment.uri === 'string') {
    return attachment.uri;
  }
  if (typeof attachment.metadata?.path === 'string') {
    return attachment.metadata.path;
  }
  return undefined;
};

export function createMultimodalNormalizer(
  dependencies: AssistantMultimodalNormalizerDependencies = {},
): AssistantMultimodalNormalizer {
  const createPartId = dependencies.createPartId ?? createDefaultPartId;

  return {
    async normalize({ input, notebook }, options = {}) {
      const parts: AssistantNormalizedMediaEnvelope['parts'] = [];
      const prompt = input.prompt.trim();

      if (prompt) {
        parts.push({
          partId: createPartId('text'),
          kind: 'text',
          role: 'input',
          text: prompt,
        });
      }

      if (notebook?.selectedText?.trim()) {
        parts.push({
          partId: createPartId('selection'),
          kind: 'selection',
          role: 'context',
          text: notebook.selectedText.trim(),
          attachment: {
            kind: 'selection',
            label: 'Notebook Selection',
          },
        });
      }

      const attachments = [
        ...(notebook?.attachments ?? []),
        ...(input.attachments ?? []),
      ];

      for (const attachment of attachments) {
        const kind = resolveAttachmentKind(attachment);
        const partId = createPartId(kind);
        const mimeType = guessMimeType(attachment);
        const uri = typeof attachment.uri === 'string' ? attachment.uri : undefined;
        const metadata: Record<string, JsonValue> = {
          ...(attachment.metadata ?? {}),
        };

        if (kind === 'image' || kind === 'document') {
          emitStatus(options.onStatus, partId, kind, 'processing', `Extracting ${kind} text`, metadata);
          let extractedText: string | undefined;
          const source = getAttachmentSource(attachment);

          if (source && dependencies.recognizeImage) {
            const ocrResult = await dependencies.recognizeImage(source);
            if (ocrResult.success) {
              extractedText = ocrResult.text;
              emitStatus(options.onStatus, partId, kind, 'ready', `${kind} text extracted`, {
                ...metadata,
                backend: ocrResult.backend ?? null,
              });
            } else {
              emitStatus(
                options.onStatus,
                partId,
                kind,
                'error',
                ocrResult.error ?? `Failed to extract ${kind} text`,
                metadata,
                {
                  code: 'MEDIA_EXTRACTION_FAILED',
                  message: ocrResult.error ?? `Failed to extract ${kind} text`,
                  retryable: false,
                },
              );
            }
          } else {
            emitStatus(options.onStatus, partId, kind, 'ready', `No extraction required for ${kind}`, metadata);
          }

          parts.push({
            partId,
            kind,
            role: 'input',
            label: attachment.label,
            mimeType,
            uri,
            extractedText,
            attachment,
            metadata,
          });
          continue;
        }

        if (kind === 'audio') {
          emitStatus(options.onStatus, partId, kind, 'processing', 'Transcribing audio', metadata);
          let extractedText: string | undefined;

          if (dependencies.transcribeAudio) {
            const transcription = await dependencies.transcribeAudio(attachment);
            if (transcription.success) {
              extractedText = transcription.text;
              emitStatus(options.onStatus, partId, kind, 'ready', 'Audio transcription complete', {
                ...metadata,
                language: transcription.language ?? null,
              });
            } else {
              emitStatus(
                options.onStatus,
                partId,
                kind,
                'error',
                transcription.error ?? 'Audio transcription failed',
                metadata,
                {
                  code: 'MEDIA_TRANSCRIPTION_FAILED',
                  message: transcription.error ?? 'Audio transcription failed',
                  retryable: false,
                },
              );
            }
          } else {
            emitStatus(options.onStatus, partId, kind, 'ready', 'No transcription adapter configured', metadata);
          }

          parts.push({
            partId,
            kind,
            role: 'input',
            label: attachment.label,
            mimeType,
            uri,
            extractedText,
            attachment,
            metadata,
          });
          continue;
        }

        parts.push({
          partId,
          kind: 'selection',
          role: 'input',
          label: attachment.label,
          text: attachment.label ?? attachment.uri ?? attachment.fileId ?? 'selection',
          attachment,
          metadata,
        });
      }

      return {
        parts,
        primaryText: prompt || undefined,
        metadata: {
          attachmentCount: attachments.length,
        },
      };
    },
  };
}
