import type { JsonValue } from '@/types';

export type ToolCallback = (toolName: string, args: Record<string, JsonValue>) => Promise<JsonValue>;
