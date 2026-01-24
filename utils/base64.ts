export const encodeBase64Utf8 = (value: string): string | null => {
  if (typeof btoa !== 'function' || typeof TextEncoder === 'undefined') {
    return null;
  }

  try {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  } catch {
    return null;
  }
};

export const decodeBase64Utf8 = (value: string): string | null => {
  if (typeof atob !== 'function' || typeof TextDecoder === 'undefined') {
    return null;
  }

  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};
