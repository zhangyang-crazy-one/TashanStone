/// <reference types="vitest" />

declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const vi: {
  clearAllMocks: () => void;
  useFakeTimers: () => void;
  useRealTimers: () => void;
  spyOn: <T, K extends keyof T>(obj: T, method: K) => any;
  fn: <T extends (...args: any[]) => any>(impl?: T) => T;
  mock: (path: string, factory: any) => void;
};
