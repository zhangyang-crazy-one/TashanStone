
export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

export const isRegistered = (): boolean => {
  return !!localStorage.getItem('neon-auth-user');
};

export const register = async (username: string, password: string): Promise<void> => {
  const hash = await hashPassword(password);
  localStorage.setItem('neon-auth-user', username);
  localStorage.setItem('neon-auth-hash', hash);
};

export const verifyLogin = async (password: string): Promise<boolean> => {
  const storedHash = localStorage.getItem('neon-auth-hash');
  if (!storedHash) return false;
  const inputHash = await hashPassword(password);
  return inputHash === storedHash;
};

export const getUsername = (): string => {
  return localStorage.getItem('neon-auth-user') || 'User';
};
