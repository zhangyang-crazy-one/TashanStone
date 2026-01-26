export const LANCEDB_CONTEXT_FILE_ID_PREFIX = '__context__:';
export const LANCEDB_MEMORY_FILE_ID_PREFIX = '__memory__:';

export const isLanceDbMemoryFileId = (fileId: string): boolean =>
  fileId.startsWith(LANCEDB_CONTEXT_FILE_ID_PREFIX) ||
  fileId.startsWith(LANCEDB_MEMORY_FILE_ID_PREFIX);

export const stripLanceDbPrefix = (fileId: string, prefix: string): string =>
  fileId.startsWith(prefix) ? fileId.slice(prefix.length) : fileId;
