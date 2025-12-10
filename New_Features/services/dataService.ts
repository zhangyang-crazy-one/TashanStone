
import { MarkdownFile, AppTheme, AIConfig, ChatMessage, NoteLayoutItem } from "../types";

const DB_VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12;

interface EncryptedDatabase {
  version: number;
  iv: string; // Base64
  salt: string; // Base64
  data: string; // Base64 Encrypted Data
  hash: string; // Integrity Check
}

interface AppData {
  files: MarkdownFile[];
  config: AIConfig;
  themes: AppTheme[];
  chatHistory: ChatMessage[];
  noteLayout: Record<string, NoteLayoutItem>;
  shortcuts: any[];
  customThemes: any[];
  timestamp: number;
}

// --- Cryptography Helpers ---

const encode = (data: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(data);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const decode = (base64: string) => {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

const getPasswordKey = (password: string) => 
  window.crypto.subtle.importKey(
    "raw", 
    new TextEncoder().encode(password), 
    "PBKDF2", 
    false, 
    ["deriveKey"]
  );

const deriveKey = (passwordKey: CryptoKey, salt: Uint8Array, keyUsage: ["encrypt"] | ["decrypt"]) => 
  window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsage
  );

// --- Validation Helpers ---

const validateAppData = (data: any): AppData => {
  if (!data || typeof data !== 'object') {
    throw new Error("Invalid backup format: Root must be an object.");
  }

  // 1. Validate Files
  let validFiles: MarkdownFile[] = [];
  if (Array.isArray(data.files)) {
    validFiles = data.files.filter((f: any) => {
      return f && typeof f === 'object' && typeof f.id === 'string' && typeof f.name === 'string';
    }).map((f: any) => ({
      ...f,
      content: typeof f.content === 'string' ? f.content : '', // Ensure content exists
      lastModified: typeof f.lastModified === 'number' ? f.lastModified : Date.now()
    }));
  }

  if (validFiles.length === 0 && Array.isArray(data.files) && data.files.length > 0) {
     console.warn("Backup contained files but none were valid. Check schema.");
  }

  // 2. Validate Config
  const validConfig: AIConfig = {
    provider: data.config?.provider || 'gemini',
    model: data.config?.model || 'gemini-2.5-flash',
    apiKey: data.config?.apiKey || '', // Allow empty, user can re-enter
    baseUrl: data.config?.baseUrl,
    temperature: typeof data.config?.temperature === 'number' ? data.config.temperature : 0.7,
    language: data.config?.language === 'zh' ? 'zh' : 'en',
    enableWebSearch: !!data.config?.enableWebSearch,
    mcpTools: data.config?.mcpTools || '[]',
    customPrompts: data.config?.customPrompts || {},
    backup: data.config?.backup || { frequency: 'weekly', lastBackup: 0 }
  };

  return {
    files: validFiles,
    config: validConfig,
    themes: Array.isArray(data.themes) ? data.themes : [],
    customThemes: Array.isArray(data.customThemes) ? data.customThemes : [],
    chatHistory: Array.isArray(data.chatHistory) ? data.chatHistory : [],
    noteLayout: typeof data.noteLayout === 'object' ? data.noteLayout : {},
    shortcuts: Array.isArray(data.shortcuts) ? data.shortcuts : [],
    timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now()
  };
};

// --- Core Data Operations ---

export const gatherAppData = (): AppData => {
  const files = JSON.parse(localStorage.getItem('neon-files') || '[]');
  const config = JSON.parse(localStorage.getItem('neon-ai-config') || '{}');
  const chatHistory = JSON.parse(localStorage.getItem('neon-chat-history') || '[]');
  const noteLayout = JSON.parse(localStorage.getItem('neon-note-layout') || '{}');
  const shortcuts = JSON.parse(localStorage.getItem('neon-shortcuts') || '[]');
  const customThemes = JSON.parse(localStorage.getItem('neon-custom-themes') || '[]');

  // Sanitize files (remove file handles as they can't be serialized)
  const cleanFiles = Array.isArray(files) ? files.map((f: any) => {
    const { handle, ...rest } = f;
    return rest;
  }) : [];

  return {
    files: cleanFiles,
    config,
    themes: [], 
    customThemes,
    chatHistory,
    noteLayout,
    shortcuts,
    timestamp: Date.now()
  };
};

export const encryptDatabase = async (data: AppData, password: string): Promise<string> => {
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LEN));
  
  const passwordKey = await getPasswordKey(password);
  const aesKey = await deriveKey(passwordKey, salt, ["encrypt"]);
  
  const jsonStr = JSON.stringify(data);
  const encodedData = new TextEncoder().encode(jsonStr);
  
  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    aesKey,
    encodedData
  );

  // Simple integrity hash of the raw JSON
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encodedData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const dbPayload: EncryptedDatabase = {
    version: DB_VERSION,
    salt: encode(salt),
    iv: encode(iv),
    data: encode(encryptedContent),
    hash: hashHex
  };

  return JSON.stringify(dbPayload);
};

