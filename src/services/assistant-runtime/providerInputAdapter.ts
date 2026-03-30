import type {
  AssistantBinaryMediaPart,
  AssistantNormalizedMediaEnvelope,
  AssistantNormalizedMediaPart,
} from './toolMediaContracts';

export interface AssistantProviderPreparedInput {
  prompt: string;
  parts: AssistantNormalizedMediaPart[];
}

export interface AssistantProviderInputAdapter {
  adapt: (basePrompt: string, envelope: AssistantNormalizedMediaEnvelope) => AssistantProviderPreparedInput;
}

const describeBinaryPart = (part: AssistantBinaryMediaPart): string => {
  const label = part.label ?? part.attachment?.label ?? part.uri ?? part.kind;
  if (part.extractedText?.trim()) {
    return `[${part.kind.toUpperCase()}: ${label}]\n${part.extractedText.trim()}`;
  }
  return `[${part.kind.toUpperCase()}: ${label}]`;
};

export function createProviderInputAdapter(): AssistantProviderInputAdapter {
  return {
    adapt(basePrompt, envelope) {
      const supplementalSections = envelope.parts.flatMap(part => {
        if (part.kind === 'text') {
          return [];
        }

        if (part.kind === 'selection') {
          return [`[SELECTION]\n${part.text}`];
        }

        return [describeBinaryPart(part)];
      });

      return {
        prompt: supplementalSections.length > 0
          ? `${basePrompt}\n\n${supplementalSections.join('\n\n')}`
          : basePrompt,
        parts: envelope.parts,
      };
    },
  };
}
