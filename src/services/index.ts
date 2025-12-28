// Platform detection
export { getPlatform, supportsFeature, resetPlatformCache } from './platform/platformService';
export type { Platform, OS } from './platform/platformService';

// Storage service
export { getStorageService, initializeStorage, resetStorageService } from './storage/storageService';
export type { StorageService, ExportData, ImportResult } from './storage/types';

// AI platform fetch
export { platformFetch, platformFetchJson } from './ai/platformFetch';

// Context Engineering
export * from './context';