export const decryptDatabase = async (fileContent: string, password: string): Promise<AppData> => {
  let payload: EncryptedDatabase;
  try {
    payload = JSON.parse(fileContent);
  } catch (e) {
    throw new Error("Invalid file format. Not a valid JSON database.");
  }

  if (!payload.salt || !payload.iv || !payload.data) {
    throw new Error("Corrupted database file structure.");
  }

  const salt = new Uint8Array(decode(payload.salt));
  const iv = new Uint8Array(decode(payload.iv));
  const encryptedData = decode(payload.data);

  const passwordKey = await getPasswordKey(password);
  const aesKey = await deriveKey(passwordKey, salt, ["decrypt"]);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      encryptedData
    );

    const decodedStr = new TextDecoder().decode(decryptedBuffer);
    
    // Verify Integrity
    if (payload.hash) {
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(decodedStr));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        if (hashHex !== payload.hash) {
            console.warn("Integrity check failed. Data might be tampered with, but decryption succeeded.");
        }
    }

    const rawData = JSON.parse(decodedStr);
    return validateAppData(rawData);

  } catch (e: any) {
    if (e.message.includes('Invalid backup')) throw e;
    throw new Error("Incorrect password or corrupted data.");
  }
};

export const restoreAppData = (data: AppData) => {
  if (data.files) localStorage.setItem('neon-files', JSON.stringify(data.files));
  // Merge config intelligently to preserve defaults if keys are missing
  if (data.config) {
      const existing = JSON.parse(localStorage.getItem('neon-ai-config') || '{}');
      const merged = { ...existing, ...data.config };
      localStorage.setItem('neon-ai-config', JSON.stringify(merged));
  }
  if (data.chatHistory) localStorage.setItem('neon-chat-history', JSON.stringify(data.chatHistory));
  if (data.noteLayout) localStorage.setItem('neon-note-layout', JSON.stringify(data.noteLayout));
  if (data.shortcuts) localStorage.setItem('neon-shortcuts', JSON.stringify(data.shortcuts));
  if (data.customThemes) localStorage.setItem('neon-custom-themes', JSON.stringify(data.customThemes));
};

// --- File System Operations ---

export const exportDatabaseToFile = async (password: string): Promise<boolean> => {
  try {
    const appData = gatherAppData();
    const encryptedString = await encryptDatabase(appData, password);
    const fileName = `backup-${new Date().toISOString().split('T')[0]}.db`;

    // Attempt File System Access API
    if ('showSaveFilePicker' in window) {
        try {
            const opts = {
              types: [{
                description: 'ZhangNote Secure Database',
                accept: { 'application/octet-stream': ['.db'] },
              }],
              suggestedName: fileName,
            };
            // @ts-ignore
            const handle = await window.showSaveFilePicker(opts);
            const writable = await handle.createWritable();
            await writable.write(encryptedString);
            await writable.close();
            return true;
        } catch (err: any) {
            if (err.name === 'AbortError') return false; 
            console.warn("File System Access API failed, using fallback.", err);
        }
    }

    // Fallback: Blob Download
    const blob = new Blob([encryptedString], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a); 
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    return true;

  } catch (e) {
    console.error("Export failed", e);
    throw e;
  }
};

export const importDatabaseFromFile = async (file: File, password: string): Promise<boolean> => {
  const text = await file.text();
  const data = await decryptDatabase(text, password);
  restoreAppData(data);
  return true;
};
