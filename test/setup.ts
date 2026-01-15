/**
 * Vitest Test Setup
 * Configures global mocks and test environment
 */

import '@testing-library/jest-dom';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverMock,
});

// Mock Electron API
Object.defineProperty(window, 'electronAPI', {
  value: {
    ipcInvoke: async (channel: string, ...args: unknown[]) => {
      // Return mock responses based on channel
      switch (channel) {
        case 'db:getConfig':
          return null;
        case 'db:setConfig':
          return true;
        case 'file:read':
          return '';
        case 'file:write':
          return true;
        default:
          return null;
      }
    },
    onMainMessage: () => () => {},
    platform: 'win32',
  },
  writable: true,
});

// Reset localStorage before each test
beforeEach(() => {
  localStorageMock.clear();
});

// Suppress console warnings in tests (optional)
// vi.spyOn(console, 'warn').mockImplementation(() => {});
