export const cleanCodeBlock = (text: string): string => {
  return text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
};

export const extractJson = (text: string): string => {
  const startObj = text.indexOf('{');
  const endObj = text.lastIndexOf('}');
  const startArr = text.indexOf('[');
  const endArr = text.lastIndexOf(']');

  if (startArr !== -1 && (startObj === -1 || startArr < startObj)) {
    if (endArr !== -1 && endArr > startArr) {
      return text.substring(startArr, endArr + 1);
    }
  }

  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    return text.substring(startObj, endObj + 1);
  }

  return cleanCodeBlock(text);
};

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const extractLastUrl = (text: string): string | null => {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/g);
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1];
};

export const chunkText = (text: string, chunkSize: number = 800, overlap: number = 100): string[] => {
  const chunks: string[] = [];
  const cleanText = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

  if (cleanText.length <= chunkSize) {
    return [cleanText];
  }

  for (let i = 0; i < cleanText.length; i += (chunkSize - overlap)) {
    let end = Math.min(i + chunkSize, cleanText.length);
    if (end < cleanText.length) {
      const nextPeriod = cleanText.indexOf('.', end - 50);
      const nextNewline = cleanText.indexOf('\n', end - 50);
      if (nextPeriod !== -1 && nextPeriod < end + 50) {
        end = nextPeriod + 1;
      } else if (nextNewline !== -1 && nextNewline < end + 50) {
        end = nextNewline + 1;
      }
    }
    chunks.push(cleanText.substring(i, end));
    if (end >= cleanText.length) {
      break;
    }
  }
  return chunks;
};
