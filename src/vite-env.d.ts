/// <reference types="vite/client" />

import type { ElectronAPI } from './types/electronAPI';

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  // Add custom environment variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }

  // Extend FileSystemDirectoryHandle to include values() method
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  }
}

export {};
