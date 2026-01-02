export interface SaveMemoryRequest {
  id?: string;
  content: string;
  title?: string;
  topics?: string[];
  importance?: 'low' | 'medium' | 'high';
  summary?: string;
  category?: string;
}

export interface SavePermanentMemoryRequest {
  id?: string;
  title?: string;
  content: string;
  summary?: string;
  topics?: string[];
  category?: string;
  importance?: 'low' | 'medium' | 'high';
  sourceType?: 'file' | 'conversation' | 'manual';
  sourcePath?: string;
  promotedFrom?: string;
  createdAt?: number;
  isStarred?: boolean;
  promotedAt?: number;
}

export interface UpdateMemoryRequest {
  id: string;
  content: string;
  updatedAt?: number;
}

export interface MemoryFilters {
  isStarred?: boolean;
  importance?: string;
}

export type Result<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

export function failure(error: string): Result {
  return { success: false, error };
}
