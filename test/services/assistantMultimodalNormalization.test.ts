import { describe, expect, it, vi } from 'vitest';

import { createMultimodalNormalizer } from '../../src/services/assistant-runtime/multimodalNormalizer';
import { createProviderInputAdapter } from '../../src/services/assistant-runtime/providerInputAdapter';

describe('assistant multimodal normalization', () => {
  it('normalizes text, selection, image, audio, and document inputs into one shared media envelope', async () => {
    const recognizeImage = vi.fn(async (source: string) => ({
      success: true,
      text: source.includes('chart') ? 'Chart OCR text' : 'Document OCR text',
      backend: 'cpu',
    }));
    const transcribeAudio = vi.fn(async () => ({
      success: true,
      text: 'Audio transcript text',
      language: 'en',
    }));
    const statuses: string[] = [];

    const normalizer = createMultimodalNormalizer({
      recognizeImage,
      transcribeAudio,
      createPartId: kind => `${kind}-part`,
    });

    const envelope = await normalizer.normalize(
      {
        input: {
          prompt: 'Summarize the attachments',
          attachments: [
            {
              kind: 'image',
              label: 'Architecture chart',
              mimeType: 'image/png',
              metadata: { dataUrl: 'data:image/png;base64,chart' },
            },
            {
              kind: 'audio',
              label: 'Voice memo',
              mimeType: 'audio/wav',
              metadata: { path: '/tmp/memo.wav' },
            },
            {
              kind: 'file',
              label: 'Spec PDF',
              uri: '/tmp/spec.pdf',
              mimeType: 'application/pdf',
              metadata: { dataUrl: 'data:application/pdf;base64,doc' },
            },
          ],
        },
        notebook: {
          notebookId: 'notebook-1',
          selectedText: 'Important selection',
        },
      },
      {
        onStatus: record => {
          statuses.push(`${record.kind}:${record.status}`);
        },
      },
    );

    expect(envelope.parts.map(part => part.kind)).toEqual([
      'text',
      'selection',
      'image',
      'audio',
      'document',
    ]);
    expect(envelope.parts.find(part => part.kind === 'image')).toMatchObject({
      extractedText: 'Chart OCR text',
      label: 'Architecture chart',
    });
    expect(envelope.parts.find(part => part.kind === 'audio')).toMatchObject({
      extractedText: 'Audio transcript text',
      label: 'Voice memo',
    });
    expect(envelope.parts.find(part => part.kind === 'document')).toMatchObject({
      extractedText: 'Document OCR text',
      label: 'Spec PDF',
      attachment: expect.objectContaining({
        kind: 'file',
      }),
    });
    expect(statuses).toEqual([
      'image:processing',
      'image:ready',
      'audio:processing',
      'audio:ready',
      'document:processing',
      'document:ready',
    ]);
  });

  it('keeps provider-facing preparation provider-neutral while incorporating extracted media context', () => {
    const adapter = createProviderInputAdapter();

    const prepared = adapter.adapt('Base runtime prompt', {
      primaryText: 'Base runtime prompt',
      parts: [
        {
          partId: 'text-1',
          kind: 'text',
          role: 'input',
          text: 'Base runtime prompt',
        },
        {
          partId: 'image-1',
          kind: 'image',
          role: 'input',
          label: 'Architecture chart',
          mimeType: 'image/png',
          extractedText: 'Chart OCR text',
          metadata: {},
        },
        {
          partId: 'audio-1',
          kind: 'audio',
          role: 'input',
          label: 'Voice memo',
          mimeType: 'audio/wav',
          extractedText: 'Audio transcript text',
          metadata: {},
        },
      ],
    });

    expect(prepared.parts).toHaveLength(3);
    expect(prepared.prompt).toContain('Base runtime prompt');
    expect(prepared.prompt).toContain('[IMAGE: Architecture chart]');
    expect(prepared.prompt).toContain('Chart OCR text');
    expect(prepared.prompt).toContain('[AUDIO: Voice memo]');
    expect(prepared.prompt).toContain('Audio transcript text');
  });

  it('preserves provenance metadata needed for downstream status and delivery handling', async () => {
    const normalizer = createMultimodalNormalizer({
      createPartId: kind => `${kind}-part`,
    });

    const envelope = await normalizer.normalize({
      input: {
        prompt: 'Review the file',
        attachments: [
          {
            kind: 'file',
            fileId: 'file-9',
            uri: '/tmp/review.md',
            label: 'Review Draft',
            mimeType: 'text/markdown',
            metadata: {
              path: '/tmp/review.md',
              source: 'active-file',
            },
          },
        ],
      },
      notebook: {
        notebookId: 'notebook-1',
      },
    });

    expect(envelope.metadata).toMatchObject({
      attachmentCount: 1,
    });
    expect(envelope.parts.find(part => part.kind === 'document')).toMatchObject({
      label: 'Review Draft',
      attachment: expect.objectContaining({
        fileId: 'file-9',
      }),
      metadata: expect.objectContaining({
        path: '/tmp/review.md',
        source: 'active-file',
      }),
    });
  });
});
