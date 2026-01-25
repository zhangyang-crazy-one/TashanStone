import { useEffect, useState } from 'react';

import type { AIConfig } from '@/types';

interface UseAuthStateOptions {
  aiConfig: AIConfig;
}

interface UseAuthStateResult {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  isCheckingAuth: boolean;
  currentUsername: string;
}

export const useAuthState = ({ aiConfig }: UseAuthStateOptions): UseAuthStateResult => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentUsername, setCurrentUsername] = useState<string>('');

  useEffect(() => {
    const checkAuth = async () => {
      const loginProtectionEnabled = aiConfig.security?.enableLoginProtection ?? false;

      if (window.electronAPI?.db?.auth && loginProtectionEnabled) {
        try {
          const registered = await window.electronAPI.db.auth.isRegistered();
          if (!registered) {
            setIsCheckingAuth(false);
            setIsAuthenticated(false);
          } else {
            const username = await window.electronAPI.db.auth.getUsername();
            setCurrentUsername(username);
            setIsCheckingAuth(false);
            setIsAuthenticated(false);
          }
        } catch (error) {
          console.error('Auth check failed:', error);
          setIsCheckingAuth(false);
          setIsAuthenticated(true);
        }
      } else {
        setIsCheckingAuth(false);
        setIsAuthenticated(true);
      }
    };

    void checkAuth();
  }, [aiConfig.security?.enableLoginProtection]);

  return {
    isAuthenticated,
    setIsAuthenticated,
    isCheckingAuth,
    currentUsername
  };
};
