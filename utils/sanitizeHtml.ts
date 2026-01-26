const UNSAFE_TAGS = new Set(['script', 'iframe', 'object', 'embed']);

const hasJavascriptProtocol = (value: string): boolean => /^\s*javascript:/i.test(value);

export const sanitizeHtml = (input: string): string => {
  if (!input) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return input;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');

  doc.querySelectorAll(Array.from(UNSAFE_TAGS).join(',')).forEach(el => el.remove());

  doc.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }

      if ((name === 'href' || name === 'xlink:href') && hasJavascriptProtocol(value)) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === 'style' && /javascript:/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return doc.body.innerHTML;
};
